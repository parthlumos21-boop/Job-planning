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
    print("Applying handover & worker tracking migration to PostgreSQL...")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()

        # 1. Update jobs table with worker & handover columns
        print("1. Updating 'jobs' table with worker assignment, position and handover columns...")
        cur.execute("""
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS current_worker_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS current_worker_position VARCHAR(100);
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS previous_worker_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS next_worker_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_handover_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_notes TEXT;

            CREATE INDEX IF NOT EXISTS idx_jobs_current_worker ON jobs (current_worker_id);
        """)

        # 2. Update job_execution_sessions with worker info
        print("2. Updating 'job_execution_sessions' table with worker_id and worker_position...")
        cur.execute("""
            ALTER TABLE job_execution_sessions ADD COLUMN IF NOT EXISTS worker_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
            ALTER TABLE job_execution_sessions ADD COLUMN IF NOT EXISTS worker_position VARCHAR(100);

            CREATE INDEX IF NOT EXISTS idx_execution_sessions_worker ON job_execution_sessions (worker_id);
        """)

        # 3. Create job_handovers table
        print("3. Creating 'job_handovers' table...")
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

        conn.commit()
        print("MIGRATION COMPLETED SUCCESSFULLY!")

        # Verify added columns
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'jobs' AND column_name IN (
                'current_worker_id', 'current_worker_position', 'previous_worker_id', 'last_handover_at'
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
