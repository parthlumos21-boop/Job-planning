import os
import sys
import bcrypt
import psycopg2
from psycopg2.extras import Json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE_DIR, "server-py"))

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "job_planning_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "root")

DEPARTMENT_CREDENTIALS = [
    {
        "username": "admin",
        "name": "System Administrator",
        "password": "admin123",
        "role": "admin",
        "departments": ["marketing", "design", "purchase", "mechanical", "production", "dispatch"]
    },
    {
        "username": "executive",
        "name": "Executive Management",
        "password": "exec123",
        "role": "executive",
        "departments": ["marketing", "design", "purchase", "mechanical", "production", "dispatch"]
    },
    {
        "username": "marketing",
        "name": "Marketing Admin",
        "password": "mkt123",
        "role": "user",
        "departments": ["marketing"]
    },
    {
        "username": "marketing_user",
        "name": "Marketing Engineer",
        "password": "mkt123",
        "role": "user",
        "departments": ["marketing"]
    },
    {
        "username": "design",
        "name": "Electrical Design Admin",
        "password": "design123",
        "role": "user",
        "departments": ["design"]
    },
    {
        "username": "design_user",
        "name": "Electrical Design Engineer",
        "password": "design123",
        "role": "user",
        "departments": ["design"]
    },
    {
        "username": "mechanical",
        "name": "Mechanical Design Admin",
        "password": "mech123",
        "role": "user",
        "departments": ["mechanical"]
    },
    {
        "username": "mech_user",
        "name": "Mechanical Design Engineer",
        "password": "mech123",
        "role": "user",
        "departments": ["mechanical"]
    },
    {
        "username": "purchase",
        "name": "Procurement Admin",
        "password": "purchase123",
        "role": "user",
        "departments": ["purchase"]
    },
    {
        "username": "purchase_user",
        "name": "Procurement Officer",
        "password": "purchase123",
        "role": "user",
        "departments": ["purchase"]
    },
    {
        "username": "production",
        "name": "Production Admin",
        "password": "prod123",
        "role": "user",
        "departments": ["production"]
    },
    {
        "username": "prod_user",
        "name": "Assembly Engineer",
        "password": "prod123",
        "role": "user",
        "departments": ["production"]
    },
    {
        "username": "qc",
        "name": "Quality Control Engineer",
        "password": "qc123",
        "role": "user",
        "departments": ["production"]
    },
    {
        "username": "dispatch",
        "name": "Dispatch Admin",
        "password": "dispatch123",
        "role": "user",
        "departments": ["dispatch"]
    },
    {
        "username": "dispatch_user",
        "name": "Shipping Coordinator",
        "password": "dispatch123",
        "role": "user",
        "departments": ["dispatch"]
    }
]

def hash_pw(plain: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")

def seed_department_credentials():
    print(f"Connecting to PostgreSQL database '{DB_NAME}' at {DB_HOST}:{DB_PORT}...")
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS
    )
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # Ensure schema has password columns
        cur.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT 'password123';")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT 'password123';")

        print("\n--- Seeding / Updating Accounts ---")
        for cred in DEPARTMENT_CREDENTIALS:
            uname = cred["username"].strip().lower()
            plain_pw = cred["password"]
            hashed_pw = hash_pw(plain_pw)
            role = cred["role"]
            depts = cred["departments"]

            # Upsert into accounts table
            cur.execute("""
                INSERT INTO accounts (username, hashed_password, password, role, departments)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (username) DO UPDATE
                SET hashed_password = EXCLUDED.hashed_password,
                    password = EXCLUDED.password,
                    role = EXCLUDED.role,
                    departments = EXCLUDED.departments;
            """, (uname, hashed_pw, plain_pw, role, depts))
            print(f"  [Account] {uname:16} | Role: {role:10} | Departments: {depts}")

        print("\n--- Synchronizing Users Table (for Assignee / Handover Dropdowns) ---")
        cur.execute("SELECT COALESCE(MAX(external_id), 0) FROM users;")
        max_ext_id = cur.fetchone()[0]

        for cred in DEPARTMENT_CREDENTIALS:
            name = cred["name"]
            plain_pw = cred["password"]
            depts = cred["departments"]

            cur.execute("SELECT id FROM users WHERE LOWER(name) = LOWER(%s);", (name,))
            existing = cur.fetchone()
            if existing:
                cur.execute("""
                    UPDATE users
                    SET password = %s,
                        departments = %s,
                        is_active = true
                    WHERE id = %s;
                """, (plain_pw, depts, existing[0]))
                print(f"  [User Updated] {name:28} (ID: {existing[0]})")
            else:
                max_ext_id += 1
                cur.execute("""
                    INSERT INTO users (external_id, name, password, departments, is_active)
                    VALUES (%s, %s, %s, %s, true)
                    RETURNING id;
                """, (max_ext_id, name, plain_pw, depts))
                new_id = cur.fetchone()[0]
                print(f"  [User Created] {name:28} (ID: {new_id}, ExtID: {max_ext_id})")

        conn.commit()
        print("\nAll department credentials successfully seeded and synchronized!")

    except Exception as e:
        conn.rollback()
        print(f"\nError seeding credentials: {e}", file=sys.stderr)
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    seed_department_credentials()
