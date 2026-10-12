from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.session import get_db
from app.api.deps import get_current_user, require_admin
from app.models import Job, JobExecutionSession, JobProgressHistory, JobHandover, User
from app.schemas import (
    UserPayload, JobScheduleRequest, JobPauseRequest,
    JobResumeRequest, JobCompleteRequest, JobHandoverRequest
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
    job = res.scalar_one_or_none()
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

    if job.lifecycle_status in ["Draft", None]:
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

# POST /api/jobs/{id}/start
@router.post("/{id}/start")
async def start_job(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.lifecycle_status == "Running":
        return {"ok": True, "message": "Job is already running", "status": "Running"}

    now = datetime.now(timezone.utc)
    if not job.actual_start_at:
        job.actual_start_at = now

    job.lifecycle_status = "Running"
    job.pause_started_at = None

    # Log work session
    session = JobExecutionSession(
        job_id=job.id,
        session_type="WORK",
        started_at=now,
        performed_by=user.username,
        notes="Started by Admin"
    )
    db.add(session)

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("JOB_STATUS_CHANGED", {
        "job_id": job.external_id,
        "status": "Running",
        "action": "STARTED",
        "actual_start_at": job.actual_start_at.isoformat(),
        "total_paused_seconds": job.total_paused_seconds or 0,
        "performed_by": user.username
    })

    return {
        "ok": True,
        "job_id": job.external_id,
        "status": "Running",
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
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.lifecycle_status != "Running":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot pause job in '{job.lifecycle_status}' state"
        )

    now = datetime.now(timezone.utc)
    job.lifecycle_status = "Paused"
    job.pause_started_at = now

    # Close previous work session
    s_stmt = select(JobExecutionSession).where(
        JobExecutionSession.job_id == job.id,
        JobExecutionSession.session_type == "WORK",
        JobExecutionSession.ended_at.is_(None)
    ).order_by(desc(JobExecutionSession.id))
    s_res = await db.execute(s_stmt)
    last_session = s_res.scalar_one_or_none()
    if last_session:
        last_session.ended_at = now
        last_session.duration_seconds = max(0, int((now - last_session.started_at).total_seconds()))

    # Create pause session
    pause_session = JobExecutionSession(
        job_id=job.id,
        session_type="PAUSE",
        started_at=now,
        performed_by=user.username,
        pause_reason=req.reason,
        notes=req.notes
    )
    db.add(pause_session)

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("JOB_STATUS_CHANGED", {
        "job_id": job.external_id,
        "status": "Paused",
        "action": "PAUSED",
        "pause_reason": req.reason,
        "pause_started_at": now.isoformat(),
        "performed_by": user.username
    })

    return {
        "ok": True,
        "job_id": job.external_id,
        "status": "Paused",
        "pause_reason": req.reason,
        "pause_started_at": now.isoformat()
    }

# POST /api/jobs/{id}/resume
@router.post("/{id}/resume")
async def resume_job(
    id: int,
    req: JobResumeRequest,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.lifecycle_status != "Paused":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot resume job in '{job.lifecycle_status}' state"
        )

    now = datetime.now(timezone.utc)
    paused_delta = 0
    if job.pause_started_at:
        paused_delta = max(0, int((now - job.pause_started_at).total_seconds()))
        job.total_paused_seconds = (job.total_paused_seconds or 0) + paused_delta

    job.lifecycle_status = "Running"
    job.pause_started_at = None

    # Close pause session
    s_stmt = select(JobExecutionSession).where(
        JobExecutionSession.job_id == job.id,
        JobExecutionSession.session_type == "PAUSE",
        JobExecutionSession.ended_at.is_(None)
    ).order_by(desc(JobExecutionSession.id))
    s_res = await db.execute(s_stmt)
    last_pause = s_res.scalar_one_or_none()
    if last_pause:
        last_pause.ended_at = now
        last_pause.duration_seconds = paused_delta

    # Open new work session
    work_session = JobExecutionSession(
        job_id=job.id,
        session_type="WORK",
        started_at=now,
        performed_by=user.username,
        notes=req.notes or "Resumed by Admin"
    )
    db.add(work_session)

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("JOB_STATUS_CHANGED", {
        "job_id": job.external_id,
        "status": "Running",
        "action": "RESUMED",
        "total_paused_seconds": job.total_paused_seconds,
        "performed_by": user.username
    })

    return {
        "ok": True,
        "job_id": job.external_id,
        "status": "Running",
        "total_paused_seconds": job.total_paused_seconds
    }

# POST /api/jobs/{id}/complete
@router.post("/{id}/complete")
async def complete_job(
    id: int,
    req: JobCompleteRequest,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    now = datetime.now(timezone.utc)
    if not job.actual_start_at:
        job.actual_start_at = now

    # If job was paused, close pause session and accumulate
    if job.lifecycle_status == "Paused" and job.pause_started_at:
        paused_delta = max(0, int((now - job.pause_started_at).total_seconds()))
        job.total_paused_seconds = (job.total_paused_seconds or 0) + paused_delta
        job.pause_started_at = None

    # Close any open work sessions
    s_stmt = select(JobExecutionSession).where(
        JobExecutionSession.job_id == job.id,
        JobExecutionSession.ended_at.is_(None)
    )
    s_res = await db.execute(s_stmt)
    for s in s_res.scalars().all():
        s.ended_at = now
        s.duration_seconds = max(0, int((now - s.started_at).total_seconds()))

    job.lifecycle_status = "Completed"
    job.actual_end_at = now

    raw_elapsed = max(0, int((now - job.actual_start_at).total_seconds()))
    job.actual_duration_seconds = max(0, raw_elapsed - (job.total_paused_seconds or 0))
    job.progress_percentage = 100.00

    # Also update dispatch status in department_status
    dep_status = dict(job.department_status or {})
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

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("JOB_STATUS_CHANGED", {
        "job_id": job.external_id,
        "status": "Completed",
        "action": "COMPLETED",
        "actual_duration_seconds": job.actual_duration_seconds,
        "performed_by": user.username
    })

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
    job = res.scalar_one_or_none()
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
        for s in sessions
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
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Fetch next worker name from users catalog
    w_stmt = select(User).where(User.id == req.to_worker_id)
    w_res = await db.execute(w_stmt)
    next_worker = w_res.scalar_one_or_none()
    next_worker_name = next_worker.name if next_worker else f"Worker #{req.to_worker_id}"

    # Fetch previous worker name
    prev_worker_name = "Unassigned"
    if job.current_worker_id:
        pw_stmt = select(User).where(User.id == job.current_worker_id)
        pw_res = await db.execute(pw_stmt)
        pw_match = pw_res.scalar_one_or_none()
        if pw_match:
            prev_worker_name = pw_match.name

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
    for s in s_res.scalars().all():
        s.ended_at = now
        s.duration_seconds = max(0, int((now - s.started_at).total_seconds()))
        active_seconds_before += s.duration_seconds

    # Create handover record
    handover_rec = JobHandover(
        job_id=job.id,
        from_worker_id=from_worker_id,
        from_worker_position=from_worker_position,
        to_worker_id=req.to_worker_id,
        to_worker_position=req.to_worker_position or "Engineer",
        handover_at=now,
        reason=req.reason,
        notes=req.notes,
        work_completed_summary=f"Handover from {prev_worker_name} ({from_worker_position}) to {next_worker_name} ({req.to_worker_position})",
        active_seconds_before_handover=active_seconds_before,
        performed_by=user.username
    )
    db.add(handover_rec)

    # Update job worker pointers
    job.previous_worker_id = from_worker_id
    job.current_worker_id = req.to_worker_id
    job.current_worker_position = req.to_worker_position or "Engineer"
    job.last_handover_at = now
    job.handover_notes = req.notes
    job.next_worker_id = None

    if req.action == "RUNNING":
        job.lifecycle_status = "Running"
        job.pause_started_at = None
        new_session = JobExecutionSession(
            job_id=job.id,
            session_type="WORK",
            started_at=now,
            performed_by=next_worker_name,
            worker_id=req.to_worker_id,
            worker_position=req.to_worker_position or "Engineer",
            notes=f"Started following handover ({req.reason})"
        )
        db.add(new_session)
    else:
        job.lifecycle_status = "Paused"
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

    # Broadcast Handover event for Toast and live updates
    await broadcaster.broadcast("JOB_HANDOVER", {
        "job_id": job.external_id,
        "jobNo": job.job_no,
        "panelName": job.panel_name,
        "fromWorker": prev_worker_name,
        "fromPosition": from_worker_position,
        "toWorker": next_worker_name,
        "toPosition": req.to_worker_position,
        "reason": req.reason,
        "handoverAt": now.isoformat(),
        "status": job.lifecycle_status,
        "performed_by": user.username
    })

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
    job = res.scalar_one_or_none()
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
        for h in handovers
    ]

