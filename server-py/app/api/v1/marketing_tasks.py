from datetime import datetime, date, timezone
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from starlette import status as http_status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models import Job, Account, DepartmentActivity, MarketingTask
from app.schemas import UserPayload
from app.schemas.marketing_tasks import (
    MarketingTaskCreate,
    MarketingTaskUpdate,
    MarketingTaskReassignRequest
)

router = APIRouter(prefix="/marketing/tasks", tags=["Marketing Tasks"])

def is_marketing_authorized(user: UserPayload) -> bool:
    user_role = (user.role or "").lower()
    user_depts = [d.lower() for d in (user.departments or [])]
    is_admin = user_role in ["admin", "executive"] or (user.username or "").lower() == "keval v shah"
    return is_admin or "marketing" in user_depts or user_role in ["mktadmin", "marketing_lead"]

def to_iso(val: Any) -> Optional[str]:
    if val is not None and hasattr(val, "isoformat"):
        return str(val.isoformat())
    return str(val) if val is not None else None

def format_task_response(task: Any, job: Optional[Any] = None) -> dict:
    today_dt = datetime.now(timezone.utc).date()
    target_val = getattr(task, "target_date", None)
    target_dt: Optional[date] = None
    if isinstance(target_val, date):
        target_dt = target_val
    elif target_val:
        try:
            target_dt = date.fromisoformat(str(target_val)[:10])
        except Exception:
            target_dt = None

    task_status = str(getattr(task, "status", "Open") or "Open")
    is_completed = task_status.lower() in ["completed", "cancelled"]
    is_due_today = False
    is_overdue = False
    days_rem = 0

    if target_dt:
        diff_days = (target_dt - today_dt).days
        days_rem = diff_days
        if not is_completed:
            if diff_days == 0:
                is_due_today = True
            elif diff_days < 0:
                is_overdue = True

    start_val = getattr(task, "start_date", None)
    comp_val = getattr(task, "completed_at", None)
    created_val = getattr(task, "created_at", None)
    updated_val = getattr(task, "updated_at", None)

    est_effort = float(getattr(task, "estimated_effort", 0.0) or 0.0)
    act_effort = float(getattr(task, "actual_effort", 0.0) or 0.0)

    return {
        "id": int(getattr(task, "id", 0)),
        "job_id": int(getattr(task, "job_id", 0)),
        "job_no": getattr(job, "job_no", "") if job else "",
        "client_name": getattr(job, "client_name", "") if job else "",
        "project_name": getattr(job, "project_name", "") if job else "",
        "panel_name": getattr(job, "panel_name", "") if job else "",
        "title": str(getattr(task, "title", "") or ""),
        "description": str(getattr(task, "description", "") or ""),
        "created_by_user_id": int(getattr(task, "created_by_user_id", 0) or 0),
        "created_by_name": str(getattr(task, "created_by_name", "") or ""),
        "assigned_to_user_id": int(getattr(task, "assigned_to_user_id", 0) or 0),
        "assigned_to_name": str(getattr(task, "assigned_to_name", "") or ""),
        "start_date": to_iso(start_val) or "",
        "target_date": to_iso(target_val) or "",
        "completed_at": to_iso(comp_val),
        "estimated_effort": est_effort,
        "effort_unit": str(getattr(task, "effort_unit", "hours") or "hours"),
        "actual_effort": act_effort,
        "priority": str(getattr(task, "priority", "Normal") or "Normal"),
        "status": task_status,
        "blocked_reason": str(getattr(task, "blocked_reason", "") or ""),
        "completion_remarks": str(getattr(task, "completion_remarks", "") or ""),
        "is_mandatory_for_readiness": bool(getattr(task, "is_mandatory_for_readiness", False)),
        "readiness_criterion_key": str(getattr(task, "readiness_criterion_key", "") or ""),
        "attachments": list(getattr(task, "attachments", None) or []),
        "is_due_today": is_due_today,
        "is_overdue": is_overdue,
        "days_remaining": days_rem,
        "created_at": to_iso(created_val),
        "updated_at": to_iso(updated_val)
    }


