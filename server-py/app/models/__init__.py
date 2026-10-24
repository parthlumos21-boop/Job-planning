from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Text, Numeric, func, ForeignKey
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from app.db.base import Base

class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    password = Column(String(255), default="password123")
    role = Column(String(50), default="user")
    departments = Column(ARRAY(String), default=[])
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(Integer, unique=True, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(Integer, unique=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    password = Column(String(255), default="password123")
    departments = Column(ARRAY(String), default=[])
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(Integer, unique=True, nullable=False, index=True)
    client_id = Column(Integer, nullable=True)
    client_name = Column(String(255), index=True)
    sr_no = Column(Integer)
    job_no = Column(String(100), nullable=False, index=True)
    panel_name = Column(String(255), default="")
    project_name = Column(String(255), default="", index=True)
    responsible_engg_name = Column(String(255), default="")
    po_no = Column(String(100), default="")
    po_date = Column(String(50), default="")
    delivery_period = Column(String(100), default="")
    delivery_date = Column(String(50), default="")
    data_given_to_design = Column(String(50), default="")
    delivery_address = Column(Text, default="")
    contact_person = Column(String(255), default="")
    type_of_industries = Column(String(255), default="")
    incomer_rating = Column(String(100), default="")
    type_of_panel = Column(String(100), default="")
    qty = Column(String(50), default="1")
    date = Column(String(50), default="")
    ttl = Column(String(100), default="")
    target_department = Column(String(100), default="")
    target_position = Column(String(100), default="")
    createdBy = Column("created_by", String(100), default="")
    visible_to_departments = Column(ARRAY(String), default=[])
    selected = Column(Boolean, default=False)

    # Lifecycle & Time Tracking Columns
    lifecycle_status = Column(String(50), default="Draft", index=True)
    planned_start_at = Column(DateTime(timezone=True), nullable=True)
    planned_end_at = Column(DateTime(timezone=True), nullable=True)
    estimated_duration_seconds = Column(Integer, default=0)
    actual_start_at = Column(DateTime(timezone=True), nullable=True)
    actual_end_at = Column(DateTime(timezone=True), nullable=True)
    total_paused_seconds = Column(Integer, default=0)
    pause_started_at = Column(DateTime(timezone=True), nullable=True)
    pause_reason_category = Column(String(100), nullable=True)
    pause_notes = Column(Text, nullable=True)
    expected_resume_at = Column(DateTime(timezone=True), nullable=True)
    actual_duration_seconds = Column(Integer, default=0)
    progress_percentage = Column(Numeric(5, 2), default=0.00)
    priority = Column(String(20), default="Normal")
    assigned_engineer_id = Column(Integer, nullable=True)
    assigned_by_user_id = Column(Integer, nullable=True)
    target_work_units = Column(Integer, default=100)
    completed_work_units = Column(Integer, default=0)

    # Worker Assignment & Handover
    current_worker_id = Column(Integer, nullable=True, index=True)
    current_worker_position = Column(String(100), nullable=True)
    previous_worker_id = Column(Integer, nullable=True)
    next_worker_id = Column(Integer, nullable=True)
    last_handover_at = Column(DateTime(timezone=True), nullable=True)
    handover_notes = Column(Text, nullable=True)

    # Handover for Planning & Department Workflow
    handover_status = Column(String(50), default="Draft", index=True)
    planning_owner_id = Column(Integer, nullable=True, index=True)
    planning_owner_name = Column(String(255), nullable=True)
    handover_submitted_at = Column(DateTime(timezone=True), nullable=True)
    handover_accepted_at = Column(DateTime(timezone=True), nullable=True)
    handover_return_reason = Column(Text, nullable=True)
    previous_responsible_engg_name = Column(String(255), default="")
    return_reason = Column(String(100), nullable=True)
    return_comment = Column(Text, nullable=True)
    returned_by = Column(String(100), nullable=True)
    returned_at = Column(DateTime(timezone=True), nullable=True)
    reassignment_history = Column(JSONB, default=list)
    handover_checklist = Column(JSONB, default=dict)
    attachments = Column(JSONB, default=list)

    # Control Center Stage & Transition Tracking
    current_stage = Column(String(50), default="INCOMING", index=True)
    current_action = Column(String(255), default="Review Incoming Job")
    current_waiting_reason = Column(Text, nullable=True)
    stage_started_at = Column(DateTime(timezone=True), server_default=func.now())
    stage_due_date = Column(DateTime(timezone=True), nullable=True)
    assignment_reason_category = Column(String(100), nullable=True)
    assignment_explanation = Column(Text, nullable=True)
    forwarding_reason_category = Column(String(100), nullable=True)
    forwarding_note = Column(Text, nullable=True)
    stage_durations = Column(JSONB, default=dict)

    # Normalized Workflow Engine Columns
    current_department = Column(String(50), default="marketing", index=True)
    assigned_user_id = Column(Integer, nullable=True)
    assigned_user_name = Column(String(255), default="")
    current_workflow_status = Column(String(50), default="In Progress", index=True)
    expected_date = Column(Date, nullable=True)

    # JSONB columns
    fields = Column(JSONB, default=dict)
    engineers = Column(JSONB, default=dict)
    department_status = Column("department_status", JSONB, default=lambda: {
        "marketing": "completed",
        "design": "pending",
        "mechanical": "pending",
        "purchase": "pending",
        "production": "pending",
        "dispatch": "pending"
    })

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    @property
    def responsible_engineer(self):
        return self.responsible_engg_name or ""

    @responsible_engineer.setter
    def responsible_engineer(self, value):
        self.responsible_engg_name = str(value or "")


class JobExecutionSession(Base):
    __tablename__ = "job_execution_sessions"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, nullable=False, index=True)
    session_type = Column(String(20), nullable=False)  # 'WORK' or 'PAUSE'
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, default=0)
    performed_by = Column(String(100), nullable=False)
    worker_id = Column(Integer, nullable=True, index=True)
    worker_position = Column(String(100), nullable=True)
    pause_reason = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class JobHandover(Base):
    __tablename__ = "job_handovers"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, nullable=False, index=True)
    handover_type = Column(String(50), default="SHIFT", index=True) # 'SHIFT' or 'PLANNING' or 'DEPARTMENT'
    from_department = Column(String(100), nullable=True)
    to_department = Column(String(100), nullable=True, index=True)
    from_worker_id = Column(Integer, nullable=True)
    from_worker_position = Column(String(100), nullable=True)
    to_worker_id = Column(Integer, nullable=True, index=True)
    to_worker_position = Column(String(100), nullable=True)
    handover_at = Column(DateTime(timezone=True), server_default=func.now())
    reason = Column(String(255), nullable=False)
    notes = Column(Text, nullable=True)
    work_completed_summary = Column(Text, nullable=True)
    checklist_snapshot = Column(JSONB, nullable=True)
    active_seconds_before_handover = Column(Integer, default=0)
    status_at_handover = Column(String(50), nullable=True)
    progress_at_handover = Column(Numeric(5, 2), nullable=True)
    performed_by = Column(String(100), nullable=False)
    target_assigned_user_id = Column(Integer, nullable=True)
    target_assigned_user_name = Column(String(255), default="")
    responsible_engg_name = Column(String(255), default="")
    previous_responsible_engg_name = Column(String(255), default="")
    reassignment_reason = Column(String(255), nullable=True)
    is_current_pending = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class JobProgressHistory(Base):
    __tablename__ = "job_progress_history"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, nullable=False, index=True)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())
    progress_percentage = Column(Numeric(5, 2), nullable=False)
    active_duration_seconds = Column(Integer, nullable=False)

    recorded_by = Column(String(100), nullable=False)
    note = Column(String(255), nullable=True)

