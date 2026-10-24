from datetime import date, datetime, timezone
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models import (
    Job, Account, JobDepartmentSchedule, DepartmentFormulaRule, 
    DepartmentExtensionRequest, JobTargetDateRevision, CompanyWorkingCalendar
)
from app.schemas import UserPayload
from app.services.planning_engine import (
    compute_master_timeline, diff_working_days, add_working_days
)

router = APIRouter(prefix="/planning", tags=["Planning & Dynamic Engine"])

# --- Request / Response Models ---
class CalculatePreviewRequest(BaseModel):
    job_created_date: date | None = None
    complexity: str | None = "medium"  # low, medium, high
    quantity: int | None = 1
    panel_type: str | None = "VFD"
    revision_required: bool | None = False
    has_customer_specs: bool | None = False
    clarification_needed: bool | None = False
    is_large_enclosure: bool | None = False
    ingress_protection: str | None = "IP54"
    has_imported_components: bool | None = False
    custom_enclosure: bool | None = False
    third_party_inspection: bool | None = False
    special_testing: bool | None = False
    outstation_dispatch: bool | None = False
    custom_params: dict[str, Any] | None = None

class RuleUpdateRequest(BaseModel):
    base_days: int
    condition_modifiers: list[dict[str, Any]]
    multiplier: float = 1.0
    description: str = ""
    is_active: bool = True

class ExtensionRequestCreate(BaseModel):
    job_id: int
    department: str
    requested_deadline: date
    reason_category: str
    reason_text: str

class ExtensionReviewRequest(BaseModel):
    action: str  # 'APPROVE' or 'REJECT'
    review_remarks: str = ""

# --- Helper to load active rules from DB ---
async def load_department_rules(db: AsyncSession) -> dict[str, dict]:
    stmt = select(DepartmentFormulaRule).where(DepartmentFormulaRule.is_active.is_(True))
    res = await db.execute(stmt)
    rules_list = res.scalars().all()
    
    rules_dict = {}
    for r in rules_list:
        rules_dict[r.department.lower()] = {
            "base_days": r.base_days,
            "condition_modifiers": r.condition_modifiers or [],
            "multiplier": float(r.multiplier or 1.0),
            "description": r.description
        }
    return rules_dict

# 1. Preview Dynamic Timeline
@router.post("/calculate-preview")
async def calculate_preview(
    req: CalculatePreviewRequest,
    db: AsyncSession = Depends(get_db)
):
    rules = await load_department_rules(db)
    job_date = req.job_created_date or date.today()
    
    # Consolidate parameters
    params = req.model_dump()
    if req.custom_params:
        params.update(req.custom_params)

    timeline = compute_master_timeline(job_date, rules, params)
    return {
        "success": True,
        "timeline": timeline
    }

