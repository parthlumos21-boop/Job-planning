import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
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

    if not actual_start:
        elapsed_seconds = 0
    elif j.lifecycle_status == "Running":
        raw = max(0, int((now - actual_start).total_seconds()))
        elapsed_seconds = max(0, raw - total_paused)
    elif j.lifecycle_status == "Paused":
        pause_start = j.pause_started_at or now
        raw = max(0, int((pause_start - actual_start).total_seconds()))
        elapsed_seconds = max(0, raw - total_paused)
    elif j.lifecycle_status == "Completed":
        elapsed_seconds = j.actual_duration_seconds or 0
    else:
        elapsed_seconds = 0

    remaining_seconds = max(0, estimated_seconds - elapsed_seconds) if estimated_seconds > 0 else 0
    variance_seconds = (elapsed_seconds - estimated_seconds) if estimated_seconds > 0 else 0

    # Overdue check: past planned_end_at or variance > 0
    is_overdue = False
    if j.planned_end_at and j.lifecycle_status != "Completed":
        is_overdue = now > j.planned_end_at
    elif estimated_seconds > 0 and elapsed_seconds > estimated_seconds:
        is_overdue = True

    return {
        "elapsedSeconds": elapsed_seconds,
        "remainingSeconds": remaining_seconds,
        "varianceSeconds": variance_seconds,
        "isOverdue": is_overdue
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
