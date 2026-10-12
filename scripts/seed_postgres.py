import os
import json
import psycopg2
from psycopg2.extras import Json
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "job_planning_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "root")

DEFAULT_ACCOUNTS = [
    {"username": "kevalvshah", "password": "kevalvshah", "role": "admin", "departments": ["marketing", "design", "purchase", "mechanical", "production", "dispatch"]},
    {"username": "keval", "password": "keval", "role": "admin", "departments": ["marketing", "design", "purchase", "mechanical", "production", "dispatch"]},
    {"username": "keval v shah", "password": "keval@123", "role": "executive", "departments": ["marketing", "design", "purchase", "mechanical", "production", "dispatch"]},
    {"username": "admin", "password": "admin", "role": "admin", "departments": ["marketing", "design", "purchase", "mechanical", "production", "dispatch"]},
    {"username": "admin2", "password": "admin2", "role": "admin", "departments": ["marketing", "design", "purchase", "mechanical", "production", "dispatch"]},
    {"username": "swatisales", "password": "swatisales", "role": "user", "departments": ["marketing"]},
    {"username": "swatisales2", "password": "swatisales2", "role": "user", "departments": ["marketing"]},
    {"username": "mktadmin", "password": "mktadmin", "role": "user", "departments": ["marketing"]},
    {"username": "swatidesign", "password": "swatidesign", "role": "user", "departments": ["design"]},
    {"username": "swatidesign2", "password": "swatidesign2", "role": "user", "departments": ["design"]},
    {"username": "designadmin", "password": "designadmin", "role": "user", "departments": ["design"]},
    {"username": "mechdesign1", "password": "mechdesign1", "role": "user", "departments": ["mechanical"]},
    {"username": "mechdesign2", "password": "mechdesign2", "role": "user", "departments": ["mechanical"]},
    {"username": "machinedesign", "password": "machinedesign", "role": "user", "departments": ["mechanical"]},
    {"username": "swatipurchase", "password": "swatipurchase", "role": "user", "departments": ["purchase"]},
    {"username": "swatipurchase2", "password": "swatipurchase2", "role": "user", "departments": ["purchase"]},
    {"username": "purchaseadmin", "password": "purchaseadmin", "role": "user", "departments": ["purchase"]},
    {"username": "swatiproduction", "password": "swatiproduction", "role": "user", "departments": ["production", "dispatch"]},
    {"username": "swatiqc", "password": "swatiqc", "role": "user", "departments": ["production", "dispatch"]},
    {"username": "prodadmin", "password": "prodadmin", "role": "user", "departments": ["production", "dispatch"]},
]

def parse_mongo_val(v):
    if isinstance(v, dict):
        if "$numberInt" in v:
            return int(v["$numberInt"])
        if "$numberLong" in v:
            return int(v["$numberLong"])
        if "$oid" in v:
            return str(v["$oid"])
        return {k: parse_mongo_val(val) for k, val in v.items()}
    elif isinstance(v, list):
        return [parse_mongo_val(x) for x in v]
    return v

