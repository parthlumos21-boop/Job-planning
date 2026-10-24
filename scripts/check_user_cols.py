import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv('server-py/.env')

async def check():
    engine = create_async_engine(os.getenv('DATABASE_URL'))
    async with engine.connect() as conn:
        for tbl in ['users', 'accounts']:
            r = await conn.execute(text(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{tbl}';"))
            print(f"Columns for {tbl}:", [c[0] for c in r.fetchall()])
        
        # sample 3 users and accounts
        r_u = await conn.execute(text("SELECT id, name FROM users LIMIT 3;"))
        print("Sample users:", r_u.fetchall())
        r_a = await conn.execute(text("SELECT id, username, role FROM accounts LIMIT 3;"))
        print("Sample accounts:", r_a.fetchall())

asyncio.run(check())
