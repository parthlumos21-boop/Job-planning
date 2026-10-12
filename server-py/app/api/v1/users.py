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
    stmt = select(Account).order_by(Account.username.asc())
    res = await db.execute(stmt)
    accounts = res.scalars().all()

    output = []
    for a in accounts:
        depts = a.departments or []
        if department and department not in depts and a.role not in ["admin", "executive"]:
            continue
        output.append({
            "name": a.username,
            "departments": depts,
            "jobCount": 0
        })
    return output
