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

SQL_SCHEMA = """
-- 1. Department Formula Rules Table
CREATE TABLE IF NOT EXISTS department_formula_rules (
    id SERIAL PRIMARY KEY,
    department VARCHAR(50) UNIQUE NOT NULL,
    base_days INTEGER NOT NULL DEFAULT 2,
    condition_modifiers JSONB DEFAULT '[]'::jsonb,
    multiplier NUMERIC(4, 2) DEFAULT 1.0,
    is_active BOOLEAN DEFAULT TRUE,
    description VARCHAR(255) DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Company Working Calendar Table
CREATE TABLE IF NOT EXISTS company_working_calendar (
    id SERIAL PRIMARY KEY,
    calendar_date DATE UNIQUE NOT NULL,
    is_working_day BOOLEAN NOT NULL DEFAULT TRUE,
    holiday_name VARCHAR(100),
    notes VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_cal_date ON company_working_calendar (calendar_date);

-- 3. Job Department Schedules (4-Date Model) Table
CREATE TABLE IF NOT EXISTS job_department_schedules (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    department VARCHAR(50) NOT NULL,
    planned_start_date DATE NOT NULL,
    original_target_date DATE NOT NULL,
    calculated_target_date DATE NOT NULL,
    approved_target_date DATE NOT NULL,
    actual_start_date DATE,
    actual_completion_date DATE,
    planned_duration_days INTEGER DEFAULT 1,
    actual_duration_days INTEGER DEFAULT 0,
    raw_delay_days INTEGER DEFAULT 0,
    approved_extension_days INTEGER DEFAULT 0,
    accountable_delay_days INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Pending',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, department)
);
CREATE INDEX IF NOT EXISTS idx_jds_job_dept ON job_department_schedules (job_id, department);
CREATE INDEX IF NOT EXISTS idx_jds_status ON job_department_schedules (status);

-- 4. Department Extension Requests Table
CREATE TABLE IF NOT EXISTS department_extension_requests (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    schedule_id INTEGER REFERENCES job_department_schedules(id) ON DELETE CASCADE,
    department VARCHAR(50) NOT NULL,
    current_deadline DATE NOT NULL,
    requested_deadline DATE NOT NULL,
    requested_extension_days INTEGER DEFAULT 1,
    reason_category VARCHAR(100) NOT NULL,
    reason_text TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending',
    requested_by_id INTEGER NOT NULL REFERENCES accounts(id),
    requested_by_name VARCHAR(255) NOT NULL,
    reviewed_by_id INTEGER REFERENCES accounts(id),
    reviewed_by_name VARCHAR(255),
    reviewed_at TIMESTAMPTZ,
    review_remarks TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_der_job_id ON department_extension_requests (job_id);
CREATE INDEX IF NOT EXISTS idx_der_status ON department_extension_requests (status);
"""

