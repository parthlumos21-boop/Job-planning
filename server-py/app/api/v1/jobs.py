from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, delete
from sqlalchemy.orm.attributes import flag_modified
from typing import Any
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models import Job, Client, DepartmentAssignment, DepartmentActivity
from app.schemas import (
    UserPayload, FieldUpdateRequest, StatusUpdateRequest,
    BulkSelectRequest, SingleSelectRequest
)

router = APIRouter(prefix="/jobs", tags=["Jobs"])

def is_keval(user: UserPayload) -> bool:
    return (user.username or "").lower() == "keval v shah"

def can_manage_core(user: UserPayload) -> bool:
    return (
        user.role in ["admin", "executive"]
        or is_keval(user)
        or "marketing" in user.departments
    )

def visible_departments_for_job(job: Job) -> list[str]:
    visible = set()
    if job.target_department:
        visible.add(job.target_department)
    if job.visible_to_departments:
        for d in job.visible_to_departments:
            if d:
                visible.add(d)
    fields = job.fields or {}
    for dept, f in fields.items():
        if f and isinstance(f, dict) and len(f) > 0:
            visible.add(dept)
    engineers = job.engineers or {}
    for dept, engs in engineers.items():
        if engs and isinstance(engs, list) and len(engs) > 0:
            visible.add(dept)
    return list(visible)

def format_job_row(j: Job, department: str | None = None) -> dict:
    engineers_dict = j.engineers or {}
    fields_dict = j.fields or {}
    dept_engs = engineers_dict.get(department, []) if department else []
    mkt_engs = engineers_dict.get("marketing", [])
    tgt_engs = engineers_dict.get(j.target_department, []) if j.target_department else []
    
    display_engs = (
        (dept_engs if len(dept_engs) else mkt_engs if len(mkt_engs) else tgt_engs)
        if department else engineers_dict
    )

    return {
        "id": j.external_id,
        "clientId": j.client_id,
        "clientName": j.client_name or "",
        "srNo": j.sr_no,
        "jobNo": j.job_no or "",
        "panelName": j.panel_name or "",
        "qty": j.qty or "1",
        "projectName": j.project_name or "",
        "typeOfIndustries": j.type_of_industries or "",
        "incomerRating": j.incomer_rating or "",
        "typeOfPanel": j.type_of_panel or "",
        "responsibleEnggName": j.responsible_engg_name or "",
        "poNo": j.po_no or "",
        "poDate": j.po_date or "",
        "deliveryPeriod": j.delivery_period or "",
        "deliveryDate": j.delivery_date or "",
        "dataGivenToDesign": j.data_given_to_design or "",
        "deliveryAddress": j.delivery_address or "",
        "contactPerson": j.contact_person or "",
        "ttl": j.ttl or "",
        "date": j.date or "",
        "targetDepartment": j.target_department or "",
        "targetPosition": j.target_position or "",
        "visibleToDepartments": j.visible_to_departments or visible_departments_for_job(j),
        "departmentStatus": j.department_status or {},
        "selected": j.selected or False,
        "departmentFields": fields_dict.get(department, {}) if department else None,
        "marketingFields": fields_dict.get("marketing", {}),
        "engineers": display_engs,
        "fields": fields_dict,
        "allDepartmentsData": fields_dict,
        "lifecycleStatus": j.lifecycle_status or "Draft",
        "plannedStartAt": j.planned_start_at.isoformat() if j.planned_start_at else None,
        "plannedEndAt": j.planned_end_at.isoformat() if j.planned_end_at else None,
        "estimatedDurationSeconds": j.estimated_duration_seconds or 0,
        "actualStartAt": j.actual_start_at.isoformat() if j.actual_start_at else None,
        "actualEndAt": j.actual_end_at.isoformat() if j.actual_end_at else None,
        "totalPausedSeconds": j.total_paused_seconds or 0,
        "pauseStartedAt": j.pause_started_at.isoformat() if j.pause_started_at else None,
        "actualDurationSeconds": j.actual_duration_seconds or 0,
        "progressPercentage": float(getattr(j, "progress_percentage", 0.0) or 0.0),
        "priority": j.priority or "Normal",
        "assignedEngineerId": j.assigned_engineer_id,
        "currentWorkerId": j.current_worker_id,
        "currentWorkerPosition": j.current_worker_position or "",
        "handoverStatus": j.handover_status or "Draft",
        "planningOwnerId": j.planning_owner_id,
        "planningOwnerName": j.planning_owner_name or "",
        "handoverSubmittedAt": j.handover_submitted_at.isoformat() if j.handover_submitted_at else None,
        "handoverAcceptedAt": j.handover_accepted_at.isoformat() if j.handover_accepted_at else None,
        "handoverReturnReason": j.handover_return_reason or "",
        "handoverChecklist": j.handover_checklist or {},
        "attachments": j.attachments or [],
        "currentStage": getattr(j, "current_stage", "INCOMING") or "INCOMING",
        "currentAction": getattr(j, "current_action", "Review Incoming Job") or "Review Incoming Job",
        "currentWaitingReason": getattr(j, "current_waiting_reason", "") or "",
        "stageStartedAt": j.stage_started_at.isoformat() if getattr(j, "stage_started_at", None) else None,
        "stageDueDate": j.stage_due_date.isoformat() if getattr(j, "stage_due_date", None) else None,
        "assignmentReasonCategory": getattr(j, "assignment_reason_category", "") or "",
        "assignmentExplanation": getattr(j, "assignment_explanation", "") or "",
        "forwardingReasonCategory": getattr(j, "forwarding_reason_category", "") or "",
        "forwardingNote": getattr(j, "forwarding_note", "") or "",
        "stageDurations": getattr(j, "stage_durations", {}) or {},
    }

