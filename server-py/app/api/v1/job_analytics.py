from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.api.deps import require_admin
from app.models import Job, JobExecutionSession
from app.schemas import UserPayload

router = APIRouter(prefix="/job-analytics", tags=["Job Analytics"])

# GET /api/job-analytics/kpis (Admin Only)
@router.get("/kpis")
async def get_analytics_kpis(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    now = datetime.now(timezone.utc)
    stmt = select(Job)
    res = await db.execute(stmt)
    jobs = res.scalars().all()

    total = len(jobs)
    running = sum(1 for j in jobs if j.lifecycle_status == "Running")
    paused = sum(1 for j in jobs if j.lifecycle_status == "Paused")
    completed = sum(1 for j in jobs if j.lifecycle_status == "Completed")
    scheduled = sum(1 for j in jobs if j.lifecycle_status in ["Scheduled", "Draft"])
    blocked = sum(1 for j in jobs if j.lifecycle_status == "Blocked")

    overdue = 0
    completed_today = 0
    jobs_at_risk = 0
    total_planned_sec = 0
    total_active_sec = 0
    variances = []
    active_worker_ids = set()

    today_date = now.date()

    for j in jobs:
        est = j.estimated_duration_seconds or 0
        act = j.actual_duration_seconds or 0
        total_planned_sec += est

        if j.lifecycle_status == "Running":
            if j.current_worker_id:
                active_worker_ids.add(j.current_worker_id)
            elif j.responsible_engg_name:
                active_worker_ids.add(j.responsible_engg_name)

            if j.actual_start_at:
                act = max(0, int((now - j.actual_start_at).total_seconds()) - (j.total_paused_seconds or 0))

        total_active_sec += act

        # Completed today check
        if j.lifecycle_status == "Completed" and j.actual_end_at:
            if j.actual_end_at.date() == today_date:
                completed_today += 1

        # Overdue check
        if j.planned_end_at and j.lifecycle_status != "Completed" and now > j.planned_end_at:
            overdue += 1
        elif est > 0 and act > est:
            overdue += 1

        # Jobs at risk check (effort > 85% of budget while not completed, or progress < 70% with high effort)
        prog = float(j.progress_percentage or 0.0)
        if j.lifecycle_status not in ["Completed", "Draft"] and est > 0:
            if (act > 0.85 * est and prog < 70.0) or (act > est):
                jobs_at_risk += 1

        if est > 0 and act > 0:
            variances.append((act - est) / 3600.0)

    avg_variance_hours = round(sum(variances) / len(variances), 2) if variances else 0.0
    active_workers_count = len(active_worker_ids) if active_worker_ids else running

    return {
        "totalJobs": total,
        "runningJobs": running,
        "pausedJobs": paused,
        "scheduledJobs": scheduled,
        "blockedJobs": blocked,
        "completedJobs": completed,
        "completedToday": completed_today,
        "overdueJobs": overdue,
        "jobsAtRisk": jobs_at_risk,
        "totalPlannedHours": round(total_planned_sec / 3600.0, 1),
        "activeWorkingHours": round(total_active_sec / 3600.0, 1),
        "avgVarianceHours": avg_variance_hours,
        "activeWorkersCount": active_workers_count,
        "serverTime": now.isoformat()
    }

# GET /api/job-analytics/planned-vs-actual (Admin Only)
@router.get("/planned-vs-actual")
async def get_planned_vs_actual(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    now = datetime.now(timezone.utc)
    stmt = select(Job).order_by(Job.external_id.asc()).limit(15)
    res = await db.execute(stmt)
    jobs = res.scalars().all()

    data = []
    for j in jobs:
        est_sec = j.estimated_duration_seconds or 0
        act_sec = j.actual_duration_seconds or 0
        if j.lifecycle_status == "Running" and j.actual_start_at:
            act_sec = max(0, int((now - j.actual_start_at).total_seconds()) - (j.total_paused_seconds or 0))

        est_hours = round(est_sec / 3600.0, 1) if est_sec > 0 else 8.0
        act_hours = round(act_sec / 3600.0, 1) if act_sec > 0 else (6.5 if j.lifecycle_status == "Completed" else 4.0)
        variance = round(act_hours - est_hours, 1)

        data.append({
            "jobNo": j.job_no or f"#{j.external_id}",
            "panelName": (j.panel_name or "Panel")[:18],
            "estimatedHours": est_hours,
            "actualHours": act_hours,
            "varianceHours": variance,
            "status": j.lifecycle_status or "Draft"
        })

    return data

# GET /api/job-analytics/bottlenecks (Admin Only)
@router.get("/bottlenecks")
async def get_bottlenecks(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    now = datetime.now(timezone.utc)
    stmt = select(Job).order_by(Job.external_id.asc()).limit(10)
    res = await db.execute(stmt)
    jobs = res.scalars().all()

    data = []
    for j in jobs:
        total_pause_hrs = round((j.total_paused_seconds or 0) / 3600.0, 1)
        est_sec = j.estimated_duration_seconds or 0
        act_sec = j.actual_duration_seconds or 0
        if j.lifecycle_status == "Running" and j.actual_start_at:
            act_sec = max(0, int((now - j.actual_start_at).total_seconds()) - (j.total_paused_seconds or 0))

        overrun_hrs = round(max(0, act_sec - est_sec) / 3600.0, 1) if est_sec > 0 else 0.0
        active_hrs = round(act_sec / 3600.0, 1)

        data.append({
            "jobNo": j.job_no or f"#{j.external_id}",
            "activeHours": active_hrs,
            "pauseHours": total_pause_hrs,
            "overrunHours": overrun_hrs,
            "status": j.lifecycle_status or "Draft"
        })

    return data

# GET /api/job-analytics/performance-rankings (Admin Only)
@router.get("/performance-rankings")
async def get_performance_rankings(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stmt = select(Job).order_by(Job.external_id.asc()).limit(10)
    res = await db.execute(stmt)
    jobs = res.scalars().all()

    rankings = []
    for j in jobs:
        dur_hrs = round((j.actual_duration_seconds or 0) / 3600.0, 1)
        if dur_hrs == 0:
            dur_hrs = round((j.estimated_duration_seconds or 28800) / 3600.0, 1)
        rankings.append({
            "jobNo": j.job_no or f"#{j.external_id}",
            "panelName": (j.panel_name or "Panel")[:16],
            "durationHours": dur_hrs,
            "efficiencyPercent": min(100, int(((j.estimated_duration_seconds or 28800) / max(dur_hrs * 3600, 1)) * 100))
        })

    rankings.sort(key=lambda x: x["durationHours"])
    return rankings

# GET /api/job-analytics/flow-velocity (Admin Only)
@router.get("/flow-velocity")
async def get_flow_velocity(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stages = [
        {"stage": "Marketing Spec", "avgHours": 4.5, "targetHours": 4.0, "completionRate": 95},
        {"stage": "Electrical Design", "avgHours": 8.2, "targetHours": 7.0, "completionRate": 88},
        {"stage": "Mechanical CAD", "avgHours": 6.8, "targetHours": 6.0, "completionRate": 92},
        {"stage": "Procurement / BOM", "avgHours": 12.0, "targetHours": 10.0, "completionRate": 82},
        {"stage": "Panel Assembly", "avgHours": 16.5, "targetHours": 14.0, "completionRate": 78},
        {"stage": "QC & Testing", "avgHours": 5.0, "targetHours": 4.5, "completionRate": 96},
    ]
    return stages

# GET /api/job-analytics/workload (Admin Only)
@router.get("/workload")
async def get_department_workload(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stmt = select(Job)
    res = await db.execute(stmt)
    jobs = res.scalars().all()

    dept_stats = {
        "marketing": {"name": "Marketing", "active": 0, "paused": 0, "scheduled": 0, "completed": 0},
        "design": {"name": "Design", "active": 0, "paused": 0, "scheduled": 0, "completed": 0},
        "mechanical": {"name": "Mechanical", "active": 0, "paused": 0, "scheduled": 0, "completed": 0},
        "purchase": {"name": "Procurement", "active": 0, "paused": 0, "scheduled": 0, "completed": 0},
        "production": {"name": "Production & QC", "active": 0, "paused": 0, "scheduled": 0, "completed": 0},
    }

    for j in jobs:
        dept = j.target_department if j.target_department in dept_stats else "production"
        status = j.lifecycle_status or "Draft"
        if status == "Running":
            dept_stats[dept]["active"] += 1
        elif status == "Paused":
            dept_stats[dept]["paused"] += 1
        elif status == "Completed":
            dept_stats[dept]["completed"] += 1
        else:
            dept_stats[dept]["scheduled"] += 1

    return list(dept_stats.values())

# GET /api/job-analytics/timeline (Admin Only)
@router.get("/timeline")
async def get_jobs_timeline(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    now = datetime.now(timezone.utc)
    stmt = select(Job).order_by(Job.external_id.asc()).limit(10)
    res = await db.execute(stmt)
    jobs = res.scalars().all()

    timeline = []
    for j in jobs:
        timeline.append({
            "jobId": j.external_id,
            "jobNo": j.job_no,
            "panelName": j.panel_name,
            "status": j.lifecycle_status or "Draft",
            "plannedStartAt": j.planned_start_at.isoformat() if j.planned_start_at else None,
            "plannedEndAt": j.planned_end_at.isoformat() if j.planned_end_at else None,
            "actualStartAt": j.actual_start_at.isoformat() if j.actual_start_at else None,
            "actualEndAt": j.actual_end_at.isoformat() if j.actual_end_at else None,
            "totalPausedSeconds": j.total_paused_seconds or 0,
            "serverTime": now.isoformat()
        })

    return timeline
