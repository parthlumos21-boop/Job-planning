from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models import Account, User
from app.schemas import UserPayload

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("")
async def get_users(
    department: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    # Query User table first
    u_stmt = select(User).where(User.is_active.is_(True)).order_by(User.name.asc())
    u_res = await db.execute(u_stmt)
    users_list = u_res.scalars().all()

    output = []
    seen_names = set()

    for u in users_list:
        depts = u.departments or []
        if department and department not in depts:
            continue
        seen_names.add(u.name.lower())
        output.append({
            "id": u.id,
            "externalId": u.external_id or u.id,
            "name": u.name,
            "username": u.name,
            "departments": depts,
            "jobCount": 0
        })

    # Also include Accounts that might not be in users table
    stmt = select(Account).order_by(Account.username.asc())
    res = await db.execute(stmt)
    accounts = res.scalars().all()

    for a in accounts:
        if a.username.lower() in seen_names:
            continue
        depts = a.departments or []
        if department and department not in depts and a.role not in ["admin", "executive"]:
            continue
        output.append({
            "id": a.id,
            "externalId": a.id,
            "name": a.username,
            "username": a.username,
            "departments": depts,
            "jobCount": 0
        })

    return output
