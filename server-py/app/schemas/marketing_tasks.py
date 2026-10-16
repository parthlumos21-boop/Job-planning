from datetime import date, datetime
from typing import Optional, Any
from pydantic import BaseModel, Field, model_validator

class MarketingTaskCreate(BaseModel):
    job_id: int
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = ""
    assigned_to_user_id: Optional[int] = None
    start_date: date
    target_date: date
    estimated_effort: float = Field(default=0.0, ge=0.0)
    effort_unit: str = Field(default="hours")  # "hours" or "minutes"
    priority: str = Field(default="Normal")    # "Low", "Normal", "High", "Urgent"
    is_mandatory_for_readiness: bool = False
    readiness_criterion_key: Optional[str] = None
    attachments: list[Any] = []

    @model_validator(mode="after")
    def validate_dates(self):
        if self.target_date < self.start_date:
            raise ValueError("Target Date cannot be earlier than Start Date.")
        unit = (self.effort_unit or "hours").lower()
        if unit not in ["hours", "minutes"]:
            raise ValueError("Effort Unit must be 'hours' or 'minutes'.")
        prio = (self.priority or "Normal").capitalize()
        if prio not in ["Low", "Normal", "High", "Urgent"]:
            prio = "Normal"
        self.priority = prio
        self.effort_unit = unit
        return self

class MarketingTaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    assigned_to_user_id: Optional[int] = None
    start_date: Optional[date] = None
    target_date: Optional[date] = None
    estimated_effort: Optional[float] = Field(default=None, ge=0.0)
    effort_unit: Optional[str] = None
    actual_effort: Optional[float] = Field(default=None, ge=0.0)
    priority: Optional[str] = None
    status: Optional[str] = None
    blocked_reason: Optional[str] = None
    completion_remarks: Optional[str] = None
    is_mandatory_for_readiness: Optional[bool] = None
    readiness_criterion_key: Optional[str] = None
    attachments: Optional[list[Any]] = None

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date is not None and self.target_date is not None:
            if self.target_date < self.start_date:
                raise ValueError("Target Date cannot be earlier than Start Date.")
        if self.effort_unit is not None:
            unit = self.effort_unit.lower()
            if unit not in ["hours", "minutes"]:
                raise ValueError("Effort Unit must be 'hours' or 'minutes'.")
            self.effort_unit = unit
        return self

class MarketingTaskReassignRequest(BaseModel):
    new_assigned_user_id: int
    reason: str = Field(..., min_length=1)

class MarketingTaskResponse(BaseModel):
    id: int
    job_id: int
    job_no: Optional[str] = None
    client_name: Optional[str] = None
    project_name: Optional[str] = None
    panel_name: Optional[str] = None
    title: str
    description: str = ""
    created_by_user_id: int
    created_by_name: str
    assigned_to_user_id: int
    assigned_to_name: str
    start_date: str
    target_date: str
    completed_at: Optional[str] = None
    estimated_effort: float
    effort_unit: str
    actual_effort: float
    priority: str
    status: str
    blocked_reason: str = ""
    completion_remarks: str = ""
    is_mandatory_for_readiness: bool
    readiness_criterion_key: Optional[str] = None
    attachments: list[Any] = []
    is_due_today: bool = False
    is_overdue: bool = False
    days_remaining: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