class DepartmentAssignment(Base):
    __tablename__ = "department_assignments"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, nullable=False)
    department = Column(String(100), nullable=False)
    assigned_users = Column(ARRAY(String), default=[])
    assigned_by = Column(String(100))
    assigned_date = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String(50), default="Pending")

class DepartmentActivity(Base):
    __tablename__ = "department_activities"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, nullable=False)
    department = Column(String(100), nullable=False)
    action = Column(String(255))
    old_value = Column(JSONB)
    new_value = Column(JSONB)
    updated_by = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class SystemConfig(Base):
    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    departments = Column(JSONB, default=list)
    field_defs = Column(JSONB, default=dict)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

class JobDelayRecord(Base):
    __tablename__ = "job_delay_records"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False, index=True)
    external_job_id = Column(Integer, index=True)
    
    # Timeline & Target Dates
    original_target_date = Column(DateTime(timezone=True), nullable=True)
    revised_target_date = Column(DateTime(timezone=True), nullable=True)
    date_delay_identified = Column(DateTime(timezone=True), server_default=func.now())
    days_overdue = Column(Integer, default=0)
    workflow_stage_at_delay = Column(String(50), nullable=False)
    current_department = Column(String(50), nullable=True)

    # Late Reason Details
    reason_category = Column(String(100), nullable=True)
    detailed_explanation = Column(Text, nullable=True)
    explanation_status = Column(String(50), default="REASON_PENDING", index=True)
    explanation_provider_id = Column(Integer, nullable=True)
    explanation_provider_name = Column(String(255), nullable=True)
    explanation_recorded_at = Column(DateTime(timezone=True), nullable=True)

    # Corrective Action & Revision
    corrective_action_required = Column(Text, nullable=True)
    revised_expected_date = Column(DateTime(timezone=True), nullable=True)
    
    # Admin Review Status
    admin_review_status = Column(String(50), default="UNREVIEWED", index=True)
    admin_review_notes = Column(Text, nullable=True)
    admin_reviewer_id = Column(Integer, nullable=True)
    admin_reviewer_name = Column(String(255), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

class JobAssignmentHistory(Base):
    __tablename__ = "job_assignment_history"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False, index=True)
    change_type = Column(String(50), default="ASSIGNMENT")
    
    # Previous & New Owner
    previous_owner_id = Column(Integer, nullable=True)
    previous_owner_name = Column(String(255), nullable=True)
    new_owner_id = Column(Integer, nullable=False)
    new_owner_name = Column(String(255), nullable=False)
    
    # Initiating Actor
    assigned_by_id = Column(Integer, nullable=False)
    assigned_by_name = Column(String(255), nullable=False)
    assigned_by_department = Column(String(100), nullable=True)
    assigned_by_role = Column(String(50), nullable=True)
    
    # Mandatory Rationale
    reason_category = Column(String(100), nullable=False)
    detailed_explanation = Column(Text, nullable=False)
    additional_note = Column(Text, nullable=True)
    
    # Milestone Context
    workflow_stage = Column(String(50), nullable=True)
    expected_start_date = Column(DateTime(timezone=True), nullable=True)
    target_completion_date = Column(DateTime(timezone=True), nullable=True)
    priority = Column(String(50), default="Normal")
    reassignment_sequence = Column(Integer, default=1)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