# 1. GET /api/marketing/tasks
@router.get("", response_model=dict)
async def list_marketing_tasks(
    scope: str = Query("my", description="'my' for current user, 'all' for department"),
    job_id: Optional[int] = Query(None),
    task_status: Optional[str] = Query(None, alias="status"),
    priority: Optional[str] = Query(None),
    due_today: Optional[bool] = Query(None),
    overdue: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    if not is_marketing_authorized(user):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Access restricted to Marketing personnel and System Administrators."
        )

    stmt = (
        select(MarketingTask, Job)
        .outerjoin(Job, MarketingTask.job_id == Job.id)
        .order_by(MarketingTask.id.desc())
    )

    if job_id:
        job_match_res = await db.execute(
            select(Job.id).where(or_(Job.id == job_id, Job.external_id == job_id))
        )
        matched_job_ids = list(job_match_res.scalars().all())
        all_ids = list(set([job_id] + matched_job_ids))
        stmt = stmt.where(MarketingTask.job_id.in_(all_ids))

    if scope == "my" and user.id:
        user_name = (user.name or user.username or "").strip().lower()
        stmt = stmt.where(
            or_(
                MarketingTask.assigned_to_user_id == user.id,
                MarketingTask.created_by_user_id == user.id,
                func.lower(MarketingTask.assigned_to_name) == user_name
            )
        )

    if task_status and task_status != "all":
        stmt = stmt.where(func.lower(MarketingTask.status) == task_status.lower())

    if priority and priority != "all":
        stmt = stmt.where(func.lower(MarketingTask.priority) == priority.lower())

    res = await db.execute(stmt)
    records = res.all()

    formatted = []
    total_est_hours = 0.0
    total_act_hours = 0.0
    open_count = 0
    due_today_count = 0
    overdue_count = 0

    for task_obj, job_obj in records:
        row = format_task_response(task_obj, job_obj)

        if due_today is True and not row["is_due_today"]:
            continue
        if overdue is True and not row["is_overdue"]:
            continue

        if search and search.strip():
            q = search.strip().lower()
            t_match = (
                q in row["title"].lower()
                or q in row["description"].lower()
                or q in row["job_no"].lower()
                or q in row["project_name"].lower()
                or q in row["client_name"].lower()
                or q in row["assigned_to_name"].lower()
            )
            if not t_match:
                continue

        formatted.append(row)

        est_val = float(row["estimated_effort"])
        act_val = float(row["actual_effort"])
        est_hrs = est_val if row["effort_unit"] == "hours" else (est_val / 60.0)
        act_hrs = act_val if row["effort_unit"] == "hours" else (act_val / 60.0)
        total_est_hours += est_hrs
        total_act_hours += act_hrs

        if row["status"].lower() not in ["completed", "cancelled"]:
            open_count += 1
            if row["is_due_today"]:
                due_today_count += 1
            elif row["is_overdue"]:
                overdue_count += 1

    return {
        "count": len(formatted),
        "tasks": formatted,
        "summary": {
            "openTasks": open_count,
            "dueToday": due_today_count,
            "overdue": overdue_count,
            "totalEstimatedHours": round(total_est_hours, 2),
            "totalActualHours": round(total_act_hours, 2)
        }
    }


