import asyncio
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func
from app.db.session import get_db
from app.api.deps import require_admin
from app.models import Job, User
from app.schemas import UserPayload
from app.core.events import broadcaster

router = APIRouter(prefix="/job-monitoring", tags=["Job Monitoring"])

def compute_job_time_metrics(j: Job, now: datetime) -> dict:
    actual_start = j.actual_start_at
    total_paused = j.total_paused_seconds or 0
    estimated_seconds = j.estimated_duration_seconds or 0
    status = (j.lifecycle_status or "Draft").strip()

    current_pause_seconds = 0
    if status in ["Paused", "On Hold"] and j.pause_started_at:
        current_pause_seconds = max(0, int((now - j.pause_started_at).total_seconds()))

    if not actual_start:
        elapsed_seconds = 0
    elif status in ["Running", "In Progress"]:
        raw = max(0, int((now - actual_start).total_seconds()))
        elapsed_seconds = max(0, raw - total_paused)
    elif status in ["Paused", "On Hold"]:
        pause_start = j.pause_started_at or now
        raw = max(0, int((pause_start - actual_start).total_seconds()))
        elapsed_seconds = max(0, raw - total_paused)
    elif status == "Completed":
        elapsed_seconds = j.actual_duration_seconds or 0
    else:
        elapsed_seconds = 0

    total_elapsed_seconds = elapsed_seconds + total_paused + current_pause_seconds
    remaining_seconds = max(0, estimated_seconds - elapsed_seconds) if estimated_seconds > 0 else 0
    variance_seconds = (elapsed_seconds - estimated_seconds) if estimated_seconds > 0 else 0

    is_overdue = False
    overdue_seconds = 0
    if j.planned_end_at and status != "Completed":
        if now > j.planned_end_at:
            is_overdue = True
            overdue_seconds = max(0, int((now - j.planned_end_at).total_seconds()))
    elif estimated_seconds > 0 and elapsed_seconds > estimated_seconds:
        is_overdue = True
        overdue_seconds = elapsed_seconds - estimated_seconds

    return {
        "elapsedSeconds": elapsed_seconds,
        "activeDurationSeconds": elapsed_seconds,
        "totalPausedSeconds": total_paused + current_pause_seconds,
        "currentPauseSeconds": current_pause_seconds,
        "totalElapsedSeconds": total_elapsed_seconds,
        "remainingSeconds": remaining_seconds,
        "varianceSeconds": variance_seconds,
        "isOverdue": is_overdue,
        "overdueSeconds": overdue_seconds
    }

