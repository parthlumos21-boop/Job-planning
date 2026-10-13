import os
import psycopg2

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "job_planning_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "root")

def migrate():
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS
    )
    conn.autocommit = True
    cur = conn.cursor()
    print("Connected to PostgreSQL for V2.1 Plan Migration...")

    # 1. Add pause fields to jobs
    cur.execute("""
        ALTER TABLE jobs
        ADD COLUMN IF NOT EXISTS pause_reason_category VARCHAR(100),
        ADD COLUMN IF NOT EXISTS pause_notes TEXT,
        ADD COLUMN IF NOT EXISTS expected_resume_at TIMESTAMPTZ;
    """)
    print("Added pause_reason_category, pause_notes, expected_resume_at to jobs.")

    # 2. Add handover status/progress fields to job_handovers
    cur.execute("""
        ALTER TABLE job_handovers
        ADD COLUMN IF NOT EXISTS status_at_handover VARCHAR(50),
        ADD COLUMN IF NOT EXISTS progress_at_handover NUMERIC(5, 2);
    """)
    print("Added status_at_handover, progress_at_handover to job_handovers.")

    # 3. Add concurrency index on active sessions
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_sessions_job_active
        ON job_execution_sessions(job_id) WHERE ended_at IS NULL;
    """)
    print("Created index idx_sessions_job_active.")

    cur.close()
    conn.close()
    print("Migration completed successfully!")

if __name__ == "__main__":
    migrate()