def seed():
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS
    )
    cur = conn.cursor()
    print("Connected to PostgreSQL successfully.")

    # 1. Accounts
    print("Seeding accounts...")
    for acc in DEFAULT_ACCOUNTS:
        u = acc["username"].strip().lower()
        hashed = pwd_context.hash(acc["password"])
        cur.execute("""
            INSERT INTO accounts (username, hashed_password, role, departments)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (username) DO UPDATE 
            SET hashed_password = EXCLUDED.hashed_password,
                role = EXCLUDED.role,
                departments = EXCLUDED.departments;
        """, (u, hashed, acc["role"], acc["departments"]))
    conn.commit()
    print(f"Accounts seeded ({len(DEFAULT_ACCOUNTS)}).")

    # 2. Config
    print("Seeding system_config...")
    config_path = os.path.join(os.path.dirname(__file__), "..", "mongo_backup", "configs.json")
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            cfg_list = json.load(f)
            for cfg in cfg_list:
                cleaned = parse_mongo_val(cfg)
                cur.execute("""
                    INSERT INTO system_config (key, departments, field_defs)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (key) DO UPDATE
                    SET departments = EXCLUDED.departments,
                        field_defs = EXCLUDED.field_defs;
                """, (
                    cleaned.get("key", "system_config"),
                    Json(cleaned.get("departments", [])),
                    Json(cleaned.get("fieldDefs", {}))
                ))
    conn.commit()

    # 3. Clients
    print("Seeding clients...")
    data_json_path = os.path.join(os.path.dirname(__file__), "..", "server", "database", "data.json")
    if os.path.exists(data_json_path):
        with open(data_json_path, "r", encoding="utf-8") as f:
            dj = json.load(f)
            clients = dj.get("clients", [])
            for c in clients:
                cid = c.get("id")
                cname = c.get("name")
                if cname:
                    cur.execute("""
                        INSERT INTO clients (external_id, name)
                        VALUES (%s, %s)
                        ON CONFLICT (external_id) DO UPDATE SET name = EXCLUDED.name;
                    """, (cid, cname))
            
            # Users
            print("Seeding users...")
            users = dj.get("users", [])
            for idx, u in enumerate(users):
                uid = u.get("id", idx + 1)
                uname = u.get("name")
                depts = u.get("departments", [])
                if uname:
                    cur.execute("""
                        INSERT INTO users (external_id, name, departments)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (external_id) DO UPDATE 
                        SET name = EXCLUDED.name, departments = EXCLUDED.departments;
                    """, (uid, uname, depts))
    conn.commit()

    # 4. Jobs
    print("Seeding jobs from backup...")
    jobs_path = os.path.join(os.path.dirname(__file__), "..", "mongo_backup", "jobs.json")
    if os.path.exists(jobs_path):
        with open(jobs_path, "r", encoding="utf-8") as f:
            raw_jobs = json.load(f)
            for rj in raw_jobs:
                j = parse_mongo_val(rj)
                jid = j.get("id", 1)
                cur.execute("""
                    INSERT INTO jobs (
                        external_id, client_name, sr_no, job_no, panel_name,
                        project_name, responsible_engg_name, po_no, po_date,
                        delivery_period, delivery_date, data_given_to_design,
                        delivery_address, contact_person, type_of_industries,
                        incomer_rating, type_of_panel, qty, date, ttl,
                        target_department, target_position, created_by,
                        visible_to_departments, selected, fields, engineers,
                        department_status
                    ) VALUES (
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s, %s,
                        %s
                    )
                    ON CONFLICT (external_id) DO NOTHING;
                """, (
                    jid, j.get("clientName", ""), j.get("srNo", 1), j.get("jobNo", ""), j.get("panelName", ""),
                    j.get("projectName", ""), j.get("responsibleEnggName", ""), j.get("poNo", ""), j.get("poDate", ""),
                    j.get("deliveryPeriod", ""), j.get("deliveryDate", ""), j.get("dataGivenToDesign", ""),
                    j.get("deliveryAddress", ""), j.get("contactPerson", ""), j.get("typeOfIndustries", ""),
                    j.get("incomerRating", ""), j.get("typeOfPanel", ""), str(j.get("qty", "1")), j.get("date", ""), j.get("ttl", ""),
                    j.get("targetDepartment", ""), j.get("targetPosition", ""), j.get("createdBy", "admin"),
                    j.get("visibleToDepartments", []), j.get("selected", False),
                    Json(j.get("fields", {})), Json(j.get("engineers", {})),
                    Json(j.get("departmentStatus", {}))
                ))
    conn.commit()

    # Print summary
    cur.execute("SELECT COUNT(*) FROM accounts;")
    print("Accounts count in Postgres:", cur.fetchone()[0])
    cur.execute("SELECT COUNT(*) FROM clients;")
    print("Clients count in Postgres:", cur.fetchone()[0])
    cur.execute("SELECT COUNT(*) FROM users;")
    print("Users count in Postgres:", cur.fetchone()[0])
    cur.execute("SELECT COUNT(*) FROM jobs;")
    print("Jobs count in Postgres:", cur.fetchone()[0])
    cur.execute("SELECT COUNT(*) FROM system_config;")
    print("System config count in Postgres:", cur.fetchone()[0])

    cur.close()
    conn.close()
    print("Seeding completed successfully!")

if __name__ == "__main__":
    seed()
