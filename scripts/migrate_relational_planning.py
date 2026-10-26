import asyncio
import os
import sys
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, 'server-py', '.env'))
load_dotenv(os.path.join(BASE_DIR, '.env'))

DB_URL = os.getenv('DATABASE_URL', 'postgresql+asyncpg://postgres:root@localhost:5432/job_planning_db')
if not DB_URL:
    print("DATABASE_URL not found!")
    sys.exit(1)

SQL_MIGRATION = """
-- 1. Job Field Definitions (Central Source of Truth)
CREATE TABLE IF NOT EXISTS job_field_definitions (
    id SERIAL PRIMARY KEY,
    field_key VARCHAR(64) UNIQUE NOT NULL,
    field_label VARCHAR(128) NOT NULL,
    field_type VARCHAR(32) NOT NULL DEFAULT 'select',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jfd_key ON job_field_definitions(field_key);

-- 2. Job Field Options (Predefined choices for select fields)
CREATE TABLE IF NOT EXISTS job_field_options (
    id SERIAL PRIMARY KEY,
    field_key VARCHAR(64) NOT NULL,
    value VARCHAR(128) NOT NULL,
    label VARCHAR(128) NOT NULL,
    sequence INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    UNIQUE(field_key, value)
);
CREATE INDEX IF NOT EXISTS idx_jfo_key ON job_field_options(field_key);

-- 3. Department Planning Rule Conditions (Relational Condition Rows)
CREATE TABLE IF NOT EXISTS department_planning_rule_conditions (
    id SERIAL PRIMARY KEY,
    rule_id INTEGER NOT NULL REFERENCES department_formula_rules(id) ON DELETE CASCADE,
    field_key VARCHAR(64) NOT NULL,
    operator VARCHAR(32) NOT NULL DEFAULT 'equals',
    value VARCHAR(128) NOT NULL,
    additional_days INTEGER NOT NULL DEFAULT 0,
    condition_label VARCHAR(255) DEFAULT '',
    sequence INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dprc_rule_id ON department_planning_rule_conditions(rule_id);

-- 4. Standardized Delay Reasons
CREATE TABLE IF NOT EXISTS delay_reasons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    label VARCHAR(255) NOT NULL,
    delay_type VARCHAR(32) NOT NULL DEFAULT 'INTERNAL', -- 'INTERNAL' or 'EXTERNAL'
    description VARCHAR(255) DEFAULT '',
    active BOOLEAN DEFAULT TRUE
);

-- 5. Individual Delay Events per Department Schedule
CREATE TABLE IF NOT EXISTS job_department_delay_events (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES job_department_schedules(id) ON DELETE CASCADE,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    department VARCHAR(50) NOT NULL,
    delay_reason_id INTEGER REFERENCES delay_reasons(id) ON DELETE SET NULL,
    delay_reason_code VARCHAR(64) DEFAULT '',
    delay_reason_label VARCHAR(255) DEFAULT '',
    delay_type VARCHAR(32) NOT NULL DEFAULT 'INTERNAL',
    delay_days INTEGER NOT NULL DEFAULT 1,
    delay_start_date DATE,
    delay_end_date DATE,
    remarks TEXT DEFAULT '',
    reported_by VARCHAR(255) DEFAULT '',
    responsible_person VARCHAR(255) DEFAULT '',
    reported_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'Approved'
);
CREATE INDEX IF NOT EXISTS idx_jde_sched ON job_department_delay_events(schedule_id);
CREATE INDEX IF NOT EXISTS idx_jde_job ON job_department_delay_events(job_id);

-- 6. Schedule Revision History (Deadline Change Audit Trail)
CREATE TABLE IF NOT EXISTS job_department_schedule_revisions (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES job_department_schedules(id) ON DELETE CASCADE,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    department VARCHAR(50) NOT NULL,
    old_target_date DATE NOT NULL,
    new_target_date DATE NOT NULL,
    days_extended INTEGER NOT NULL DEFAULT 1,
    reason_category VARCHAR(100) DEFAULT '',
    reason_text TEXT DEFAULT '',
    requested_by VARCHAR(255) DEFAULT '',
    approved_by VARCHAR(255) DEFAULT '',
    requested_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'Approved'
);
CREATE INDEX IF NOT EXISTS idx_jdsr_sched ON job_department_schedule_revisions(schedule_id);

-- 7. Add columns to job_department_schedules if not existing
ALTER TABLE job_department_schedules ADD COLUMN IF NOT EXISTS current_target_date DATE;
ALTER TABLE job_department_schedules ADD COLUMN IF NOT EXISTS formula_snapshot JSONB;
ALTER TABLE job_department_schedules ADD COLUMN IF NOT EXISTS formula_inputs JSONB;
ALTER TABLE job_department_schedules ADD COLUMN IF NOT EXISTS total_delay_days INTEGER DEFAULT 0;
ALTER TABLE job_department_schedules ADD COLUMN IF NOT EXISTS completion_status VARCHAR(50) DEFAULT 'Pending';

UPDATE job_department_schedules SET current_target_date = approved_target_date WHERE current_target_date IS NULL;
"""

