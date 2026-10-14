from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_, and_
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from app.db.session import get_db
from app.api.deps import require_admin
from app.schemas import UserPayload
from app.models import (
    Job, User, Account, DepartmentActivity,
    JobDelayRecord, JobAssignmentHistory, JobTargetDateRevision
)
from app.api.v1.job_handover import resolve_job_stage

router = APIRouter(prefix="/admin/dashboard", tags=["Admin Oversight & User Accountability"])

DELAY_REASON_CATEGORIES = [
    "Pending information from customer",
    "Pending input from another department",
    "Technical clarification required",
    "Design work pending",
    "Material or procurement delay",
    "Resource or workload constraint",
    "Approval pending",
    "Job assignment or ownership issue",
    "Scope or specification change",
    "Incorrect or incomplete information",
    "Unexpected technical issue",
    "Other — explanation required"
]

REASSIGNMENT_CATEGORIES = [
    "Workload Rebalance",
    "Specialized Expertise Required",
    "Engineer On Leave / Unavailable",
    "Priority Elevation / Escalation",
    "Project Scope or Revision Change",
    "Cross-Department Transfer",
    "Performance or Delay Correction",
    "Customer / Management Directive",
    "Shift / Schedule Handover",
    "Other Administrative Adjustment"
]

# Helper to check if job is delayed
def is_job_delayed(j: Job, now: datetime) -> tuple[bool, int]:
    stage = resolve_job_stage(j)
    if stage == "RELEASED":
        return False, 0
    
    # 1. Stage Due Date Exceeded
    stage_due = getattr(j, "stage_due_date", None)
    if stage_due and now > stage_due:
        days = max(1, (now - stage_due).days)
        return True, days

    # 2. Delivery Date / Target Date Exceeded
    delivery_str = (getattr(j, "delivery_date", "") or getattr(j, "deliveryDate", "") or "").strip()
    if delivery_str:
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
            try:
                dt = datetime.strptime(delivery_str, fmt).replace(tzinfo=timezone.utc)
                if now > dt:
                    return True, max(1, (now - dt).days)
            except Exception:
                pass

    return False, 0


