import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv('server-py/.env')
url = os.getenv('DATABASE_URL')
print('Database URL:', url)

async def check_columns():
    engine = create_async_engine(url)
    async with engine.connect() as conn:
        res = await conn.execute(text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'jobs'
            ORDER BY ordinal_position;
        """))
        cols = [r[0] for r in res.fetchall()]
        print('Total columns in jobs table:', len(cols))
        print('Columns in PostgreSQL jobs table:', cols)
        
        # Check specifically for columns mentioned in error
        targets = [
            'handover_status', 'current_workflow_status', 'planning_owner_id', 
            'planning_owner_name', 'handover_submitted_at', 'handover_accepted_at',
            'handover_return_reason', 'reassignment_history', 'handover_checklist',
            'current_stage', 'current_action', 'current_waiting_reason', 
            'stage_started_at', 'stage_due_date', 'assignment_reason_category',
            'assignment_explanation', 'forwarding_reason_category', 'forwarding_note',
            'stage_durations', 'current_department', 'assigned_user_id', 
            'assigned_user_name', 'expected_date', 'fields', 'engineers', 
            'department_status'
        ]
        missing = [t for t in targets if t not in cols]
        print('Missing columns from targets:', missing)

asyncio.run(check_columns())