SEEDED_FIELDS = [
    ("panel_type", "Panel Type", "select"),
    ("quantity", "Quantity (Units)", "number"),
    ("complexity", "Project Complexity", "select"),
    ("priority", "Job Priority", "select"),
    ("type_of_industries", "Industry Sector", "select"),
    ("incomer_rating", "Incomer Rating (Amps)", "select"),
    ("enclosure_type", "Enclosure Type", "select"),
    ("revision_required", "Revision Required", "boolean"),
    ("has_customer_specs", "Customer Custom Specs", "boolean"),
    ("is_large_enclosure", "Large Enclosure Dimension", "boolean"),
    ("has_imported_components", "Imported Components", "boolean"),
    ("third_party_inspection", "Third Party Inspection Required", "boolean")
]

SEEDED_OPTIONS = [
    # Panel Type
    ("panel_type", "PLC", "PLC (Programmable Logic Control)", 1),
    ("panel_type", "PCC", "PCC (Power Control Center)", 2),
    ("panel_type", "MCC", "MCC (Motor Control Center)", 3),
    ("panel_type", "APFC", "APFC (Power Factor Correction)", 4),
    ("panel_type", "VFD", "VFD (Variable Frequency Drive)", 5),
    ("panel_type", "FEEDER", "Feeder (Distribution Board)", 6),
    ("panel_type", "SYNCHRONIZING", "Synchronizing & DG Grid", 7),
    ("panel_type", "DESK", "Control Desk / SCADA Console", 8),

    # Complexity
    ("complexity", "low", "Low Complexity (Standard)", 1),
    ("complexity", "medium", "Medium Complexity (Normal)", 2),
    ("complexity", "high", "High Complexity (Multi-tier)", 3),
    ("complexity", "critical", "Critical Complexity (Specialized)", 4),

    # Priority
    ("priority", "urgent", "Urgent (Rush Order)", 1),
    ("priority", "high", "High Priority", 2),
    ("priority", "normal", "Normal / Medium", 3),
    ("priority", "low", "Low Priority", 4),

    # Industry
    ("type_of_industries", "Chemical", "Chemical & Pharma", 1),
    ("type_of_industries", "Textile", "Textile & Spinning", 2),
    ("type_of_industries", "Steel", "Steel & Heavy Metal", 3),
    ("type_of_industries", "Solar", "Solar & Renewable Power", 4),
    ("type_of_industries", "Infrastructure", "Infrastructure & Building", 5),
    ("type_of_industries", "OEM", "OEM Machinery", 6),

    # Incomer Rating
    ("incomer_rating", "100A-400A", "100A - 400A", 1),
    ("incomer_rating", "630A-1600A", "630A - 1600A", 2),
    ("incomer_rating", "2000A-3200A", "2000A - 3200A", 3),
    ("incomer_rating", "4000A+", "4000A & Above", 4),

    # Enclosure Type
    ("enclosure_type", "Indoor", "Indoor IP42/IP52", 1),
    ("enclosure_type", "Outdoor", "Outdoor IP55 Canopy", 2),
    ("enclosure_type", "Stainless_Steel", "Stainless Steel (SS304/SS316)", 3)
]