# 1. GET /api/admin/dashboard/kpis
@router.get("/kpis")
async def get_admin_kpis(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)

    # Fetch all jobs
    jobs_res = await db.execute(select(Job))
    jobs = jobs_res.scalars().all()

    # Fetch assignment histories
    hist_res = await db.execute(select(JobAssignmentHistory))
    histories = hist_res.scalars().all()

    # Reassignments count per job
    reassign_counts: Dict[Any, int] = {}
    for h in histories:
        jid = getattr(h, "job_id", None)
        if jid is not None:
            reassign_counts[jid] = reassign_counts.get(jid, 0) + 1

    # Fetch delay records
    delay_res = await db.execute(select(JobDelayRecord))
    delay_records = delay_res.scalars().all()
    delay_map: Dict[Any, JobDelayRecord] = {getattr(d, "job_id", None): d for d in delay_records}

    # Fetch date revision counts
    rev_res = await db.execute(select(JobTargetDateRevision))
    revisions = rev_res.scalars().all()
    revised_job_ids = {getattr(r, "job_id", None) for r in revisions if getattr(r, "job_id", None) is not None}

    total_jobs = len(jobs)
    new_jobs_received = 0
    awaiting_verification = 0
    planning_ready = 0
    awaiting_planning_owner = 0
    planning_in_progress = 0
    awaiting_clarification = 0
    overdue_jobs = 0
    completed_jobs = 0
    released_jobs = 0

    jobs_delayed = 0
    jobs_without_delay_reason = 0
    jobs_with_delay_reason = 0
    jobs_awaiting_action_beyond_target = 0
    jobs_with_missed_target_dates = 0

    # 12 Spec KPI counters
    total_active = 0
    on_time_jobs = 0
    at_risk_jobs = 0
    completed_late = 0
    completed_on_time = 0
    completed_early = 0

    for j in jobs:
        st = resolve_job_stage(j)
        c_at = getattr(j, "created_at", None)
        if c_at and c_at >= seven_days_ago:
            new_jobs_received += 1

        is_completed = (st == "RELEASED" or (getattr(j, "lifecycle_status", "") or "").lower() == "completed" or getattr(j, "actual_end_at", None) is not None)

        if is_completed:
            completed_jobs += 1
            released_jobs += 1
            
            # Completion variance vs original planned
            p_end = getattr(j, "planned_end_at", None)
            a_end = getattr(j, "actual_end_at", None) or getattr(j, "updated_at", None) or now
            if p_end:
                if a_end > p_end:
                    completed_late += 1
                elif (p_end - a_end).total_seconds() >= 86400:
                    completed_early += 1
                else:
                    completed_on_time += 1
            else:
                completed_on_time += 1
        else:
            total_active += 1

            if st == "VERIFICATION":
                awaiting_verification += 1
            elif st == "PLANNING_READY":
                planning_ready += 1
                if not j.planning_owner_id and not j.planning_owner_name:
                    awaiting_planning_owner += 1
            elif st == "PLANNING_ASSIGNED":
                if not j.planning_owner_id and not j.planning_owner_name:
                    awaiting_planning_owner += 1
            elif st == "PLANNING_ACTIVE":
                planning_in_progress += 1
            elif st == "NEEDS_CLARIFICATION":
                awaiting_clarification += 1

            # Check delay status
            delayed, days = is_job_delayed(j, now)
            if delayed:
                jobs_delayed += 1
                overdue_jobs += 1
                d_rec = delay_map.get(getattr(j, "id", None))
                if not d_rec or d_rec.explanation_status == "REASON_PENDING" or not d_rec.detailed_explanation:
                    jobs_without_delay_reason += 1
                else:
                    jobs_with_delay_reason += 1
            else:
                # Check At-Risk window (within 48h of target)
                target_dt = getattr(j, "stage_due_date", None) or getattr(j, "planned_end_at", None)
                if target_dt and (target_dt - now).total_seconds() <= 172800:
                    at_risk_jobs += 1
                else:
                    on_time_jobs += 1

            # Stage SLA check
            due_date = getattr(j, "stage_due_date", None)
            if due_date and now > due_date:
                jobs_awaiting_action_beyond_target += 1

            # Missed target date check
            delivery_str = (getattr(j, "delivery_date", "") or "").strip()
            if delivery_str:
                for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
                    try:
                        dt = datetime.strptime(delivery_str, fmt).replace(tzinfo=timezone.utc)
                        if now > dt:
                            jobs_with_missed_target_dates += 1
                            break
                    except Exception:
                        pass

    # Reassigned jobs
    jobs_reassigned = len([jid for jid, cnt in reassign_counts.items() if cnt >= 1])
    jobs_reassigned_multiple = len([jid for jid, cnt in reassign_counts.items() if cnt >= 2])
    if jobs_reassigned == 0:
        for j in jobs:
            if getattr(j, "assignment_explanation", None):
                jobs_reassigned += 1

    jobs_with_revised_date = len(revised_job_ids)

    return {
        # Original keys
        "totalJobs": total_jobs,
        "newJobsReceived": new_jobs_received,
        "awaitingVerification": awaiting_verification,
        "planningReady": planning_ready,
        "awaitingPlanningOwner": awaiting_planning_owner,
        "planningInProgress": planning_in_progress,
        "awaitingClarification": awaiting_clarification,
        "overdueJobs": overdue_jobs,
        "completedJobs": completed_jobs,
        "releasedJobs": released_jobs,
        "jobsDelayed": jobs_delayed,
        "jobsWithoutDelayReason": jobs_without_delay_reason,
        "jobsWithDelayReason": jobs_with_delay_reason,
        "jobsReassigned": jobs_reassigned,
        "jobsReassignedMultipleTimes": jobs_reassigned_multiple,
        "jobsAwaitingActionBeyondTarget": jobs_awaiting_action_beyond_target,
        "jobsWithMissedTargetDates": jobs_with_missed_target_dates,
        
        # 12 Command Center Specific KPI Keys
        "totalActiveJobs": total_active,
        "onTimeJobs": on_time_jobs,
        "atRiskJobs": at_risk_jobs,
        "jobsWithRevisedExpectedDate": jobs_with_revised_date,
        "completedLate": completed_late,
        "completedOnTime": completed_on_time,
        "completedEarly": completed_early
    }


