import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv('server-py/.env')
url = os.getenv('DATABASE_URL')

async def check_all():
    engine = create_async_engine(url)
    async with engine.connect() as conn:
        res = await conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """))
        tables = [r[0] for r in res.fetchall()]
        print('Tables:', tables)
        
        for tbl in ['jobs', 'job_handovers', 'job_delay_records', 'job_assignment_history', 'job_target_date_revisions']:
            if tbl in tables:
                r_cols = await conn.execute(text(f"""
                    SELECT column_name FROM information_schema.columns WHERE table_name = '{tbl}';
                """))
                cols = [c[0] for c in r_cols.fetchall()]
                print(f'{tbl} columns count: {len(cols)}')
            else:
                print(f'{tbl} does NOT exist')

asyncio.run(check_all())
