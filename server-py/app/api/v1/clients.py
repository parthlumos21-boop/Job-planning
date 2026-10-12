from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models import Client, Job
from app.schemas import UserPayload

router = APIRouter(prefix="/clients", tags=["Clients"])

@router.get("")
async def get_clients(
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    stmt = select(Client).order_by(Client.name.asc())
    res = await db.execute(stmt)
    clients = res.scalars().all()

    # Get job counts per client
    job_count_stmt = select(Job.client_name, func.count(Job.id)).group_by(Job.client_name)
    jc_res = await db.execute(job_count_stmt)
    job_counts = dict(jc_res.all())

    output = []
    for c in clients:
        output.append({
            "id": c.external_id or c.id,
            "name": c.name,
            "jobCount": job_counts.get(c.name, 0)
        })
    return output
