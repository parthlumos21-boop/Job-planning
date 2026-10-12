from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models import SystemConfig, Account, User
from app.schemas import UserPayload

router = APIRouter(prefix="/departments", tags=["Departments"])

DEFAULT_DEPARTMENTS = [
    {"key": "marketing", "name": "Marketing"},
    {"key": "design", "name": "Design- Electrical"},
    {"key": "purchase", "name": "Procurement"},
    {"key": "mechanical", "name": "Design- Mechanical"},
    {"key": "production", "name": "Production & QC & Dispatch"}
]

@router.get("")
async def get_departments(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = select(SystemConfig).where(SystemConfig.key == "system_config")
    res = await db.execute(stmt)
    cfg = res.scalar_one_or_none()

    departments = cfg.departments if cfg and cfg.departments else DEFAULT_DEPARTMENTS
    field_defs = cfg.field_defs if cfg and cfg.field_defs else {}

    output = []
    for d in departments:
        output.append({
            "key": d["key"],
            "name": d["name"],
            "fields": field_defs.get(d["key"], [])
        })
    return output

@router.get("/{key}/users")
async def get_department_users(
    key: str,
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    # Fetch accounts / users assigned to this department
    stmt = select(Account).order_by(Account.username.asc())
    res = await db.execute(stmt)
    accounts = res.scalars().all()

    dept_users = [
        {"name": a.username, "departments": a.departments or []}
        for a in accounts
        if key in (a.departments or []) or a.role in ["admin", "executive"]
    ]
    return dept_users
