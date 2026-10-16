import psycopg2
import sys
import os

DB_CONFIG = {
    "dbname": "job_planning_db",
    "user": "postgres",
    "password": "root",
    "host": "localhost",
    "port": 5432
}

def migrate():
    print("Applying marketing_tasks migration to PostgreSQL...")
    sql_path = os.path.join(os.path.dirname(__file__), "schema_marketing_tasks.sql")
    with open(sql_path, "r", encoding="utf-8") as f:
        sql = f.read()

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = True
        cur = conn.cursor()
        print("Executing schema_marketing_tasks.sql...")
        cur.execute(sql)
        print("Table 'marketing_tasks' created/verified successfully!")

        # Verify table exists
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'marketing_tasks'
            ORDER BY ordinal_position;
        """)
        columns = cur.fetchall()
        print(f"Verified {len(columns)} columns in marketing_tasks:")
        for col_name, data_type in columns:
            print(f" - {col_name} ({data_type})")

        cur.close()
        conn.close()
        print("Migration complete!")
    except Exception as e:
        print(f"Migration error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    migrate()