SEEDED_DELAY_REASONS = [
    ("CLIENT_DRAWING", "Client Drawing / Spec Change", "EXTERNAL", "Customer revised SLD/GA or delayed drawing approval"),
    ("CLIENT_APPROVAL", "Client Approval Pending", "EXTERNAL", "Waiting for client green signal to proceed"),
    ("VENDOR_MATERIAL", "Material / Switchgear Supplier Delay", "EXTERNAL", "Component vendor missed committed delivery date"),
    ("CONSULTANT_QUERY", "Consultant Technical Clarification", "EXTERNAL", "Technical query raised to client consultant"),
    ("MANPOWER_SHORTAGE", "Manpower / Resource Shortage", "INTERNAL", "Draftsman, fitter, or wireman unavailable"),
    ("MACHINE_BREAKDOWN", "Machine / Tooling Unavailable", "INTERNAL", "CNC punch, bender, or busbar tool maintenance"),
    ("INTERNAL_REWORK", "Fabrication or Wiring Rework", "INTERNAL", "Error detected during assembly needing workshop rework"),
    ("QUALITY_ISSUE", "QC / Testing Failure", "INTERNAL", "Insulation/HV test issue or faulty relay wiring"),
    ("PRIORITY_SHIFT", "Emergency High-Priority Job Shift", "INTERNAL", "Team diverted to critical dispatch"),
    ("OTHER", "Other Reason", "INTERNAL", "Miscellaneous with mandatory remarks")
]

async def migrate():
    engine = create_async_engine(DB_URL, echo=False)
    async with engine.begin() as conn:
        print("1. Running SQL DDL Migration...")
        for statement in SQL_MIGRATION.split(";"):
            stmt = statement.strip()
            if stmt:
                await conn.execute(text(stmt))

        print("2. Seeding Job Field Definitions...")
        for f_key, f_lbl, f_type in SEEDED_FIELDS:
            await conn.execute(text("""
                INSERT INTO job_field_definitions (field_key, field_label, field_type, active)
                VALUES (:k, :l, :t, TRUE)
                ON CONFLICT (field_key) DO UPDATE SET field_label = EXCLUDED.field_label, field_type = EXCLUDED.field_type;
            """), {"k": f_key, "l": f_lbl, "t": f_type})

        print("3. Seeding Job Field Options...")
        for f_key, val, lbl, seq in SEEDED_OPTIONS:
            await conn.execute(text("""
                INSERT INTO job_field_options (field_key, value, label, sequence, active)
                VALUES (:k, :v, :l, :s, TRUE)
                ON CONFLICT (field_key, value) DO UPDATE SET label = EXCLUDED.label, sequence = EXCLUDED.sequence;
            """), {"k": f_key, "v": val, "l": lbl, "s": seq})

        print("4. Seeding Standardized Delay Reasons...")
        for code, lbl, d_type, desc in SEEDED_DELAY_REASONS:
            await conn.execute(text("""
                INSERT INTO delay_reasons (code, label, delay_type, description, active)
                VALUES (:c, :l, :t, :d, TRUE)
                ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, delay_type = EXCLUDED.delay_type, description = EXCLUDED.description;
            """), {"c": code, "l": lbl, "t": d_type, "d": desc})

        print("5. Syncing initial conditions from department_formula_rules to relational conditions table...")
        res = await conn.execute(text("SELECT id, department, condition_modifiers FROM department_formula_rules;"))
        rows = res.fetchall()
        for r_id, dept, mods in rows:
            if mods and isinstance(mods, list):
                for idx, mod in enumerate(mods):
                    f_key = mod.get("field", "complexity")
                    op = mod.get("operator", "equals")
                    val = str(mod.get("value", ""))
                    add_days = int(mod.get("additionalDays", 0))
                    lbl = mod.get("label", f"{f_key} {op} {val}")
                    
                    # Check if already exists
                    chk = await conn.execute(text("""
                        SELECT id FROM department_planning_rule_conditions
                        WHERE rule_id = :r_id AND field_key = :f_key AND operator = :op AND value = :val;
                    """), {"r_id": r_id, "f_key": f_key, "op": op, "val": val})
                    if not chk.scalar():
                        await conn.execute(text("""
                            INSERT INTO department_planning_rule_conditions
                            (rule_id, field_key, operator, value, additional_days, condition_label, sequence, active)
                            VALUES (:r_id, :f_key, :op, :val, :days, :lbl, :seq, TRUE);
                        """), {"r_id": r_id, "f_key": f_key, "op": op, "val": val, "days": add_days, "lbl": lbl, "seq": idx + 1})

    await engine.dispose()
    print("Migration and seeding completed successfully!")

if __name__ == '__main__':
    asyncio.run(migrate())
