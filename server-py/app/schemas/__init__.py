from pydantic import BaseModel, Field
from typing import Any, Optional

class LoginRequest(BaseModel):
    username: str
    password: str

class UserPayload(BaseModel):
    username: str
    role: str
    departments: list[str] = []

class TokenResponse(BaseModel):
    token: str
    user: UserPayload

class ClientResponse(BaseModel):
    id: int
    name: str
    jobCount: int = 0

class UserResponse(BaseModel):
    name: str
    departments: list[str] = []
    jobCount: int = 0

class DepartmentResponse(BaseModel):
    key: str
    name: str
    fields: list[Any] = []

class FieldUpdateRequest(BaseModel):
    department: str
    field: str
    value: Any

class StatusUpdateRequest(BaseModel):
    department: str
    status: str

class BulkSelectRequest(BaseModel):
    ids: list[int]
    selected: bool

class SingleSelectRequest(BaseModel):
    selected: bool

class JobScheduleRequest(BaseModel):
    planned_start_at: Optional[str] = None
    planned_end_at: Optional[str] = None
    estimated_duration_hours: Optional[float] = None
    assigned_engineer_id: Optional[int] = None
    priority: Optional[str] = "Normal"

class JobPauseRequest(BaseModel):
    reason: str = "Break"
    notes: Optional[str] = None

class JobResumeRequest(BaseModel):
    notes: Optional[str] = None

class JobCompleteRequest(BaseModel):
    notes: Optional[str] = None

class JobHandoverRequest(BaseModel):
    to_worker_id: int
    to_worker_position: Optional[str] = "Engineer"
    reason: str = "Shift Change"
    notes: Optional[str] = None
    action: Optional[str] = "RUNNING"  # "RUNNING" or "PAUSED"


