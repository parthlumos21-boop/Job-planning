import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv('server-py/.env')

async def cleanup():
    engine = create_async_engine(os.getenv('DATABASE_URL'))
    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM jobs WHERE job_no = 'TEST-AUTO-9999';"))
    print("Test job cleaned up successfully!")

asyncio.run(cleanup())
