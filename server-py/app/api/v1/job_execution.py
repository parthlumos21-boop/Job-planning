from typing import Optional, Any, cast
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from app.db.session import get_db
from app.api.deps import get_current_user, require_admin
from app.models import Job, JobExecutionSession, JobProgressHistory, JobHandover, User, Account
from app.schemas import (
    UserPayload, JobScheduleRequest, JobPauseRequest,
    JobResumeRequest, JobCompleteRequest, JobHandoverRequest,
    JobProgressUpdateRequest
)
from app.core.events import broadcaster

router = APIRouter(prefix="/jobs", tags=["Job Execution"])

def parse_iso_datetime(dt_str: str | None) -> datetime | None:
    if not dt_str:
        return None
    try:
        # replace Z with +00:00 for fromisoformat compatibility
        clean = dt_str.replace("Z", "+00:00")
        return datetime.fromisoformat(clean)
    except Exception:
        return None

# POST /api/jobs/{id}/schedule
@router.post("/{id}/schedule")
async def schedule_job(
    id: int,
    req: JobScheduleRequest,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job: Any = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if req.planned_start_at:
        job.planned_start_at = parse_iso_datetime(req.planned_start_at)
    if req.planned_end_at:
        job.planned_end_at = parse_iso_datetime(req.planned_end_at)
    if req.estimated_duration_hours is not None:
        job.estimated_duration_seconds = int(req.estimated_duration_hours * 3600)
    if req.priority:
        job.priority = req.priority
    if req.assigned_engineer_id:
        job.assigned_engineer_id = req.assigned_engineer_id

    current_status = str(getattr(job, "lifecycle_status", "") or "")
    if current_status in ["Draft", "None", "", "NoneType"]:
        job.lifecycle_status = "Scheduled"

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("JOB_STATUS_CHANGED", {
        "job_id": job.external_id,
        "status": job.lifecycle_status,
        "action": "SCHEDULED",
        "performed_by": user.username
    })

    return {
        "ok": True,
        "job_id": job.external_id,
        "status": job.lifecycle_status,
        "planned_start_at": job.planned_start_at.isoformat() if job.planned_start_at else None,
        "planned_end_at": job.planned_end_at.isoformat() if job.planned_end_at else None,
        "estimated_duration_seconds": job.estimated_duration_seconds
    }

VALID_PAUSE_CATEGORIES = [
    "Material unavailable",
    "Waiting for approval",
    "Machine breakdown",
    "Technical issue",
    "Employee unavailable",
    "Customer dependency",
    "Power outage",
    "Other"
]

# POST /api/jobs/{id}/start
@router.post("/{id}/start")
async def start_job(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job: Any = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if str(getattr(job, "lifecycle_status", "") or "") in ["In Progress", "Running"]:
        return {"ok": True, "message": "Job is already running", "status": "In Progress"}

    now = datetime.now(timezone.utc)
    if not job.actual_start_at:
        job.actual_start_at = now

    job.lifecycle_status = "In Progress"
    job.pause_started_at = None

    # Close any accidental open sessions
    c_stmt = select(JobExecutionSession).where(
        JobExecutionSession.job_id == job.id,
        JobExecutionSession.ended_at.is_(None)
    )
    c_res = await db.execute(c_stmt)
    for cs in cast(list[Any], c_res.scalars().all()):
        cs.ended_at = now
        cs.duration_seconds = max(0, int((now - cs.started_at).total_seconds()))

    session = JobExecutionSession(
        job_id=job.id,
        session_type="WORK",
        started_at=now,
        performed_by=user.username,
        worker_id=job.current_worker_id,
        worker_position=job.current_worker_position or "Engineer",
        notes="Started by User"
    )
    db.add(session)

    await db.commit()
    await db.refresh(job)

    # Terminal Process Log
    print(f"[JOB-AUDIT {now.strftime('%Y-%m-%d %H:%M:%S UTC')}] START    | Job #{job.external_id} ({job.job_no}) started by '{user.username}'", flush=True)

    payload = {
        "event": "job_started",
        "job_id": job.external_id,
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "status": "In Progress",
        "action": "STARTED",
        "actual_start_at": job.actual_start_at.isoformat(),
        "startedAt": now.isoformat(),
        "total_paused_seconds": job.total_paused_seconds or 0,
        "performed_by": user.username
    }
    await broadcaster.broadcast("job_started", payload)
    await broadcaster.broadcast("JOB_STATUS_CHANGED", payload)

    return {
        "ok": True,
        "job_id": job.external_id,
        "status": "In Progress",
        "actual_start_at": job.actual_start_at.isoformat()
    }

# POST /api/jobs/{id}/pause
@router.post("/{id}/pause")
async def pause_job(
    id: int,
    req: JobPauseRequest,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job: Any = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    current_status = str(getattr(job, "lifecycle_status", "") or "")
    if current_status not in ["Running", "In Progress"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot pause job in '{current_status}' state (must be In Progress/Running)"
        )

    category = (req.category or req.reason or "Material unavailable").strip()
    detail_note = (req.detailed_reason or req.notes or "").strip()

    if category.lower() == "other":
        if not detail_note or len(detail_note) < 5:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Detailed explanation is required when pause reason is 'Other' (min 5 characters)"
            )

    now = datetime.now(timezone.utc)
    job.lifecycle_status = "On Hold"
    job.pause_reason_category = category
    job.pause_notes = detail_note
    job.pause_started_at = now

    if req.expected_resume_at:
        try:
            job.expected_resume_at = datetime.fromisoformat(req.expected_resume_at.replace("Z", "+00:00"))
        except Exception:
            pass

    # Close previous work session
    s_stmt = select(JobExecutionSession).where(
        JobExecutionSession.job_id == job.id,
        JobExecutionSession.session_type == "WORK",
        JobExecutionSession.ended_at.is_(None)
    ).order_by(desc(JobExecutionSession.id))
    s_res = await db.execute(s_stmt)
    for last_session in cast(list[Any], s_res.scalars().all()):
        last_session.ended_at = now
        last_session.duration_seconds = max(0, int((now - last_session.started_at).total_seconds()))

    # Create pause session
    pause_session = JobExecutionSession(
        job_id=job.id,
        session_type="PAUSE",
        started_at=now,
        performed_by=user.username,
        pause_reason=category,
        notes=detail_note
    )
    db.add(pause_session)

    await db.commit()
    await db.refresh(job)

    # Terminal Process Log
    print(f"[JOB-AUDIT {now.strftime('%Y-%m-%d %H:%M:%S UTC')}] PAUSE    | Job #{job.external_id} ({job.job_no}) paused by '{user.username}' | Category: '{category}' | Notes: '{detail_note}'", flush=True)

    payload = {
        "event": "job_paused",
        "job_id": job.external_id,
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "status": "On Hold",
        "action": "PAUSED",
        "reasonCategory": category,
        "pause_reason": category,
        "detailedReason": detail_note,
        "notes": detail_note,
        "pause_started_at": now.isoformat(),
        "pausedAt": now.isoformat(),
        "performed_by": user.username,
        "pausedBy": user.username
    }
    await broadcaster.broadcast("job_paused", payload)
    await broadcaster.broadcast("JOB_STATUS_CHANGED", payload)

    return {
        "ok": True,
        "job_id": job.external_id,
        "status": "On Hold",
        "pause_reason": category,
        "pause_reason_category": category,
        "pauseReasonCategory": category,
        "pause_notes": detail_note,
        "pauseNotes": detail_note,
        "expected_resume_at": job.expected_resume_at.isoformat() if job.expected_resume_at else None,
        "expectedResumeAt": job.expected_resume_at.isoformat() if job.expected_resume_at else None,
        "pause_started_at": now.isoformat()
    }

# POST /api/jobs/{id}/resume
@router.post("/{id}/resume")
async def resume_job(
    id: int,
    req: Optional[JobResumeRequest] = None,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    if req is None:
        req = JobResumeRequest()
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job: Any = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    status_val = str(getattr(job, "lifecycle_status", "") or "")
    if status_val in ["In Progress", "Running"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot resume job: job is already active and running"
        )
    if status_val == "Completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot resume job: job has already been completed"
        )
    if status_val not in ["Paused", "On Hold"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot resume job in '{status_val}' state"
        )

    now = datetime.now(timezone.utc)
    paused_delta = 0
    if job.pause_started_at:
        paused_delta = max(0, int((now - job.pause_started_at).total_seconds()))
        job.total_paused_seconds = int(getattr(job, "total_paused_seconds", 0) or 0) + paused_delta

    job.lifecycle_status = "In Progress"
    job.pause_started_at = None
    job.pause_reason_category = None

    # Close open pause sessions
    s_stmt = select(JobExecutionSession).where(
        JobExecutionSession.job_id == job.id,
        JobExecutionSession.session_type == "PAUSE",
        JobExecutionSession.ended_at.is_(None)
    ).order_by(desc(JobExecutionSession.id))
    s_res = await db.execute(s_stmt)
    for last_pause in cast(list[Any], s_res.scalars().all()):
        last_pause.ended_at = now
        last_pause.duration_seconds = max(0, int((now - last_pause.started_at).total_seconds()))

    # Open single new work session
    work_session = JobExecutionSession(
        job_id=job.id,
        session_type="WORK",
        started_at=now,
        performed_by=user.username,
        worker_id=job.current_worker_id,
        worker_position=job.current_worker_position or "Engineer",
        notes=req.notes or f"Resumed by {user.username}"
    )
    db.add(work_session)

    await db.commit()
    await db.refresh(job)

    # Terminal Process Log
    print(f"[JOB-AUDIT {now.strftime('%Y-%m-%d %H:%M:%S UTC')}] RESUME   | Job #{job.external_id} ({job.job_no}) resumed by '{user.username}' | Paused interval: {paused_delta}s | Status: 'In Progress'", flush=True)

    payload = {
        "event": "job_resumed",
        "job_id": job.external_id,
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "status": "In Progress",
        "action": "RESUMED",
        "resumedBy": user.username,
        "resumedAt": now.isoformat(),
        "pauseDuration": paused_delta,
        "total_paused_seconds": job.total_paused_seconds,
        "performed_by": user.username
    }
    await broadcaster.broadcast("job_resumed", payload)
    await broadcaster.broadcast("JOB_STATUS_CHANGED", payload)

    return {
        "ok": True,
        "job_id": job.external_id,
        "status": "In Progress",
        "total_paused_seconds": job.total_paused_seconds,
        "totalPausedSeconds": job.total_paused_seconds
    }

# POST /api/jobs/{id}/complete
@router.post("/{id}/complete")
async def complete_job(
    id: int,
    req: Optional[JobCompleteRequest] = None,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    if req is None:
        req = JobCompleteRequest()
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job: Any = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    now = datetime.now(timezone.utc)
    if not job.actual_start_at:
        job.actual_start_at = now

    # If job was paused, close pause session and accumulate
    if str(getattr(job, "lifecycle_status", "") or "") == "Paused" and job.pause_started_at:
        paused_delta = max(0, int((now - job.pause_started_at).total_seconds()))
        job.total_paused_seconds = int(getattr(job, "total_paused_seconds", 0) or 0) + paused_delta
        job.pause_started_at = None

    # Close any open work sessions
    s_stmt = select(JobExecutionSession).where(
        JobExecutionSession.job_id == job.id,
        JobExecutionSession.ended_at.is_(None)
    )
    s_res = await db.execute(s_stmt)
    for s in cast(list[Any], s_res.scalars().all()):
        s.ended_at = now
        s.duration_seconds = max(0, int((now - s.started_at).total_seconds()))

    job.lifecycle_status = "Completed"
    job.actual_end_at = now

    raw_elapsed = max(0, int((now - job.actual_start_at).total_seconds()))
    job.actual_duration_seconds = max(0, raw_elapsed - int(getattr(job, "total_paused_seconds", 0) or 0))
    job.progress_percentage = 100.00

    # Also update dispatch status in department_status
    raw_dept_status = getattr(job, "department_status", None) or {}
    dep_status = dict(raw_dept_status) if isinstance(raw_dept_status, dict) else {}
    dep_status["dispatch"] = "completed"
    job.department_status = dep_status

    # Record progress history snapshot
    history = JobProgressHistory(
        job_id=job.id,
        recorded_at=now,
        progress_percentage=100.00,
        active_duration_seconds=job.actual_duration_seconds,
        recorded_by=user.username,
        note=req.notes or "Completed by Admin"
    )
    db.add(history)

    # Terminal Process Log
    print(f"[JOB-AUDIT {now.strftime('%Y-%m-%d %H:%M:%S UTC')}] COMPLETE | Job #{job.external_id} ({job.job_no}) completed by '{user.username}' | Active duration: {job.actual_duration_seconds}s", flush=True)

    payload = {
        "event": "job_completed",
        "job_id": job.external_id,
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "status": "Completed",
        "action": "COMPLETED",
        "actual_duration_seconds": job.actual_duration_seconds,
        "totalActiveDuration": job.actual_duration_seconds,
        "completedAt": now.isoformat(),
        "performed_by": user.username
    }
    await broadcaster.broadcast("job_completed", payload)
    await broadcaster.broadcast("JOB_STATUS_CHANGED", payload)

    return {
        "ok": True,
        "job_id": job.external_id,
        "status": "Completed",
        "actual_duration_seconds": job.actual_duration_seconds,
        "actual_end_at": job.actual_end_at.isoformat()
    }

# GET /api/jobs/{id}/sessions
@router.get("/{id}/sessions")
async def get_job_sessions(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job: Any = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    s_stmt = select(JobExecutionSession).where(
        JobExecutionSession.job_id == job.id
    ).order_by(JobExecutionSession.started_at.asc())
    s_res = await db.execute(s_stmt)
    sessions = s_res.scalars().all()

    return [
        {
            "id": s.id,
            "sessionType": s.session_type,
            "startedAt": s.started_at.isoformat() if s.started_at else None,
            "endedAt": s.ended_at.isoformat() if s.ended_at else None,
            "durationSeconds": s.duration_seconds,
            "performedBy": s.performed_by,
            "pauseReason": s.pause_reason,
            "notes": s.notes
        }
        for s in cast(list[Any], sessions)
    ]

# POST /api/jobs/{id}/handover
@router.post("/{id}/handover")
async def handover_job(
    id: int,
    req: JobHandoverRequest,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job: Any = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Resolve next worker target
    target_worker_id = req.to_worker_id or req.toWorkerId
    target_worker_name = req.to_worker_name or req.toWorker
    target_position = req.to_worker_position or req.toPosition or "Engineer"

    next_worker = None
    if target_worker_id:
        w_stmt = select(User).where(User.id == target_worker_id)
        w_res = await db.execute(w_stmt)
        next_worker = w_res.scalar_one_or_none()
        if not next_worker:
            a_stmt = select(Account).where(Account.id == target_worker_id)
            a_res = await db.execute(a_stmt)
            acc = a_res.scalar_one_or_none()
            if acc:
                target_worker_name = acc.username
    elif target_worker_name:
        w_stmt = select(User).where(func.lower(User.name) == target_worker_name.strip().lower())
        w_res = await db.execute(w_stmt)
        next_worker = w_res.scalars().first()
        if next_worker:
            target_worker_id = next_worker.id
        else:
            a_stmt = select(Account).where(func.lower(Account.username) == target_worker_name.strip().lower())
            a_res = await db.execute(a_stmt)
            acc = a_res.scalars().first()
            if acc:
                target_worker_id = acc.id
                target_worker_name = acc.username

    if not target_worker_id:
        target_worker_id = 1

    next_worker_name = next_worker.name if next_worker else (target_worker_name or f"Worker #{target_worker_id}")

    # Fetch previous worker name
    prev_worker_name = "Unassigned"
    if job.current_worker_id:
        pw_stmt = select(User).where(User.id == job.current_worker_id)
        pw_res = await db.execute(pw_stmt)
        pw_match = pw_res.scalar_one_or_none()
        if pw_match:
            prev_worker_name = pw_match.name
        else:
            paw_stmt = select(Account).where(Account.id == job.current_worker_id)
            paw_res = await db.execute(paw_stmt)
            paw_match = paw_res.scalar_one_or_none()
            if paw_match:
                prev_worker_name = paw_match.username

    now = datetime.now(timezone.utc)
    from_worker_id = job.current_worker_id
    from_worker_position = job.current_worker_position or "Worker"

    # Close previous work session if any
    s_stmt = select(JobExecutionSession).where(
        JobExecutionSession.job_id == job.id,
        JobExecutionSession.ended_at.is_(None)
    )
    s_res = await db.execute(s_stmt)
    active_seconds_before = 0
    for s in cast(list[Any], s_res.scalars().all()):
        s.ended_at = now
        s.duration_seconds = max(0, int((now - s.started_at).total_seconds()))
        active_seconds_before += s.duration_seconds

    summary_text = req.work_completed_summary or req.workCompletedSummary or f"Handover from {prev_worker_name} ({from_worker_position}) to {next_worker_name} ({target_position})"

    is_paused_already = str(getattr(job, "lifecycle_status", "") or "") in ["Paused", "On Hold"]
    is_running = True
    if req.action == "PAUSED" or req.keepRunning is False or is_paused_already:
        is_running = False

    progress_val = float(getattr(job, "progress_percentage", 0.0) or 0.0)
    # Create handover record
    handover_rec = JobHandover(
        job_id=job.id,
        from_worker_id=from_worker_id,
        from_worker_position=from_worker_position,
        to_worker_id=target_worker_id,
        to_worker_position=target_position,
        handover_at=now,
        reason=req.reason,
        notes=req.notes,
        work_completed_summary=summary_text,
        active_seconds_before_handover=active_seconds_before,
        status_at_handover=str(getattr(job, "lifecycle_status", "") or ""),
        progress_at_handover=progress_val,
        performed_by=user.username
    )
    db.add(handover_rec)

    # Update job worker pointers
    job.previous_worker_id = from_worker_id
    job.current_worker_id = target_worker_id
    job.current_worker_position = target_position
    job.last_handover_at = now
    job.handover_notes = req.notes
    job.next_worker_id = None

    if is_running:
        job.lifecycle_status = "In Progress"
        job.pause_started_at = None
        new_session = JobExecutionSession(
            job_id=job.id,
            session_type="WORK",
            started_at=now,
            performed_by=next_worker_name,
            worker_id=target_worker_id,
            worker_position=target_position,
            notes=f"Started following handover ({req.reason})"
        )
        db.add(new_session)
    else:
        # Preserve On Hold state
        job.lifecycle_status = "On Hold"
        if not is_paused_already:
            job.pause_started_at = now
            pause_session = JobExecutionSession(
                job_id=job.id,
                session_type="PAUSE",
                started_at=now,
                performed_by=user.username,
                pause_reason=f"Handover to {next_worker_name}",
                notes=req.notes
            )
            db.add(pause_session)

    await db.commit()
    await db.refresh(job)

    # Terminal Process Log
    print(f"[JOB-AUDIT {now.strftime('%Y-%m-%d %H:%M:%S UTC')}] HANDOVER | Job #{job.external_id} ({job.job_no}) transferred from '{prev_worker_name}' to '{next_worker_name}' ({target_position}) | Reason: '{req.reason}'", flush=True)

    # Broadcast Handover event for Toast and live updates
    payload = {
        "event": "job_handed_over",
        "job_id": job.external_id,
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "panelName": job.panel_name,
        "fromWorker": prev_worker_name,
        "fromPosition": from_worker_position,
        "toWorker": next_worker_name,
        "toPosition": target_position,
        "reason": req.reason,
        "handoverAt": now.isoformat(),
        "status": job.lifecycle_status,
        "progressAtHandover": progress_val,
        "performed_by": user.username
    }
    await broadcaster.broadcast("job_handed_over", payload)
    await broadcaster.broadcast("JOB_HANDOVER", payload)
    await broadcaster.broadcast("JOB_HANDOVER", payload)

    return {
        "ok": True,
        "job_id": job.external_id,
        "currentWorkerId": job.current_worker_id,
        "currentWorkerName": next_worker_name,
        "currentWorkerPosition": job.current_worker_position,
        "status": job.lifecycle_status,
        "handoverAt": now.isoformat()
    }

# GET /api/jobs/{id}/handovers
@router.get("/{id}/handovers")
async def get_job_handovers(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job: Any = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Fetch users catalog map
    u_stmt = select(User)
    u_res = await db.execute(u_stmt)
    users_map = {u.id: u.name for u in u_res.scalars().all()}

    h_stmt = select(JobHandover).where(
        JobHandover.job_id == job.id
    ).order_by(JobHandover.handover_at.desc())
    h_res = await db.execute(h_stmt)
    handovers = h_res.scalars().all()

    return [
        {
            "id": h.id,
            "fromWorkerId": h.from_worker_id,
            "fromWorkerName": users_map.get(h.from_worker_id, "Unassigned"),
            "fromWorkerPosition": h.from_worker_position,
            "toWorkerId": h.to_worker_id,
            "toWorkerName": users_map.get(h.to_worker_id, f"Worker #{h.to_worker_id}"),
            "toWorkerPosition": h.to_worker_position,
            "handoverAt": h.handover_at.isoformat() if h.handover_at else None,
            "reason": h.reason,
            "notes": h.notes,
            "performedBy": h.performed_by
        }
        for h in cast(list[Any], handovers)
    ]

# POST /api/jobs/{id}/progress
@router.post("/{id}/progress")
async def update_job_progress(
    id: int,
    req: JobProgressUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job: Any = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if req.completed_work_units is not None:
        job.completed_work_units = req.completed_work_units
    if req.target_work_units is not None:
        job.target_work_units = req.target_work_units

    if req.progress_percentage is not None:
        job.progress_percentage = req.progress_percentage
    else:
        target_units = float(getattr(job, "target_work_units", 0) or 0)
        completed_units = getattr(job, "completed_work_units", None)
        if target_units > 0 and completed_units is not None:
            job.progress_percentage = round((float(completed_units) / target_units) * 100.0, 2)

    now = datetime.now(timezone.utc)
    dur = int(getattr(job, "actual_duration_seconds", 0) or 0)
    current_pct = float(getattr(job, "progress_percentage", 0.0) or 0.0)

    # Log progress history
    hist = JobProgressHistory(
        job_id=job.id,
        recorded_at=now,
        progress_percentage=current_pct,
        active_duration_seconds=dur,
        recorded_by=user.username,
        note=req.note or f"Updated to {current_pct}%"
    )
    db.add(hist)

    # Terminal Process Log
    print(f"[JOB-AUDIT {now.strftime('%Y-%m-%d %H:%M:%S UTC')}] PROGRESS | Job #{job.external_id} ({job.job_no}) progress updated by '{user.username}' | {current_pct}% ({getattr(job, 'completed_work_units', 0)}/{getattr(job, 'target_work_units', 0)} units) | Note: '{req.note or ''}'", flush=True)

    # Broadcast event for live timeline updates
    payload = {
        "event": "job_progress_updated",
        "job_id": job.external_id,
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "progress_percentage": current_pct,
        "progressPercentage": current_pct,
        "completed_work_units": getattr(job, "completed_work_units", None),
        "completedWorkUnits": getattr(job, "completed_work_units", None),
        "target_work_units": getattr(job, "target_work_units", None),
        "targetWorkUnits": getattr(job, "target_work_units", None),
        "status": getattr(job, "lifecycle_status", None),
        "performed_by": user.username,
        "recorded_at": now.isoformat()
    }
    await broadcaster.broadcast("job_progress_updated", payload)
    await broadcaster.broadcast("JOB_PROGRESS_UPDATED", payload)

    return {
        "ok": True,
        "job_id": job.external_id,
        "progress_percentage": current_pct,
        "progressPercentage": current_pct,
        "completed_work_units": getattr(job, "completed_work_units", None),
        "completedWorkUnits": getattr(job, "completed_work_units", None),
        "target_work_units": getattr(job, "target_work_units", None),
        "targetWorkUnits": getattr(job, "target_work_units", None)
    }


