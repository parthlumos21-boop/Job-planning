import os
import uuid
import shutil
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_
from sqlalchemy.orm.attributes import flag_modified
from datetime import datetime, timezone
from app.db.session import get_db
from app.api.deps import get_current_user, is_admin_or_keval
from app.models import Job, JobHandover, DepartmentActivity, User, Account, JobAssignmentHistory, JobExecutionSession
from app.schemas import UserPayload
from app.core.events import broadcaster
from app.api.v1.jobs import format_job_row

router = APIRouter(prefix="/jobs", tags=["Job Handover"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

async def safe_json_body(request: Request) -> dict:
    try:
        data = await request.json()
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}

async def find_job_by_id(db: AsyncSession, id: int) -> Any:
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        stmt2 = select(Job).where(Job.id == id)
        res2 = await db.execute(stmt2)
        job = res2.scalar_one_or_none()
    return job

async def _resolve_valid_user_id(db: AsyncSession, user_id: Any, user_name: Any = None) -> Any:
    """
    Safely resolves a valid User.id that satisfies the PostgreSQL foreign key constraint referencing users(id).
    If user_id is an account (>= 10000) or not present in the users table, it attempts to look up the User by name.
    If still not present in the users table (e.g. system accounts like 'admin' or 'mktadmin'), returns None so the
    foreign key constraint is satisfied without failing.
    """
    if user_id is not None and str(user_id).strip() != "":
        try:
            val = int(user_id)
            if val < 10000:
                stmt = select(User.id).where(User.id == val)
                res = await db.execute(stmt)
                if res.scalar_one_or_none():
                    return val
        except (ValueError, TypeError):
            pass

    if user_name and str(user_name).strip():
        name_str = str(user_name).strip().lower()
        stmt = select(User.id).where(func.lower(User.name) == name_str)
        res = await db.execute(stmt)
        matched_id = res.scalar_one_or_none()
        if matched_id:
            return matched_id

    return None

# 1. POST /api/jobs/{id}/handover/submit
@router.post("/{id}/handover/submit")
async def submit_job_handover(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    target_dept = body.get("target_department") or body.get("targetDepartment") or "planning"
    from_dept = body.get("from_department") or body.get("fromDepartment") or (user.departments[0] if user.departments else "marketing")
    checklist = body.get("checklist") or body.get("handoverChecklist") or {}
    notes = body.get("notes") or body.get("handoverNotes") or ""
    to_worker_id = body.get("to_worker_id") or body.get("toWorkerId")

    # Enforce mandatory marketing tasks gate
    from app.models import MarketingTask
    mkt_stmt = select(MarketingTask).where(
        or_(MarketingTask.job_id == job.id, MarketingTask.job_id == job.external_id),
        MarketingTask.is_mandatory_for_readiness == True
    )
    mkt_res = await db.execute(mkt_stmt)
    mandatory_tasks = mkt_res.scalars().all()
    uncompleted = [t for t in mandatory_tasks if (t.status or "").lower() != "completed"]
    if uncompleted:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot submit job for planning. {len(uncompleted)} mandatory marketing task(s) ('{uncompleted[0].title}') are incomplete."
        )

    previous_status = job.handover_status or "Draft"
    new_status = f"Submitted for {target_dept.capitalize()}" if target_dept.lower() == "planning" else f"Submitted to {target_dept.capitalize()}"
    if target_dept.lower() == "planning":
        new_status = "Submitted for Planning"

    checklist_data = dict(checklist)
    checklist_data["submitted_by"] = user.name or user.username
    from datetime import datetime, timezone
    checklist_data["submitted_at"] = datetime.now(timezone.utc).isoformat()
    checklist_data["target_department"] = target_dept.lower()

    job.handover_status = new_status
    job.target_department = target_dept.lower()
    job.handover_submitted_at = func.now()
    job.handover_checklist = checklist_data
    flag_modified(job, "handover_checklist")
    job.handover_notes = notes

    valid_to_worker_id = await _resolve_valid_user_id(db, to_worker_id)
    # Create immutable handover history record
    handover_record = JobHandover(
        job_id=job.id,
        handover_type="PLANNING" if target_dept.lower() == "planning" else "DEPARTMENT",
        from_department=from_dept,
        to_department=target_dept.lower(),
        to_worker_id=valid_to_worker_id,
        reason=f"Handover from {from_dept.capitalize()} to {target_dept.capitalize()}",
        notes=notes,
        work_completed_summary=f"Handover submitted by {user.name or user.username} with checklist verified.",
        checklist_snapshot=checklist,
        performed_by=user.name or user.username,
        status_at_handover=new_status,
        progress_at_handover=job.progress_percentage or 0.0
    )
    db.add(handover_record)

    # Activity log
    activity = DepartmentActivity(
        job_id=job.id,
        department=from_dept,
        action="HANDOVER_SUBMITTED",
        old_value={"handover_status": previous_status},
        new_value={"handover_status": new_status, "target_department": target_dept, "notes": notes},
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    # Broadcast real-time SSE notification
    await broadcaster.broadcast("HANDOVER_SUBMITTED", {
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "panelName": job.panel_name,
        "fromDepartment": from_dept,
        "targetDepartment": target_dept,
        "submittedBy": user.name or user.username,
        "status": new_status,
        "message": f"Job #{job.job_no} ({job.panel_name}) submitted for {target_dept.capitalize()} by {user.name or user.username}"
    })

    return {
        "success": True,
        "message": f"Job #{job.job_no} successfully submitted to {target_dept.capitalize()}",
        "job": format_job_row(job)
    }

# 2. POST /api/jobs/{id}/handover/accept
@router.post("/{id}/handover/accept")
async def accept_job_handover(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    planning_owner_id = body.get("planning_owner_id") or body.get("planningOwnerId")
    planning_owner_name = body.get("planning_owner_name") or body.get("planningOwnerName")
    notes = body.get("notes") or ""

    previous_status = job.handover_status
    new_status = "Accepted"

    job.handover_status = new_status
    job.handover_accepted_at = func.now()

    valid_owner_id = await _resolve_valid_user_id(db, planning_owner_id, planning_owner_name)
    job.planning_owner_id = valid_owner_id
    if planning_owner_name:
        job.planning_owner_name = str(planning_owner_name).strip()

    # Create immutable handover history record
    handover_record = JobHandover(
        job_id=job.id,
        handover_type="PLANNING",
        from_department="planning",
        to_department="planning",
        to_worker_id=valid_owner_id,
        reason="Handover Accepted by Planning",
        notes=notes or f"Accepted by {user.name or user.username}. Planning Owner: {job.planning_owner_name or 'Unassigned'}",
        work_completed_summary=f"Handover accepted. Planning owner assigned: {job.planning_owner_name or 'None'}",
        performed_by=user.name or user.username,
        status_at_handover=new_status,
        progress_at_handover=job.progress_percentage or 0.0
    )
    db.add(handover_record)

    # Activity log
    activity = DepartmentActivity(
        job_id=job.id,
        department="planning",
        action="HANDOVER_ACCEPTED",
        old_value={"handover_status": previous_status},
        new_value={
            "handover_status": new_status,
            "planning_owner_id": job.planning_owner_id,
            "planning_owner_name": job.planning_owner_name,
            "accepted_by": user.name or user.username
        },
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    # Broadcast real-time SSE notification
    await broadcaster.broadcast("HANDOVER_ACCEPTED", {
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "panelName": job.panel_name,
        "planningOwner": job.planning_owner_name,
        "acceptedBy": user.name or user.username,
        "status": new_status,
        "message": f"Job #{job.job_no} accepted by Planning. Owner: {job.planning_owner_name or user.name or user.username}"
    })

    return {
        "success": True,
        "message": f"Job #{job.job_no} handover accepted successfully",
        "job": format_job_row(job)
    }

# 3. POST /api/jobs/{id}/handover/return
@router.post("/{id}/handover/return")
async def return_job_handover(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    reason = (body.get("reason") or body.get("returnReason") or body.get("notes") or "").strip()
    if not reason or len(reason) < 5:
        raise HTTPException(
            status_code=400,
            detail="A detailed return reason (at least 5 characters) is required"
        )

    previous_status = job.handover_status
    new_status = "Returned for Correction"

    job.handover_status = new_status
    job.handover_return_reason = reason

    # Create immutable handover history record
    handover_record = JobHandover(
        job_id=job.id,
        handover_type="PLANNING",
        from_department="planning",
        to_department="marketing",
        reason=f"Returned: {reason}",
        notes=reason,
        work_completed_summary=f"Handover returned for correction by {user.name or user.username}. Reason: {reason}",
        performed_by=user.name or user.username,
        status_at_handover=new_status,
        progress_at_handover=job.progress_percentage or 0.0
    )
    db.add(handover_record)

    # Activity log
    activity = DepartmentActivity(
        job_id=job.id,
        department="planning",
        action="HANDOVER_RETURNED",
        old_value={"handover_status": previous_status},
        new_value={"handover_status": new_status, "reason": reason, "returned_by": user.name or user.username},
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    # Broadcast real-time SSE notification
    await broadcaster.broadcast("HANDOVER_RETURNED", {
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "panelName": job.panel_name,
        "returnedBy": user.name or user.username,
        "reason": reason,
        "status": new_status,
        "message": f"Job #{job.job_no} returned for correction: {reason}"
    })

    return {
        "success": True,
        "message": f"Job #{job.job_no} returned for correction",
        "job": format_job_row(job)
    }

# 4. POST /api/jobs/{id}/handover/forward
@router.post("/{id}/handover/forward")
async def forward_job_to_department(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    target_dept = (body.get("target_department") or body.get("targetDepartment") or "design").lower()
    notes = body.get("notes") or ""

    previous_status = job.handover_status
    new_status = f"Forwarded to {target_dept.capitalize()}"

    job.handover_status = new_status
    job.target_department = target_dept

    # Also ensure visible_to_departments contains the target department
    visible = list(job.visible_to_departments or [])
    if target_dept not in visible:
        visible.append(target_dept)
    job.visible_to_departments = visible
    flag_modified(job, "visible_to_departments")

    # Handover record
    handover_record = JobHandover(
        job_id=job.id,
        handover_type="DEPARTMENT",
        from_department="planning",
        to_department=target_dept,
        reason=f"Forwarded from Planning to {target_dept.capitalize()}",
        notes=notes or f"Forwarded by {user.name or user.username}",
        work_completed_summary=f"Planning stage complete. Forwarded to {target_dept.capitalize()}.",
        performed_by=user.name or user.username,
        status_at_handover=new_status,
        progress_at_handover=job.progress_percentage or 0.0
    )
    db.add(handover_record)

    activity = DepartmentActivity(
        job_id=job.id,
        department="planning",
        action="STAGE_FORWARDED",
        old_value={"handover_status": previous_status},
        new_value={"handover_status": new_status, "target_department": target_dept, "notes": notes},
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    # Broadcast
    await broadcaster.broadcast("STAGE_FORWARDED", {
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "panelName": job.panel_name,
        "targetDepartment": target_dept,
        "forwardedBy": user.name or user.username,
        "message": f"Job #{job.job_no} forwarded to {target_dept.capitalize()}"
    })

    return {
        "success": True,
        "message": f"Job #{job.job_no} forwarded to {target_dept.capitalize()}",
        "job": format_job_row(job)
    }

# 5. GET /api/jobs/{id}/handover/history
@router.get("/{id}/handover/history")
async def get_job_handover_history(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    job_ids = [job.id, job.external_id] if job else [id]

    stmt = (
        select(JobHandover)
        .where(JobHandover.job_id.in_(job_ids))
        .order_by(desc(JobHandover.handover_at), desc(JobHandover.id))
    )
    res = await db.execute(stmt)
    records = res.scalars().all()

    # Also fetch activities for full chronological context
    act_stmt = (
        select(DepartmentActivity)
        .where(DepartmentActivity.job_id.in_(job_ids))
        .order_by(desc(DepartmentActivity.created_at))
    )
    act_res = await db.execute(act_stmt)
    activities = act_res.scalars().all()

    history = []
    for r in records:
        history.append({
            "id": r.id,
            "type": "HANDOVER",
            "handoverType": r.handover_type,
            "fromDepartment": r.from_department or "Unknown",
            "toDepartment": r.to_department or "Unknown",
            "performedBy": r.performed_by,
            "reason": r.reason,
            "notes": r.notes,
            "workCompletedSummary": r.work_completed_summary,
            "checklistSnapshot": r.checklist_snapshot or {},
            "statusAtHandover": r.status_at_handover,
            "timestamp": r.handover_at.isoformat() if r.handover_at else None
        })

    for a in activities:
        history.append({
            "id": a.id,
            "type": "ACTIVITY",
            "department": a.department,
            "action": a.action,
            "oldValue": a.old_value,
            "newValue": a.new_value,
            "performedBy": a.updated_by,
            "timestamp": a.created_at.isoformat() if a.created_at else None
        })

    # Sort descending by timestamp
    history.sort(key=lambda x: x["timestamp"] or "", reverse=True)

    return history

# 6. GET /api/jobs/handovers/stats
@router.get("/handovers/stats")
async def get_handover_stats(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    all_jobs_stmt = select(Job)
    res = await db.execute(all_jobs_stmt)
    all_jobs = res.scalars().all()

    user_name_lower = (getattr(user, "name", None) or getattr(user, "username", "") or "").lower()
    user_id = getattr(user, "id", None)
    user_username_lower = (getattr(user, "username", "") or "").lower()
    user_role = getattr(user, "role", "user")
    user_depts = set(d.lower() for d in (getattr(user, "departments", []) or []))

    pending_review = 0
    accepted = 0
    returned = 0
    in_progress = 0
    completed = 0
    my_jobs_count = 0

    for j in all_jobs:
        status_clean = (j.handover_status or "Draft").lower()
        if "submitted" in status_clean or "pending" in status_clean:
            pending_review += 1
        elif status_clean == "accepted":
            accepted += 1
        elif "returned" in status_clean:
            returned += 1
        elif "in progress" in status_clean or "planning in progress" in status_clean:
            in_progress += 1
        elif "completed" in status_clean or "forwarded" in status_clean:
            completed += 1

        # Check if job belongs to current user
        is_resp = bool(user_name_lower and (j.responsible_engg_name or "").lower() == user_name_lower) or (user_id is not None and j.assigned_engineer_id == user_id)
        is_plan_owner = bool(user_name_lower and (j.planning_owner_name or "").lower() == user_name_lower) or (user_id is not None and j.planning_owner_id == user_id)
        is_worker = (user_id is not None and j.current_worker_id == user_id)
        creator_name = (getattr(j, "createdBy", None) or getattr(j, "created_by", "") or "").lower()
        is_creator = bool(user_username_lower and creator_name == user_username_lower)
        
        # Or in user's departments
        target_dept = (getattr(j, "target_department", "") or "").lower()
        visible_depts = set(d.lower() for d in (getattr(j, "visible_to_departments", []) or []))
        in_user_dept = bool(user_depts.intersection(visible_depts)) or (target_dept in user_depts if target_dept else False)

        if is_resp or is_plan_owner or is_worker or is_creator or in_user_dept or user_role in ["admin", "executive"]:
            my_jobs_count += 1

    return {
        "pendingReview": pending_review,
        "accepted": accepted,
        "returned": returned,
        "inProgress": in_progress,
        "completed": completed,
        "myJobsCount": my_jobs_count,
        "total": len(all_jobs)
    }

# 7. POST /api/jobs/{id}/attachments
@router.post("/{id}/attachments")
async def upload_job_attachment(
    id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job_upload_dir = os.path.join(UPLOAD_DIR, str(id))
    os.makedirs(job_upload_dir, exist_ok=True)

    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    filename = os.path.basename(file.filename)
    file_ext = os.path.splitext(filename)[1]
    safe_filename = f"{uuid.uuid4().hex[:8]}_{filename}"
    file_path = os.path.join(job_upload_dir, safe_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    from datetime import datetime, timezone
    file_size = os.path.getsize(file_path)
    attachment_record = {
        "id": str(uuid.uuid4()),
        "originalName": filename,
        "storedName": safe_filename,
        "url": f"/uploads/{id}/{safe_filename}",
        "size": file_size,
        "uploadedBy": user.name or user.username,
        "uploadedAt": datetime.now(timezone.utc).isoformat()
    }

    current_attachments = list(job.attachments or [])
    current_attachments.append(attachment_record)
    job.attachments = current_attachments
    flag_modified(job, "attachments")

    await db.commit()
    await db.refresh(job)

    return {
        "success": True,
        "attachment": attachment_record,
        "attachments": job.attachments
    }

# -------------------------------------------------------------
# CONTROL CENTER HELPER FUNCTIONS
# -------------------------------------------------------------

def resolve_job_stage(j: Job) -> str:
    raw = getattr(j, "current_stage", None)
    if raw and raw in [
        "INCOMING", "VERIFICATION", "PLANNING_READY",
        "PLANNING_ASSIGNED", "PLANNING_ACTIVE",
        "NEEDS_CLARIFICATION", "RELEASED"
    ]:
        return raw

    st = (getattr(j, "handover_status", "") or "Draft").lower()
    if "return" in st or "clarif" in st:
        return "NEEDS_CLARIFICATION"
    elif "in progress" in st or "active" in st:
        return "PLANNING_ACTIVE"
    elif "accepted" in st:
        return "PLANNING_ASSIGNED" if getattr(j, "planning_owner_id", None) else "PLANNING_READY"
    elif "submitted" in st or "pending" in st:
        return "VERIFICATION"
    elif "completed" in st or "forward" in st or "release" in st:
        return "RELEASED"
    return "INCOMING"

def compute_planning_readiness(j: Job, mkt_tasks: list = None) -> dict:
    checklist = getattr(j, "handover_checklist", {}) or {}
    fields = getattr(j, "fields", {}) or {}
    attachments = getattr(j, "attachments", None) or []

    reqs = [
        {"key": "job_no", "label": "Job Number Verified", "ready": bool(j.job_no), "mandatory": True},
        {"key": "client_project", "label": "Customer & Project Confirmed", "ready": bool(j.client_name and j.project_name), "mandatory": True},
        {"key": "commercial_po", "label": "PO Information Available", "ready": bool(getattr(j, "po_no", None) or getattr(j, "po_date", None) or getattr(j, "poNo", None) or getattr(j, "poDate", None)), "mandatory": True},
        {"key": "responsible_engg", "label": "Responsible Engineer Assigned", "ready": bool(j.responsible_engg_name), "mandatory": True},
        {"key": "design_input", "label": "Design & Drawings Input", "ready": bool(fields.get("design") or fields.get("mechanical") or checklist.get("designVerified")), "mandatory": True},
        {"key": "documents_attached", "label": "Required Documents Attached", "ready": bool(bool(attachments) or checklist.get("docsVerified")), "mandatory": False}
    ]

    if mkt_tasks:
        for t in mkt_tasks:
            if getattr(t, "is_mandatory_for_readiness", False):
                is_comp = (getattr(t, "status", "") or "").lower() == "completed"
                reqs.append({
                    "key": f"mkt_task_{t.id}",
                    "label": f"Mandatory Task: {t.title}",
                    "ready": is_comp,
                    "mandatory": True,
                    "taskId": t.id
                })

    all_mandatory_ready = all(r["ready"] for r in reqs if r.get("mandatory", True))
    ready_count = sum(1 for r in reqs if r["ready"])
    return {
        "score": f"{ready_count}/{len(reqs)}",
        "readyCount": ready_count,
        "totalCount": len(reqs),
        "isFullyReady": all_mandatory_ready and (ready_count >= 5),
        "requirements": reqs
    }

def compute_stage_durations(j: Job, now: datetime) -> dict:
    durations = dict(getattr(j, "stage_durations", {}) or {})
    stage_started = getattr(j, "stage_started_at", None)
    current_st = resolve_job_stage(j).lower()
    if stage_started:
        current_elapsed = max(0, int((now - stage_started).total_seconds()))
        durations[current_st] = current_elapsed
    return durations

# -------------------------------------------------------------
# CONTROL CENTER ENDPOINTS
# -------------------------------------------------------------

# 8. GET /api/jobs/control-center/summary
@router.get("/control-center/summary")
async def get_control_center_summary(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    all_jobs_stmt = select(Job)
    res = await db.execute(all_jobs_stmt)
    all_jobs = res.scalars().all()

    now = datetime.now(timezone.utc)
    user_name_lower = (getattr(user, "name", None) or getattr(user, "username", "") or "").lower()
    user_id = getattr(user, "id", None)
    user_depts = set(d.lower() for d in (getattr(user, "departments", []) or []))
    is_admin = is_admin_or_keval(user)

    counts = {
        "incoming": 0,
        "verification": 0,
        "planningReady": 0,
        "planningAssigned": 0,
        "planningActive": 0,
        "needsClarification": 0,
        "released": 0,
        "releasedToday": 0,
        "total": len(all_jobs),
        "myActions": {
            "waitingForMe": 0,
            "assignedToMe": 0,
            "returnedToMe": 0,
            "dueToday": 0,
            "overdue": 0,
            "recentlyCompleted": 0
        },
        "bottlenecks": {
            "unassignedPlanning": 0,
            "missingDesign": 0,
            "overdue": 0
        }
    }

    for j in all_jobs:
        st = resolve_job_stage(j)
        if st == "INCOMING":
            counts["incoming"] += 1
        elif st == "VERIFICATION":
            counts["verification"] += 1
        elif st == "PLANNING_READY":
            counts["planningReady"] += 1
            counts["bottlenecks"]["unassignedPlanning"] += 1
        elif st == "PLANNING_ASSIGNED":
            counts["planningAssigned"] += 1
        elif st == "PLANNING_ACTIVE":
            counts["planningActive"] += 1
        elif st == "NEEDS_CLARIFICATION":
            counts["needsClarification"] += 1
            counts["bottlenecks"]["missingDesign"] += 1
        elif st == "RELEASED":
            counts["released"] += 1
            if j.updated_at and j.updated_at.date() == now.date():
                counts["releasedToday"] += 1

        # Check user actions
        is_resp = bool(user_name_lower and (j.responsible_engg_name or "").lower() == user_name_lower) or (user_id is not None and j.assigned_engineer_id == user_id)
        is_plan_owner = bool(user_name_lower and (j.planning_owner_name or "").lower() == user_name_lower) or (user_id is not None and j.planning_owner_id == user_id)

        if is_plan_owner:
            counts["myActions"]["assignedToMe"] += 1
            if st in ["PLANNING_ASSIGNED", "PLANNING_ACTIVE"]:
                counts["myActions"]["waitingForMe"] += 1
        elif is_resp:
            counts["myActions"]["assignedToMe"] += 1
            if st == "NEEDS_CLARIFICATION":
                counts["myActions"]["returnedToMe"] += 1
                counts["myActions"]["waitingForMe"] += 1

        # Due date check
        due = getattr(j, "stage_due_date", None)
        if due and st != "RELEASED":
            if now > due:
                counts["myActions"]["overdue"] += 1
                counts["bottlenecks"]["overdue"] += 1
            elif due.date() == now.date():
                counts["myActions"]["dueToday"] += 1

    return counts

# 9. GET /api/jobs/control-center/queue
@router.get("/control-center/queue")
async def get_control_center_queue(
    stage: str | None = None,
    department: str | None = None,
    responsible_engg: str | None = None,
    planning_owner: str | None = None,
    priority: str | None = None,
    attention: str | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = select(Job).order_by(desc(Job.id))
    res = await db.execute(stmt)
    jobs = res.scalars().all()

    now = datetime.now(timezone.utc)
    user_name_lower = (getattr(user, "name", None) or getattr(user, "username", "") or "").lower()
    user_id = getattr(user, "id", None)
    is_admin = is_admin_or_keval(user)
    user_depts = set(d.lower() for d in (getattr(user, "departments", []) or []))

    result = []
    for j in jobs:
        st = resolve_job_stage(j)

        # Department visibility check
        if not is_admin:
            target_dept = (getattr(j, "target_department", "") or "").lower()
            vis_depts = set(d.lower() for d in (getattr(j, "visible_to_departments", []) or []))
            is_resp = bool(user_name_lower and (j.responsible_engg_name or "").lower() == user_name_lower) or (user_id is not None and j.assigned_engineer_id == user_id)
            is_plan_owner = bool(user_name_lower and (j.planning_owner_name or "").lower() == user_name_lower) or (user_id is not None and j.planning_owner_id == user_id)
            if not (is_resp or is_plan_owner or user_depts.intersection(vis_depts) or (target_dept in user_depts if target_dept else False)):
                continue

        # Filters
        if stage and stage.upper() != "ALL":
            if st != stage.upper():
                continue

        if department and department != "all":
            j_dept = (getattr(j, "target_department", "") or "").lower()
            if j_dept != department.lower():
                continue

        if responsible_engg and responsible_engg != "all":
            if (j.responsible_engg_name or "").lower() != responsible_engg.lower():
                continue

        if planning_owner and planning_owner != "all":
            if (j.planning_owner_name or "").lower() != planning_owner.lower():
                continue

        if priority and priority != "all":
            if (j.priority or "Normal").lower() != priority.lower():
                continue

        if search:
            q = search.lower()
            m = (
                q in (j.job_no or "").lower()
                or q in (j.panel_name or "").lower()
                or q in (j.client_name or "").lower()
                or q in (j.project_name or "").lower()
                or q in (j.responsible_engg_name or "").lower()
                or q in (j.planning_owner_name or "").lower()
            )
            if not m:
                continue

        readiness = compute_planning_readiness(j)

        # Attention filters
        if attention:
            due = getattr(j, "stage_due_date", None)
            is_overdue = bool(due and now > due and st != "RELEASED")
            if attention == "overdue" and not is_overdue:
                continue
            elif attention == "unassigned" and (st != "PLANNING_READY" or j.planning_owner_id is not None):
                continue
            elif attention == "missing_info" and readiness["isFullyReady"]:
                continue
            elif attention == "returned" and st != "NEEDS_CLARIFICATION":
                continue
            elif attention == "ready_to_start" and st != "PLANNING_ASSIGNED":
                continue

        row = format_job_row(j)
        row["stage"] = st
        row["readiness"] = readiness
        result.append(row)

    return result

# 10. POST /api/jobs/{id}/control/verify-item
@router.post("/{id}/control/verify-item")
async def verify_checklist_item(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    item_key = body.get("itemKey")
    verified = body.get("verified", True)
    comment = body.get("comment", "")

    checklist = dict(getattr(job, "handover_checklist", {}) or {})
    checklist[item_key] = {
        "verified": verified,
        "verifiedBy": user.name or user.username,
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
        "comment": comment
    }
    job.handover_checklist = checklist
    flag_modified(job, "handover_checklist")

    # If verification makes it ready
    readiness = compute_planning_readiness(job)
    if readiness["isFullyReady"] and resolve_job_stage(job) in ["INCOMING", "VERIFICATION"]:
        setattr(job, "current_stage", "PLANNING_READY")
        setattr(job, "current_action", "Assign Planning Owner")
        setattr(job, "current_waiting_reason", "All inputs verified. Waiting for Planning Owner Assignment.")

    activity = DepartmentActivity(
        job_id=job.id,
        department="planning",
        action="CHECKLIST_ITEM_VERIFIED",
        old_value={"item": item_key, "previous": checklist.get(item_key, {})},
        new_value=checklist[item_key],
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    return {"success": True, "readiness": readiness, "job": format_job_row(job)}

# 11. POST /api/jobs/{id}/control/assign-owner
@router.post("/{id}/control/assign-owner")
async def assign_planning_owner(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    planning_owner_id = (
        body.get("planningOwnerId")
        if body.get("planningOwnerId") is not None
        else body.get("planning_owner_id")
        if body.get("planning_owner_id") is not None
        else body.get("ownerId")
        if body.get("ownerId") is not None
        else body.get("owner_id")
    )
    planning_owner_name = (
        body.get("planningOwnerName")
        or body.get("planning_owner_name")
        or body.get("ownerName")
        or body.get("owner_name")
        or ""
    ).strip()
    reason_category = (
        body.get("reasonCategory")
        or body.get("reason_category")
        or "Capacity & Availability"
    ).strip()
    reason_explanation = (
        body.get("reasonExplanation")
        or body.get("assignmentReason")
        or body.get("explanation")
        or body.get("reason")
        or ""
    ).strip()
    priority = body.get("priority", "Normal")
    expected_start = body.get("expectedStart")
    target_completion = body.get("targetCompletion") or body.get("targetDueDate")

    if planning_owner_id is None or planning_owner_id == "" or not planning_owner_name:
        raise HTTPException(status_code=400, detail="Planning Owner selection is required")

    try:
        planning_owner_id = int(planning_owner_id)
    except (ValueError, TypeError):
        pass

    if not reason_category:
        reason_category = "General Assignment"

    if not reason_explanation or len(reason_explanation) < 5:
        raise HTTPException(status_code=400, detail="Detailed assignment explanation (at least 5 characters) is required")

    now = datetime.now(timezone.utc)
    previous_owner = job.planning_owner_name or "Unassigned"
    valid_owner_id = await _resolve_valid_user_id(db, planning_owner_id, planning_owner_name)
    job.planning_owner_id = valid_owner_id
    job.planning_owner_name = str(planning_owner_name).strip()
    job.priority = priority
    job.assignment_reason_category = reason_category
    job.assignment_explanation = reason_explanation
    job.current_stage = "PLANNING_ASSIGNED"
    job.current_action = f"Planning assigned to {planning_owner_name}. Start planning review."
    job.current_waiting_reason = ""
    job.stage_started_at = now

    if target_completion:
        try:
            job.stage_due_date = datetime.fromisoformat(target_completion.replace("Z", "+00:00"))
        except Exception:
            pass

    full_reason = f"[{reason_category}] {reason_explanation}"

    handover_record = JobHandover(
        job_id=job.id,
        handover_type="PLANNING",
        from_department="planning",
        to_department="planning",
        to_worker_id=valid_owner_id,
        reason=f"Planning Owner Assigned: {planning_owner_name}",
        notes=full_reason,
        work_completed_summary=f"Assigned by {user.name or user.username}. Reason: {full_reason}",
        performed_by=user.name or user.username,
        status_at_handover="PLANNING_ASSIGNED",
        progress_at_handover=float(getattr(job, "progress_percentage", 0.0) or 0.0)
    )
    db.add(handover_record)

    activity = DepartmentActivity(
        job_id=job.id,
        department="planning",
        action="PLANNING_OWNER_ASSIGNED",
        old_value={"planning_owner": previous_owner},
        new_value={
            "planning_owner": planning_owner_name,
            "category": reason_category,
            "explanation": reason_explanation,
            "assigned_by": user.name or user.username
        },
        updated_by=user.name or user.username
    )
    db.add(activity)

    assignment_hist = JobAssignmentHistory(
        job_id=job.id,
        change_type="INITIAL_ASSIGNMENT",
        previous_owner_id=None,
        previous_owner_name=previous_owner,
        new_owner_id=planning_owner_id or 0,
        new_owner_name=planning_owner_name,
        assigned_by_id=user.id or 0,
        assigned_by_name=user.name or user.username,
        assigned_by_department=user.departments[0] if user.departments else "planning",
        assigned_by_role=user.role,
        reason_category=reason_category or "Initial Assignment",
        detailed_explanation=reason_explanation or "Initial planning lead assigned",
        additional_note="",
        workflow_stage=resolve_job_stage(job),
        expected_start_date=now,
        target_completion_date=job.stage_due_date,
        priority=job.priority or "Normal"
    )
    db.add(assignment_hist)

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("PLANNING_OWNER_ASSIGNED", {
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "panelName": job.panel_name,
        "planningOwner": planning_owner_name,
        "assignedBy": user.name or user.username,
        "message": f"Job #{job.job_no} assigned to {planning_owner_name} ({reason_category})"
    })

    return {"success": True, "message": "Planning owner assigned successfully", "job": format_job_row(job)}

# 12. POST /api/jobs/{id}/control/reassign-owner
@router.post("/{id}/control/reassign-owner")
async def reassign_planning_owner(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    new_owner_id = (
        body.get("newOwnerId")
        if body.get("newOwnerId") is not None
        else body.get("new_owner_id")
        if body.get("new_owner_id") is not None
        else body.get("ownerId")
        if body.get("ownerId") is not None
        else body.get("owner_id")
    )
    new_owner_name = (
        body.get("newOwnerName")
        or body.get("new_owner_name")
        or body.get("ownerName")
        or body.get("owner_name")
        or ""
    ).strip()
    reason_category = (
        body.get("reasonCategory")
        or body.get("reason_category")
        or "Reassignment"
    ).strip()
    reassignment_reason = (
        body.get("reassignmentReason")
        or body.get("reason")
        or body.get("explanation")
        or ""
    ).strip()
    additional_note = (
        body.get("additionalNote")
        or body.get("notes")
        or ""
    ).strip()

    if new_owner_id is None or new_owner_id == "" or not new_owner_name:
        raise HTTPException(status_code=400, detail="New Planning Owner is required")

    try:
        new_owner_id = int(new_owner_id)
    except (ValueError, TypeError):
        pass

    if not reassignment_reason or len(reassignment_reason) < 5:
        raise HTTPException(status_code=400, detail="Reassignment reason is mandatory (at least 5 characters)")

    now = datetime.now(timezone.utc)
    previous_owner = job.planning_owner_name or "Unassigned"
    valid_owner_id = await _resolve_valid_user_id(db, new_owner_id, new_owner_name)
    job.planning_owner_id = valid_owner_id
    job.planning_owner_name = str(new_owner_name).strip()
    job.assignment_reason_category = reason_category or "Reassignment"
    job.assignment_explanation = reassignment_reason
    job.current_action = f"Planning reassigned to {new_owner_name}. Continue planning review."
    job.stage_started_at = now

    note_text = f"Reassigned from {previous_owner} to {new_owner_name}. Reason: [{reason_category}] {reassignment_reason}"
    if additional_note:
        note_text += f". Note: {additional_note}"

    handover_record = JobHandover(
        job_id=job.id,
        handover_type="PLANNING",
        from_department="planning",
        to_department="planning",
        to_worker_id=valid_owner_id,
        reason=f"Planning Owner Reassigned: {previous_owner} → {new_owner_name}",
        notes=note_text,
        work_completed_summary=f"Reassigned by {user.name or user.username}. Reason: {reassignment_reason}",
        performed_by=user.name or user.username,
        status_at_handover="PLANNING_ASSIGNED",
        progress_at_handover=float(getattr(job, "progress_percentage", 0.0) or 0.0)
    )
    db.add(handover_record)

    activity = DepartmentActivity(
        job_id=job.id,
        department="planning",
        action="PLANNING_OWNER_REASSIGNED",
        old_value={"planning_owner": previous_owner},
        new_value={
            "planning_owner": new_owner_name,
            "category": reason_category,
            "reason": reassignment_reason,
            "note": additional_note,
            "reassigned_by": user.name or user.username
        },
        updated_by=user.name or user.username
    )
    db.add(activity)

    assignment_hist = JobAssignmentHistory(
        job_id=job.id,
        change_type="REASSIGNMENT",
        previous_owner_id=getattr(job, "planning_owner_id", None),
        previous_owner_name=previous_owner,
        new_owner_id=new_owner_id,
        new_owner_name=new_owner_name,
        assigned_by_id=user.id or 0,
        assigned_by_name=user.name or user.username,
        assigned_by_department=user.departments[0] if user.departments else "planning",
        assigned_by_role=user.role,
        reason_category=reason_category,
        detailed_explanation=reassignment_reason,
        additional_note=additional_note,
        workflow_stage=resolve_job_stage(job),
        expected_start_date=now,
        target_completion_date=job.stage_due_date,
        priority=job.priority or "Normal"
    )
    db.add(assignment_hist)

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("PLANNING_OWNER_REASSIGNED", {
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "panelName": job.panel_name,
        "previousOwner": previous_owner,
        "newOwner": new_owner_name,
        "reassignedBy": user.name or user.username,
        "message": f"Job #{job.job_no} reassigned from {previous_owner} to {new_owner_name}"
    })

    return {"success": True, "message": "Planning owner reassigned successfully", "job": format_job_row(job)}

# 13. POST /api/jobs/{id}/control/request-clarification
@router.post("/{id}/control/request-clarification")
async def request_job_clarification(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = select(Job).where(or_(Job.external_id == id, Job.id == id))
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    requested_from = body.get("requestedFrom") or job.responsible_engg_name or "Responsible Engineer"
    reason_category = body.get("reasonCategory", "Missing Technical Information")
    details = (body.get("details") or body.get("reason") or "").strip()

    if not details or len(details) < 5:
        raise HTTPException(status_code=400, detail="Clarification details (at least 5 characters) are required")

    previous_stage = resolve_job_stage(job)
    job.current_stage = "NEEDS_CLARIFICATION"
    job.handover_status = "Returned for Correction"
    job.handover_return_reason = f"[{reason_category}] {details}"
    job.current_action = f"Waiting for clarification/correction from {requested_from}"
    job.current_waiting_reason = f"Clarification requested: {details}"

    activity = DepartmentActivity(
        job_id=job.external_id,
        department="planning",
        action="CLARIFICATION_REQUESTED",
        old_value={"stage": previous_stage},
        new_value={
            "requested_from": requested_from,
            "category": reason_category,
            "details": details,
            "requested_by": user.name or user.username
        },
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("CLARIFICATION_REQUESTED", {
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "panelName": job.panel_name,
        "requestedFrom": requested_from,
        "message": f"Clarification requested on Job #{job.job_no} from {requested_from}"
    })

    return {"success": True, "message": "Clarification requested successfully", "job": format_job_row(job)}

# 14. POST /api/jobs/{id}/control/submit-correction
@router.post("/{id}/control/submit-correction")
async def submit_job_correction(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = select(Job).where(or_(Job.external_id == id, Job.id == id))
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    correction_summary = (body.get("correctionSummary") or body.get("summary") or body.get("notes") or "").strip()

    if not correction_summary:
        raise HTTPException(status_code=400, detail="Correction summary is required")

    job.current_stage = "VERIFICATION"
    job.handover_status = "Submitted for Planning"
    job.current_action = "Review submitted corrections and verify inputs"
    job.current_waiting_reason = ""
    job.stage_started_at = func.now()

    activity = DepartmentActivity(
        job_id=job.external_id,
        department=user.departments[0] if user.departments else "marketing",
        action="CORRECTION_SUBMITTED",
        old_value={"stage": "NEEDS_CLARIFICATION"},
        new_value={"summary": correction_summary, "submitted_by": user.name or user.username},
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("CORRECTION_SUBMITTED", {
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "submittedBy": user.name or user.username,
        "message": f"Correction submitted on Job #{job.job_no} by {user.name or user.username}"
    })

    return {"success": True, "message": "Correction submitted successfully", "job": format_job_row(job)}

# 15. POST /api/jobs/{id}/control/start-planning
@router.post("/{id}/control/start-planning")
async def start_planning_work(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    note = body.get("note", "Planning work initiated")

    now = datetime.now(timezone.utc)

    # Determine worker name and worker id
    worker_id = job.planning_owner_id or user.id
    worker_name = job.planning_owner_name or user.name or user.username or "Planning Engineer"

    # Auto-assign planning owner if missing
    if not job.planning_owner_id:
        job.planning_owner_id = worker_id
        job.planning_owner_name = worker_name

    # Set execution and stage tracking fields
    job.current_stage = "PLANNING_ACTIVE"
    job.handover_status = "Planning in Progress"
    job.lifecycle_status = "In Progress"
    job.current_action = f"Planning in progress by {worker_name}"
    job.current_worker_id = worker_id
    job.current_worker_position = "Planning Engineer"
    job.stage_started_at = now
    job.pause_started_at = None
    if not job.actual_start_at:
        job.actual_start_at = now

    # Close any existing open sessions for this job
    c_stmt = select(JobExecutionSession).where(
        JobExecutionSession.job_id == job.id,
        JobExecutionSession.ended_at.is_(None)
    )
    c_res = await db.execute(c_stmt)
    for cs in c_res.scalars().all():
        cs.ended_at = now
        cs.duration_seconds = max(0, int((now - cs.started_at).total_seconds()))
        job.actual_duration_seconds = (job.actual_duration_seconds or 0) + cs.duration_seconds

    # Create new active WORK execution session
    session = JobExecutionSession(
        job_id=job.id,
        session_type="WORK",
        started_at=now,
        performed_by=worker_name,
        worker_id=worker_id,
        worker_position="Planning Engineer",
        notes=f"Planning milestone started: {note}"
    )
    db.add(session)

    # Record activity in department_activities
    activity = DepartmentActivity(
        job_id=job.id,
        department="planning",
        action="PLANNING_STARTED",
        old_value={"stage": getattr(job, "current_stage", "PLANNING_ASSIGNED")},
        new_value={"started_by": worker_name, "worker_id": worker_id, "note": note},
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    # Broadcast real-time notifications
    await broadcaster.broadcast("JOB_STATUS_CHANGED", {
        "event": "JOB_STATUS_CHANGED",
        "job_id": job.external_id,
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "status": "In Progress",
        "lifecycle_status": "In Progress",
        "current_stage": "PLANNING_ACTIVE",
        "worker_name": worker_name,
        "server_time": now.isoformat()
    })

    await broadcaster.broadcast("PLANNING_STARTED", {
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "workerName": worker_name,
        "message": f"Planning milestone started on Job #{job.job_no} by {worker_name}"
    })

    return {"success": True, "message": "Planning started", "job": format_job_row(job)}

# 16. POST /api/jobs/{id}/control/complete-planning
@router.post("/{id}/control/complete-planning")
async def complete_planning_work(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    note = body.get("note", "Planning review complete and verified")

    now = datetime.now(timezone.utc)

    # Close active work sessions and accumulate durations
    c_stmt = select(JobExecutionSession).where(
        JobExecutionSession.job_id == job.id,
        JobExecutionSession.ended_at.is_(None)
    )
    c_res = await db.execute(c_stmt)
    total_closed_dur = 0
    for cs in c_res.scalars().all():
        cs.ended_at = now
        cs.duration_seconds = max(0, int((now - cs.started_at).total_seconds()))
        total_closed_dur += cs.duration_seconds

    job.actual_duration_seconds = (job.actual_duration_seconds or 0) + total_closed_dur

    durations = compute_stage_durations(job, now)
    job.stage_durations = durations
    flag_modified(job, "stage_durations")

    job.current_stage = "PLANNING_ACTIVE"
    job.current_action = "Planning complete. Ready to release to next department."

    activity = DepartmentActivity(
        job_id=job.id,
        department="planning",
        action="PLANNING_COMPLETED",
        old_value={"stage": "PLANNING_ACTIVE"},
        new_value={"completed_by": user.name or user.username, "note": note},
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("JOB_STATUS_CHANGED", {
        "event": "JOB_STATUS_CHANGED",
        "job_id": job.external_id,
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "status": job.lifecycle_status or "In Progress",
        "current_stage": job.current_stage,
        "message": f"Planning completed on Job #{job.job_no}"
    })

    return {"success": True, "message": "Planning completed successfully", "job": format_job_row(job)}

# 17. POST /api/jobs/{id}/control/release
@router.post("/{id}/control/release")
async def release_to_next_department(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    target_dept = (body.get("targetDepartment") or "production").lower()
    next_owner_id = body.get("nextOwnerId")
    next_owner_name = body.get("nextOwnerName") or "Department Lead"
    forwarding_reason_category = body.get("reasonCategory", "Planning Completed & Verified")
    forwarding_note = body.get("notes") or body.get("forwardingNote") or ""

    if not forwarding_reason_category:
        raise HTTPException(status_code=400, detail="Forwarding reason category is mandatory")

    now = datetime.now(timezone.utc)

    # Close any lingering open session for this job
    c_stmt = select(JobExecutionSession).where(
        JobExecutionSession.job_id == job.id,
        JobExecutionSession.ended_at.is_(None)
    )
    c_res = await db.execute(c_stmt)
    for cs in c_res.scalars().all():
        cs.ended_at = now
        cs.duration_seconds = max(0, int((now - cs.started_at).total_seconds()))
        job.actual_duration_seconds = (job.actual_duration_seconds or 0) + cs.duration_seconds

    durations = compute_stage_durations(job, now)
    job.stage_durations = durations
    flag_modified(job, "stage_durations")

    job.previous_worker_id = job.current_worker_id
    job.current_worker_id = next_owner_id
    job.current_worker_position = f"{target_dept.capitalize()} Lead"
    job.last_handover_at = now

    job.current_stage = "RELEASED"
    job.handover_status = f"Forwarded to {target_dept.capitalize()}"
    job.target_department = target_dept
    job.forwarding_reason_category = forwarding_reason_category
    job.forwarding_note = forwarding_note
    job.current_action = f"Released to {target_dept.capitalize()} ({next_owner_name})"

    vis = list(job.visible_to_departments or [])
    if target_dept not in vis:
        vis.append(target_dept)
    job.visible_to_departments = vis

    handover_record = JobHandover(
        job_id=job.id,
        handover_type="DEPARTMENT",
        from_department="planning",
        to_department=target_dept,
        from_worker_id=job.previous_worker_id,
        to_worker_id=next_owner_id,
        reason=f"Released to {target_dept.capitalize()} - {forwarding_reason_category}",
        notes=forwarding_note,
        work_completed_summary=f"Released by {user.name or user.username}. Note: {forwarding_note}",
        performed_by=user.name or user.username,
        status_at_handover="RELEASED",
        progress_at_handover=job.progress_percentage or 0.0
    )
    db.add(handover_record)

    activity = DepartmentActivity(
        job_id=job.id,
        department="planning",
        action="JOB_RELEASED_TO_NEXT_DEPARTMENT",
        old_value={"stage": "PLANNING_ACTIVE"},
        new_value={
            "target_department": target_dept,
            "next_owner": next_owner_name,
            "category": forwarding_reason_category,
            "note": forwarding_note,
            "released_by": user.name or user.username
        },
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("STAGE_FORWARDED", {
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "targetDepartment": target_dept,
        "releasedBy": user.name or user.username,
        "message": f"Job #{job.job_no} released to {target_dept.capitalize()} by {user.name or user.username}"
    })
    await broadcaster.broadcast("JOB_STATUS_CHANGED", {
        "event": "JOB_STATUS_CHANGED",
        "job_id": job.external_id,
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "status": job.lifecycle_status or "In Progress",
        "current_stage": "RELEASED",
        "message": f"Job #{job.job_no} released to {target_dept.capitalize()}"
    })

    return {"success": True, "message": f"Job #{job.job_no} released to {target_dept.capitalize()}", "job": format_job_row(job)}

# 18. GET /api/jobs/{id}/control/timeline (Stage durations restricted to Admin / Keval)
@router.get("/{id}/control/timeline")
async def get_control_center_timeline(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    is_admin = is_admin_or_keval(user)

    job_ids = [job.id, job.external_id]
    handovers_stmt = select(JobHandover).where(JobHandover.job_id.in_(job_ids)).order_by(desc(JobHandover.handover_at), desc(JobHandover.id))
    h_res = await db.execute(handovers_stmt)
    records = h_res.scalars().all()

    acts_stmt = select(DepartmentActivity).where(DepartmentActivity.job_id.in_(job_ids)).order_by(desc(DepartmentActivity.created_at))
    a_res = await db.execute(acts_stmt)
    activities = a_res.scalars().all()

    events = []
    seen_keys = set()

    for r in records:
        ts = r.handover_at.isoformat() if r.handover_at else None
        p_by = r.performed_by or "Admin"
        ts_minute = ts[:16] if ts else ""
        dedup_key = f"{r.reason}-{ts_minute}"
        if dedup_key in seen_keys:
            continue
        seen_keys.add(dedup_key)

        events.append({
            "id": r.id,
            "type": "HANDOVER",
            "action": r.reason or "HANDOVER",
            "performedBy": p_by,
            "performed_by": p_by,
            "updated_by": p_by,
            "fromDepartment": r.from_department or "planning",
            "toDepartment": r.to_department or "planning",
            "reason": r.reason,
            "notes": r.notes,
            "timestamp": ts,
            "created_at": ts
        })

    for a in activities:
        ts = a.created_at.isoformat() if a.created_at else None
        p_by = a.updated_by or (a.new_value or {}).get("started_by") or (a.new_value or {}).get("assigned_by") or "Admin"
        notes = (a.new_value or {}).get("note") or (a.new_value or {}).get("explanation") or ""
        reason = (a.new_value or {}).get("category") or ""
        ts_minute = ts[:16] if ts else ""
        dedup_key = f"{a.action}-{ts_minute}"
        if dedup_key in seen_keys:
            continue
        seen_keys.add(dedup_key)

        events.append({
            "id": a.id,
            "type": "ACTIVITY",
            "action": a.action,
            "performedBy": p_by,
            "performed_by": p_by,
            "updated_by": p_by,
            "department": a.department,
            "oldValue": a.old_value,
            "newValue": a.new_value,
            "notes": notes,
            "reason": reason,
            "timestamp": ts,
            "created_at": ts
        })

    events.sort(key=lambda x: x["timestamp"] or "", reverse=True)

    now = datetime.now(timezone.utc)
    # STRICT PRIVACY: Durations are only exposed to Admins and Keval V Shah!
    durations = compute_stage_durations(job, now) if is_admin else None

    return {
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "events": events,
        "isAdmin": is_admin,
        "stageDurations": durations
    }

# 18A. GET /api/jobs/activities/all (Unified Cross-Department Activity Stream)
@router.get("/activities/all")
async def get_all_department_activities(
    department: str | None = Query(None),
    action: str | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = (
        select(DepartmentActivity, Job)
        .outerjoin(Job, or_(DepartmentActivity.job_id == Job.id, DepartmentActivity.job_id == Job.external_id))
        .order_by(desc(DepartmentActivity.created_at))
        .limit(limit)
    )
    if department and department.lower() != "all":
        stmt = stmt.where(func.lower(DepartmentActivity.department) == department.lower())
    if action and action.lower() != "all":
        stmt = stmt.where(func.lower(DepartmentActivity.action) == action.lower())

    res = await db.execute(stmt)
    rows = res.all()

    output = []
    seen = set()
    for act, j in rows:
        job_no = j.job_no if j else f"#{act.job_id}"
        panel_name = j.panel_name if j else ""
        client_name = j.client_name if j else ""

        if search and search.strip():
            s = search.strip().lower()
            combined = f"{job_no} {panel_name} {client_name} {act.action} {act.updated_by or ''} {act.department or ''}".lower()
            if s not in combined:
                continue

        p_by = act.updated_by or (act.new_value or {}).get("started_by") or (act.new_value or {}).get("assigned_by") or "Admin"
        notes = (act.new_value or {}).get("note") or (act.new_value or {}).get("explanation") or ""
        category = (act.new_value or {}).get("category") or ""
        ts = act.created_at.isoformat() if act.created_at else None

        # Deduplicate same action on same job within same minute
        key = f"{act.job_id}-{act.action}-{ts[:16] if ts else ''}"
        if key in seen:
            continue
        seen.add(key)

        output.append({
            "id": act.id,
            "jobId": j.external_id if j else act.job_id,
            "jobNo": job_no,
            "panelName": panel_name,
            "clientName": client_name,
            "department": act.department or "planning",
            "action": act.action,
            "performedBy": p_by,
            "performed_by": p_by,
            "updated_by": p_by,
            "category": category,
            "notes": notes,
            "oldValue": act.old_value,
            "newValue": act.new_value,
            "timestamp": ts,
            "created_at": ts
        })

    return {
        "count": len(output),
        "activities": output
    }

# 18B. GET /api/jobs/assignments/all (Global Who-to-Whom Ownership Transfers)
@router.get("/assignments/all")
async def get_all_job_assignments(
    search: str | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = (
        select(JobAssignmentHistory, Job)
        .outerjoin(Job, or_(JobAssignmentHistory.job_id == Job.id, JobAssignmentHistory.job_id == Job.external_id))
        .order_by(desc(JobAssignmentHistory.created_at))
        .limit(limit)
    )
    res = await db.execute(stmt)
    rows = res.all()

    output = []
    seen = set()
    for hist, j in rows:
        job_no = j.job_no if j else f"#{hist.job_id}"
        panel_name = j.panel_name if j else ""
        client_name = j.client_name if j else ""

        if search and search.strip():
            s = search.strip().lower()
            combined = f"{job_no} {panel_name} {client_name} {hist.previous_owner_name or ''} {hist.new_owner_name or ''} {hist.assigned_by_name or ''} {hist.reason_category or ''}".lower()
            if s not in combined:
                continue

        ts = hist.created_at.isoformat() if hist.created_at else None
        key = f"{hist.job_id}-{hist.new_owner_name}-{ts[:16] if ts else ''}"
        if key in seen:
            continue
        seen.add(key)

        output.append({
            "id": hist.id,
            "jobId": j.external_id if j else hist.job_id,
            "jobNo": job_no,
            "panelName": panel_name,
            "clientName": client_name,
            "changeType": hist.change_type,
            "fromWorker": hist.previous_owner_name or "Unassigned",
            "toWorker": hist.new_owner_name or "Unassigned",
            "assignedBy": hist.assigned_by_name or "Admin",
            "assignedByDepartment": hist.assigned_by_department or "planning",
            "assignedByRole": hist.assigned_by_role or "Staff",
            "reasonCategory": hist.reason_category or "Assignment",
            "detailedExplanation": hist.detailed_explanation or "",
            "workflowStage": hist.workflow_stage or "PLANNING_ASSIGNED",
            "priority": hist.priority or "Normal",
            "timestamp": ts,
            "created_at": ts
        })

    return {
        "count": len(output),
        "assignments": output
    }

# 19. GET /api/jobs/control/users-workload
@router.get("/control/users-workload")
async def get_planning_users_workload(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    # 1. Fetch active Users from User table (named engineers)
    users_stmt = select(User).where(User.is_active.isnot(False)).order_by(User.name.asc())
    u_res = await db.execute(users_stmt)
    users = u_res.scalars().all()

    # 2. Fetch Accounts from Account table (department accounts and admins)
    accounts_stmt = select(Account).order_by(Account.username.asc())
    a_res = await db.execute(accounts_stmt)
    accounts = a_res.scalars().all()

    # 3. Combine unique candidates
    seen_names = set()
    combined_candidates = []

    for u in users:
        c_name = (u.name or u.username or "").strip()
        if not c_name:
            continue
        seen_names.add(c_name.lower())
        combined_candidates.append({
            "id": u.id,
            "userType": "user",
            "uniqueKey": f"user_{u.id}",
            "name": c_name,
            "username": c_name,
            "departments": u.departments or []
        })

    for a in accounts:
        a_name = (a.username or "").strip()
        if not a_name or a_name.lower() in seen_names:
            continue
        seen_names.add(a_name.lower())
        combined_candidates.append({
            "id": 10000 + a.id,
            "userType": "account",
            "uniqueKey": f"account_{a.id}",
            "name": a_name,
            "username": a_name,
            "departments": a.departments or []
        })

    # Sort alphabetically by name
    combined_candidates.sort(key=lambda x: x["name"].lower())

    # 4. Fetch jobs to calculate active workload
    jobs_stmt = select(Job)
    j_res = await db.execute(jobs_stmt)
    jobs = j_res.scalars().all()

    now = datetime.now(timezone.utc)

    workload = []
    for cand in combined_candidates:
        active_count = 0
        waiting_count = 0
        overdue_count = 0

        c_name_lower = cand["name"].lower()
        c_id = cand["id"]

        for j in jobs:
            is_owner = (j.planning_owner_id == c_id) or ((j.planning_owner_name or "").lower() == c_name_lower)
            if is_owner:
                st = resolve_job_stage(j)
                if st == "PLANNING_ACTIVE":
                    active_count += 1
                elif st in ["PLANNING_READY", "PLANNING_ASSIGNED"]:
                    waiting_count += 1

                due = getattr(j, "stage_due_date", None)
                if due and now > due and st != "RELEASED":
                    overdue_count += 1

        workload.append({
            "id": cand["id"],
            "userType": cand.get("userType", "user"),
            "uniqueKey": cand.get("uniqueKey", f"u_{cand['id']}_{cand['name']}"),
            "name": cand["name"],
            "username": cand["username"],
            "departments": cand["departments"],
            "activeCount": active_count,
            "waitingCount": waiting_count,
            "overdueCount": overdue_count,
            "totalAssigned": active_count + waiting_count
        })

    return {
        "users": workload,
        "total": len(workload)
    }
