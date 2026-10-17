import os
import psycopg2
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "job_planning_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "root")

MIGRATION_SQL = """
-- 1. Create Generalized department_tasks Table
CREATE TABLE IF NOT EXISTS public.department_tasks (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    department VARCHAR(50) NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    
    assigned_user_id INTEGER REFERENCES public.accounts(id),
    assigned_user_name VARCHAR(255) NOT NULL,
    created_by_user_id INTEGER REFERENCES public.accounts(id),
    created_by_name VARCHAR(255) NOT NULL,
    
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    target_date DATE NOT NULL,
    completed_at TIMESTAMPTZ NULL,
    estimated_effort_hours NUMERIC(6, 2) DEFAULT 0.00,
    actual_effort_hours NUMERIC(6, 2) DEFAULT 0.00,
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
    
    status VARCHAR(50) NOT NULL DEFAULT 'In Progress',
    blocked_reason TEXT DEFAULT '',
    completion_remarks TEXT DEFAULT '',
    
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dept_tasks_job_dept ON public.department_tasks(job_id, department);
CREATE INDEX IF NOT EXISTS idx_dept_tasks_assigned_user ON public.department_tasks(assigned_user_name, status);
CREATE INDEX IF NOT EXISTS idx_dept_tasks_dept ON public.department_tasks(department, status);

-- 2. Extend jobs table with normalized workflow columns (Non-breaking)
ALTER TABLE public.jobs 
    ADD COLUMN IF NOT EXISTS current_department VARCHAR(50) DEFAULT 'marketing',
    ADD COLUMN IF NOT EXISTS assigned_user_id INTEGER REFERENCES public.accounts(id),
    ADD COLUMN IF NOT EXISTS assigned_user_name VARCHAR(255) DEFAULT '',
    ADD COLUMN IF NOT EXISTS current_workflow_status VARCHAR(50) DEFAULT 'In Progress',
    ADD COLUMN IF NOT EXISTS expected_date DATE NULL;

-- 3. Enhance job_handovers table for clean workflow tracking
ALTER TABLE public.job_handovers
    ADD COLUMN IF NOT EXISTS target_assigned_user_id INTEGER REFERENCES public.accounts(id),
    ADD COLUMN IF NOT EXISTS target_assigned_user_name VARCHAR(255) DEFAULT '',
    ADD COLUMN IF NOT EXISTS responsible_engg_name VARCHAR(255) DEFAULT '',
    ADD COLUMN IF NOT EXISTS is_current_pending BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_handovers_pending ON public.job_handovers(to_department, is_current_pending);
"""

DEFAULT_ACCOUNTS = [
    # Marketing
    {"username": "swatisales", "password": "swatisales", "role": "user", "departments": ["marketing"]},
    {"username": "swatisales2", "password": "swatisales2", "role": "user", "departments": ["marketing"]},
    {"username": "mktadmin", "password": "mktadmin", "role": "user", "departments": ["marketing"]},
    # Design- Electrical
    {"username": "swatidesign", "password": "swatidesign", "role": "user", "departments": ["design"]},
    {"username": "swatidesign2", "password": "swatidesign2", "role": "user", "departments": ["design"]},
    {"username": "designadmin", "password": "designadmin", "role": "user", "departments": ["design"]},
    # Design- Mechanical
    {"username": "mechdesign1", "password": "mechdesign1", "role": "user", "departments": ["mechanical"]},
    {"username": "mechdesign2", "password": "mechdesign2", "role": "user", "departments": ["mechanical"]},
    {"username": "machinedesign", "password": "machinedesign", "role": "user", "departments": ["mechanical"]},
    # Procurement
    {"username": "swatipurchase", "password": "swatipurchase", "role": "user", "departments": ["purchase"]},
    {"username": "swatipurchase2", "password": "swatipurchase2", "role": "user", "departments": ["purchase"]},
    {"username": "purchaseadmin", "password": "purchaseadmin", "role": "user", "departments": ["purchase"]},
    # Production & QC & Dispatch
    {"username": "swatiproduction", "password": "swatiproduction", "role": "user", "departments": ["production"]},
    {"username": "swatiqc", "password": "swatiqc", "role": "user", "departments": ["qc", "production"]},
    {"username": "prodadmin", "password": "prodadmin", "role": "user", "departments": ["production", "dispatch", "qc"]},
]

def run_migration():
    print(f"Connecting to PostgreSQL at {DB_HOST}:{DB_PORT}/{DB_NAME}...")
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS
    )
    conn.autocommit = True
    cur = conn.cursor()

    print("Running DDL migration...")
    cur.execute(MIGRATION_SQL)
    print("DDL migration completed successfully.")

    print("Ensuring department accounts exist...")
    for acc in DEFAULT_ACCOUNTS:
        cur.execute("SELECT id, departments FROM public.accounts WHERE username = %s;", (acc["username"],))
        row = cur.fetchone()
        hashed = pwd_context.hash(acc["password"])
        if row:
            cur.execute(
                "UPDATE public.accounts SET departments = %s, role = %s WHERE id = %s;",
                (acc["departments"], acc["role"], row[0])
            )
            print(f"  Updated account: {acc['username']} -> {acc['departments']}")
        else:
            cur.execute(
                "INSERT INTO public.accounts (username, hashed_password, role, departments) VALUES (%s, %s, %s, %s);",
                (acc["username"], hashed, acc["role"], acc["departments"])
            )
            print(f"  Created account: {acc['username']}")

    # Backfill current_department on jobs if NULL or empty
    cur.execute("UPDATE public.jobs SET current_department = 'marketing' WHERE current_department IS NULL OR current_department = '';")
    cur.execute("UPDATE public.jobs SET current_workflow_status = 'In Progress' WHERE current_workflow_status IS NULL OR current_workflow_status = '';")
    print("Backfilled existing jobs with default workflow values.")

    cur.close()
    conn.close()
    print("Migration finished successfully.")

if __name__ == "__main__":
    run_migration()