DEFAULT_RULES = [
    {
        "department": "marketing",
        "base_days": 2,
        "description": "Job ticket verification, client documentation and initial handover",
        "condition_modifiers": [
            {"field": "has_customer_specs", "operator": "equals", "value": True, "additionalDays": 1, "label": "Customer Technical Specs Attached"},
            {"field": "clarification_needed", "operator": "equals", "value": True, "additionalDays": 1, "label": "Commercial Clarification in Progress"}
        ]
    },
    {
        "department": "design",
        "base_days": 3,
        "description": "Electrical schematics, GA drawings, BOM, and wiring schedules",
        "condition_modifiers": [
            {"field": "complexity", "operator": "equals", "value": "high", "additionalDays": 2, "label": "High Engineering Complexity"},
            {"field": "complexity", "operator": "equals", "value": "medium", "additionalDays": 1, "label": "Medium Engineering Complexity"},
            {"field": "panel_type", "operator": "in", "value": ["VFD", "PLC", "Automation", "MCC"], "additionalDays": 2, "label": "VFD/PLC/MCC Panel Automation"},
            {"field": "quantity", "operator": ">", "value": 2, "additionalDays": 1, "label": "Batch Quantity (>2 units)"},
            {"field": "revision_required", "operator": "equals", "value": True, "additionalDays": 2, "label": "Client Major Revision Loop"}
        ]
    },
    {
        "department": "mechanical",
        "base_days": 3,
        "description": "Busbar sizing, enclosure 3D layout, sheet metal cutting and fabrication release",
        "condition_modifiers": [
            {"field": "complexity", "operator": "equals", "value": "high", "additionalDays": 2, "label": "Heavy Mechanical Enclosure"},
            {"field": "panel_type", "operator": "in", "value": ["PCC", "MCC", "Busduct"], "additionalDays": 2, "label": "PCC/MCC Multi-tier Framework"},
            {"field": "is_large_enclosure", "operator": "equals", "value": True, "additionalDays": 1, "label": "Non-standard Enclosure Height/Width"},
            {"field": "ingress_protection", "operator": "in", "value": ["IP55", "IP65"], "additionalDays": 1, "label": "High Ingress Rating (IP55/IP65)"}
        ]
    },
    {
        "department": "purchase",
        "base_days": 5,
        "description": "BOM component sourcing, switchgear POs, copper busbar and raw material receipt",
        "condition_modifiers": [
            {"field": "has_imported_components", "operator": "equals", "value": True, "additionalDays": 4, "label": "Imported VFDs/Switchgear Lead Time"},
            {"field": "custom_enclosure", "operator": "equals", "value": True, "additionalDays": 3, "label": "Custom Sheetmetal Fabrication Lead Time"},
            {"field": "quantity", "operator": ">", "value": 5, "additionalDays": 2, "label": "Large Material Lot (>5 panels)"}
        ]
    },
    {
        "department": "production",
        "base_days": 7,
        "description": "Structure assembly, busbar bending, component mounting, wiring, and terminal fitting",
        "condition_modifiers": [
            {"field": "complexity", "operator": "equals", "value": "high", "additionalDays": 3, "label": "Complex Interlocking & Dense Wiring"},
            {"field": "quantity", "operator": ">", "value": 3, "additionalDays": 3, "label": "Multi-Bay Assembly (>3 units)"},
            {"field": "quantity", "operator": ">", "value": 1, "additionalDays": 1, "label": "Standard Multi-Unit (2-3 panels)"}
        ]
    },
    {
        "department": "qc",
        "base_days": 2,
        "description": "High-voltage testing, insulation resistance, functional loop test, and customer FAT",
        "condition_modifiers": [
            {"field": "third_party_inspection", "operator": "equals", "value": True, "additionalDays": 2, "label": "Third Party / TPI Witness Inspection"},
            {"field": "special_testing", "operator": "equals", "value": True, "additionalDays": 1, "label": "Temperature Rise / High-Pot Witness"}
        ]
    },
    {
        "department": "dispatch",
        "base_days": 1,
        "description": "Export wooden crating, transit insurance, packing list, and gate pass release",
        "condition_modifiers": [
            {"field": "outstation_dispatch", "operator": "equals", "value": True, "additionalDays": 1, "label": "Long-Haul Transit / Ocean Freight Crating"}
        ]
    }
]

async def migrate():
    engine = create_async_engine(DB_URL)
    async with engine.begin() as conn:
        print("1. Creating planning engine database tables...")
        statements = [s.strip() for s in SQL_SCHEMA.split(";") if s.strip()]
        for stmt in statements:
            await conn.execute(text(stmt))
        print("   Tables created successfully.")

        print("2. Seeding default department formula rules...")
        for r in DEFAULT_RULES:
            await conn.execute(
                text("""
                    INSERT INTO department_formula_rules (department, base_days, condition_modifiers, description)
                    VALUES (:dept, :base_days, :mods, :desc)
                    ON CONFLICT (department) DO UPDATE SET
                        base_days = EXCLUDED.base_days,
                        condition_modifiers = EXCLUDED.condition_modifiers,
                        description = EXCLUDED.description,
                        updated_at = CURRENT_TIMESTAMP;
                """),
                {
                    "dept": r["department"],
                    "base_days": r["base_days"],
                    "mods": json.dumps(r["condition_modifiers"]),
                    "desc": r["description"]
                }
            )
            print(f"   - Rule seeded for '{r['department']}' (Base: {r['base_days']} days)")

    await engine.dispose()
    print("\nPlanning engine migration complete!")

if __name__ == "__main__":
    asyncio.run(migrate())