# GET /api/job-monitoring/running (Admin Only)
@router.get("/running")
async def get_running_jobs(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    now = datetime.now(timezone.utc)
    stmt = select(Job).order_by(Job.external_id.asc())
    res = await db.execute(stmt)
    all_jobs = res.scalars().all()

    # Fetch users catalog map for assigned engineers
    u_stmt = select(User)
    u_res = await db.execute(u_stmt)
    users_map = {u.id: u.name for u in u_res.scalars().all()}

    output = []
    for j in all_jobs:
        metrics = compute_job_time_metrics(j, now)
        assigned_name = users_map.get(j.assigned_engineer_id, j.responsible_engg_name or "Unassigned")
        current_worker_name = users_map.get(j.current_worker_id, assigned_name)
        prev_worker_name = users_map.get(j.previous_worker_id, "—") if j.previous_worker_id else "—"
        next_worker_name = users_map.get(j.next_worker_id, "Not yet assigned") if j.next_worker_id else "Not yet assigned"

        output.append({
            "id": j.external_id,
            "jobNo": j.job_no,
            "panelName": j.panel_name,
            "projectName": j.project_name,
            "clientName": j.client_name,
            "status": j.lifecycle_status or "Draft",
            "priority": j.priority or "Normal",
            "assignedEngineer": assigned_name,
            "currentWorkerId": j.current_worker_id,
            "currentWorkerName": current_worker_name,
            "currentWorkerPosition": j.current_worker_position or "Engineer",
            "previousWorkerName": prev_worker_name,
            "nextWorkerName": next_worker_name,
            "lastHandoverAt": j.last_handover_at.isoformat() if j.last_handover_at else None,
            "plannedStartAt": j.planned_start_at.isoformat() if j.planned_start_at else None,
            "plannedEndAt": j.planned_end_at.isoformat() if j.planned_end_at else None,
            "estimatedDurationSeconds": j.estimated_duration_seconds or 0,
            "actualStartAt": j.actual_start_at.isoformat() if j.actual_start_at else None,
            "actualEndAt": j.actual_end_at.isoformat() if j.actual_end_at else None,
            "totalPausedSeconds": j.total_paused_seconds or 0,
            "pauseStartedAt": j.pause_started_at.isoformat() if j.pause_started_at else None,
            "progressPercentage": float(j.progress_percentage or 0.0),
            **metrics
        })

    return {
        "serverTime": now.isoformat(),
        "count": len(output),
        "jobs": output
    }

# GET /api/job-monitoring/timeline/{id} (Admin Only)
@router.get("/timeline/{id}")
async def get_job_timeline(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    from app.models import JobExecutionSession, JobHandover
    now = datetime.now(timezone.utc)
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Fetch users catalog map
    u_stmt = select(User)
    u_res = await db.execute(u_stmt)
    users_map = {u.id: u.name for u in u_res.scalars().all()}

    # Fetch sessions
    s_stmt = select(JobExecutionSession).where(
        JobExecutionSession.job_id == job.id
    ).order_by(JobExecutionSession.started_at.asc())
    s_res = await db.execute(s_stmt)
    sessions = s_res.scalars().all()

    # Fetch handovers
    h_stmt = select(JobHandover).where(
        JobHandover.job_id == job.id
    ).order_by(JobHandover.handover_at.asc())
    h_res = await db.execute(h_stmt)
    handovers = h_res.scalars().all()

    # Dynamic Time Bounds Calculation (Dynamic Sliding Window)
    start_candidates = [ts for ts in [job.planned_start_at, job.actual_start_at] if ts]
    if sessions and sessions[0].started_at:
        start_candidates.append(sessions[0].started_at)
    scale_start = min(start_candidates) if start_candidates else now

    end_candidates = [ts for ts in [job.planned_end_at, job.actual_end_at] if ts]
    end_candidates.append(now)
    scale_end = max(end_candidates)

    current_worker_name = users_map.get(job.current_worker_id, job.responsible_engg_name or "Unassigned")

    session_blocks = []
    for s in sessions:
        end_time = s.ended_at or now
        dur = s.duration_seconds if s.ended_at else max(0, int((now - s.started_at).total_seconds()))
        session_blocks.append({
            "id": s.id,
            "sessionType": s.session_type,
            "startedAt": s.started_at.isoformat() if s.started_at else None,
            "endedAt": end_time.isoformat(),
            "durationSeconds": dur,
            "performedBy": s.performed_by,
            "workerPosition": s.worker_position or "Staff",
            "pauseReason": s.pause_reason,
            "notes": s.notes
        })

    handover_points = [
        {
            "id": h.id,
            "fromWorker": users_map.get(h.from_worker_id, "Worker"),
            "fromPosition": h.from_worker_position,
            "toWorker": users_map.get(h.to_worker_id, "Worker"),
            "toPosition": h.to_worker_position,
            "handoverAt": h.handover_at.isoformat(),
            "reason": h.reason,
            "notes": h.notes
        }
        for h in handovers
    ]

    return {
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "panelName": job.panel_name,
        "status": job.lifecycle_status or "Draft",
        "currentWorkerName": current_worker_name,
        "currentWorkerPosition": job.current_worker_position or "Senior Fitter",
        "serverTime": now.isoformat(),
        "scaleStart": scale_start.isoformat(),
        "scaleEnd": scale_end.isoformat(),
        "planned": {
            "startAt": job.planned_start_at.isoformat() if job.planned_start_at else None,
            "endAt": job.planned_end_at.isoformat() if job.planned_end_at else None,
            "estimatedDurationSeconds": job.estimated_duration_seconds or 0
        },
        "sessions": session_blocks,
        "handovers": handover_points
    }

# GET /api/job-monitoring/timeline-overview (Admin Only)
@router.get("/timeline-overview")
async def get_timeline_overview(
    time_range: str = Query("today", description="Scale mode: today, week, month, custom, all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    worker_id: int | None = Query(None),
    status: str | None = Query(None),
    department: str | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    from app.models import JobExecutionSession, JobHandover
    now = datetime.now(timezone.utc)

    # 1. Fetch users catalog map
    u_stmt = select(User)
    u_res = await db.execute(u_stmt)
    users_map = {u.id: u.name for u in u_res.scalars().all()}

    # 2. Build Query
    stmt = select(Job)
    conditions = []

    if search and search.strip():
        term = f"%{search.strip()}%"
        conditions.append(or_(
            Job.job_no.ilike(term),
            Job.panel_name.ilike(term),
            Job.project_name.ilike(term),
            Job.client_name.ilike(term)
        ))

    if worker_id is not None:
        conditions.append(or_(
            Job.current_worker_id == worker_id,
            Job.assigned_engineer_id == worker_id
        ))

    if status and status.strip() and status.lower() != "all":
        st = status.strip()
        if st.lower() == "overdue":
            conditions.append(or_(
                and_(Job.planned_end_at.is_not(None), Job.planned_end_at < now, Job.lifecycle_status != "Completed"),
                and_(Job.estimated_duration_seconds > 0, Job.actual_duration_seconds > Job.estimated_duration_seconds)
            ))
        else:
            conditions.append(Job.lifecycle_status.ilike(st))

    if department and department.strip() and department.lower() != "all":
        conditions.append(Job.target_department.ilike(department.strip()))

    if conditions:
        stmt = stmt.where(and_(*conditions))

    stmt = stmt.order_by(Job.external_id.asc()).limit(limit)
    res = await db.execute(stmt)
    jobs = list(res.scalars().all())

    if not jobs:
        start_bound = now - timedelta(hours=4)
        end_bound = now + timedelta(hours=4)
        return {
            "serverTime": now.isoformat(),
            "timeRange": time_range,
            "scaleStart": start_bound.isoformat(),
            "scaleEnd": end_bound.isoformat(),
            "count": 0,
            "jobs": []
        }

    job_ids = [j.id for j in jobs]

    # 3. Batch fetch sessions
    s_stmt = select(JobExecutionSession).where(
        JobExecutionSession.job_id.in_(job_ids)
    ).order_by(JobExecutionSession.started_at.asc())
    s_res = await db.execute(s_stmt)
    all_sessions = s_res.scalars().all()
    sessions_by_job: dict[int, list] = {}
    for s in all_sessions:
        sessions_by_job.setdefault(s.job_id, []).append(s)

    # 4. Batch fetch handovers
    h_stmt = select(JobHandover).where(
        JobHandover.job_id.in_(job_ids)
    ).order_by(JobHandover.handover_at.asc())
    h_res = await db.execute(h_stmt)
    all_handovers = h_res.scalars().all()
    handovers_by_job: dict[int, list] = {}
    for h in all_handovers:
        handovers_by_job.setdefault(h.job_id, []).append(h)

    # 5. Determine Scale Boundaries
    all_ts = [now]
    for j in jobs:
        if j.planned_start_at: all_ts.append(j.planned_start_at)
        if j.planned_end_at: all_ts.append(j.planned_end_at)
        if j.actual_start_at: all_ts.append(j.actual_start_at)
        if j.actual_end_at: all_ts.append(j.actual_end_at)
    for s in all_sessions:
        if s.started_at: all_ts.append(s.started_at)
        if s.ended_at: all_ts.append(s.ended_at)

    min_ts = min(all_ts)
    max_ts = max(all_ts)

    if time_range == "today":
        start_of_day = datetime(now.year, now.month, now.day, 0, 0, 0, tzinfo=timezone.utc)
        end_of_day = start_of_day + timedelta(days=1)
        scale_start = min(min_ts, start_of_day)
        scale_end = max(max_ts, end_of_day)
    elif time_range == "week":
        start_of_week = now - timedelta(days=now.weekday())
        start_of_week = datetime(start_of_week.year, start_of_week.month, start_of_week.day, 0, 0, 0, tzinfo=timezone.utc)
        end_of_week = start_of_week + timedelta(days=7)
        scale_start = min(min_ts, start_of_week)
        scale_end = max(max_ts, end_of_week)
    elif time_range == "month":
        start_of_month = datetime(now.year, now.month, 1, 0, 0, 0, tzinfo=timezone.utc)
        end_of_month = start_of_month + timedelta(days=31)
        scale_start = min(min_ts, start_of_month)
        scale_end = max(max_ts, end_of_month)
    elif time_range == "custom" and start_date and end_date:
        try:
            scale_start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            scale_end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        except Exception:
            scale_start = min_ts - timedelta(hours=2)
            scale_end = max_ts + timedelta(hours=2)
    else:
        span = max(timedelta(hours=6), max_ts - min_ts)
        scale_start = min_ts - (span * 0.05)
        scale_end = max_ts + (span * 0.05)

    # 6. Build Job Items
    job_items = []
    for j in jobs:
        metrics = compute_job_time_metrics(j, now)
        assigned_name = users_map.get(j.assigned_engineer_id, j.responsible_engg_name or "Unassigned")
        current_name = users_map.get(j.current_worker_id, assigned_name)
        assigned_by = users_map.get(getattr(j, "assigned_by_user_id", None), "Admin")

        j_sessions = sessions_by_job.get(j.id, [])
        session_blocks = []
        for s in j_sessions:
            end_t = s.ended_at or (now if j.lifecycle_status == "Running" else s.started_at)
            dur = s.duration_seconds if s.ended_at else max(0, int((now - s.started_at).total_seconds()))
            session_blocks.append({
                "id": s.id,
                "sessionType": s.session_type,
                "startedAt": s.started_at.isoformat() if s.started_at else None,
                "endedAt": end_t.isoformat() if end_t else None,
                "durationSeconds": dur,
                "performedBy": s.performed_by,
                "workerPosition": s.worker_position or "Staff",
                "pauseReason": s.pause_reason,
                "notes": s.notes
            })

        j_handovers = handovers_by_job.get(j.id, [])
        last_ho = j_handovers[-1] if j_handovers else None

        job_items.append({
            "id": j.external_id,
            "jobNo": j.job_no,
            "panelName": j.panel_name or "Panel",
            "projectName": j.project_name or "",
            "clientName": j.client_name or "",
            "targetDepartment": j.target_department or "Production",
            "status": j.lifecycle_status or "Draft",
            "priority": j.priority or "Normal",
            "assignedByName": assigned_by,
            "assignedEngineer": assigned_name,
            "currentWorkerId": j.current_worker_id,
            "currentWorkerName": current_name,
            "currentWorkerPosition": j.current_worker_position or "Operations Lead",
            "plannedStartAt": j.planned_start_at.isoformat() if j.planned_start_at else None,
            "plannedEndAt": j.planned_end_at.isoformat() if j.planned_end_at else None,
            "estimatedDurationSeconds": j.estimated_duration_seconds or 0,
            "actualStartAt": j.actual_start_at.isoformat() if j.actual_start_at else None,
            "actualEndAt": j.actual_end_at.isoformat() if j.actual_end_at else None,
            "totalPausedSeconds": j.total_paused_seconds or 0,
            "pauseStartedAt": j.pause_started_at.isoformat() if j.pause_started_at else None,
            "pauseReasonCategory": getattr(j, "pause_reason_category", None),
            "pauseNotes": getattr(j, "pause_notes", None),
            "expectedResumeAt": j.expected_resume_at.isoformat() if getattr(j, "expected_resume_at", None) else None,
            "actualDurationSeconds": j.actual_duration_seconds or 0,
            "progressPercentage": float(getattr(j, "progress_percentage", 0.0) or 0.0),
            "targetWorkUnits": getattr(j, "target_work_units", 100) or 100,
            "completedWorkUnits": getattr(j, "completed_work_units", 0) or 0,
            "handoversCount": len(j_handovers),
            "lastHandoverAt": last_ho.handover_at.isoformat() if last_ho else None,
            "sessions": session_blocks,
            **metrics
        })

    return {
        "serverTime": now.isoformat(),
        "timeRange": time_range,
        "scaleStart": scale_start.isoformat(),
        "scaleEnd": scale_end.isoformat(),
        "count": len(job_items),
        "jobs": job_items
    }

# GET /api/job-monitoring/timeline/{id}/history (Admin Only)
@router.get("/timeline/{id}/history")
async def get_job_timeline_history(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    from app.models import JobExecutionSession, JobHandover, JobProgressHistory
    now = datetime.now(timezone.utc)
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    u_stmt = select(User)
    u_res = await db.execute(u_stmt)
    users_map = {u.id: u.name for u in u_res.scalars().all()}

    # Fetch handovers in chronological order
    h_stmt = select(JobHandover).where(
        JobHandover.job_id == job.id
    ).order_by(JobHandover.handover_at.asc())
    h_res = await db.execute(h_stmt)
    handovers = h_res.scalars().all()

    # Fetch sessions
    s_stmt = select(JobExecutionSession).where(
        JobExecutionSession.job_id == job.id
    ).order_by(JobExecutionSession.started_at.asc())
    s_res = await db.execute(s_stmt)
    sessions = s_res.scalars().all()

    # Fetch progress history
    p_stmt = select(JobProgressHistory).where(
        JobProgressHistory.job_id == job.id
    ).order_by(JobProgressHistory.recorded_at.asc())
    p_res = await db.execute(p_stmt)
    progress_logs = p_res.scalars().all()

    assigned_by = users_map.get(getattr(job, "assigned_by_user_id", None), "Admin")
    assigned_to = users_map.get(job.assigned_engineer_id, job.responsible_engg_name or "Unassigned")
    current_worker = users_map.get(job.current_worker_id, assigned_to)

    metrics = compute_job_time_metrics(job, now)

    return {
        "job": {
            "id": job.external_id,
            "jobNo": job.job_no,
            "panelName": job.panel_name,
            "projectName": job.project_name,
            "clientName": job.client_name,
            "status": job.lifecycle_status or "Draft",
            "priority": job.priority or "Normal",
            "targetDepartment": job.target_department or "Production",
            "progressPercentage": float(getattr(job, "progress_percentage", 0.0) or 0.0),
            "plannedStartAt": job.planned_start_at.isoformat() if job.planned_start_at else None,
            "plannedEndAt": job.planned_end_at.isoformat() if job.planned_end_at else None,
            "actualStartAt": job.actual_start_at.isoformat() if job.actual_start_at else None,
            "actualEndAt": job.actual_end_at.isoformat() if job.actual_end_at else None,
            "estimatedDurationSeconds": job.estimated_duration_seconds or 0,
            "actualDurationSeconds": job.actual_duration_seconds or 0,
            "pauseReasonCategory": getattr(job, "pause_reason_category", None),
            "pauseNotes": getattr(job, "pause_notes", None),
            "expectedResumeAt": job.expected_resume_at.isoformat() if getattr(job, "expected_resume_at", None) else None,
            "serverTime": now.isoformat(),
            **metrics
        },
        "assignment": {
            "assignedBy": assigned_by,
            "assignedTo": assigned_to,
            "currentResponsible": current_worker,
            "currentPosition": job.current_worker_position or "Operations Lead",
            "assignedAt": job.planned_start_at.isoformat() if job.planned_start_at else (job.created_at.isoformat() if job.created_at else None),
            "actualStartAt": job.actual_start_at.isoformat() if job.actual_start_at else None
        },
        "handovers": [
            {
                "id": h.id,
                "fromWorkerId": h.from_worker_id,
                "fromWorker": users_map.get(h.from_worker_id, "Worker"),
                "fromPosition": h.from_worker_position or "Engineer",
                "toWorkerId": h.to_worker_id,
                "toWorker": users_map.get(h.to_worker_id, f"Worker #{h.to_worker_id}"),
                "toPosition": h.to_worker_position or "Engineer",
                "handoverAt": h.handover_at.isoformat() if h.handover_at else None,
                "reason": h.reason,
                "notes": h.notes,
                "workCompletedSummary": h.work_completed_summary,
                "statusAtHandover": getattr(h, "status_at_handover", None),
                "progressAtHandover": float(h.progress_at_handover) if getattr(h, "progress_at_handover", None) is not None else None,
                "activeSecondsBefore": h.active_seconds_before_handover,
                "performedBy": h.performed_by
            }
            for h in handovers
        ],
        "sessions": [
            {
                "id": s.id,
                "sessionType": s.session_type,
                "startedAt": s.started_at.isoformat() if s.started_at else None,
                "endedAt": s.ended_at.isoformat() if s.ended_at else None,
                "durationSeconds": s.duration_seconds if s.ended_at else max(0, int((now - s.started_at).total_seconds())),
                "performedBy": s.performed_by,
                "workerPosition": s.worker_position or "Staff",
                "pauseReason": s.pause_reason,
                "notes": s.notes
            }
            for s in sessions
        ],
        "progressLogs": [
            {
                "id": p.id,
                "recordedAt": p.recorded_at.isoformat() if p.recorded_at else None,
                "progressPercentage": float(p.progress_percentage),
                "activeDurationSeconds": p.active_duration_seconds,
                "recordedBy": p.recorded_by,
                "note": p.note
            }
            for p in progress_logs
        ]
    }

# GET /api/job-monitoring/stream (Admin Only SSE)
@router.get("/stream")
async def live_monitoring_stream(
    request: Request,
    user: UserPayload = Depends(require_admin)
):
    queue = broadcaster.subscribe()

    async def event_generator():
        try:
            # Send initial greeting
            yield f"event: connected\ndata: {{\"user\": \"{user.username}\", \"time\": \"{datetime.now(timezone.utc).isoformat()}\"}}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    # Wait for message or timeout after 15s for keep-alive ping
                    message = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {message}\n\n"
                except asyncio.TimeoutError:
                    # Send keep-alive heartbeat
                    yield f": keep-alive {datetime.now(timezone.utc).isoformat()}\n\n"
        finally:
            broadcaster.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
