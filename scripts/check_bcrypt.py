import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv
import bcrypt

load_dotenv('server-py/.env')

async def check():
    engine = create_async_engine(os.getenv('DATABASE_URL'))
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT username, password, hashed_password FROM accounts WHERE username = 'swatisales';"))
        r = res.fetchone()
        print("swatisales password:", r[1])
        print("swatisales hashed_password:", r[2])
        if r[2]:
            try:
                ok = bcrypt.checkpw("password123".encode('utf-8'), r[2].encode('utf-8'))
                print("bcrypt matches?:", ok)
            except Exception as e:
                print("bcrypt error:", e)

asyncio.run(check())