# GET /api/jobs/stats
@router.get("/stats")
async def get_job_stats(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = select(Job)
    res = await db.execute(stmt)
    jobs = res.scalars().all()

    total_jobs = len(jobs)
    departments = ["marketing", "design", "mechanical", "purchase", "production"]
    stats: dict[str, Any] = {
        "overall": {
            "total": total_jobs,
            "completed": sum(1 for j in jobs if (j.department_status or {}).get("dispatch") == "completed"),
            "pending": sum(1 for j in jobs if (j.department_status or {}).get("dispatch") != "completed"),
        }
    }

    for dept in departments:
        d_completed = sum(1 for j in jobs if (j.department_status or {}).get(dept) == "completed")
        stats[dept] = {
            "total": total_jobs,
            "completed": d_completed,
            "pending": total_jobs - d_completed
        }

    return stats

# GET /api/jobs
@router.get("")
async def list_jobs(
    department: str | None = Query(None),
    user_name: str | None = Query(None, alias="user"),
    client: str | None = Query(None),
    search: str | None = Query(None),
    selectedOnly: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserPayload = Depends(get_current_user)
):
    stmt = select(Job).order_by(Job.external_id.desc())
    res = await db.execute(stmt)
    jobs = list(res.scalars().all())

    # In-memory or relational filtering
    if client:
        jobs = [j for j in jobs if str(j.client_id) == client or (j.client_name and client.lower() in j.client_name.lower())]

    if department:
        jobs = [j for j in jobs if department in visible_departments_for_job(j)]

    if user_name:
        needle = user_name.strip().upper()
        filtered = []
        for j in jobs:
            eng_map = j.engineers or {}
            scopes = [department] if department else list(eng_map.keys())
            matched = False
            for dept_key in scopes:
                for name in eng_map.get(dept_key, []):
                    if needle in str(name).upper():
                        matched = True
                        break
                if matched:
                    break
            if matched:
                filtered.append(j)
        jobs = filtered

    if search:
        s = search.strip().lower()
        jobs = [
            j for j in jobs
            if s in (j.job_no or "").lower()
            or s in (j.panel_name or "").lower()
            or s in (j.project_name or "").lower()
            or s in (j.client_name or "").lower()
        ]

    if selectedOnly == "true":
        jobs = [j for j in jobs if j.selected]

    rows = [format_job_row(j, department) for j in jobs]
    return {"count": len(rows), "jobs": rows}

# POST /api/jobs
@router.post("")
async def create_job(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    body = await request.json()

    raw_job_no = str(body.get("jobNo", "")).strip()
    if raw_job_no:
        dup_stmt = select(Job).where(func.lower(Job.job_no) == raw_job_no.lower())
        existing = (await db.execute(dup_stmt)).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Job #{raw_job_no} already exists in the system (Panel: '{existing.panel_name}'). Please choose a unique Job Number or edit the existing job."
            )

    # Determine next external_id
    max_id_res = await db.execute(select(func.max(Job.external_id)))
    max_id = max_id_res.scalar_one_or_none() or 0
    next_id = max_id + 1

    client_name = body.get("clientName", "")
    client_id = body.get("clientId")
    if not client_id and client_name:
        c_res = await db.execute(select(Client).where(Client.name == client_name))
        c_match = c_res.scalar_one_or_none()
        if c_match:
            client_id = c_match.external_id or c_match.id

    new_job = Job(
        external_id=next_id,
        client_id=client_id or 1,
        client_name=client_name,
        sr_no=body.get("srNo", next_id),
        job_no=body.get("jobNo", str(next_id)),
        panel_name=body.get("panelName", ""),
        project_name=body.get("projectName", ""),
        responsible_engg_name=body.get("responsibleEnggName", ""),
        assigned_engineer_id=body.get("assignedEngineerId"),
        handover_status=body.get("handoverStatus", "Draft"),
        handover_checklist=body.get("handoverChecklist", {}),
        attachments=body.get("attachments", []),
        po_no=body.get("poNo") or body.get("po_no") or "",
        po_date=body.get("poDate") or body.get("po_date") or "",
        delivery_period=body.get("deliveryPeriod") or body.get("delivery_period") or "",
        delivery_date=body.get("deliveryDate") or body.get("delivery_date") or "",
        data_given_to_design=body.get("dataGivenToDesign") or body.get("data_given_to_design") or "",
        delivery_address=body.get("deliveryAddress") or body.get("delivery_address") or "",
        contact_person=body.get("contactPerson") or body.get("contact_person") or "",
        type_of_industries=body.get("typeOfIndustries") or body.get("type_of_industries") or "",
        incomer_rating=body.get("incomerRating") or body.get("incomer_rating") or "",
        type_of_panel=body.get("typeOfPanel") or body.get("type_of_panel") or "",
        qty=str(body.get("qty", "1")),
        date=body.get("date", ""),
        ttl=body.get("ttl", ""),
        target_department=body.get("targetDepartment", "marketing"),
        target_position=body.get("targetPosition", ""),
        createdBy=user.username,
        visible_to_departments=body.get("visibleToDepartments", ["marketing"]),
        selected=False,
        fields=body.get("fields") or body.get("allDepartmentsData") or {},
        engineers=body.get("engineers", {}),
        department_status=body.get("departmentStatus", {
            "marketing": "completed",
            "design": "pending",
            "mechanical": "pending",
            "purchase": "pending",
            "production": "pending",
            "dispatch": "pending"
        })
    )

    db.add(new_job)
    await db.commit()
    await db.refresh(new_job)
    return format_job_row(new_job)

# POST /api/jobs/select
@router.post("/select")
async def select_job(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    body = await request.json()
    ids = body.get("ids", [])
    selected = body.get("selected", False)
    if ids:
        target_id = ids[0]
        stmt = select(Job).where(Job.external_id == target_id)
        res = await db.execute(stmt)
        job = res.scalar_one_or_none()
        if job:
            job.selected = selected
            await db.commit()
            return {"id": job.external_id, "selected": job.selected}
    return {"ok": True}

# POST /api/jobs/select-bulk
@router.post("/select-bulk")
async def select_bulk_jobs(
    req: BulkSelectRequest,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = update(Job).where(Job.external_id.in_(req.ids)).values(selected=req.selected)
    res = await db.execute(stmt)
    await db.commit()
    return {"updated": res.rowcount}

# POST /api/jobs/clear-selection
@router.post("/clear-selection")
async def clear_all_selections(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = update(Job).values(selected=False)
    await db.execute(stmt)
    await db.commit()
    return {"ok": True}

# GET /api/jobs/{id}
@router.get("/{id}")
async def get_job(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return format_job_row(job)

# PATCH /api/jobs/{id}/select
@router.patch("/{id}/select")
async def patch_select_job(
    id: int,
    req: SingleSelectRequest,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.selected = req.selected
    await db.commit()
    return {"id": job.external_id, "selected": job.selected}

# PATCH /api/jobs/{id}/field
@router.patch("/{id}/field")
async def patch_job_field(
    id: int,
    req: FieldUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    target_dept = "marketing" if req.department == "marketing-lock" else req.department

    user_depts = set(user.departments or [])
    is_admin = user.role in ["admin", "executive"] or is_keval(user)

    if (target_dept in ["core", "marketing"] or req.department in ["core", "marketing"]) and not can_manage_core(user):
        raise HTTPException(status_code=403, detail="Only admins and marketing can edit core and marketing fields")

    if not is_admin and target_dept not in ["core", "marketing"] and target_dept not in user_depts:
        raise HTTPException(
            status_code=403,
            detail=f"Forbidden: You are not authorized to update fields in the '{target_dept}' department"
        )

    current_fields = dict(job.fields or {})
    dept_fields = dict(current_fields.get(target_dept, {}))
    dept_fields[req.field] = req.value
    current_fields[target_dept] = dept_fields
    job.fields = current_fields
    flag_modified(job, "fields")

    # If updating core fields
    if target_dept == "core" or target_dept == "marketing":
        if req.field == "Job No.":
            job.job_no = str(req.value)
        elif req.field == "Name of Panel":
            job.panel_name = str(req.value)
        elif req.field == "Project Name":
            job.project_name = str(req.value)
        elif req.field == "Responsible Engg. Name":
            job.responsible_engg_name = str(req.value)
        elif req.field == "Type of Industries":
            job.type_of_industries = str(req.value)
        elif req.field == "Type of Panel":
            job.type_of_panel = str(req.value)
        elif req.field == "Incomer Rating":
            job.incomer_rating = str(req.value)

    await db.commit()
    return {"ok": True}

# PATCH /api/jobs/{id}/status
@router.patch("/{id}/status")
async def patch_job_status(
    id: int,
    req: StatusUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    if req.status not in ["pending", "completed"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    stmt = select(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    current_status = dict(job.department_status or {})
    current_status[req.department] = req.status
    job.department_status = current_status
    flag_modified(job, "department_status")

    await db.commit()
    return {"ok": True}

# DELETE /api/jobs/{id}
@router.delete("/{id}")
async def delete_job(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    if user.role not in ["admin", "executive"] and not is_keval(user):
        raise HTTPException(status_code=403, detail="Only admins can delete jobs")

    stmt = delete(Job).where(Job.external_id == id)
    res = await db.execute(stmt)
    await db.commit()
    return {"ok": True}
