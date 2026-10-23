import os
import uuid
import shutil
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_
from sqlalchemy.orm.attributes import flag_modified
from datetime import datetime, timezone, date, timedelta
from app.db.session import get_db
from app.api.deps import get_current_user, is_admin_or_keval, require_admin, require_keval
from app.models import Job, JobHandover, DepartmentActivity, User, Account, JobAssignmentHistory, JobExecutionSession, DepartmentTask, JobDocument
from app.schemas import UserPayload
from app.core.events import broadcaster
from app.api.v1.jobs import format_job_row

router = APIRouter(prefix="/jobs", tags=["Job Handover"])

# Unified Upload Directory (points to server-py/uploads, matching main.py)
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "uploads")
LEGACY_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")
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

    user_dept = (user.departments[0] if user.departments else (job.target_department or "design")).lower()
    previous_status = job.handover_status
    new_status = f"{user_dept.capitalize()} Accepted" if user_dept in ["design", "mechanical", "purchase", "production"] else "Accepted"

    job.handover_status = new_status
    job.current_stage = "PLANNING_ACTIVE"
    job.handover_accepted_at = func.now()
    job.current_department = user_dept

    valid_owner_id = await _resolve_valid_user_id(db, planning_owner_id or user.id, planning_owner_name or user.name or user.username)
    job.planning_owner_id = valid_owner_id
    job.planning_owner_name = str(planning_owner_name or user.name or user.username).strip()
    job.assigned_user_id = valid_owner_id
    job.assigned_user_name = user.name or user.username

    # Create immutable handover history record with Responsible Engineer
    handover_record = JobHandover(
        job_id=job.id,
        handover_type="DEPARTMENT",
        from_department=job.from_department if hasattr(job, "from_department") and job.from_department else "marketing",
        to_department=user_dept,
        to_worker_id=valid_owner_id,
        reason=f"Handover Accepted by {user_dept.capitalize()}",
        notes=notes or f"Accepted by {user.name or user.username}. Assigned Owner: {job.planning_owner_name}",
        responsible_engg_name=job.responsible_engg_name or "",
        work_completed_summary=f"Handover accepted by {user.name or user.username}. Responsible Engg: {job.responsible_engg_name or 'Unassigned'}",
        performed_by=user.name or user.username,
        status_at_handover=new_status,
        progress_at_handover=job.progress_percentage or 0.0
    )
    db.add(handover_record)

    # Activity log
    activity = DepartmentActivity(
        job_id=job.id,
        department=user_dept,
        action="HANDOVER_ACCEPTED",
        old_value={"handover_status": previous_status},
        new_value={
            "handover_status": new_status,
            "planning_owner_id": job.planning_owner_id,
            "planning_owner_name": job.planning_owner_name,
            "responsible_engg_name": job.responsible_engg_name or "",
            "accepted_by": user.name or user.username
        },
        updated_by=user.name or user.username
    )
    db.add(activity)

    # Automatically add to receiving user's "My Tasks" queue
    from app.models import DepartmentTask
    t_stmt = select(DepartmentTask).where(
        DepartmentTask.job_id == job.id,
        DepartmentTask.department == user_dept,
        DepartmentTask.assigned_user_name == (user.name or user.username),
        DepartmentTask.status == "In Progress"
    )
    t_res = await db.execute(t_stmt)
    if not t_res.scalar_one_or_none():
        new_task = DepartmentTask(
            job_id=job.id,
            department=user_dept,
            task_name=f"{user_dept.capitalize()} Milestone: {job.panel_name or 'Panel Execution'}",
            description=notes or f"Accepted by {user.name or user.username}. Technical review and execution underway.",
            assigned_user_id=getattr(user, "id", None),
            assigned_user_name=user.name or user.username,
            created_by_user_id=getattr(user, "id", None),
            created_by_name=user.name or user.username,
            start_date=date.today(),
            target_date=date.today() + timedelta(days=7),
            status="In Progress"
        )
        db.add(new_task)

    await db.commit()
    await db.refresh(job)

    # Broadcast real-time SSE notification
    await broadcaster.broadcast("HANDOVER_ACCEPTED", {
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "panelName": job.panel_name,
        "planningOwner": job.planning_owner_name,
        "responsibleEngineer": job.responsible_engg_name,
        "acceptedBy": user.name or user.username,
        "status": new_status,
        "message": f"Job #{job.job_no} accepted by {user_dept.capitalize()} ({user.name or user.username}). Responsible Engg: {job.responsible_engg_name or 'Unassigned'}"
    })

    return {
        "success": True,
        "message": f"Job #{job.job_no} handover accepted successfully and added to My Tasks queue",
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
    reason = (body.get("reason") or body.get("returnReason") or "Other").strip()
    comment = (body.get("comment") or body.get("returnComment") or body.get("notes") or "").strip()
    
    if not comment or len(comment) < 3:
        raise HTTPException(
            status_code=400,
            detail="A detailed return explanation comment (at least 3 characters) is required"
        )

    previous_status = job.handover_status
    new_status = "Returned to Marketing"

    job.handover_status = new_status
    job.current_stage = "NEEDS_CLARIFICATION"
    job.return_reason = reason
    job.return_comment = comment
    job.handover_return_reason = f"[{reason}] {comment}"
    job.returned_by = user.name or user.username
    job.returned_at = func.now()

    # Create immutable handover history record
    handover_record = JobHandover(
        job_id=job.id,
        handover_type="DEPARTMENT",
        from_department=user.departments[0] if user.departments else "design",
        to_department="marketing",
        reason=f"Returned: {reason}",
        notes=comment,
        responsible_engg_name=job.responsible_engg_name or "",
        work_completed_summary=f"Handover returned to Marketing by {user.name or user.username}. Reason: {reason}. Comment: {comment}",
        performed_by=user.name or user.username,
        status_at_handover=new_status,
        progress_at_handover=job.progress_percentage or 0.0
    )
    db.add(handover_record)

    # Activity log
    activity = DepartmentActivity(
        job_id=job.id,
        department=user.departments[0] if user.departments else "design",
        action="HANDOVER_RETURNED",
        old_value={"handover_status": previous_status},
        new_value={
            "handover_status": new_status,
            "return_reason": reason,
            "return_comment": comment,
            "responsible_engg_name": job.responsible_engg_name or "",
            "returned_by": user.name or user.username
        },
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
        "responsibleEngineer": job.responsible_engg_name,
        "reason": reason,
        "comment": comment,
        "status": new_status,
        "message": f"Job #{job.job_no} returned to Marketing: [{reason}] {comment}"
    })

    return {
        "success": True,
        "message": f"Job #{job.job_no} returned to Marketing for correction",
        "job": format_job_row(job)
    }

