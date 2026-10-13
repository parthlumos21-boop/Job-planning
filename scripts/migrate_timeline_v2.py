import psycopg2
import sys

DB_CONFIG = {
    "dbname": "job_planning_db",
    "user": "postgres",
    "password": "root",
    "host": "localhost",
    "port": 5432
}

def migrate():
    print("Applying timeline & live monitoring enhancements to PostgreSQL (job_planning_db)...")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()

        # 1. Update jobs table with assignment tracking & work unit columns
        print("1. Updating 'jobs' table with assigned_by_user_id and work units...")
        cur.execute("""
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS target_work_units INTEGER DEFAULT 100;
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_work_units INTEGER DEFAULT 0;

            CREATE INDEX IF NOT EXISTS idx_jobs_planned_dates ON jobs (planned_start_at, planned_end_at);
            CREATE INDEX IF NOT EXISTS idx_jobs_worker_status ON jobs (current_worker_id, lifecycle_status);
            CREATE INDEX IF NOT EXISTS idx_jobs_assigned_by ON jobs (assigned_by_user_id);
        """)

        # 2. Ensure job_handovers table exists with indexes
        print("2. Ensuring 'job_handovers' table has proper indexes...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS job_handovers (
                id SERIAL PRIMARY KEY,
                job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                from_worker_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                from_worker_position VARCHAR(100),
                to_worker_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                to_worker_position VARCHAR(100),
                handover_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                reason VARCHAR(255) NOT NULL,
                notes TEXT,
                work_completed_summary TEXT,
                active_seconds_before_handover INTEGER DEFAULT 0,
                performed_by VARCHAR(100) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_job_handovers_job ON job_handovers (job_id, handover_at);
            CREATE INDEX IF NOT EXISTS idx_job_handovers_to_worker ON job_handovers (to_worker_id);
        """)

        # 3. Ensure job_execution_sessions and job_progress_history exist
        print("3. Ensuring 'job_execution_sessions' and 'job_progress_history' indexes...")
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_execution_sessions_job_type ON job_execution_sessions (job_id, session_type);
            CREATE INDEX IF NOT EXISTS idx_progress_history_job_rec ON job_progress_history (job_id, recorded_at);
        """)

        conn.commit()
        print("MIGRATION COMPLETED SUCCESSFULLY!")

        # Verify added columns
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'jobs' AND column_name IN (
                'assigned_by_user_id', 'target_work_units', 'completed_work_units'
            );
        """)
        cols = cur.fetchall()
        print("Verified added columns in jobs table:", cols)

        cur.close()
        conn.close()

    except Exception as e:
        print("Migration failed:", e)
        sys.exit(1)

if __name__ == "__main__":
    migrate()