# 2. POST /api/marketing/tasks
@router.post("", response_model=dict, status_code=http_status.HTTP_201_CREATED)
async def create_marketing_task(
    payload: MarketingTaskCreate,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    if not is_marketing_authorized(user):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Access restricted to Marketing personnel and System Administrators."
        )

    job_res = await db.execute(select(Job).where(Job.external_id == payload.job_id))
    job = job_res.scalar_one_or_none()
    if not job:
        job_res = await db.execute(select(Job).where(Job.id == payload.job_id))
        job = job_res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job #{payload.job_id} not found.")

    assigned_user_id = payload.assigned_to_user_id or user.id or 1
    assigned_user_name = user.name or user.username or "Marketing User"
    if payload.assigned_to_user_id and payload.assigned_to_user_id != user.id:
        acc_res = await db.execute(select(Account).where(Account.id == payload.assigned_to_user_id))
        acc = acc_res.scalar_one_or_none()
        if acc:
            assigned_user_name = acc.username

    recent_dup_stmt = (
        select(MarketingTask)
        .where(
            MarketingTask.job_id == job.id,
            MarketingTask.title == payload.title.strip(),
            MarketingTask.created_by_user_id == (user.id or 1),
            MarketingTask.status == "Open"
        )
    )
    existing_dup = (await db.execute(recent_dup_stmt)).first()
    if existing_dup:
        raise HTTPException(
            status_code=409,
            detail=f"An open task with title '{payload.title.strip()}' already exists for this job."
        )

    task = MarketingTask(
        job_id=job.id,
        title=payload.title.strip(),
        description=payload.description or "",
        created_by_user_id=user.id or 1,
        created_by_name=user.name or user.username or "Marketing User",
        assigned_to_user_id=assigned_user_id,
        assigned_to_name=assigned_user_name,
        start_date=payload.start_date,
        target_date=payload.target_date,
        estimated_effort=payload.estimated_effort,
        effort_unit=payload.effort_unit,
        actual_effort=0.0,
        priority=payload.priority,
        status="Open",
        is_mandatory_for_readiness=payload.is_mandatory_for_readiness,
        readiness_criterion_key=payload.readiness_criterion_key,
        attachments=payload.attachments or []
    )
    db.add(task)

    activity = DepartmentActivity(
        job_id=job.id,
        department="marketing",
        action="MARKETING_TASK_CREATED",
        new_value={
            "task_title": task.title,
            "assigned_to": task.assigned_to_name,
            "start_date": str(task.start_date),
            "target_date": str(task.target_date),
            "estimated_effort": float(payload.estimated_effort),
            "is_mandatory": task.is_mandatory_for_readiness
        },
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(task)

    return {
        "success": True,
        "message": f"Task '{task.title}' created successfully.",
        "task": format_task_response(task, job)
    }


# 3. GET /api/marketing/tasks/{task_id}
@router.get("/{task_id}", response_model=dict)
async def get_marketing_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    if not is_marketing_authorized(user):
        raise HTTPException(status_code=403, detail="Access restricted to Marketing personnel.")

    res = await db.execute(
        select(MarketingTask, Job)
        .outerjoin(Job, MarketingTask.job_id == Job.id)
        .where(MarketingTask.id == task_id)
    )
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found.")

    task, job = row
    return {"task": format_task_response(task, job)}


# 4. PATCH /api/marketing/tasks/{task_id}
@router.patch("/{task_id}", response_model=dict)
async def update_marketing_task(
    task_id: int,
    payload: MarketingTaskUpdate,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    if not is_marketing_authorized(user):
        raise HTTPException(status_code=403, detail="Access restricted to Marketing personnel.")

    res = await db.execute(
        select(MarketingTask, Job)
        .outerjoin(Job, MarketingTask.job_id == Job.id)
        .where(MarketingTask.id == task_id)
    )
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found.")

    task, job = row
    old_status = getattr(task, "status", "Open")

    if payload.title is not None:
        setattr(task, "title", payload.title.strip())
    if payload.description is not None:
        setattr(task, "description", payload.description.strip())
    if payload.start_date is not None:
        setattr(task, "start_date", payload.start_date)
    if payload.target_date is not None:
        setattr(task, "target_date", payload.target_date)
    if payload.estimated_effort is not None:
        setattr(task, "estimated_effort", payload.estimated_effort)
    if payload.effort_unit is not None:
        setattr(task, "effort_unit", payload.effort_unit)
    if payload.actual_effort is not None:
        setattr(task, "actual_effort", payload.actual_effort)
    if payload.priority is not None:
        setattr(task, "priority", payload.priority)
    if payload.blocked_reason is not None:
        setattr(task, "blocked_reason", payload.blocked_reason)
    if payload.completion_remarks is not None:
        setattr(task, "completion_remarks", payload.completion_remarks)
    if payload.is_mandatory_for_readiness is not None:
        setattr(task, "is_mandatory_for_readiness", payload.is_mandatory_for_readiness)
    if payload.readiness_criterion_key is not None:
        setattr(task, "readiness_criterion_key", payload.readiness_criterion_key)
    if payload.attachments is not None:
        setattr(task, "attachments", payload.attachments)

    # Status transition handling
    if payload.status is not None:
        new_st = payload.status.title()
        if new_st in ["Open", "In Progress", "Blocked", "Completed", "Cancelled"]:
            setattr(task, "status", new_st)
            if new_st == "Completed" and not getattr(task, "completed_at", None):
                setattr(task, "completed_at", datetime.now(timezone.utc))
            elif new_st != "Completed":
                setattr(task, "completed_at", None)

    # Safety check on dates
    t_start = getattr(task, "start_date", None)
    t_target = getattr(task, "target_date", None)
    if t_start and t_target and t_target < t_start:
        raise HTTPException(
            status_code=422,
            detail="Target Date cannot be earlier than Start Date."
        )

    setattr(task, "updated_at", datetime.now(timezone.utc))

    activity = DepartmentActivity(
        job_id=int(getattr(task, "job_id", 0)),
        department="marketing",
        action="MARKETING_TASK_UPDATED",
        old_value={"status": old_status},
        new_value={
            "status": getattr(task, "status", ""),
            "actual_effort": float(getattr(task, "actual_effort", 0.0) or 0.0)
        },
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(task)

    return {
        "success": True,
        "message": f"Task '{getattr(task, 'title', '')}' updated successfully.",
        "task": format_task_response(task, job)
    }


# 5. POST /api/marketing/tasks/{task_id}/reassign
@router.post("/{task_id}/reassign", response_model=dict)
async def reassign_marketing_task(
    task_id: int,
    payload: MarketingTaskReassignRequest,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    if not is_marketing_authorized(user):
        raise HTTPException(status_code=403, detail="Access restricted to Marketing personnel.")

    res = await db.execute(
        select(MarketingTask, Job)
        .outerjoin(Job, MarketingTask.job_id == Job.id)
        .where(MarketingTask.id == task_id)
    )
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found.")

    task, job = row

    acc_res = await db.execute(select(Account).where(Account.id == payload.new_assigned_user_id))
    acc = acc_res.scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Target assignee user account not found.")

    old_assignee = getattr(task, "assigned_to_name", "")
    setattr(task, "assigned_to_user_id", acc.id)
    setattr(task, "assigned_to_name", acc.username)
    setattr(task, "updated_at", datetime.now(timezone.utc))

    activity = DepartmentActivity(
        job_id=int(getattr(task, "job_id", 0)),
        department="marketing",
        action="MARKETING_TASK_REASSIGNED",
        old_value={"assigned_to": old_assignee},
        new_value={
            "assigned_to": acc.username,
            "reason": payload.reason
        },
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(task)

    return {
        "success": True,
        "message": f"Task reassigned to {acc.username}.",
        "task": format_task_response(task, job)
    }


# 6. DELETE /api/marketing/tasks/{task_id}
@router.delete("/{task_id}", response_model=dict)
async def delete_marketing_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    if not is_marketing_authorized(user):
        raise HTTPException(status_code=403, detail="Access restricted to Marketing personnel.")

    res = await db.execute(select(MarketingTask).where(MarketingTask.id == task_id))
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    user_role = (user.role or "").lower()
    is_admin = user_role in ["admin", "executive"] or (user.username or "").lower() == "keval v shah"
    task_creator_id = int(getattr(task, "created_by_user_id", 0) or 0)
    if task_creator_id != user.id and not is_admin:
        raise HTTPException(
            status_code=403,
            detail="Only the task creator or system administrator can delete this task."
        )

    await db.delete(task)
    await db.commit()

    return {"success": True, "message": f"Task #{task_id} deleted."}


# 7. GET /api/marketing/tasks/jobs/{job_id}
@router.get("/jobs/{job_id}", response_model=dict)
async def list_job_marketing_tasks(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job_res = await db.execute(select(Job).where(Job.external_id == job_id))
    job = job_res.scalar_one_or_none()
    if not job:
        job_res = await db.execute(select(Job).where(Job.id == job_id))
        job = job_res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    res = await db.execute(
        select(MarketingTask)
        .where(or_(MarketingTask.job_id == job.id, MarketingTask.job_id == job.external_id))
        .order_by(MarketingTask.id.asc())
    )
    tasks = res.scalars().all()
    return {
        "count": len(tasks),
        "job_id": job_id,
        "tasks": [format_task_response(t, job) for t in tasks]
    }
