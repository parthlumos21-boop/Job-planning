from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, delete, or_
from sqlalchemy.orm.attributes import flag_modified
from typing import Any
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models import Job, Client, DepartmentAssignment, DepartmentActivity, DepartmentTask
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
    raw_vis = [d.lower().strip() for d in (job.visible_to_departments or []) if d and str(d).strip()]
    
    # If explicitly assigned a specific subset of departments (< 5), that takes precedence
    if raw_vis and len(set(raw_vis)) < 5:
        for d in raw_vis:
            visible.add(d)
        if job.target_department:
            visible.add(job.target_department.lower().strip())
        return list(visible)

    # Otherwise, deduce dynamically:
    # 1. Target department is always visible
    tgt = (job.target_department or "").lower().strip()
    if tgt:
        visible.add(tgt)

    # 2. Departments with active form fields
    fields = job.fields or {}
    for dept, f in fields.items():
        if f and isinstance(f, dict) and len(f) > 0:
            visible.add(dept.lower().strip())

    # 3. Departments with assigned engineers
    engineers = job.engineers or {}
    for dept, engs in engineers.items():
        if engs and isinstance(engs, list) and len(engs) > 0:
            visible.add(dept.lower().strip())

    # 4. Handover indicators
    if job.data_given_to_design and str(job.data_given_to_design).strip():
        visible.add("design")
    h_status = (job.handover_status or "").lower()
    if "design" in h_status:
        visible.add("design")
    if "mechanical" in h_status:
        visible.add("mechanical")

    # 5. Department status for non-marketing departments or when target is marketing
    dept_status = job.department_status or {}
    for d, st in dept_status.items():
        d_lower = d.lower().strip()
        if d_lower == "marketing":
            if tgt == "marketing" or bool(fields.get("marketing")) or bool(engineers.get("marketing")):
                visible.add("marketing")
        elif st and str(st).lower() in ["completed", "in_progress", "in progress", "active", "submitted", "ready"]:
            visible.add(d_lower)

    # If completely empty, default to target_department or 'marketing'
    if not visible:
        visible.add(tgt if tgt else "marketing")

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
        "id": j.external_id or j.id,
        "clientId": j.client_id,
        "clientName": j.client_name or "",
        "srNo": j.sr_no,
        "jobNo": j.job_no or "",
        "panelName": j.panel_name or "",
        "qty": j.qty or "1",
        "projectName": j.project_name or "",
        "typeOfIndustries": j.type_of_industries or (fields_dict.get("marketing") or {}).get("Type of Industries") or "",
        "incomerRating": j.incomer_rating or (fields_dict.get("marketing") or {}).get("Incomer Rating") or "",
        "typeOfPanel": j.type_of_panel or (fields_dict.get("marketing") or {}).get("Type of Panel") or "",
        "responsibleEnggName": j.responsible_engg_name or (fields_dict.get("marketing") or {}).get("Responsible Engg. Name") or (fields_dict.get("marketing") or {}).get("Responsible Engg Name") or "",
        "poNo": j.po_no or (fields_dict.get("marketing") or {}).get("Purchase Order") or (fields_dict.get("marketing") or {}).get("poNo") or "",
        "poDate": j.po_date or (fields_dict.get("marketing") or {}).get("Purchase Order Date") or (fields_dict.get("marketing") or {}).get("poDate") or "",
        "deliveryPeriod": j.delivery_period or (fields_dict.get("marketing") or {}).get("Delivery Period as per P.O.") or (fields_dict.get("marketing") or {}).get("deliveryPeriod") or "",
        "deliveryDate": j.delivery_date or (fields_dict.get("marketing") or {}).get("Delivery Date as per P.O.") or (fields_dict.get("marketing") or {}).get("deliveryDate") or "",
        "dataGivenToDesign": j.data_given_to_design or (fields_dict.get("marketing") or {}).get("Data Given To Design Dept.") or (fields_dict.get("marketing") or {}).get("Data Given To Design") or "",
        "deliveryAddress": j.delivery_address or "",
        "contactPerson": j.contact_person or "",
        "ttl": j.ttl or "",
        "date": j.date or "",
        "targetDepartment": j.target_department or "",
        "targetPosition": j.target_position or "",
        "visibleToDepartments": j.visible_to_departments or visible_departments_for_job(j),
        "departmentStatus": j.department_status or {},
        "selected": j.selected or False,
        "createdBy": getattr(j, "createdBy", None) or "",
        "creator": getattr(j, "createdBy", None) or "",
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
        "handoverSubmittedBy": (j.handover_checklist or {}).get("submitted_by", ""),
        "handoverNotes": j.handover_notes or "",
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

    is_admin = (
        current_user.role in ["admin", "executive"]
        or (current_user.username or "").lower() in ["keval v shah", "keval", "kevalvshah", "admin", "admin2"]
    )
    user_depts = [d.lower() for d in (current_user.departments or [])]

    # Department filtering & security isolation
    effective_dept = department
    if not is_admin:
        # Department users are locked strictly to their own authorized department(s)
        # If an explicit department is requested, it must be within user_depts
        target_dept = department.lower() if (department and department.lower() in user_depts) else (user_depts[0] if user_depts else None)
        effective_dept = target_dept
        user_name_lower = (current_user.name or current_user.username or "").strip().lower()
        user_uname_lower = (current_user.username or "").strip().lower()
        if target_dept:
            jobs = [
                j for j in jobs
                if target_dept in visible_departments_for_job(j)
                or (getattr(j, "createdBy", "") or "").strip().lower() == user_uname_lower
                or (j.responsible_engg_name or "").strip().lower() == user_name_lower
                or j.assigned_engineer_id == current_user.id
            ]
        elif user_depts:
            jobs = [
                j for j in jobs
                if any(d in visible_departments_for_job(j) for d in user_depts)
                or (getattr(j, "createdBy", "") or "").strip().lower() == user_uname_lower
                or (j.responsible_engg_name or "").strip().lower() == user_name_lower
                or j.assigned_engineer_id == current_user.id
            ]
    else:
        # Admin / Keval V Shah can filter by any department from dropdown or view all
        if department and department.lower() != "all":
            jobs = [j for j in jobs if department.lower() in visible_departments_for_job(j)]

    # In-memory or relational filtering
    if client:
        jobs = [j for j in jobs if str(j.client_id) == client or (j.client_name and client.lower() in j.client_name.lower())]

    if user_name:
        needle = user_name.strip().upper()
        filtered = []
        for j in jobs:
            eng_map = j.engineers or {}
            scopes = [effective_dept] if effective_dept else list(eng_map.keys())
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

    if search and search.strip():
        q = search.strip().lower()
        q_num = q.replace("job-", "").replace("job", "").replace("#", "").strip()
        jobs = [
            j for j in jobs
            if q in (j.job_no or "").strip().lower()
            or q in (j.job_no or "").replace("#", "").strip().lower()
            or (q_num and q_num in (j.job_no or "").replace("#", "").strip().lower())
            or q in (j.client_name or "").lower()
            or q in (j.project_name or "").lower()
            or q in (j.panel_name or "").lower()
            or q in (j.responsible_engg_name or "").lower()
            or q in (j.lifecycle_status or "").lower()
            or q in (j.target_department or "").lower()
        ]

    if selectedOnly == "true":
        jobs = [j for j in jobs if j.selected]

    rows = [format_job_row(j, effective_dept) for j in jobs]
    return {"count": len(rows), "jobs": rows}