# 2. Get Rules
@router.get("/rules")
async def get_formula_rules(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = select(DepartmentFormulaRule).order_by(DepartmentFormulaRule.id.asc())
    res = await db.execute(stmt)
    rules = res.scalars().all()
    return rules

# 3. Update Rule for a Department (Admin Only)
@router.put("/rules/{department}")
async def update_formula_rule(
    department: str,
    req: RuleUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    role = (user.role or "").lower()
    username = (user.username or "").lower()
    if role not in ["admin", "executive"] and "keval" not in username:
        raise HTTPException(status_code=403, detail="Only Admins can modify department formula rules.")

    stmt = select(DepartmentFormulaRule).where(func.lower(DepartmentFormulaRule.department) == department.lower().strip())
    res = await db.execute(stmt)
    rule = res.scalar_one_or_none()

    if not rule:
        rule = DepartmentFormulaRule(
            department=department.lower().strip(),
            base_days=req.base_days,
            condition_modifiers=req.condition_modifiers,
            multiplier=req.multiplier,
            description=req.description,
            is_active=req.is_active
        )
        db.add(rule)
    else:
        rule.base_days = req.base_days
        rule.condition_modifiers = req.condition_modifiers
        rule.multiplier = req.multiplier
        rule.description = req.description
        rule.is_active = req.is_active

    await db.commit()
    await db.refresh(rule)
    return {"success": True, "rule": rule}

async def get_job_by_id_or_external(job_id: int, db: AsyncSession) -> Job | None:
    stmt = select(Job).where(or_(Job.id == job_id, Job.external_id == job_id))
    res = await db.execute(stmt)
    return res.scalars().first()

async def initialize_job_timeline_internal(job_id: int, db: AsyncSession):
    job = await get_job_by_id_or_external(job_id, db)
    if not job:
        return None
    real_job_id = job.id

    rules = await load_department_rules(db)
    
    # Extract params from job record
    job_date = date.today()
    if job.planned_start_at:
        job_date = job.planned_start_at.date()
    elif job.created_at:
        job_date = job.created_at.date()

    job_fields = job.fields or {}
    params = {
        "panel_type": job.type_of_panel or job.panel_name or "Standard",
        "quantity": int(job.qty) if str(job.qty or "1").isdigit() else 1,
        "complexity": job_fields.get("complexity", "medium"),
        "revision_required": bool(job_fields.get("revision_required", False)),
        "has_customer_specs": bool(job_fields.get("has_customer_specs", False)),
        "is_large_enclosure": bool(job_fields.get("is_large_enclosure", False)),
        "has_imported_components": bool(job_fields.get("has_imported_components", False)),
        "third_party_inspection": bool(job_fields.get("third_party_inspection", False))
    }
    params.update(job_fields)

    computed = compute_master_timeline(job_date, rules, params)
    dept_schedules = computed["departments"]

    # Delete existing if any, or upsert
    for dept_key, sched in dept_schedules.items():
        stmt = select(JobDepartmentSchedule).where(
            or_(JobDepartmentSchedule.job_id == real_job_id, JobDepartmentSchedule.job_id == job.external_id),
            func.lower(JobDepartmentSchedule.department) == dept_key
        )
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()

        if existing:
            existing.calculated_target_date = sched["planned_end"]
            existing.planned_duration_days = sched["duration_days"]
        else:
            new_sched = JobDepartmentSchedule(
                job_id=real_job_id,
                department=dept_key,
                planned_start_date=sched["planned_start"],
                original_target_date=sched["planned_end"],
                calculated_target_date=sched["planned_end"],
                approved_target_date=sched["planned_end"],
                planned_duration_days=sched["duration_days"],
                status="Pending" if dept_key != "marketing" else "In Progress"
            )
            db.add(new_sched)

    await db.commit()
    return computed

# 4. Initialize / Recalculate Master Timeline for a Job
@router.post("/jobs/{job_id}/initialize-timeline")
async def initialize_job_timeline(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    computed = await initialize_job_timeline_internal(job_id, db)
    if computed is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"success": True, "message": "Timeline initialized successfully", "timeline": computed}

# 5. Get Job Timeline (4-Date Model & 3 Delays)
@router.get("/jobs/{job_id}/timeline")
async def get_job_timeline(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await get_job_by_id_or_external(job_id, db)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    real_job_id = job.id

    # Fetch schedules
    stmt = select(JobDepartmentSchedule).where(
        or_(JobDepartmentSchedule.job_id == real_job_id, JobDepartmentSchedule.job_id == job.external_id)
    ).order_by(JobDepartmentSchedule.planned_start_date.asc())
    res = await db.execute(stmt)
    schedules = res.scalars().all()

    # If empty, initialize automatically
    if not schedules:
        rules = await load_department_rules(db)
        job_date = job.created_at.date() if job.created_at else date.today()
        computed = compute_master_timeline(job_date, rules, {"quantity": 1, "complexity": "medium"})
        for dept_key, sched in computed["departments"].items():
            db.add(JobDepartmentSchedule(
                job_id=real_job_id,
                department=dept_key,
                planned_start_date=sched["planned_start"],
                original_target_date=sched["planned_end"],
                calculated_target_date=sched["planned_end"],
                approved_target_date=sched["planned_end"],
                planned_duration_days=sched["duration_days"],
                status="In Progress" if dept_key == "marketing" else "Pending"
            ))
        await db.commit()
        res = await db.execute(stmt)
        schedules = res.scalars().all()

    # Fetch active extension requests
    ext_stmt = select(DepartmentExtensionRequest).where(
        or_(DepartmentExtensionRequest.job_id == real_job_id, DepartmentExtensionRequest.job_id == job.external_id)
    ).order_by(DepartmentExtensionRequest.created_at.desc())
    ext_res = await db.execute(ext_stmt)
    extension_requests = ext_res.scalars().all()

    ext_map = {}
    for req in extension_requests:
        if req.department not in ext_map:
            ext_map[req.department] = req

    output_schedules = []
    today = date.today()

    for s in schedules:
        # Re-evaluate live delay metrics if in progress or completed
        eff_end = s.actual_completion_date or (today if s.status == "In Progress" and today > s.approved_target_date else s.approved_target_date)
        
        raw_delay = diff_working_days(s.original_target_date, eff_end)
        app_ext = diff_working_days(s.original_target_date, s.approved_target_date)
        acc_delay = diff_working_days(s.approved_target_date, eff_end)

        output_schedules.append({
            "id": s.id,
            "department": s.department,
            "planned_start_date": s.planned_start_date,
            "original_target_date": s.original_target_date,
            "calculated_target_date": s.calculated_target_date,
            "approved_target_date": s.approved_target_date,
            "actual_start_date": s.actual_start_date,
            "actual_completion_date": s.actual_completion_date,
            "planned_duration_days": s.planned_duration_days,
            "actual_duration_days": s.actual_duration_days,
            "raw_delay_days": max(0, raw_delay) if (s.actual_completion_date or today > s.approved_target_date) else 0,
            "approved_extension_days": max(0, app_ext),
            "accountable_delay_days": max(0, acc_delay) if (s.actual_completion_date or today > s.approved_target_date) else 0,
            "status": s.status,
            "pending_request": ext_map.get(s.department) if ext_map.get(s.department) and ext_map[s.department].status == "Pending" else None
        })

    return {
        "job_id": job_id,
        "job_no": job.job_no,
        "client_name": job.client_name,
        "panel_name": job.panel_name,
        "delivery_date": job.delivery_date,
        "schedules": output_schedules
    }

# 6. Submit Extension Request (Department User)
@router.post("/extension-requests")
async def create_extension_request(
    req: ExtensionRequestCreate,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await get_job_by_id_or_external(req.job_id, db)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    real_job_id = job.id

    stmt = select(JobDepartmentSchedule).where(
        or_(JobDepartmentSchedule.job_id == real_job_id, JobDepartmentSchedule.job_id == job.external_id),
        func.lower(JobDepartmentSchedule.department) == req.department.lower().strip()
    )
    res = await db.execute(stmt)
    schedule = res.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Department schedule not found for this job")

    ext_days = diff_working_days(schedule.approved_target_date, req.requested_deadline)
    if ext_days <= 0:
        raise HTTPException(status_code=400, detail="Requested deadline must be after the current approved deadline")

    # Check for existing pending request
    pending_stmt = select(DepartmentExtensionRequest).where(
        or_(DepartmentExtensionRequest.job_id == real_job_id, DepartmentExtensionRequest.job_id == job.external_id),
        DepartmentExtensionRequest.department == req.department.lower().strip(),
        DepartmentExtensionRequest.status == "Pending"
    )
    pend_res = await db.execute(pending_stmt)
    if pend_res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A pending extension request already exists for this department")

    new_req = DepartmentExtensionRequest(
        job_id=real_job_id,
        schedule_id=schedule.id,
        department=req.department.lower().strip(),
        current_deadline=schedule.approved_target_date,
        requested_deadline=req.requested_deadline,
        requested_extension_days=ext_days,
        reason_category=req.reason_category,
        reason_text=req.reason_text,
        status="Pending",
        requested_by_id=user.id,
        requested_by_name=user.name or user.username
    )
    db.add(new_req)
    await db.commit()
    await db.refresh(new_req)

    return {"success": True, "message": "Extension request submitted for Admin review", "request": new_req}

# 7. List Extension Requests (Admin Queue)
@router.get("/extension-requests")
async def list_extension_requests(
    status_filter: str | None = Query(None, alias="status"),
    job_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = select(DepartmentExtensionRequest)
    if status_filter:
        stmt = stmt.where(func.lower(DepartmentExtensionRequest.status) == status_filter.lower().strip())
    if job_id:
        stmt = stmt.where(DepartmentExtensionRequest.job_id == job_id)

    stmt = stmt.order_by(DepartmentExtensionRequest.created_at.desc())
    res = await db.execute(stmt)
    requests = res.scalars().all()
    return requests

# 8. Admin Review (Approve or Reject)
@router.post("/extension-requests/{request_id}/review")
async def review_extension_request(
    request_id: int,
    body: ExtensionReviewRequest,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    role = (user.role or "").lower()
    username = (user.username or "").lower()
    if role not in ["admin", "executive"] and "keval" not in username:
        raise HTTPException(status_code=403, detail="Only Admins or Executives can approve deadline extensions")

    ext_req = await db.get(DepartmentExtensionRequest, request_id)
    if not ext_req:
        raise HTTPException(status_code=404, detail="Extension request not found")

    if ext_req.status != "Pending":
        raise HTTPException(status_code=400, detail=f"Request has already been {ext_req.status}")

    action = body.action.upper().strip()
    if action not in ["APPROVE", "REJECT"]:
        raise HTTPException(status_code=400, detail="Action must be APPROVE or REJECT")

    ext_req.status = "Approved" if action == "APPROVE" else "Rejected"
    ext_req.reviewed_by_id = user.id
    ext_req.reviewed_by_name = user.name or user.username
    ext_req.reviewed_at = datetime.now(timezone.utc)
    ext_req.review_remarks = body.review_remarks

    if action == "APPROVE":
        # Update department schedule approved_target_date
        stmt = select(JobDepartmentSchedule).where(
            JobDepartmentSchedule.job_id == ext_req.job_id,
            func.lower(JobDepartmentSchedule.department) == ext_req.department.lower().strip()
        )
        res = await db.execute(stmt)
        sched = res.scalar_one_or_none()
        if sched:
            old_date = sched.approved_target_date
            sched.approved_target_date = ext_req.requested_deadline
            sched.approved_extension_days = diff_working_days(sched.original_target_date, ext_req.requested_deadline)
            
            # Log in target date revisions table
            revision_log = JobTargetDateRevision(
                job_id=ext_req.job_id,
                previous_target_date=datetime.combine(old_date, datetime.min.time(), tzinfo=timezone.utc),
                revised_target_date=datetime.combine(ext_req.requested_deadline, datetime.min.time(), tzinfo=timezone.utc),
                reason_category=ext_req.reason_category,
                revision_rationale=f"Approved Extension: {ext_req.reason_text} (Notes: {body.review_remarks})",
                authorized_by_id=user.id,
                authorized_by_name=user.name or user.username
            )
            db.add(revision_log)

            # Cascade: Shift downstream calculated dates
            all_scheds_stmt = select(JobDepartmentSchedule).where(
                JobDepartmentSchedule.job_id == ext_req.job_id
            ).order_by(JobDepartmentSchedule.planned_start_date.asc())
            all_res = await db.execute(all_scheds_stmt)
            all_scheds = all_res.scalars().all()
            
            # Simple cascade: if downstream starts before new approved end date, shift it forward
            cur_end = ext_req.requested_deadline
            dept_order = ["marketing", "design", "mechanical", "purchase", "production", "qc", "dispatch"]
            try:
                curr_idx = dept_order.index(ext_req.department.lower())
                for s in all_scheds:
                    s_dept = s.department.lower()
                    if s_dept in dept_order and dept_order.index(s_dept) > curr_idx:
                        if s.calculated_target_date < cur_end:
                            s.calculated_target_date = add_working_days(cur_end, s.planned_duration_days)
                            cur_end = s.calculated_target_date
            except ValueError:
                pass

    await db.commit()
    await db.refresh(ext_req)

    return {
        "success": True,
        "message": f"Extension request {action.lower()}d successfully",
        "request": ext_req
    }

# 9. Department Performance & Delay Analytics
@router.get("/analytics/department-performance")
async def get_department_performance(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = select(JobDepartmentSchedule)
    res = await db.execute(stmt)
    schedules = res.scalars().all()

    today = date.today()
    metrics = {}

    for s in schedules:
        d = s.department.lower()
        if d not in metrics:
            metrics[d] = {
                "department": d,
                "total_assigned": 0,
                "completed": 0,
                "in_progress": 0,
                "overdue": 0,
                "total_planned_days": 0,
                "total_actual_days": 0,
                "total_raw_delay": 0,
                "total_approved_extensions": 0,
                "total_accountable_delay": 0,
                "on_time_count": 0
            }

        m = metrics[d]
        m["total_assigned"] += 1
        m["total_planned_days"] += s.planned_duration_days or 1

        is_done = bool(s.actual_completion_date)
        if is_done:
            m["completed"] += 1
            m["total_actual_days"] += s.actual_duration_days or s.planned_duration_days
            
            # Delay calculations
            raw = diff_working_days(s.original_target_date, s.actual_completion_date)
            app = diff_working_days(s.original_target_date, s.approved_target_date)
            acc = diff_working_days(s.approved_target_date, s.actual_completion_date)

            if raw > 0:
                m["total_raw_delay"] += raw
            if app > 0:
                m["total_approved_extensions"] += app
            if acc > 0:
                m["total_accountable_delay"] += acc
            else:
                m["on_time_count"] += 1
        else:
            m["in_progress"] += 1
            if today > s.approved_target_date:
                m["overdue"] += 1
                acc = diff_working_days(s.approved_target_date, today)
                m["total_accountable_delay"] += max(0, acc)

    # Calculate averages and percentages
    results = []
    for d, m in metrics.items():
        comp = m["completed"]
        tot = m["total_assigned"]
        on_time_rate = round((m["on_time_count"] / comp * 100), 1) if comp > 0 else 100.0
        avg_planned = round(m["total_planned_days"] / tot, 1) if tot > 0 else 0
        avg_actual = round(m["total_actual_days"] / comp, 1) if comp > 0 else avg_planned
        avg_acc_delay = round(m["total_accountable_delay"] / tot, 1) if tot > 0 else 0

        results.append({
            "department": d,
            "total_assigned": tot,
            "completed": comp,
            "in_progress": m["in_progress"],
            "overdue": m["overdue"],
            "avg_planned_days": avg_planned,
            "avg_actual_days": avg_actual,
            "on_time_rate": on_time_rate,
            "total_raw_delay_days": m["total_raw_delay"],
            "total_approved_extensions_days": m["total_approved_extensions"],
            "total_accountable_delay_days": m["total_accountable_delay"],
            "avg_accountable_delay_days": avg_acc_delay
        })

    return results
