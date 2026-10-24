import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv('server-py/.env')

async def check():
    engine = create_async_engine(os.getenv('DATABASE_URL'))
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT username, password FROM accounts WHERE username LIKE '%sales%' OR username LIKE '%mkt%' OR username LIKE '%admin%';"))
        for r in res.fetchall():
            print(r[0], "-> password:", r[1])

asyncio.run(check())