# GET /api/jobs/marketing-dashboard
@router.get("/marketing-dashboard")
async def get_marketing_dashboard(
    scope: str = Query("all"),
    search: str | None = Query(None),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    from datetime import datetime, timezone

    stmt = select(Job).order_by(Job.id.desc())
    res = await db.execute(stmt)
    all_jobs = list(res.scalars().all())

    user_role = (user.role or "").lower()
    user_depts = [d.lower() for d in (user.departments or [])]
    is_mkt_lead = user_role in ["mktadmin", "marketing_lead", "admin", "executive"]
    user_name_lower = (user.name or user.username or "").strip().lower()

    # Marketing scope filter
    mkt_jobs = []
    for j in all_jobs:
        vis_depts = [d.lower() for d in (j.visible_to_departments or visible_departments_for_job(j))]
        tgt = (j.target_department or "").lower()
        has_mkt_data = bool((j.fields or {}).get("marketing"))
        is_mkt = "marketing" in vis_depts or tgt == "marketing" or has_mkt_data
        if is_mkt:
            mkt_jobs.append(j)

    if scope == "my":
        scoped_jobs = []
        for j in mkt_jobs:
            is_resp = (j.responsible_engg_name or "").strip().lower() == user_name_lower or j.assigned_engineer_id == user.id
            is_creator = (j.createdBy or "").strip().lower() == (user.username or "").strip().lower()
            if is_resp or is_creator or is_mkt_lead:
                scoped_jobs.append(j)
    else:
        scoped_jobs = mkt_jobs

    now = datetime.now(timezone.utc)
    today_dt = now.date()

    # Pre-calculate overall stats & counts across all scoped marketing jobs
    active_count = 0
    due_soon_count = 0
    overdue_count = 0
    handover_pending_count = 0

    tab_counts = {
        "all": len(scoped_jobs),
        "my_open": 0,
        "in_progress": 0,
        "ready_to_release": 0,
        "awaiting_acceptance": 0,
        "returned": 0,
        "overdue": 0
    }

    for j in scoped_jobs:
        is_completed = (j.lifecycle_status or "").lower() == "completed" or j.actual_end_at is not None or (j.department_status or {}).get("dispatch") == "completed"
        h_status = (j.handover_status or "").lower()
        is_handed_over = "submitted" in h_status or "pending" in h_status or (j.target_department or "").lower() == "design"
        is_returned = "returned" in h_status or bool(j.handover_return_reason)
        is_ready = bool(j.data_given_to_design and str(j.data_given_to_design).strip()) and not is_handed_over and not is_completed

        exp_date_raw = j.stage_due_date or j.planned_end_at
        if not exp_date_raw and j.delivery_date:
            try:
                from datetime import datetime as dt
                exp_date_raw = dt.fromisoformat(str(j.delivery_date)[:10]).replace(tzinfo=timezone.utc)
            except Exception:
                exp_date_raw = None

        is_overdue = False
        if not is_completed and exp_date_raw:
            exp_date = exp_date_raw.date() if hasattr(exp_date_raw, "date") else exp_date_raw
            diff_days = (exp_date - today_dt).days
            if diff_days < 0:
                is_overdue = True
                overdue_count += 1
            elif 0 <= diff_days <= 3:
                due_soon_count += 1

        if not is_completed:
            active_count += 1
            tab_counts["in_progress"] += 1
            h_stat = (j.handover_status or "Draft").lower()
            if "submitted" in h_stat or "pending" in h_stat or h_stat == "draft":
                if (j.target_department or "").lower() in ["design", "planning", ""]:
                    handover_pending_count += 1

        is_my_job = (j.responsible_engg_name or "").strip().lower() == user_name_lower or j.assigned_engineer_id == user.id or (j.createdBy or "").strip().lower() == (user.username or "").strip().lower()
        if is_my_job and not is_completed:
            tab_counts["my_open"] += 1

        if is_ready:
            tab_counts["ready_to_release"] += 1
        if is_handed_over:
            tab_counts["awaiting_acceptance"] += 1
        if is_returned:
            tab_counts["returned"] += 1
        if is_overdue:
            tab_counts["overdue"] += 1

    # Optional search filtering (alphanumeric, case-insensitive across 5 fields)
    if search and search.strip():
        q = search.strip().lower()
        filtered = []
        for j in scoped_jobs:
            clean_no = (j.job_no or "").replace("#", "").strip().lower()
            raw_no = (j.job_no or "").strip().lower()
            matches_job = q in clean_no or q in raw_no
            matches_client = q in (j.client_name or "").lower()
            matches_project = q in (j.project_name or "").lower()
            matches_panel = q in (j.panel_name or "").lower()
            matches_engg = q in (j.responsible_engg_name or "").lower()
            if matches_job or matches_client or matches_project or matches_panel or matches_engg:
                filtered.append(j)
        scoped_jobs = filtered

    # Optional status filtering
    if status and status != "all":
        status_filtered = []
        for j in scoped_jobs:
            is_completed = (j.lifecycle_status or "").lower() == "completed" or j.actual_end_at is not None or (j.department_status or {}).get("dispatch") == "completed"
            h_status = (j.handover_status or "").lower()
            is_handed_over = "submitted" in h_status or "pending" in h_status or (j.target_department or "").lower() == "design"
            is_returned = "returned" in h_status or bool(j.handover_return_reason)
            is_ready = bool(j.data_given_to_design and str(j.data_given_to_design).strip()) and not is_handed_over and not is_completed

            exp_date_raw = j.stage_due_date or j.planned_end_at
            if not exp_date_raw and j.delivery_date:
                try:
                    from datetime import datetime as dt
                    exp_date_raw = dt.fromisoformat(str(j.delivery_date)[:10]).replace(tzinfo=timezone.utc)
                except Exception:
                    exp_date_raw = None
            is_overdue = False
            if not is_completed and exp_date_raw:
                exp_date = exp_date_raw.date() if hasattr(exp_date_raw, "date") else exp_date_raw
                if (exp_date - today_dt).days < 0:
                    is_overdue = True

            is_my_job = (j.responsible_engg_name or "").strip().lower() == user_name_lower or j.assigned_engineer_id == user.id or (j.createdBy or "").strip().lower() == (user.username or "").strip().lower()

            if status == "my_open":
                if is_my_job and not is_completed:
                    status_filtered.append(j)
            elif status == "in_progress":
                if not is_completed:
                    status_filtered.append(j)
            elif status == "ready_to_release":
                if is_ready:
                    status_filtered.append(j)
            elif status == "awaiting_acceptance":
                if is_handed_over:
                    status_filtered.append(j)
            elif status == "returned":
                if is_returned:
                    status_filtered.append(j)
            elif status == "overdue":
                if is_overdue:
                    status_filtered.append(j)
            else:
                status_filtered.append(j)
        scoped_jobs = status_filtered

    formatted_rows = [format_job_row(j, "marketing") for j in scoped_jobs]

    act_stmt = select(DepartmentActivity).where(DepartmentActivity.department == "marketing").order_by(DepartmentActivity.id.desc()).limit(15)
    act_res = await db.execute(act_stmt)
    activities = [
        {
            "id": a.id,
            "jobId": a.job_id,
            "action": a.action,
            "updatedBy": a.updated_by,
            "createdAt": a.created_at.isoformat() if a.created_at else None,
            "notes": (a.new_value or {}).get("notes") or ""
        }
        for a in act_res.scalars().all()
    ]

    # Aggregate marketing tasks metrics
    from app.models import MarketingTask
    from sqlalchemy import or_
    mkt_tasks_stmt = select(MarketingTask)
    if scope == "my" and user.id:
        user_name = (user.name or user.username or "").strip().lower()
        mkt_tasks_stmt = mkt_tasks_stmt.where(
            or_(
                MarketingTask.assigned_to_user_id == user.id,
                MarketingTask.created_by_user_id == user.id,
                func.lower(MarketingTask.assigned_to_name) == user_name
            )
        )
    tasks_res = await db.execute(mkt_tasks_stmt)
    all_mkt_tasks = tasks_res.scalars().all()

    my_open_tasks = 0
    tasks_due_today = 0
    tasks_overdue = 0
    task_est_hrs = 0.0
    task_act_hrs = 0.0
    blocked_job_ids = set()

    for t in all_mkt_tasks:
        st = str(getattr(t, "status", "") or "").lower()
        t_est = float(getattr(t, "estimated_effort", 0.0) or 0.0)
        t_act = float(getattr(t, "actual_effort", 0.0) or 0.0)
        t_unit = str(getattr(t, "effort_unit", "hours") or "hours")
        est = t_est if t_unit == "hours" else (t_est / 60.0)
        act = t_act if t_unit == "hours" else (t_act / 60.0)
        task_est_hrs += est
        task_act_hrs += act

        if st not in ["completed", "cancelled"]:
            my_open_tasks += 1
            t_target = getattr(t, "target_date", None)
            if t_target and hasattr(t_target, "isoformat"):
                t_dt = t_target if hasattr(t_target, "year") else None
                if t_dt:
                    diff = (t_dt - today_dt).days
                    if diff == 0:
                        tasks_due_today += 1
                    elif diff < 0:
                        tasks_overdue += 1
            if getattr(t, "is_mandatory_for_readiness", False):
                blocked_job_ids.add(int(getattr(t, "job_id", 0)))

    task_summary = {
        "openTasks": my_open_tasks,
        "dueToday": tasks_due_today,
        "overdue": tasks_overdue,
        "totalEstimatedHours": round(task_est_hrs, 2),
        "totalActualHours": round(task_act_hrs, 2),
        "jobsBlockedByTasksCount": len(blocked_job_ids)
    }

    return {
        "jobs": formatted_rows,
        "count": len(formatted_rows),
        "stats": {
            "activeJobs": active_count,
            "dueSoon": due_soon_count,
            "overdue": overdue_count,
            "designHandoverPending": handover_pending_count
        },
        "taskSummary": task_summary,
        "tabCounts": tab_counts,
        "isLead": is_mkt_lead,
        "recentActivity": activities
    }


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
        existing = (await db.execute(dup_stmt)).scalars().first()
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
        c_res = await db.execute(select(Client).where(func.lower(Client.name) == client_name.strip().lower()))
        c_match = c_res.scalars().first()
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
        visible_to_departments=list(set(
            ["marketing", str(body.get("targetDepartment", "marketing") or "marketing").lower().strip()]
            + [d.lower().strip() for d in (user.departments or []) if d and str(d).strip()]
            + [str(d).lower().strip() for d in (body.get("visibleToDepartments") or []) if d and str(d).strip()]
        )),
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
    await db.flush()

    # Create and link DepartmentTask if myTask payload is present
    my_task = body.get("myTask") or (body.get("fields") or {}).get("myTask")
    if my_task and isinstance(my_task, dict):
        try:
            est_hours = float(my_task.get("estimatedEffortHours") or 0.0)
        except Exception:
            est_hours = 0.0

        s_date_str = str(my_task.get("taskStartDate") or "").strip()[:10]
        t_date_str = str(my_task.get("taskTargetCompletionDate") or "").strip()[:10]

        from datetime import datetime, date
        s_date = None
        t_date = None
        if s_date_str:
            try:
                s_date = datetime.strptime(s_date_str, "%Y-%m-%d").date()
            except Exception:
                pass
        if t_date_str:
            try:
                t_date = datetime.strptime(t_date_str, "%Y-%m-%d").date()
            except Exception:
                pass

        if not s_date:
            s_date = date.today()
        if not t_date:
            t_date = s_date

        u_dept = (user.departments[0] if user.departments else "marketing").lower()
        dept_task = DepartmentTask(
            job_id=new_job.id,
            department=u_dept,
            task_name=f"{u_dept.title()} Engineering Task",
            description=f"Department task for Job #{new_job.job_no}",
            assigned_user_id=user.id,
            assigned_user_name=user.name or user.username,
            created_by_user_id=user.id,
            created_by_name=user.name or user.username,
            start_date=s_date,
            target_date=t_date,
            estimated_effort_hours=est_hours,
            actual_effort_hours=0.0,
            progress_percentage=0,
            status="In Progress"
        )
        db.add(dept_task)

        # 1. Audit Activity: JOB_CREATED
        job_act = DepartmentActivity(
            job_id=new_job.id,
            department=u_dept,
            action="JOB_CREATED",
            new_value={
                "job_no": new_job.job_no,
                "panel_name": new_job.panel_name,
                "client_name": new_job.client_name,
                "responsible_engineer": new_job.responsible_engineer,
                "created_by": user.username
            },
            updated_by=user.username
        )
        db.add(job_act)

        # 2. Audit Activity: TASK_CREATED
        act = DepartmentActivity(
            job_id=new_job.id,
            department=u_dept,
            action="TASK_CREATED",
            new_value={
                "task_name": dept_task.task_name,
                "estimated_effort_hours": est_hours,
                "start_date": str(s_date),
                "target_date": str(t_date),
                "assigned_user": user.name or user.username
            },
            updated_by=user.username
        )
        db.add(act)

        # Store task summary in job.fields["myTask"]
        curr_fields: dict[str, Any] = dict(getattr(new_job, "fields", None) or {})
        curr_fields["myTask"] = {
            "estimatedEffortHours": est_hours,
            "taskStartDate": str(s_date),
            "taskTargetCompletionDate": str(t_date)
        }
        setattr(new_job, "fields", curr_fields)
        flag_modified(new_job, "fields")

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

def check_user_job_access(job: Job, user: UserPayload) -> bool:
    user_role = (user.role or "").lower()
    if user_role in ["admin", "executive"] or is_keval(user):
        return True
    if user_role in ["mktadmin", "marketing_lead"]:
        return True

    user_name_lower = (user.name or user.username or "").strip().lower()
    user_depts = [d.lower() for d in (user.departments or [])]

    # Direct assignments
    if (job.responsible_engg_name or "").strip().lower() == user_name_lower:
        return True
    if job.assigned_engineer_id == user.id or job.planning_owner_id == user.id or job.current_worker_id == user.id:
        return True
    if (job.createdBy or "").strip().lower() == (user.username or "").strip().lower():
        return True

    # Department scopes
    vis_depts = [d.lower() for d in (job.visible_to_departments or visible_departments_for_job(job))]
    tgt_dept = (job.target_department or "").lower()

    for dept in user_depts:
        if dept in vis_depts or dept == tgt_dept:
            return True
        if job.fields and job.fields.get(dept):
            return True

    return False

# GET /api/jobs/{id}
@router.get("/{id}")
async def get_job(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = select(Job).where(or_(Job.external_id == id, Job.id == id)).order_by(Job.external_id == id)
    res = await db.execute(stmt)
    job = res.scalars().first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not check_user_job_access(job, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view this job record."
        )

    return format_job_row(job)

# PATCH /api/jobs/{id}/select
@router.patch("/{id}/select")
async def patch_select_job(
    id: int,
    req: SingleSelectRequest,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = select(Job).where(or_(Job.external_id == id, Job.id == id))
    res = await db.execute(stmt)
    job = res.scalars().first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    setattr(job, "selected", req.selected)
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
    stmt = select(Job).where(or_(Job.external_id == id, Job.id == id))
    res = await db.execute(stmt)
    job = res.scalars().first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    def normalize_dept(d: str) -> str:
        s = (d or "").lower()
        if "market" in s: return "marketing"
        if "mech" in s: return "mechanical"
        if "elect" in s or "design" in s: return "design"
        if "purch" in s or "proc" in s: return "purchase"
        if "prod" in s or "qc" in s or "disp" in s: return "production"
        return s

    raw_dept = "marketing" if req.department == "marketing-lock" else req.department
    target_dept = normalize_dept(raw_dept)

    user_dept_keys = {normalize_dept(d) for d in (user.departments or [])}
    is_admin = user.role in ["admin", "executive"] or is_keval(user)

    if (target_dept in ["core", "marketing"]) and not is_admin and "marketing" not in user_dept_keys:
        raise HTTPException(status_code=403, detail="Only admins and marketing can edit core and marketing fields")

    if not is_admin and target_dept not in ["core", "marketing"] and target_dept not in user_dept_keys:
        raise HTTPException(
            status_code=403,
            detail=f"Forbidden: You are not authorized to update fields in the '{target_dept}' department"
        )

    current_fields: dict[str, Any] = dict(getattr(job, "fields", None) or {})
    dept_raw = current_fields.get(raw_dept)
    dept_target = current_fields.get(target_dept)
    dept_source = dept_raw if isinstance(dept_raw, dict) else (dept_target if isinstance(dept_target, dict) else {})
    dept_fields: dict[str, Any] = dict(dept_source)
    dept_fields[req.field] = req.value
    current_fields[raw_dept] = dept_fields
    if raw_dept != target_dept:
        current_fields[target_dept] = dept_fields
    setattr(job, "fields", current_fields)
    flag_modified(job, "fields")

    # If updating core fields, sync directly to PostgreSQL columns in jobs table
    if target_dept in ["core", "marketing"]:
        f_key = req.field.lower().replace(" ", "").replace(".", "").replace("_", "")
        val_str = str(req.value or "").strip()
        field_attr_map = {
            "jobno": "job_no",
            "nameofpanel": "panel_name",
            "panelname": "panel_name",
            "projectname": "project_name",
            "clientname": "client_name",
            "customername": "client_name",
            "responsibleenggname": "responsible_engg_name",
            "responsibleengineer": "responsible_engg_name",
            "responsibleengg": "responsible_engg_name",
            "typeofindustries": "type_of_industries",
            "typeofpanel": "type_of_panel",
            "incomerrating": "incomer_rating",
            "qty": "qty",
            "pono": "po_no",
            "purchaseorder": "po_no",
            "podate": "po_date",
            "purchaseorderdate": "po_date",
            "deliveryperiod": "delivery_period",
            "deliveryperiodasperpo": "delivery_period",
            "deliverydate": "delivery_date",
            "deliverydateasperpo": "delivery_date",
            "datagiventodesign": "data_given_to_design",
            "datagiventodesigndept": "data_given_to_design",
            "deliveryaddress": "delivery_address",
            "contactperson": "contact_person",
            "contactpersonphno": "contact_person",
        }
        target_attr = field_attr_map.get(f_key)
        if target_attr:
            final_val = (val_str or "1") if target_attr == "qty" else val_str
            setattr(job, target_attr, final_val)

    await db.commit()
    await db.refresh(job)
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

    stmt = select(Job).where(or_(Job.external_id == id, Job.id == id))
    res = await db.execute(stmt)
    job = res.scalars().first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    current_status: dict[str, Any] = dict(getattr(job, "department_status", None) or {})
    current_status[req.department] = req.status
    setattr(job, "department_status", current_status)
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

    stmt = delete(Job).where(or_(Job.external_id == id, Job.id == id))
    res = await db.execute(stmt)
    await db.commit()
    return {"ok": True}