# 1B. GET /api/admin/dashboard/accountability-monitor
@router.get("/accountability-monitor")
async def get_accountability_monitor(
    search: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    customer: Optional[str] = Query(None),
    worker_id: Optional[int] = Query(None),
    planning_owner_id: Optional[int] = Query(None),
    job_status: Optional[str] = Query(None),
    delay_status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    now = datetime.now(timezone.utc)

    # Fetch users mapping
    u_res = await db.execute(select(User))
    users_map = {u.id: u for u in u_res.scalars().all()}

    # Fetch delay records
    delay_res = await db.execute(select(JobDelayRecord))
    delay_map = {d.job_id: d for d in delay_res.scalars().all()}

    # Fetch assignment histories
    hist_res = await db.execute(select(JobAssignmentHistory).order_by(JobAssignmentHistory.created_at.asc()))
    hist_by_job: Dict[int, List[JobAssignmentHistory]] = {}
    for h in hist_res.scalars().all():
        hist_by_job.setdefault(h.job_id, []).append(h)

    # Fetch target revisions
    rev_res = await db.execute(select(JobTargetDateRevision).order_by(JobTargetDateRevision.created_at.asc()))
    rev_by_job: Dict[int, List[JobTargetDateRevision]] = {}
    for r in rev_res.scalars().all():
        rev_by_job.setdefault(r.job_id, []).append(r)

    # Fetch all jobs
    jobs_res = await db.execute(select(Job).order_by(Job.id.desc()))
    all_jobs = jobs_res.scalars().all()

    items = []
    for j in all_jobs:
        stage = resolve_job_stage(j)
        delayed, days_late = is_job_delayed(j, now)
        is_completed = (stage == "RELEASED" or (j.lifecycle_status or "").lower() == "completed" or j.actual_end_at is not None)

        # Classify status
        if is_completed:
            status_badge = "COMPLETED"
        elif delayed:
            status_badge = "OVERDUE"
        else:
            tgt = j.stage_due_date or j.planned_end_at
            if tgt and (tgt - now).total_seconds() <= 172800:
                status_badge = "AT_RISK"
            else:
                status_badge = "ON_TIME"

        # Days variance calculation
        p_end = j.planned_end_at
        cur_expected = j.stage_due_date or p_end
        if is_completed:
            actual_end = j.actual_end_at or j.updated_at or now
            if p_end:
                variance_days = int((actual_end - p_end).total_seconds() // 86400)
            else:
                variance_days = 0
        else:
            if delayed:
                variance_days = days_late
            elif cur_expected:
                variance_days = -max(0, int((cur_expected - now).total_seconds() // 86400))
            else:
                variance_days = 0

        # Delay info
        d_rec = delay_map.get(j.id)
        late_reason = d_rec.reason_category if (d_rec and d_rec.reason_category) else (j.assignment_reason_category or ("Reason Pending" if delayed else "—"))
        reason_reporter = d_rec.explanation_provider_name if (d_rec and d_rec.explanation_provider_name) else ("—" if not delayed else "Pending")
        reason_date = d_rec.explanation_recorded_at if d_rec else None

        # Worker info
        worker_user = users_map.get(j.current_worker_id)
        worker_name = worker_user.name if worker_user else (j.planning_owner_name or j.responsible_engg_name or "Unassigned")
        worker_dept = worker_user.departments[0] if (worker_user and worker_user.departments) else (j.target_department or "Planning")
        worker_role = "Responsible Engineer" if j.responsible_engg_name else "Assignee"

        # Time with current owner
        owner_assigned_at = j.stage_started_at or j.created_at or now
        time_with_owner_hours = max(0, int((now - owner_assigned_at).total_seconds() // 3600))

        # Revisions & Reassignments
        job_revisions = rev_by_job.get(j.id, [])
        job_history = hist_by_job.get(j.id, [])

        # Filter criteria
        if search:
            q = search.lower()
            if not (
                q in (j.job_no or "").lower() or
                q in (j.client_name or "").lower() or
                q in (j.project_name or "").lower() or
                q in (j.panel_name or "").lower() or
                q in worker_name.lower() or
                q in (j.planning_owner_name or "").lower()
            ):
                continue

        if department and department.lower() != "all":
            if (j.target_department or "").lower() != department.lower() and worker_dept.lower() != department.lower():
                continue

        if customer and customer.lower() != "all":
            if (j.client_name or "").lower() != customer.lower():
                continue

        if worker_id and j.current_worker_id != worker_id:
            continue

        if planning_owner_id and j.planning_owner_id != planning_owner_id:
            continue

        if priority and priority.lower() != "all":
            if (j.priority or "Normal").lower() != priority.lower():
                continue

        if delay_status and delay_status.lower() != "all":
            if delay_status.upper() != status_badge:
                continue

        if job_status and job_status.lower() != "all":
            cur_st = (j.lifecycle_status or "Draft").lower()
            if job_status.lower() == "completed" and not is_completed:
                continue
            if job_status.lower() == "active" and is_completed:
                continue

        items.append({
            "id": j.id,
            "externalId": j.external_id,
            "jobNo": j.job_no,
            "clientName": j.client_name or "Unassigned Client",
            "projectName": j.project_name or "—",
            "panelName": j.panel_name or "—",
            "currentStage": stage,
            "department": j.target_department or worker_dept,
            "priority": j.priority or "Normal",
            
            # Working By Block
            "workingBy": {
                "name": worker_name,
                "role": worker_role,
                "department": worker_dept,
                "assignedAt": owner_assigned_at.isoformat() if owner_assigned_at else None,
                "timeWithOwnerHours": time_with_owner_hours
            },
            
            # Planning & Ownership
            "planningOwnerName": j.planning_owner_name or "Unassigned",
            "assignedBy": j.createdBy or "System",
            "assignedDate": j.created_at.isoformat() if j.created_at else None,
            
            # Dates & Commitments
            "expectedStart": j.planned_start_at.isoformat() if j.planned_start_at else None,
            "originalExpectedDate": j.planned_end_at.isoformat() if j.planned_end_at else None,
            "currentExpectedDate": cur_expected.isoformat() if cur_expected else None,
            "actualCompletionDate": j.actual_end_at.isoformat() if j.actual_end_at else None,
            
            # Status & Variance
            "todayStatus": status_badge,
            "daysVariance": variance_days,
            "completionVariance": f"{variance_days:+d}d" if is_completed else ("—"),
            
            # Delay Reason Details
            "lateReason": late_reason,
            "detailedExplanation": d_rec.detailed_explanation if d_rec else (j.assignment_explanation or ""),
            "reasonReportedBy": reason_reporter,
            "reasonDate": reason_date.isoformat() if reason_date else None,
            "correctiveAction": d_rec.corrective_action_required if d_rec else "",
            "adminReviewStatus": d_rec.admin_review_status if d_rec else "UNREVIEWED",
            
            # Revision and reassignment counts
            "reassignmentsCount": len(job_history),
            "revisionsCount": len(job_revisions),
            "lastActivity": j.updated_at.isoformat() if j.updated_at else j.created_at.isoformat()
        })

    return {
        "items": items,
        "total": len(items)
    }


# 1C. GET /api/admin/dashboard/live-working-metrics
@router.get("/live-working-metrics")
async def get_live_working_metrics(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    now = datetime.now(timezone.utc)
    res = await db.execute(select(Job).where(Job.lifecycle_status.in_(["Running", "In Progress", "Paused"])))
    running_jobs = res.scalars().all()

    u_res = await db.execute(select(User))
    users_map = {u.id: u.name for u in u_res.scalars().all()}

    output = []
    for j in running_jobs:
        actual_start = j.actual_start_at or j.stage_started_at
        total_paused = j.total_paused_seconds or 0
        if actual_start:
            elapsed_raw = max(0, int((now - actual_start).total_seconds()))
            active_sec = max(0, elapsed_raw - total_paused)
        else:
            active_sec = 0

        est_sec = j.estimated_duration_seconds or 28800 # default 8 hours
        active_hours = round(active_sec / 3600, 2)
        expected_hours = round(est_sec / 3600, 2)
        variance_hours = round(active_hours - expected_hours, 2)

        worker_name = users_map.get(j.current_worker_id) or j.planning_owner_name or j.responsible_engg_name or "Assigned Lead"

        output.append({
            "jobId": j.id,
            "jobNo": j.job_no,
            "clientName": j.client_name or "Client",
            "workerName": worker_name,
            "department": j.target_department or "Planning",
            "activeHours": active_hours,
            "expectedHours": expected_hours,
            "varianceHours": variance_hours,
            "isOverBudget": active_hours > expected_hours,
            "status": j.lifecycle_status
        })

    return output


# 2. GET /api/admin/dashboard/customer-work
@router.get("/customer-work")
async def get_customer_workload(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    now = datetime.now(timezone.utc)
    jobs_res = await db.execute(select(Job).order_by(Job.client_name.asc()))
    jobs = jobs_res.scalars().all()

    cust_groups: Dict[str, Dict[str, Any]] = {}

    for j in jobs:
        c_name = (j.client_name or "Unassigned Client").strip()
        if c_name not in cust_groups:
            cust_groups[c_name] = {
                "customerName": c_name,
                "totalJobs": 0,
                "liveWorkingJobs": 0,
                "completedJobs": 0,
                "delayedJobs": 0,
                "projects": set(),
                "oldestJobNo": None,
                "oldestDays": 0
            }

        grp = cust_groups[c_name]
        grp["totalJobs"] += 1

        p_name = (j.project_name or "").strip()
        if p_name:
            grp["projects"].add(p_name)

        st = resolve_job_stage(j)
        if st in ["RELEASED"]:
            grp["completedJobs"] += 1
        else:
            grp["liveWorkingJobs"] += 1

        delayed, days = is_job_delayed(j, now)
        if delayed:
            grp["delayedJobs"] += 1

        # Check age of active job
        c_at = getattr(j, "created_at", None)
        if c_at and st != "RELEASED":
            age_days = (now - c_at).days
            if age_days > grp["oldestDays"]:
                grp["oldestDays"] = age_days
                grp["oldestJobNo"] = f"Job #{j.job_no} ({age_days}d active)"

    results = []
    for grp in cust_groups.values():
        total = grp["totalJobs"]
        done = grp["completedJobs"]
        pct = round((done / total * 100), 1) if total > 0 else 0.0
        results.append({
            "customerName": grp["customerName"],
            "totalJobs": total,
            "liveWorkingJobs": grp["liveWorkingJobs"],
            "completedJobs": done,
            "delayedJobs": grp["delayedJobs"],
            "completionPercentage": pct,
            "activeProjects": list(grp["projects"])[:4],
            "oldestLiveJob": grp["oldestJobNo"] or "No live backlog"
        })

    # Sort descending by live working jobs, then total
    results.sort(key=lambda x: (x["liveWorkingJobs"], x["totalJobs"]), reverse=True)
    return results


# 3. GET /api/admin/dashboard/delay-investigation
@router.get("/delay-investigation")
async def get_delay_investigation(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    now = datetime.now(timezone.utc)
    jobs_res = await db.execute(select(Job))
    jobs = jobs_res.scalars().all()

    delay_res = await db.execute(select(JobDelayRecord))
    delay_records = delay_res.scalars().all()
    delay_map: Dict[Any, JobDelayRecord] = {getattr(d, "job_id", None): d for d in delay_records}

    delayed_list = []
    category_counts: Dict[str, int] = {c: 0 for c in DELAY_REASON_CATEGORIES}
    dept_counts: Dict[Any, int] = {}
    stage_counts: Dict[Any, int] = {}
    client_counts: Dict[Any, int] = {}

    for j in jobs:
        delayed, days = is_job_delayed(j, now)
        if not delayed:
            continue

        d_rec = delay_map.get(getattr(j, "id", None))
        reason_cat = str(d_rec.reason_category) if d_rec and d_rec.reason_category else "Reason Pending"
        explanation = d_rec.detailed_explanation if d_rec else (getattr(j, "current_waiting_reason", None) or "")
        explanation_status = d_rec.explanation_status if d_rec else ("SUBMITTED" if explanation else "REASON_PENDING")
        admin_review = d_rec.admin_review_status if d_rec else "UNREVIEWED"
        admin_notes = d_rec.admin_review_notes if d_rec else ""

        stage = resolve_job_stage(j)
        dept = str(getattr(j, "target_department", "") or "planning")
        client = str(getattr(j, "client_name", "") or "Unassigned")

        delayed_list.append({
            "jobId": j.id,
            "externalId": j.external_id,
            "jobNo": j.job_no,
            "panelName": j.panel_name,
            "clientName": client,
            "projectName": j.project_name or "",
            "responsibleEnggName": j.responsible_engg_name or "Unassigned",
            "planningOwnerName": j.planning_owner_name or "Unassigned",
            "stage": stage,
            "currentDepartment": dept,
            "daysOverdue": days,
            "reasonCategory": reason_cat,
            "detailedExplanation": explanation,
            "explanationStatus": explanation_status,
            "correctiveAction": d_rec.corrective_action_required if d_rec else "",
            "adminReviewStatus": admin_review,
            "adminReviewNotes": admin_notes,
            "targetDueDate": getattr(j, "stage_due_date", None)
        })

        # Aggregations
        if reason_cat in category_counts:
            category_counts[reason_cat] += 1
        dept_counts[dept] = dept_counts.get(dept, 0) + 1
        stage_counts[stage] = stage_counts.get(stage, 0) + 1
        client_counts[client] = client_counts.get(client, 0) + 1

    delayed_list.sort(key=lambda x: x["daysOverdue"], reverse=True)

    return {
        "delayedJobs": delayed_list,
        "totalDelayed": len(delayed_list),
        "categoryBreakdown": [{"category": k, "count": v} for k, v in category_counts.items() if v > 0],
        "departmentBreakdown": [{"department": k, "count": v} for k, v in dept_counts.items()],
        "stageBreakdown": [{"stage": k, "count": v} for k, v in stage_counts.items()],
        "clientBreakdown": [{"client": k, "count": v} for k, v in client_counts.items()]
    }


# 4. GET /api/admin/dashboard/assignment-changes
@router.get("/assignment-changes")
async def get_assignment_changes(
    search: Optional[str] = Query(None),
    multipleOnly: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stmt = select(JobAssignmentHistory).order_by(desc(JobAssignmentHistory.created_at))
    res = await db.execute(stmt)
    records = res.scalars().all()

    # Load associated jobs
    job_ids = [getattr(r, "job_id", None) for r in records if getattr(r, "job_id", None) is not None]
    job_map: Dict[Any, Job] = {}
    if job_ids:
        j_res = await db.execute(select(Job).where(Job.id.in_(job_ids)))
        for j in j_res.scalars().all():
            job_map[getattr(j, "id", None)] = j

    # Count reassignments per job
    counts_per_job: Dict[Any, int] = {}
    for r in records:
        jid = getattr(r, "job_id", None)
        if jid is not None:
            counts_per_job[jid] = counts_per_job.get(jid, 0) + 1

    output = []
    for r in records:
        jid = getattr(r, "job_id", None)
        j = job_map.get(jid)
        if not j:
            continue
        
        job_total_changes = counts_per_job.get(jid, 1)
        if multipleOnly and job_total_changes < 2:
            continue

        item = {
            "id": r.id,
            "jobId": j.id,
            "externalId": j.external_id,
            "jobNo": j.job_no,
            "panelName": j.panel_name,
            "clientName": j.client_name or "",
            "previousOwner": r.previous_owner_name or "Unassigned",
            "newOwner": r.new_owner_name,
            "assignedBy": r.assigned_by_name,
            "assignedByDepartment": r.assigned_by_department or "Management",
            "reasonCategory": r.reason_category,
            "detailedExplanation": r.detailed_explanation,
            "additionalNote": r.additional_note or "",
            "reassignmentDate": r.created_at,
            "totalJobReassignments": job_total_changes,
            "workflowStage": r.workflow_stage or resolve_job_stage(j)
        }

        if search:
            q = search.lower()
            match = (
                q in (j.job_no or "").lower()
                or q in (j.client_name or "").lower()
                or q in (r.previous_owner_name or "").lower()
                or q in (r.new_owner_name or "").lower()
                or q in (r.reason_category or "").lower()
            )
            if not match:
                continue

        output.append(item)

    # Fallback to existing job columns if history is fresh
    if not output:
        j_all_res = await db.execute(select(Job).where(Job.assignment_explanation.isnot(None)))
        for j in j_all_res.scalars().all():
            output.append({
                "id": j.id,
                "jobId": j.id,
                "externalId": j.external_id,
                "jobNo": j.job_no,
                "panelName": j.panel_name,
                "clientName": j.client_name or "",
                "previousOwner": "Previous Assignee",
                "newOwner": j.planning_owner_name or "Assigned Lead",
                "assignedBy": "Planning Manager",
                "assignedByDepartment": "Planning",
                "reasonCategory": j.assignment_reason_category or "Reassignment",
                "detailedExplanation": j.assignment_explanation or "Owner reassigned for workload optimization",
                "additionalNote": "",
                "reassignmentDate": getattr(j, "stage_started_at", datetime.now(timezone.utc)),
                "totalJobReassignments": 1,
                "workflowStage": resolve_job_stage(j)
            })

    return output


# 5. GET /api/admin/dashboard/user-accountability
@router.get("/user-accountability")
async def get_user_accountability(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    now = datetime.now(timezone.utc)
    
    # 1. Fetch Users and Accounts
    users_res = await db.execute(select(User).where(User.is_active.isnot(False)).order_by(User.name.asc()))
    users = users_res.scalars().all()

    accounts_res = await db.execute(select(Account).order_by(Account.username.asc()))
    accounts = accounts_res.scalars().all()

    # 2. Fetch Jobs
    jobs_res = await db.execute(select(Job))
    jobs = jobs_res.scalars().all()

    # 3. Fetch Reassignments
    hist_res = await db.execute(select(JobAssignmentHistory))
    histories = hist_res.scalars().all()

    # 4. Fetch Delay Records
    delay_res = await db.execute(select(JobDelayRecord))
    delay_records = delay_res.scalars().all()
    delay_map: Dict[Any, JobDelayRecord] = {getattr(d, "job_id", None): d for d in delay_records}

    # Build user list
    seen_names = set()
    user_roster = []

    for u in users:
        n = (u.name or u.username or "").strip()
        if not n or n.lower() in seen_names:
            continue
        seen_names.add(n.lower())
        user_roster.append({
            "id": u.id,
            "name": n,
            "department": (u.departments[0] if u.departments else "Engineering").title()
        })

    for a in accounts:
        n = (a.username or "").strip()
        if not n or n.lower() in seen_names:
            continue
        seen_names.add(n.lower())
        user_roster.append({
            "id": a.id,
            "name": n,
            "department": (a.departments[0] if a.departments else a.role or "Operations").title()
        })

    matrix = []
    for u in user_roster:
        u_name_lower = u["name"].lower()
        active_jobs = 0
        waiting_jobs = 0
        completed_jobs = 0
        overdue_jobs = 0
        pending_delays = 0
        oldest_pending = None
        oldest_age = 0

        for j in jobs:
            p_owner = (j.planning_owner_name or "").lower()
            r_engg = (j.responsible_engg_name or "").lower()

            is_user_job = (p_owner == u_name_lower) or (r_engg == u_name_lower)
            if not is_user_job:
                continue

            stage = resolve_job_stage(j)
            if stage == "RELEASED":
                completed_jobs += 1
            elif stage in ["PLANNING_ACTIVE", "PLANNING_ASSIGNED"]:
                active_jobs += 1
            else:
                waiting_jobs += 1

            delayed, days = is_job_delayed(j, now)
            if delayed:
                overdue_jobs += 1
                d_rec = delay_map.get(getattr(j, "id", None))
                if not d_rec or d_rec.explanation_status == "REASON_PENDING":
                    pending_delays += 1

            # Oldest job
            c_at = getattr(j, "created_at", None)
            if c_at and stage != "RELEASED":
                age = (now - c_at).days
                if age > oldest_age:
                    oldest_age = age
                    oldest_pending = f"Job #{j.job_no} ({age}d)"

        # Reassignments calculation
        reassigned_from = 0
        reassigned_to = 0
        for h in histories:
            if (h.previous_owner_name or "").lower() == u_name_lower:
                reassigned_from += 1
            if (h.new_owner_name or "").lower() == u_name_lower:
                reassigned_to += 1

        matrix.append({
            "userName": u["name"],
            "department": u["department"],
            "activeJobs": active_jobs,
            "waitingJobs": waiting_jobs,
            "completedJobs": completed_jobs,
            "overdueJobs": overdue_jobs,
            "pendingDelayExplanations": pending_delays,
            "reassignedFromCount": reassigned_from,
            "reassignedToCount": reassigned_to,
            "totalReassignmentEvents": reassigned_from + reassigned_to,
            "oldestPendingJob": oldest_pending or "No active backlog",
            "correctiveActionsPending": 1 if overdue_jobs > 2 else 0
        })

    # Sort by overdue desc, then active
    matrix.sort(key=lambda x: (x["overdueJobs"], x["activeJobs"]), reverse=True)
    return matrix


# 6. POST /api/admin/jobs/{id}/delay-review
@router.post("/jobs/{id}/delay-review")
async def review_job_delay(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stmt = select(Job).where(or_(Job.external_id == id, Job.id == id))
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        body = await request.json()
    except Exception:
        body = {}

    action = body.get("action", "REVIEW").upper() # 'REVIEW', 'RESOLVE', 'REQUEST_EXPLANATION'
    admin_notes = (body.get("adminReviewNotes") or body.get("notes") or "").strip()
    corrective_action = (body.get("correctiveActionRequired") or "").strip()
    reason_category = body.get("reasonCategory")

    # Fetch or create delay record
    d_res = await db.execute(select(JobDelayRecord).where(JobDelayRecord.job_id == job.id))
    d_rec = d_res.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if not d_rec:
        d_rec = JobDelayRecord(
            job_id=job.id,
            external_job_id=job.external_id,
            workflow_stage_at_delay=resolve_job_stage(job),
            current_department=job.target_department or "planning"
        )
        db.add(d_rec)

    if reason_category:
        d_rec.reason_category = reason_category
    if corrective_action:
        d_rec.corrective_action_required = corrective_action
    
    d_rec.admin_review_notes = admin_notes
    d_rec.admin_reviewer_id = user.id
    d_rec.admin_reviewer_name = user.name or user.username
    d_rec.reviewed_at = now
    d_rec.admin_review_status = "RESOLVED" if action == "RESOLVE" else "ACTION_REQUIRED" if corrective_action else "UNDER_REVIEW"

    # Log in DepartmentActivity
    activity = DepartmentActivity(
        job_id=job.external_id,
        department="management",
        action="DELAY_ADMIN_REVIEWED",
        old_value={"review_status": "UNREVIEWED"},
        new_value={
            "action": action,
            "notes": admin_notes,
            "corrective_action": corrective_action,
            "reviewed_by": user.name or user.username
        },
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(d_rec)

    return {
        "success": True,
        "message": f"Delay review recorded for Job #{job.job_no}",
        "adminReviewStatus": d_rec.admin_review_status
    }


# 7. POST /api/admin/jobs/{id}/approve-deadline-revision
@router.post("/jobs/{id}/approve-deadline-revision")
async def approve_deadline_revision(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(require_admin)
):
    stmt = select(Job).where(or_(Job.external_id == id, Job.id == id))
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        body = await request.json()
    except Exception:
        body = {}

    new_target_str = body.get("newTargetDate")
    reason_cat = body.get("reasonCategory", "Other — explanation required")
    rationale = (body.get("revisionRationale") or body.get("reason") or "").strip()

    if not new_target_str:
        raise HTTPException(status_code=400, detail="New target date is required")
    if not rationale or len(rationale) < 5:
        raise HTTPException(status_code=400, detail="Revision rationale (at least 5 characters) is mandatory")

    prev_due = getattr(job, "stage_due_date", None) or datetime.now(timezone.utc)
    
    # Parse new target date
    try:
        new_dt = datetime.fromisoformat(new_target_str.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO format (YYYY-MM-DD)")

    # Record in job_target_date_revisions
    revision = JobTargetDateRevision(
        job_id=job.id,
        previous_target_date=prev_due,
        revised_target_date=new_dt,
        reason_category=reason_cat,
        revision_rationale=rationale,
        authorized_by_id=user.id or 0,
        authorized_by_name=user.name or user.username
    )
    db.add(revision)

    # Update job
    job.stage_due_date = new_dt
    
    # Update delay record if exists
    d_res = await db.execute(select(JobDelayRecord).where(JobDelayRecord.job_id == job.id))
    d_rec = d_res.scalar_one_or_none()
    if d_rec:
        d_rec.revised_target_date = new_dt
        d_rec.admin_review_status = "RESOLVED"
        d_rec.detailed_explanation = f"Deadline revised: {rationale}"

    # Log in DepartmentActivity
    activity = DepartmentActivity(
        job_id=job.external_id,
        department="management",
        action="DEADLINE_REVISION_APPROVED",
        old_value={"stage_due_date": str(prev_due)},
        new_value={
            "new_target_date": str(new_dt),
            "reason_category": reason_cat,
            "rationale": rationale,
            "authorized_by": user.name or user.username
        },
        updated_by=user.name or user.username
    )
    db.add(activity)

    await db.commit()
    await db.refresh(job)

    return {
        "success": True,
        "message": f"Target deadline for Job #{job.job_no} successfully revised to {new_dt.strftime('%d-%b-%Y')}",
        "newTargetDate": new_dt.isoformat()
    }