class JobTargetDateRevision(Base):
    __tablename__ = "job_target_date_revisions"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False, index=True)
    previous_target_date = Column(DateTime(timezone=True), nullable=False)
    revised_target_date = Column(DateTime(timezone=True), nullable=False)
    reason_category = Column(String(100), nullable=False)
    revision_rationale = Column(Text, nullable=False)
    authorized_by_id = Column(Integer, nullable=False)
    authorized_by_name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class MarketingTask(Base):
    __tablename__ = "marketing_tasks"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, default="")

    created_by_user_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    created_by_name = Column(String(255), nullable=False)
    assigned_to_user_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    assigned_to_name = Column(String(255), nullable=False)

    start_date = Column(Date, nullable=False)
    target_date = Column(Date, nullable=False, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    estimated_effort = Column(Numeric(8, 2), default=0.00, nullable=False)
    effort_unit = Column(String(20), default="hours", nullable=False)
    actual_effort = Column(Numeric(8, 2), default=0.00, nullable=False)

    priority = Column(String(20), default="Normal", nullable=False)
    status = Column(String(30), default="Open", nullable=False, index=True)
    blocked_reason = Column(Text, default="")
    completion_remarks = Column(Text, default="")

    is_mandatory_for_readiness = Column(Boolean, default=False)
    readiness_criterion_key = Column(String(100), nullable=True)
    attachments = Column(JSONB, default=list)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class DepartmentTask(Base):
    __tablename__ = "department_tasks"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    department = Column(String(50), nullable=False, index=True)
    task_name = Column(String(255), nullable=False)
    description = Column(Text, default="")

    assigned_user_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    assigned_user_name = Column(String(255), nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    created_by_name = Column(String(255), nullable=False)

    start_date = Column(Date, nullable=False, default=func.current_date())
    target_date = Column(Date, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    estimated_effort_hours = Column(Numeric(6, 2), default=0.00)
    actual_effort_hours = Column(Numeric(6, 2), default=0.00)
    progress_percentage = Column(Integer, default=0)

    status = Column(String(50), default="In Progress", nullable=False)
    blocked_reason = Column(Text, default="")
    completion_remarks = Column(Text, default="")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class JobDocument(Base):
    __tablename__ = "job_documents"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    job_no = Column(String(100), nullable=False, index=True)
    document_type = Column(String(50), nullable=False, default="GENERAL") # 'PO', 'CUSTOMER_DRAWING', 'PANEL_SPECIFICATION', 'GENERAL'
    file_name = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    file_path = Column(Text, nullable=False)
    file_url = Column(String(255), nullable=False)
    file_size_kb = Column(Numeric(10, 2), default=0.00)
    mime_type = Column(String(100), default="application/pdf")
    uploaded_by = Column(String(255), nullable=False)
    department = Column(String(50), nullable=False, default="marketing")
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    handover_id = Column(Integer, ForeignKey("job_handovers.id", ondelete="SET NULL"), nullable=True)