# 3b. POST /api/jobs/{id}/reassign-engineer
@router.post("/{id}/reassign-engineer")
async def reassign_responsible_engineer(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    new_engineer = (body.get("new_engineer_name") or body.get("newEngineerName") or body.get("responsibleEngineer") or "").strip()
    reason = (body.get("reason") or body.get("reassignmentReason") or "").strip()

    if not new_engineer:
        raise HTTPException(status_code=400, detail="New Responsible Engineer name is required")
    if not reason or len(reason) < 3:
        raise HTTPException(status_code=400, detail="A mandatory reason for reassignment (at least 3 characters) is required")

    # Permission check: Marketing users, Admins, or Keval V Shah
    user_u_lower = (user.username or "").lower().strip()
    is_mkt_user = "marketing" in [d.lower() for d in user.departments] or "sales" in user_u_lower or "mkt" in user_u_lower
    is_admin = user.role in ["admin", "executive"] or user_u_lower == "keval v shah"

    if not (is_mkt_user or is_admin):
        raise HTTPException(
            status_code=403,
            detail="Only Marketing users or System Administrators are authorized to reassign the Responsible Engineer."
        )

    previous_engineer = job.responsible_engg_name or "Unassigned"
    
    # Update job without silently overwriting: store previous and record immutable history
    job.previous_responsible_engg_name = previous_engineer
    job.responsible_engg_name = new_engineer

    # Also synchronize inside JSONB fields
    fields_dict = dict(job.fields or {})
    mkt_fields = dict(fields_dict.get("marketing") or {})
    mkt_fields["Responsible Engg. Name"] = new_engineer
    mkt_fields["Responsible Engineer"] = new_engineer
    fields_dict["marketing"] = mkt_fields
    job.fields = fields_dict
    flag_modified(job, "fields")

    # Append to reassignment_history
    history_entry = {
        "from_engineer": previous_engineer,
        "to_engineer": new_engineer,
        "reassigned_by": user.name or user.username,
        "reassigned_at": datetime.now(timezone.utc).isoformat(),
        "department": user.departments[0] if user.departments else "marketing",
        "reason": reason
    }
    history_list = list(getattr(job, "reassignment_history", None) or [])
    history_list.append(history_entry)
    job.reassignment_history = history_list
    flag_modified(job, "reassignment_history")

    # Create immutable handover audit entry
    handover_record = JobHandover(
        job_id=job.id,
        handover_type="REASSIGNMENT",
        from_department=user.departments[0] if user.departments else "marketing",
        to_department=job.target_department or "design",
        reason=f"Responsible Engineer Reassigned: {reason}",
        notes=f"Reassigned from {previous_engineer} to {new_engineer}. Reason: {reason}",
        responsible_engg_name=new_engineer,
        previous_responsible_engg_name=previous_engineer,
        reassignment_reason=reason,
        performed_by=user.name or user.username,
        status_at_handover=job.handover_status or "Draft",
        progress_at_handover=job.progress_percentage or 0.0
    )
    db.add(handover_record)

    # Department activity record
    activity = DepartmentActivity(
        job_id=job.id,
        department=user.departments[0] if user.departments else "marketing",
        action="RESPONSIBLE_ENGINEER_REASSIGNED",
        old_value={"responsible_engg_name": previous_engineer},
        new_value={
            "responsible_engg_name": new_engineer,
            "previous_responsible_engg_name": previous_engineer,
            "reason": reason,
            "reassigned_by": user.name or user.username
        },
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    # Broadcast SSE
    await broadcaster.broadcast("RESPONSIBLE_ENGINEER_REASSIGNED", {
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "panelName": job.panel_name,
        "previousEngineer": previous_engineer,
        "newEngineer": new_engineer,
        "reassignedBy": user.name or user.username,
        "reason": reason,
        "message": f"Responsible Engineer for Job #{job.job_no} reassigned: {previous_engineer} → {new_engineer}"
    })

    return {
        "success": True,
        "message": f"Responsible Engineer successfully reassigned to {new_engineer}",
        "job": format_job_row(job)
    }

# 3c. POST /api/jobs/{id}/handover/re-submit
@router.post("/{id}/handover/re-submit")
async def resubmit_job_handover(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    target_dept = (body.get("target_department") or body.get("targetDepartment") or job.target_department or "design").lower()
    notes = (body.get("notes") or body.get("handoverNotes") or "Corrected technical package resubmitted to Design.").strip()

    previous_status = job.handover_status
    new_status = f"Submitted to {target_dept.capitalize()}"

    # Clear return states
    job.handover_status = new_status
    job.current_stage = "VERIFICATION"
    job.target_department = target_dept
    job.handover_submitted_at = func.now()
    job.handover_notes = notes
    job.return_reason = None
    job.return_comment = None
    job.handover_return_reason = None

    handover_record = JobHandover(
        job_id=job.id,
        handover_type="DEPARTMENT",
        from_department="marketing",
        to_department=target_dept,
        reason=f"Re-Handover to {target_dept.capitalize()} after correction",
        notes=notes,
        responsible_engg_name=job.responsible_engg_name or "",
        work_completed_summary=f"Re-submitted by {user.name or user.username}. Previous issue addressed.",
        performed_by=user.name or user.username,
        status_at_handover=new_status,
        progress_at_handover=job.progress_percentage or 0.0
    )
    db.add(handover_record)

    activity = DepartmentActivity(
        job_id=job.id,
        department="marketing",
        action="HANDOVER_RESUBMITTED",
        old_value={"handover_status": previous_status},
        new_value={
            "handover_status": new_status,
            "target_department": target_dept,
            "notes": notes,
            "responsible_engg_name": job.responsible_engg_name or ""
        },
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("HANDOVER_SUBMITTED", {
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "panelName": job.panel_name,
        "fromDepartment": "marketing",
        "targetDepartment": target_dept,
        "submittedBy": user.name or user.username,
        "responsibleEngineer": job.responsible_engg_name,
        "status": new_status,
        "message": f"Job #{job.job_no} re-submitted to {target_dept.capitalize()} by {user.name or user.username}"
    })

    return {
        "success": True,
        "message": f"Job #{job.job_no} re-submitted to {target_dept.capitalize()} successfully",
        "job": format_job_row(job)
    }

# 3d. GET /api/jobs/{id}/reassignment-history
@router.get("/{id}/reassignment-history")
async def get_reassignment_history(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "jobId": job.external_id or job.id,
        "jobNo": job.job_no,
        "panelName": job.panel_name,
        "currentResponsibleEngineer": job.responsible_engg_name,
        "previousResponsibleEngineer": getattr(job, "previous_responsible_engg_name", "") or "",
        "history": getattr(job, "reassignment_history", []) or []
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
    records: list[Any] = list(res.scalars().all())

    # Also fetch activities for full chronological context
    act_stmt = (
        select(DepartmentActivity)
        .where(DepartmentActivity.job_id.in_(job_ids))
        .order_by(desc(DepartmentActivity.created_at))
    )
    act_res = await db.execute(act_stmt)
    activities: list[Any] = list(act_res.scalars().all())

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

    raw_attachments = getattr(job, "attachments", None)
    current_attachments = list(raw_attachments) if isinstance(raw_attachments, list) else []
    current_attachments.append(attachment_record)
    setattr(job, "attachments", current_attachments)
    flag_modified(job, "attachments")

    await db.commit()
    await db.refresh(job)

    return {
        "success": True,
        "attachment": attachment_record,
        "attachments": getattr(job, "attachments", current_attachments)
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

def compute_planning_readiness(j: Job, mkt_tasks: list | None = None) -> dict:
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
    all_jobs: list[Any] = list(res.scalars().all())

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
    job = await find_job_by_id(db, id)
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
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    correction_summary = (body.get("correctionSummary") or body.get("summary") or body.get("notes") or "").strip()

    if not correction_summary:
        raise HTTPException(status_code=400, detail="Correction summary is required")

    now = datetime.now(timezone.utc)
    job.current_stage = "VERIFICATION"
    job.handover_status = "Submitted for Planning"
    job.current_action = "Review submitted corrections and verify inputs"
    job.current_waiting_reason = ""
    job.stage_started_at = now

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
    open_sessions: list[Any] = list(c_res.scalars().all())
    for cs in open_sessions:
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
    open_sessions: list[Any] = list(c_res.scalars().all())
    for cs in open_sessions:
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
    open_sessions: list[Any] = list(c_res.scalars().all())
    for cs in open_sessions:
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
    records: list[Any] = list(h_res.scalars().all())

    acts_stmt = select(DepartmentActivity).where(DepartmentActivity.job_id.in_(job_ids)).order_by(desc(DepartmentActivity.created_at))
    a_res = await db.execute(acts_stmt)
    activities: list[Any] = list(a_res.scalars().all())

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
            "responsibleEnggName": getattr(r, "responsible_engg_name", "") or job.responsible_engg_name or "",
            "previousResponsibleEnggName": getattr(r, "previous_responsible_engg_name", "") or getattr(job, "previous_responsible_engg_name", "") or "",
            "reassignmentReason": getattr(r, "reassignment_reason", "") or "",
            "timestamp": ts,
            "created_at": ts
        })

    for a in activities:
        ts = a.created_at.isoformat() if a.created_at else None
        p_by = a.updated_by or (a.new_value or {}).get("started_by") or (a.new_value or {}).get("assigned_by") or "Admin"
        notes = (a.new_value or {}).get("note") or (a.new_value or {}).get("explanation") or (a.new_value or {}).get("reason") or ""
        reason = (a.new_value or {}).get("category") or (a.new_value or {}).get("return_reason") or ""
        resp_engg = (a.new_value or {}).get("responsible_engg_name") or job.responsible_engg_name or ""
        prev_engg = (a.new_value or {}).get("previous_responsible_engg_name") or (a.old_value or {}).get("responsible_engg_name") or ""
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
            "responsibleEnggName": resp_engg,
            "previousResponsibleEnggName": prev_engg,
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
    user: UserPayload = Depends(require_keval)
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
    user: UserPayload = Depends(require_keval)
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
        c_name = (u.name or "").strip()
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

# =============================================================
# UNIFIED DEPARTMENT WORKFLOW ENGINE
# =============================================================

def normalize_dept_key(d: str | None) -> str:
    s = (d or "").strip().lower()
    if "market" in s:
        return "marketing"
    elif "mech" in s:
        return "mechanical"
    elif "elect" in s or "design" in s:
        return "design"
    elif "proc" in s or "purch" in s:
        return "purchase"
    elif "prod" in s or "qc" in s or "disp" in s:
        return "production"
    return s or "marketing"

def dept_matches(dept1: str | None, dept2: str | None) -> bool:
    if not dept1 or not dept2:
        return False
    return normalize_dept_key(dept1) == normalize_dept_key(dept2)

def user_in_department(user_depts: list[str], dept: str, is_admin: bool = False) -> bool:
    if is_admin:
        return True
    return any(dept_matches(ud, dept) for ud in user_depts)

DEFAULT_DEPARTMENT_TASKS = {
    "marketing": "Prepare Job for Design",
    "design": "Design Review & Preparation",
    "mechanical": "Mechanical Layout & GA Drawing",
    "purchase": "Bill of Materials & PO Sourcing",
    "production": "Panel Assembly & Quality Testing",
    "qc": "Quality Control & Testing Clearance",
    "dispatch": "Final Packaging & Dispatch Clearance"
}

STANDARD_NEXT_DEPARTMENTS = {
    "marketing": "design",
    "design": "purchase",
    "mechanical": "purchase",
    "purchase": "production",
    "production": "dispatch"
}

# GET /api/jobs/{id}/workflow-state
@router.get("/{id}/workflow-state")
async def get_job_workflow_state(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    user_depts = [d.lower() for d in (user.departments or [])]
    user_primary_dept = user_depts[0] if user_depts else "marketing"
    is_admin = is_admin_or_keval(user)

    curr_dept = (job.current_department or "marketing").lower()
    curr_dept_norm = normalize_dept_key(curr_dept)
    curr_status = job.current_workflow_status or "In Progress"

    # Fetch active department task for current department on this job
    t_stmt = select(DepartmentTask).where(
        DepartmentTask.job_id == job.id,
        or_(
            DepartmentTask.department == curr_dept,
            DepartmentTask.department == curr_dept_norm
        )
    ).order_by(desc(DepartmentTask.id))
    t_res = await db.execute(t_stmt)
    active_task: Any = t_res.scalars().first()

    # If no task exists yet and current department is marketing, auto-seed the initial Marketing task
    if not active_task and curr_dept_norm == "marketing":
        now_d = date.today()
        active_task = DepartmentTask(
            job_id=job.id,
            department="marketing",
            task_name=DEFAULT_DEPARTMENT_TASKS.get("marketing", "Prepare Job for Design"),
            assigned_user_id=getattr(user, "id", None),
            assigned_user_name=job.assigned_user_name or getattr(user, "name", None) or getattr(user, "username", "Marketing User"),
            created_by_user_id=getattr(user, "id", None),
            created_by_name=getattr(user, "name", None) or getattr(user, "username", "System"),
            start_date=now_d,
            target_date=now_d + timedelta(days=5),
            estimated_effort_hours=4.00,
            actual_effort_hours=0.00,
            progress_percentage=0,
            status="In Progress"
        )
        db.add(active_task)
        await db.commit()
        await db.refresh(active_task)

    # Fetch all department tasks for this job from PostgreSQL
    all_t_stmt = select(DepartmentTask).where(DepartmentTask.job_id == job.id).order_by(DepartmentTask.id)
    all_t_res = await db.execute(all_t_stmt)
    all_job_tasks = list(all_t_res.scalars().all())

    curr_dept_tasks = [t for t in all_job_tasks if normalize_dept_key(t.department) == curr_dept_norm]
    tasks_all_completed = bool(curr_dept_tasks and all((t.status or "").lower() == "completed" for t in curr_dept_tasks))

    # Fetch all job documents from PostgreSQL table job_documents
    docs_stmt = select(JobDocument).where(JobDocument.job_id == job.id).order_by(desc(JobDocument.uploaded_at))
    docs_res = await db.execute(docs_stmt)
    all_job_docs = list(docs_res.scalars().all())
    has_documents = bool(len(all_job_docs) > 0 or getattr(job, "attachments", None))

    has_resp_engg = bool(job.responsible_engg_name)
    has_target_date = bool(job.expected_date or getattr(job, "delivery_date", None) or getattr(job, "stage_due_date", None) or getattr(job, "planned_end_at", None))

    # Calculate lightweight readiness check (5 conditions from approved plan)
    readiness_requirements = [
        {"key": "tasks_completed", "label": "Required department tasks completed", "ready": tasks_all_completed, "missingAction": "COMPLETE_TASKS"},
        {"key": "documents_available", "label": "Required specifications/documents available", "ready": has_documents, "missingAction": "UPLOAD_DOCUMENT"},
        {"key": "responsible_assigned", "label": "Responsible engineer assigned", "ready": has_resp_engg, "missingAction": "ASSIGN_ENGINEER"},
        {"key": "target_date_defined", "label": "Milestone target date defined", "ready": has_target_date, "missingAction": "SET_TARGET_DATE"}
    ]
    is_fully_ready = tasks_all_completed and has_resp_engg

    readiness = {
        "score": f"{sum([tasks_all_completed, has_documents, has_resp_engg, has_target_date])}/4",
        "isFullyReady": is_fully_ready,
        "requirements": readiness_requirements
    }

    # Fetch pending incoming handover record if job is pending acceptance
    h_stmt = select(JobHandover).where(
        JobHandover.job_id.in_([job.id, job.external_id]),
        JobHandover.is_current_pending.is_(True)
    ).order_by(desc(JobHandover.id))
    h_res = await db.execute(h_stmt)
    pending_handover: Any = h_res.scalars().first()

    # Determine primary action
    user_belongs_to_curr_dept = user_in_department(user_depts, curr_dept, is_admin)
    primary_action = "VIEW"
    if curr_status == "Pending Acceptance":
        if user_belongs_to_curr_dept:
            primary_action = "ACCEPT_JOB"
        else:
            primary_action = "WAITING_ACCEPTANCE"
    elif curr_status == "In Progress":
        if is_fully_ready:
            primary_action = "HANDOVER"
        else:
            primary_action = "UPDATE_TASK"
    elif curr_status == "Needs Clarification":
        primary_action = "CORRECT_AND_RESUBMIT"

    # Fetch recent history (activities & handovers)
    act_stmt = select(DepartmentActivity).where(
        DepartmentActivity.job_id.in_([job.id, job.external_id])
    ).order_by(desc(DepartmentActivity.created_at)).limit(10)
    act_res = await db.execute(act_stmt)
    activities: list[Any] = list(act_res.scalars().all())

    history_items = []
    for a in activities:
        history_items.append({
            "id": a.id,
            "action": a.action,
            "department": a.department,
            "performedBy": a.updated_by,
            "responsibleEnggName": (a.new_value or {}).get("responsible_engg_name") or job.responsible_engg_name or "",
            "previousResponsibleEnggName": (a.new_value or {}).get("previous_responsible_engg_name") or "",
            "timestamp": a.created_at.isoformat() if getattr(a, "created_at", None) else None,
            "details": a.new_value
        })

    # Format department tasks list
    today_d = date.today()
    formatted_tasks = []
    for t in all_job_tasks:
        is_comp = (t.status or "").lower() == "completed"
        timing_status = "On Time"
        if is_comp:
            if t.completed_at and t.target_date:
                t_comp_date = t.completed_at.date() if hasattr(t.completed_at, "date") else t.completed_at
                if t_comp_date < t.target_date:
                    timing_status = "Completed Early"
                elif t_comp_date == t.target_date:
                    timing_status = "Completed On Time"
                else:
                    timing_status = "Completed Late"
            else:
                timing_status = "Completed"
        else:
            if t.target_date and t.target_date < today_d:
                timing_status = "Overdue"
            else:
                timing_status = "On Time"

        formatted_tasks.append({
            "id": t.id,
            "taskName": t.task_name,
            "department": t.department,
            "assignedUser": t.assigned_user_name or "Unassigned",
            "startDate": t.start_date.isoformat() if t.start_date else None,
            "targetDate": t.target_date.isoformat() if t.target_date else None,
            "estimatedEffort": float(t.estimated_effort_hours or 0.0),
            "actualEffort": float(t.actual_effort_hours or 0.0),
            "remainingEffort": max(0.0, float(t.estimated_effort_hours or 0.0) - float(t.actual_effort_hours or 0.0)),
            "status": t.status or "In Progress",
            "timingStatus": timing_status,
            "sentBy": t.created_by_name or "",
            "completedDate": t.completed_at.isoformat() if t.completed_at else None,
            "completionRemarks": t.completion_remarks or "",
            "blockedReason": t.blocked_reason or ""
        })

    # Format job documents list (queryable in pgAdmin 4)
    formatted_docs = []
    for d in all_job_docs:
        formatted_docs.append({
            "id": d.id,
            "fileName": getattr(d, "original_name", None) or d.file_name,
            "originalName": getattr(d, "original_name", None) or d.file_name,
            "filePath": d.file_path,
            "fileUrl": f"/api/jobs/{job.id}/documents/{d.id}/download",
            "staticUrl": getattr(d, "file_url", "") or f"/uploads/{job.id}/{d.file_name}",
            "fileSize": float(getattr(d, "file_size_kb", 0) or 0),
            "documentType": d.document_type or "Specification Document",
            "department": d.department or "general",
            "uploadedBy": d.uploaded_by or "User",
            "uploadedAt": d.uploaded_at.isoformat() if d.uploaded_at else None
        })

    # Prepare response payload
    return {
        "jobInfo": {
            "id": job.id,
            "externalId": job.external_id,
            "jobNo": job.job_no,
            "customer": job.client_name or "",
            "project": job.project_name or "",
            "panelName": job.panel_name or "",
            "quantity": job.qty or "1",
            "currentDepartment": curr_dept,
            "responsibleEngineer": job.responsible_engg_name or "",
            "previousResponsibleEngineer": getattr(job, "previous_responsible_engg_name", "") or "",
            "returnReason": getattr(job, "return_reason", "") or getattr(job, "handover_return_reason", "") or "",
            "returnComment": getattr(job, "return_comment", "") or "",
            "returnedBy": getattr(job, "returned_by", "") or "",
            "returnedAt": job.returned_at.isoformat() if getattr(job, "returned_at", None) else None,
            "originalDate": job.date or "",
            "expectedDate": job.expected_date.isoformat() if getattr(job, "expected_date", None) else getattr(job, "delivery_date", None)
        },
        "ownership": {
            "department": curr_dept,
            "responsibleEngineer": job.responsible_engg_name or "",
            "previousResponsibleEngineer": getattr(job, "previous_responsible_engg_name", "") or "",
            "assignedUser": job.assigned_user_name or (active_task.assigned_user_name if active_task else ""),
            "assignedUserId": job.assigned_user_id,
            "currentStatus": curr_status
        },
        "myTask": {
            "id": active_task.id if active_task else None,
            "taskName": active_task.task_name if active_task else "",
            "department": active_task.department if active_task else curr_dept,
            "assignedUser": active_task.assigned_user_name if active_task else "",
            "startDate": active_task.start_date.isoformat() if active_task and active_task.start_date else None,
            "targetedDate": active_task.target_date.isoformat() if active_task and active_task.target_date else None,
            "estimatedEffort": float(active_task.estimated_effort_hours or 0) if active_task else 0,
            "actualEffort": float(active_task.actual_effort_hours or 0) if active_task else 0,
            "progress": int(active_task.progress_percentage or 0) if active_task else 0,
            "status": active_task.status if active_task else "In Progress",
            "completedDate": active_task.completed_at.isoformat() if active_task and active_task.completed_at else None,
            "completionRemarks": active_task.completion_remarks if active_task else ""
        } if active_task else None,
        "departmentTasks": formatted_tasks,
        "documents": formatted_docs,
        "readiness": readiness,
        "isReadyForHandover": is_fully_ready,
        "primaryAction": {
            "type": primary_action,
            "action": primary_action,
            "canAccept": bool(curr_status == "Pending Acceptance" and user_belongs_to_curr_dept),
            "canReturn": bool(curr_status == "Pending Acceptance" and user_belongs_to_curr_dept),
            "canHandover": bool(curr_status == "In Progress" and is_fully_ready and user_belongs_to_curr_dept),
            "isCallerDept": user_belongs_to_curr_dept
        },
        "incomingHandover": {
            "id": pending_handover.id,
            "fromDepartment": pending_handover.from_department,
            "toDepartment": pending_handover.to_department,
            "handedOverBy": pending_handover.performed_by,
            "handedOverAt": pending_handover.handover_at.isoformat() if getattr(pending_handover, "handover_at", None) else None,
            "responsibleEngineer": pending_handover.responsible_engg_name,
            "handoverNote": pending_handover.notes or ""
        } if pending_handover else None,
        "history": history_items
    }

# POST /api/jobs/{id}/workflow/accept
@router.post("/{id}/workflow/accept")
async def accept_job_workflow(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    now = datetime.now(timezone.utc)
    user_name = user.name or user.username
    target_dept = (job.current_department or "design").lower()
    target_dept_norm = normalize_dept_key(target_dept)

    # Find open pending handover for this job
    h_stmt = select(JobHandover).where(
        JobHandover.job_id.in_([job.id, job.external_id]),
        JobHandover.is_current_pending.is_(True)
    ).order_by(desc(JobHandover.id))
    h_res = await db.execute(h_stmt)
    pending_handover: Any = h_res.scalars().first()

    if pending_handover:
        pending_handover.is_current_pending = False
        pending_handover.status_at_handover = "Accepted"
        setattr(pending_handover, "accepted_by", user_name)
        setattr(pending_handover, "accepted_at", now)

    job.current_workflow_status = "In Progress"
    job.assigned_user_id = user.id
    job.assigned_user_name = user_name
    job.current_stage = "PLANNING_ACTIVE"
    job.current_action = f"Working on {target_dept.capitalize()} stage"

    # Rule 3: Acceptance automatically creates the next department's My Task
    # Rule 8: Never create duplicate active tasks for the same department and job
    existing_t_stmt = select(DepartmentTask).where(
        DepartmentTask.job_id == job.id,
        or_(
            DepartmentTask.department == target_dept,
            DepartmentTask.department == target_dept_norm
        ),
        DepartmentTask.status == "In Progress"
    )
    ex_res = await db.execute(existing_t_stmt)
    existing_task = ex_res.scalars().first()

    if not existing_task:
        target_task_name = body.get("taskName") or DEFAULT_DEPARTMENT_TASKS.get(target_dept_norm, f"{target_dept.capitalize()} Review & Preparation")
        target_days = int(body.get("targetDays") or 5)
        new_task = DepartmentTask(
            job_id=job.id,
            department=target_dept_norm,
            task_name=target_task_name,
            assigned_user_id=user.id,
            assigned_user_name=user_name,
            created_by_user_id=user.id,
            created_by_name=user_name,
            start_date=date.today(),
            target_date=date.today() + timedelta(days=target_days),
            estimated_effort_hours=float(body.get("estimatedEffort") or 4.0),
            actual_effort_hours=0.0,
            progress_percentage=0,
            status="In Progress"
        )
        db.add(new_task)

    # Record audit activity
    activity = DepartmentActivity(
        job_id=job.id,
        department=target_dept,
        action="JOB_ACCEPTED",
        old_value={"status": "Pending Acceptance"},
        new_value={"status": "In Progress", "accepted_by": user_name, "department": target_dept},
        updated_by=user_name
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("JOB_STATUS_CHANGED", {
        "event": "JOB_ACCEPTED",
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "department": target_dept,
        "acceptedBy": user_name
    })

    return {"success": True, "message": f"Job accepted by {user_name} for {target_dept.capitalize()}"}

# POST /api/jobs/{id}/workflow/return
@router.post("/{id}/workflow/return")
async def return_job_for_clarification(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    reason_cat = body.get("reasonCategory", "Missing Technical Information")
    remarks = (body.get("remarks") or body.get("details") or "").strip()
    if not remarks:
        raise HTTPException(status_code=400, detail="Clarification remarks are required")

    user_name = user.name or user.username
    curr_dept = job.current_department or "design"

    # Find pending handover to resolve sender department
    h_stmt = select(JobHandover).where(
        JobHandover.job_id.in_([job.id, job.external_id]),
        JobHandover.is_current_pending.is_(True)
    ).order_by(desc(JobHandover.id))
    h_res = await db.execute(h_stmt)
    pending_handover: Any = h_res.scalars().first()

    return_to_dept = pending_handover.from_department if pending_handover and pending_handover.from_department else "marketing"

    if pending_handover:
        pending_handover.is_current_pending = False
        pending_handover.status_at_handover = "Returned for Clarification"
        pending_handover.notes = f"[{reason_cat}] {remarks}"

    job.current_department = return_to_dept
    job.current_workflow_status = "Needs Clarification"
    job.handover_status = "Returned for Correction"
    job.handover_return_reason = f"[{reason_cat}] {remarks}"
    job.current_action = f"Clarification requested by {curr_dept.capitalize()}: {reason_cat}"

    activity = DepartmentActivity(
        job_id=job.id,
        department=curr_dept,
        action="RETURNED_FOR_CLARIFICATION",
        old_value={"department": curr_dept, "status": "Pending Acceptance"},
        new_value={"return_to": return_to_dept, "reason": reason_cat, "remarks": remarks, "returned_by": user_name},
        updated_by=user_name
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("JOB_STATUS_CHANGED", {
        "event": "CLARIFICATION_REQUESTED",
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "returnedTo": return_to_dept,
        "reason": reason_cat
    })

    return {"success": True, "message": f"Job returned to {return_to_dept.capitalize()} for clarification"}

# PATCH /api/jobs/{id}/workflow/my-task
@router.patch("/{id}/workflow/my-task")
async def update_department_my_task(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    task_id = body.get("taskId")

    task = None
    if task_id:
        t_stmt = select(DepartmentTask).where(DepartmentTask.id == task_id)
        t_res = await db.execute(t_stmt)
        task = t_res.scalar_one_or_none()

    curr_dept = (job.current_department or (user.departments[0] if user.departments else "marketing")).lower()

    if not task:
        # Find latest task for current department
        t_stmt = select(DepartmentTask).where(
            DepartmentTask.job_id == job.id,
            DepartmentTask.department == curr_dept
        ).order_by(desc(DepartmentTask.id))
        t_res = await db.execute(t_stmt)
        task = t_res.scalars().first()

    # If no task exists yet, automatically create one so progress tracking never breaks
    now = datetime.now(timezone.utc)
    if not task:
        s_date = now.date()
        t_date = s_date
        if body.get("targetedDate"):
            try:
                t_date = datetime.strptime(body["targetedDate"][:10], "%Y-%m-%d").date()
            except Exception:
                pass

        task = DepartmentTask(
            job_id=job.id,
            department=curr_dept,
            task_name=f"{curr_dept.title()} Engineering Task",
            description=f"Task for Job #{job.job_no}",
            assigned_user_id=user.id,
            assigned_user_name=user.name or user.username,
            created_by_user_id=user.id,
            created_by_name=user.name or user.username,
            start_date=s_date,
            target_date=t_date,
            estimated_effort_hours=max(0.0, float(body.get("estimatedEffort", 0.0))),
            actual_effort_hours=0.0,
            progress_percentage=0,
            status="In Progress"
        )
        db.add(task)
        await db.flush()

    t_item: Any = task
    old_progress = t_item.progress_percentage
    old_actual = float(t_item.actual_effort_hours or 0.0)

    # Validations
    if "progress" in body:
        val_prog = int(body["progress"])
        if val_prog < 0 or val_prog > 100:
            raise HTTPException(status_code=400, detail="Progress percentage must be between 0 and 100")
        t_item.progress_percentage = val_prog

    # Actual effort: either direct override or session hours accumulation
    session_hours = 0.0
    if "sessionHours" in body:
        try:
            session_hours = float(body["sessionHours"])
        except Exception:
            session_hours = 0.0
        if session_hours < 0:
            raise HTTPException(status_code=400, detail="Session hours cannot be negative")
        if session_hours > 0:
            t_item.actual_effort_hours = old_actual + session_hours
            # Create a JobExecutionSession
            work_session = JobExecutionSession(
                job_id=job.id,
                session_type="WORK",
                started_at=now - timedelta(hours=session_hours),
                ended_at=now,
                duration_seconds=int(session_hours * 3600),
                performed_by=user.name or user.username,
                notes=str(body.get("completionRemarks") or "Work session completed").strip()
            )
            db.add(work_session)
    elif "actualEffort" in body:
        try:
            act_val = float(body["actualEffort"])
        except Exception:
            act_val = 0.0
        if act_val < 0:
            raise HTTPException(status_code=400, detail="Actual effort hours cannot be negative")
        t_item.actual_effort_hours = act_val

    if "estimatedEffort" in body and body["estimatedEffort"] is not None:
        try:
            est_val = float(body["estimatedEffort"])
            if est_val >= 0:
                t_item.estimated_effort_hours = est_val
        except Exception:
            pass

    if "completionRemarks" in body:
        t_item.completion_remarks = str(body["completionRemarks"]).strip()

    if "targetedDate" in body and body["targetedDate"]:
        try:
            t_item.target_date = datetime.strptime(body["targetedDate"][:10], "%Y-%m-%d").date()
        except Exception:
            pass

    # Status handling
    new_status = body.get("status")
    if new_status:
        t_item.status = new_status
        if new_status == "Blocked":
            b_reason = str(body.get("blockedReason") or body.get("completionRemarks") or "").strip()
            if not b_reason:
                raise HTTPException(status_code=400, detail="A blocker or delay reason is required when marking a task Blocked")
            t_item.blocked_reason = b_reason

    if t_item.status == "Completed" or (t_item.progress_percentage or 0) >= 100:
        t_item.status = "Completed"
        t_item.completed_at = now
        t_item.progress_percentage = 100

    # Audit Trail Entry
    act = DepartmentActivity(
        job_id=job.id,
        department=t_item.department,
        action="TASK_PROGRESS_UPDATED",
        old_value={"progress": old_progress, "actual_hours": old_actual},
        new_value={
            "progress": t_item.progress_percentage,
            "status": t_item.status,
            "actual_hours": float(t_item.actual_effort_hours or 0.0),
            "session_hours": session_hours,
            "remarks": t_item.completion_remarks,
            "blocked_reason": t_item.blocked_reason or ""
        },
        updated_by=user.username
    )
    db.add(act)

    await db.commit()
    await db.refresh(t_item)

    return {"success": True, "message": "My Task updated successfully", "task": {
        "id": t_item.id,
        "progress": t_item.progress_percentage,
        "status": t_item.status,
        "actualEffort": float(t_item.actual_effort_hours or 0),
        "estimatedEffort": float(t_item.estimated_effort_hours or 0),
        "completedAt": t_item.completed_at.isoformat() if t_item.completed_at else None
    }}

# POST /api/jobs/{id}/workflow/direct-assign
@router.post("/{id}/workflow/direct-assign")
async def direct_assign_department_task(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    assigned_user_id = body.get("assignedUserId")
    assigned_user_name = (body.get("assignedUserName") or "").strip()
    task_name = (body.get("taskName") or "").strip()
    estimated_effort = float(body.get("estimatedEffort") or 4.0)

    if not assigned_user_name:
        raise HTTPException(status_code=400, detail="Assigned user name is required")

    curr_dept = job.current_department or "marketing"
    job.assigned_user_id = assigned_user_id
    job.assigned_user_name = assigned_user_name

    # Check for open task in this department
    t_stmt = select(DepartmentTask).where(
        DepartmentTask.job_id == job.id,
        DepartmentTask.department == curr_dept,
        DepartmentTask.status == "In Progress"
    ).order_by(desc(DepartmentTask.id))
    t_res = await db.execute(t_stmt)
    task: Any = t_res.scalars().first()

    now_d = date.today()
    if task:
        task.assigned_user_id = assigned_user_id
        task.assigned_user_name = assigned_user_name
        if task_name:
            task.task_name = task_name
        if "targetDate" in body and body["targetDate"]:
            try:
                task.target_date = datetime.strptime(body["targetDate"][:10], "%Y-%m-%d").date()
            except Exception:
                pass
    else:
        task = DepartmentTask(
            job_id=job.id,
            department=curr_dept,
            task_name=task_name or DEFAULT_DEPARTMENT_TASKS.get(curr_dept, "Department Execution Task"),
            assigned_user_id=assigned_user_id,
            assigned_user_name=assigned_user_name,
            created_by_user_id=user.id,
            created_by_name=user.name or user.username,
            start_date=now_d,
            target_date=now_d + timedelta(days=5),
            estimated_effort_hours=estimated_effort,
            actual_effort_hours=0.0,
            progress_percentage=0,
            status="In Progress"
        )
        db.add(task)

    activity = DepartmentActivity(
        job_id=job.id,
        department=curr_dept,
        action="TASK_DIRECT_ASSIGNED",
        old_value={"assigned_user": job.assigned_user_name},
        new_value={"assigned_to": assigned_user_name, "task_name": task.task_name},
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    return {"success": True, "message": f"Task directly assigned to {assigned_user_name}"}

# POST /api/jobs/{id}/tasks
@router.post("/{id}/tasks")
async def create_job_task(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    task_name = (body.get("taskName") or body.get("title") or "").strip()
    if not task_name:
        raise HTTPException(status_code=400, detail="Task title is required")

    curr_dept = (job.current_department or "marketing").lower()
    dept = (body.get("department") or curr_dept).lower()
    assigned_user = (body.get("assignedUser") or body.get("assigned_user_name") or job.responsible_engg_name or user.name or user.username).strip()
    est_hours = float(body.get("estimatedEffort") or body.get("estimated_effort_hours") or 8.0)
    instructions = (body.get("instructions") or body.get("description") or "").strip()

    t_start = date.today()
    t_due = date.today() + timedelta(days=5)
    if body.get("targetDate"):
        try:
            t_due = datetime.strptime(str(body["targetDate"])[:10], "%Y-%m-%d").date()
        except Exception:
            pass

    new_task = DepartmentTask(
        job_id=job.id,
        department=dept,
        task_name=task_name,
        assigned_user_name=assigned_user,
        created_by_user_id=user.id,
        created_by_name=user.name or user.username,
        description=instructions,
        start_date=t_start,
        target_date=t_due,
        estimated_effort_hours=est_hours,
        actual_effort_hours=0.0,
        progress_percentage=0,
        status="In Progress"
    )
    db.add(new_task)

    activity = DepartmentActivity(
        job_id=job.id,
        department=dept,
        action="TASK_CREATED",
        new_value={"task_name": task_name, "assigned_to": assigned_user, "target_date": str(t_due)},
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(new_task)
    return {"success": True, "task": {
        "id": new_task.id,
        "taskName": new_task.task_name,
        "department": new_task.department,
        "assignedUser": new_task.assigned_user_name,
        "targetDate": str(new_task.target_date),
        "estimatedEffort": new_task.estimated_effort_hours,
        "status": new_task.status
    }}

# GET /api/jobs/department-tasks/my-tasks
@router.get("/department-tasks/my-tasks")
async def get_department_my_tasks(
    department: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    user_depts = [d.lower() for d in (user.departments or [])]
    is_admin = is_admin_or_keval(user)

    # Scoping: if regular user, restrict strictly to their own department
    allowed_dept = None
    if not is_admin:
        allowed_dept = user_depts[0] if user_depts else "marketing"
    else:
        allowed_dept = department.lower() if department else None

    stmt = select(DepartmentTask, Job).join(Job, DepartmentTask.job_id == Job.id)

    if allowed_dept:
        allowed_dept_norm = normalize_dept_key(allowed_dept)
        stmt = stmt.where(
            or_(
                DepartmentTask.department == allowed_dept,
                DepartmentTask.department == allowed_dept_norm,
                func.lower(DepartmentTask.department).like(f"%{allowed_dept_norm}%")
            )
        )

    if status and status.lower() != "all":
        stmt = stmt.where(DepartmentTask.status == status)

    if search:
        s_pat = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Job.job_no).like(s_pat),
                func.lower(Job.client_name).like(s_pat),
                func.lower(Job.panel_name).like(s_pat),
                func.lower(DepartmentTask.task_name).like(s_pat),
                func.lower(DepartmentTask.assigned_user_name).like(s_pat)
            )
        )

    stmt = stmt.order_by(desc(DepartmentTask.id))
    res = await db.execute(stmt)
    records: list[Any] = list(res.all())

    tasks = []
    for t, j in records:
        tasks.append({
            "id": t.id,
            "jobId": j.id,
            "externalId": j.external_id,
            "jobNo": j.job_no,
            "clientName": j.client_name or "",
            "panelName": j.panel_name or "",
            "projectName": j.project_name or "",
            "taskName": t.task_name,
            "department": t.department,
            "assignedUser": t.assigned_user_name,
            "sentBy": getattr(t, "created_by_name", None) or "Marketing",
            "sentByDepartment": "marketing" if t.department != "marketing" else "system",
            "startDate": t.start_date.isoformat() if t.start_date else None,
            "targetDate": t.target_date.isoformat() if t.target_date else None,
            "estimatedEffort": float(t.estimated_effort_hours or 0),
            "actualEffort": float(t.actual_effort_hours or 0),
            "progress": int(t.progress_percentage or 0),
            "status": t.status,
            "completedAt": t.completed_at.isoformat() if t.completed_at else None,
            "completionRemarks": t.completion_remarks or "",
            "blockedReason": getattr(t, "blocked_reason", "") or "",
            "description": getattr(t, "description", "") or "",
            "remainingEffort": max(0.0, float(t.estimated_effort_hours or 0) - float(t.actual_effort_hours or 0)),
            "responsibleEngineer": j.responsible_engg_name or ""
        })

    return {"tasks": tasks, "total": len(tasks), "department": allowed_dept or "all"}

# POST /api/jobs/{id}/workflow/handover
@router.post("/{id}/workflow/handover")
async def handover_to_next_department(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    target_dept = (body.get("targetDepartment") or "design").lower()
    resp_engg = (body.get("responsibleEngineer") or job.responsible_engg_name or "").strip()
    notes = (body.get("notes") or body.get("handoverNote") or "").strip()
    tasks_payload = body.get("tasks") or []
    if not tasks_payload and body.get("task"):
        tasks_payload = [body.get("task")]

    from_dept = (job.current_department or "marketing").lower()

    # Rule 9: Never allow duplicate handovers while a handover is already Pending Acceptance
    existing_h_stmt = select(JobHandover).where(
        JobHandover.job_id.in_([job.id, job.external_id]),
        JobHandover.is_current_pending.is_(True)
    )
    ex_h_res = await db.execute(existing_h_stmt)
    if ex_h_res.scalars().first():
        raise HTTPException(status_code=400, detail="A handover is already pending acceptance for this job")

    # Mark current active task as Completed
    t_stmt = select(DepartmentTask).where(
        DepartmentTask.job_id == job.id,
        DepartmentTask.department == from_dept,
        DepartmentTask.status == "In Progress"
    ).order_by(desc(DepartmentTask.id))
    t_res = await db.execute(t_stmt)
    curr_task: Any = t_res.scalars().first()
    now = datetime.now(timezone.utc)
    if curr_task:
        curr_task.status = "Completed"
        curr_task.completed_at = now
        curr_task.progress_percentage = 100

    # Rule 1: Handover creates an incoming record for the next department (status = 'Pending Acceptance')
    handover_record = JobHandover(
        job_id=job.id,
        handover_type="DEPARTMENT",
        from_department=from_dept,
        to_department=target_dept,
        performed_by=user.name or user.username,
        responsible_engg_name=resp_engg,
        reason=f"Handover from {from_dept.capitalize()} to {target_dept.capitalize()}",
        notes=notes,
        is_current_pending=True,
        status_at_handover="Pending Acceptance"
    )
    db.add(handover_record)
    await db.flush()

    # Rule 2: Create DepartmentTask(s) for the receiving department
    target_dept_norm = normalize_dept_key(target_dept)
    if tasks_payload:
        for t_item in tasks_payload:
            t_title = t_item.get("taskTitle") or t_item.get("taskName") or DEFAULT_DEPARTMENT_TASKS.get(target_dept_norm, f"{target_dept.capitalize()} Review & Preparation")
            t_assigned = t_item.get("assignedTo") or resp_engg
            t_start = date.today()
            t_due = date.today() + timedelta(days=5)
            if t_item.get("targetDate"):
                try:
                    t_due = datetime.strptime(str(t_item["targetDate"])[:10], "%Y-%m-%d").date()
                except Exception:
                    pass
            if t_item.get("startDate"):
                try:
                    t_start = datetime.strptime(str(t_item["startDate"])[:10], "%Y-%m-%d").date()
                except Exception:
                    pass

            new_task = DepartmentTask(
                job_id=job.id,
                department=target_dept_norm,
                task_name=t_title,
                assigned_user_name=t_assigned,
                created_by_user_id=user.id,
                created_by_name=user.name or user.username,
                description=t_item.get("instructions") or t_item.get("description") or f"Handed over by {user.name or user.username} ({from_dept.capitalize()})",
                start_date=t_start,
                target_date=t_due,
                estimated_effort_hours=float(t_item.get("estimatedEffort") or 8.0),
                actual_effort_hours=0.0,
                progress_percentage=0,
                status="In Progress"
            )
            db.add(new_task)
    else:
        # Default fallback task
        new_task = DepartmentTask(
            job_id=job.id,
            department=target_dept_norm,
            task_name=DEFAULT_DEPARTMENT_TASKS.get(target_dept_norm, f"{target_dept.capitalize()} Review & Preparation"),
            assigned_user_name=resp_engg or f"{target_dept.capitalize()} Team",
            created_by_user_id=user.id,
            created_by_name=user.name or user.username,
            description=f"Handed over by {user.name or user.username} ({from_dept.capitalize()})",
            start_date=date.today(),
            target_date=date.today() + timedelta(days=5),
            estimated_effort_hours=8.0,
            actual_effort_hours=0.0,
            progress_percentage=0,
            status="In Progress"
        )
        db.add(new_task)

    # Link selected or existing documents for this job to the handover record
    selected_doc_ids = body.get("selectedDocumentIds") or body.get("selected_document_ids") or []
    if selected_doc_ids:
        docs_stmt = select(JobDocument).where(JobDocument.id.in_(selected_doc_ids))
        docs_res = await db.execute(docs_stmt)
        for doc_item in docs_res.scalars().all():
            doc_item.handover_id = handover_record.id
    else:
        docs_stmt = select(JobDocument).where(JobDocument.job_id == job.id, JobDocument.handover_id.is_(None))
        docs_res = await db.execute(docs_stmt)
        for doc_item in docs_res.scalars().all():
            doc_item.handover_id = handover_record.id

    # Update job stage & ownership
    job.current_department = target_dept
    job.current_workflow_status = "Pending Acceptance"
    job.assigned_user_id = None
    job.assigned_user_name = ""
    if resp_engg:
        job.responsible_engg_name = resp_engg
    job.handover_status = f"Submitted to {target_dept.capitalize()}"
    job.current_action = f"Waiting for {target_dept.capitalize()} acceptance"

    # Audit log
    activity = DepartmentActivity(
        job_id=job.id,
        department=from_dept,
        action="HANDOVER_SUBMITTED",
        old_value={"department": from_dept, "status": "In Progress"},
        new_value={"to_department": target_dept, "responsible_engg": resp_engg, "notes": notes},
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("JOB_STATUS_CHANGED", {
        "event": "HANDOVER_SUBMITTED",
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "fromDepartment": from_dept,
        "toDepartment": target_dept,
        "responsibleEngineer": resp_engg
    })

    return {
        "success": True,
        "message": f"Job successfully handed over to {target_dept.capitalize()}",
        "currentDepartment": target_dept,
        "status": "Pending Acceptance"
    }

# =========================================================================
# DOCUMENTS API (PostgreSQL job_documents table & pgAdmin 4 queryable)
# =========================================================================

# POST /api/jobs/{id}/documents/upload
@router.post("/{id}/documents/upload")
async def upload_job_document(
    id: int,
    file: UploadFile = File(...),
    document_type: str = Form("GENERAL"),
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job_upload_dir = os.path.join(UPLOAD_DIR, str(job.id))
    os.makedirs(job_upload_dir, exist_ok=True)

    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    orig_filename = os.path.basename(file.filename)
    safe_filename = f"{uuid.uuid4().hex[:8]}_{orig_filename}"
    file_path = os.path.join(job_upload_dir, safe_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = os.path.getsize(file_path)
    file_size_kb = round(file_size / 1024.0, 2)
    file_url = f"/uploads/{job.id}/{safe_filename}"

    user_dept = user.departments[0] if user.departments else "marketing"
    doc = JobDocument(
        job_id=job.id,
        job_no=job.job_no,
        document_type=document_type.upper(),
        file_name=safe_filename,
        original_name=orig_filename,
        file_path=file_path,
        file_url=file_url,
        file_size_kb=file_size_kb,
        mime_type=file.content_type or "application/pdf",
        uploaded_by=user.name or user.username,
        department=user_dept
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return {
        "success": True,
        "document": {
            "id": doc.id,
            "jobId": doc.job_id,
            "jobNo": doc.job_no,
            "documentType": doc.document_type,
            "originalName": doc.original_name,
            "fileName": doc.file_name,
            "fileUrl": doc.file_url,
            "fileSizeKb": float(doc.file_size_kb or 0),
            "uploadedBy": doc.uploaded_by,
            "uploadedAt": doc.uploaded_at.isoformat() if doc.uploaded_at else None
        }
    }

# GET /api/jobs/{id}/documents
@router.get("/{id}/documents")
async def get_job_documents(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    stmt = select(JobDocument).where(JobDocument.job_id == job.id).order_by(desc(JobDocument.id))
    res = await db.execute(stmt)
    docs = res.scalars().all()

    return [
        {
            "id": d.id,
            "jobId": d.job_id,
            "jobNo": d.job_no,
            "documentType": d.document_type,
            "originalName": d.original_name,
            "fileUrl": f"/api/jobs/{job.id}/documents/{d.id}/download",
            "staticUrl": d.file_url or f"/uploads/{job.id}/{d.file_name}",
            "fileSizeKb": float(d.file_size_kb or 0),
            "uploadedBy": d.uploaded_by,
            "uploadedAt": d.uploaded_at.isoformat() if d.uploaded_at else None
        }
        for d in docs
    ]

# GET /api/jobs/{id}/documents/{doc_id}/download
@router.get("/{id}/documents/{doc_id}/download")
async def download_job_document(
    id: int,
    doc_id: int,
    db: AsyncSession = Depends(get_db)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    stmt = select(JobDocument).where(JobDocument.id == doc_id)
    res = await db.execute(stmt)
    doc = res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document record not found")

    # Locate physical file with candidate paths
    file_path = doc.file_path
    if not (file_path and os.path.exists(file_path)):
        candidate1 = os.path.join(UPLOAD_DIR, str(job.id), doc.file_name)
        candidate2 = os.path.join(LEGACY_UPLOAD_DIR, str(job.id), doc.file_name)
        if os.path.exists(candidate1):
            file_path = candidate1
        elif os.path.exists(candidate2):
            file_path = candidate2
        else:
            raise HTTPException(status_code=404, detail="Physical file not found on disk")

    download_name = doc.original_name or doc.file_name
    return FileResponse(
        path=file_path,
        filename=download_name,
        media_type=doc.mime_type or "application/octet-stream"
    )

# =========================================================================
# INCOMING JOBS INBOX API (For ALL Users across All Departments)
# =========================================================================

# GET /api/jobs/incoming/list
@router.get("/incoming/list")
async def get_incoming_jobs(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    is_admin = is_admin_or_keval(user)
    user_depts = [normalize_dept_key(d) for d in (user.departments or [])]

    stmt = select(Job).where(Job.current_workflow_status == "Pending Acceptance")
    if not is_admin:
        stmt = stmt.where(
            or_(*[func.lower(Job.current_department) == ud for ud in user_depts])
        )
    stmt = stmt.order_by(desc(Job.id))
    res = await db.execute(stmt)
    jobs_list = res.scalars().all()

    results = []
    for j in jobs_list:
        # Get latest pending handover
        h_stmt = select(JobHandover).where(
            JobHandover.job_id.in_([j.id, j.external_id]),
            JobHandover.is_current_pending.is_(True)
        ).order_by(desc(JobHandover.id))
        h_res = await db.execute(h_stmt)
        handover = h_res.scalars().first()

        # Get attached documents from PostgreSQL job_documents
        doc_stmt = select(JobDocument).where(JobDocument.job_id == j.id).order_by(desc(JobDocument.id))
        doc_res = await db.execute(doc_stmt)
        docs = doc_res.scalars().all()

        # Get tasks created for this department
        t_stmt = select(DepartmentTask).where(
            DepartmentTask.job_id == j.id,
            DepartmentTask.department == normalize_dept_key(j.current_department)
        ).order_by(desc(DepartmentTask.id))
        t_res = await db.execute(t_stmt)
        tasks = t_res.scalars().all()

        results.append({
            "jobId": j.id,
            "externalId": j.external_id,
            "jobNo": j.job_no,
            "clientName": j.client_name or "",
            "projectName": j.project_name or "",
            "panelName": j.panel_name or "",
            "currentDepartment": j.current_department,
            "responsibleEngineer": j.responsible_engg_name or "",
            "handover": {
                "id": handover.id if handover else None,
                "fromDepartment": handover.from_department if handover else "marketing",
                "sentBy": handover.performed_by if handover else (tasks[0].created_by_name if tasks else "System"),
                "handedOverAt": handover.created_at.isoformat() if handover and getattr(handover, "created_at", None) else None,
                "note": handover.notes if handover else "",
                "responsibleEngineer": handover.responsible_engg_name if handover else j.responsible_engg_name
            } if handover else None,
            "documents": [
                {
                    "id": d.id,
                    "originalName": d.original_name,
                    "documentType": d.document_type,
                    "fileUrl": f"/api/jobs/{j.id}/documents/{d.id}/download",
                    "staticUrl": d.file_url or f"/uploads/{j.id}/{d.file_name}",
                    "fileSizeKb": float(d.file_size_kb or 0),
                    "uploadedBy": d.uploaded_by
                }
                for d in docs
            ],
            "tasks": [
                {
                    "id": t.id,
                    "taskName": t.task_name,
                    "assignedUser": t.assigned_user_name,
                    "startDate": t.start_date.isoformat() if t.start_date else None,
                    "targetDate": t.target_date.isoformat() if t.target_date else None,
                    "estimatedEffort": float(t.estimated_effort_hours or 0),
                    "status": t.status,
                    "instructions": t.description or ""
                }
                for t in tasks
            ]
        })

    return {"incomingJobs": results, "count": len(results)}

# GET /api/jobs/incoming/count
@router.get("/incoming/count")
async def get_incoming_jobs_count(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    is_admin = is_admin_or_keval(user)
    user_depts = [normalize_dept_key(d) for d in (user.departments or [])]

    stmt = select(func.count(Job.id)).where(Job.current_workflow_status == "Pending Acceptance")
    if not is_admin:
        stmt = stmt.where(
            or_(*[func.lower(Job.current_department) == ud for ud in user_depts])
        )
    res = await db.execute(stmt)
    count_val = res.scalar() or 0
    return {"count": count_val}

# POST /api/jobs/{id}/incoming/accept
@router.post("/{id}/incoming/accept")
async def accept_incoming_job(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    user_name = user.name or user.username
    now = datetime.now(timezone.utc)

    h_stmt = select(JobHandover).where(
        JobHandover.job_id.in_([job.id, job.external_id]),
        JobHandover.is_current_pending.is_(True)
    )
    h_res = await db.execute(h_stmt)
    handover = h_res.scalars().first()
    if handover:
        handover.is_current_pending = False
        handover.status_at_handover = "Accepted"
        setattr(handover, "accepted_by", user_name)
        setattr(handover, "accepted_at", now)

    job.current_workflow_status = "In Progress"
    job.handover_status = f"Accepted by {job.current_department.capitalize()}"
    job.current_action = f"Working on {job.current_department.capitalize()} stage"

    # Update tasks status to In Progress
    t_stmt = select(DepartmentTask).where(
        DepartmentTask.job_id == job.id,
        DepartmentTask.department == normalize_dept_key(job.current_department)
    )
    t_res = await db.execute(t_stmt)
    for t in t_res.scalars().all():
        if t.status in ["Pending Review", "Open"]:
            t.status = "In Progress"

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("JOB_STATUS_CHANGED", {
        "event": "JOB_ACCEPTED",
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "department": job.current_department,
        "acceptedBy": user_name
    })

    return {"success": True, "message": f"Job accepted by {user_name}"}

# POST /api/jobs/{id}/incoming/return
@router.post("/{id}/incoming/return")
async def return_incoming_job(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    job = await find_job_by_id(db, id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    body = await safe_json_body(request)
    reason_cat = body.get("reasonCategory") or body.get("reason") or "Missing Technical Information"
    remarks = (body.get("remarks") or body.get("comment") or "").strip()

    user_name = user.name or user.username
    now = datetime.now(timezone.utc)

    h_stmt = select(JobHandover).where(
        JobHandover.job_id.in_([job.id, job.external_id]),
        JobHandover.is_current_pending.is_(True)
    )
    h_res = await db.execute(h_stmt)
    handover = h_res.scalars().first()

    return_to_dept = handover.from_department if handover else "marketing"
    if handover:
        handover.is_current_pending = False
        handover.status_at_handover = f"Returned to {return_to_dept.capitalize()}"
        handover.notes = f"{handover.notes}\n[RETURN REASON: {reason_cat}] {remarks}"

    job.current_department = return_to_dept
    job.current_workflow_status = "Needs Clarification"
    job.handover_status = f"Returned to {return_to_dept.capitalize()}"
    job.handover_return_reason = reason_cat
    job.handover_return_comment = remarks
    job.current_action = f"Clarification required by {return_to_dept.capitalize()}"

    # Mark department tasks as Blocked / Returned (DO NOT DELETE)
    t_stmt = select(DepartmentTask).where(
        DepartmentTask.job_id == job.id,
        DepartmentTask.department == normalize_dept_key(user.departments[0] if user.departments else "design")
    )
    t_res = await db.execute(t_stmt)
    for t in t_res.scalars().all():
        t.status = "Blocked / Returned"
        t.blocked_reason = f"Returned: {reason_cat} - {remarks}"

    await db.commit()
    await db.refresh(job)

    await broadcaster.broadcast("JOB_STATUS_CHANGED", {
        "event": "CLARIFICATION_REQUESTED",
        "jobId": job.external_id,
        "jobNo": job.job_no,
        "returnedTo": return_to_dept,
        "reason": reason_cat
    })

    return {"success": True, "message": f"Job returned to {return_to_dept.capitalize()}"}
