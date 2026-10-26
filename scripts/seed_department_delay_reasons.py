import asyncio
import os
import sys
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DB_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/job_planning_db")

DEPARTMENT_DELAY_REASONS = [
    # Marketing
    ("MKT_CLIENT_SPEC", "Client Drawing / Specification Revision", "EXTERNAL", "marketing", "Customer revised SLD/GA or technical requirements"),
    ("MKT_CLIENT_APPROVAL", "Client Commercial / PO Approval Pending", "EXTERNAL", "marketing", "Waiting for customer commercial clearance or PO amendment"),
    ("MKT_COMMERCIAL_QUERY", "Commercial / Scope Clarification Required", "EXTERNAL", "marketing", "Pricing or scope boundary under client discussion"),
    
    # Electrical Design
    ("DSG_SLD_CHANGE", "SLD & Schematic Engineering Revision", "INTERNAL", "design", "Internal circuitry, relay, or switchgear re-engineering"),
    ("DSG_CLIENT_DRAWING", "Customer Drawing Approval Pending", "EXTERNAL", "design", "Drawings submitted to customer consultant awaiting sign-off"),
    ("DSG_TECH_CLARIFICATION", "Consultant Technical Clarification", "EXTERNAL", "design", "Clarification on control philosophy or technical specs"),
    ("DSG_BOM_RELEASE", "BOM Engineering Release Revision", "INTERNAL", "design", "BOM revisions or long lead part number corrections"),
    
    # Mechanical Design
    ("MCH_FAB_DRAWING", "GA & Fabrication Drawing Revision", "INTERNAL", "mechanical", "Dimensional, busbar clearance, or door detail changes"),
    ("MCH_OUTSOURCE_FAB", "Outsourced Fabricator Capacity Delay", "EXTERNAL", "mechanical", "Fabrication vendor delay in sheet metal delivery"),
    ("MCH_LASER_BENDING", "Laser & Bending CNC File Correction", "INTERNAL", "mechanical", "Nesting or bending program updates"),
    
    # Procurement / Purchase
    ("PUR_LONG_LEAD", "Switchgear / Long Lead Item Vendor Delay", "EXTERNAL", "purchase", "ACB, VCB, or major breakers delayed by OEM supplier"),
    ("PUR_VENDOR_STOCK", "Component Vendor Stock Out", "EXTERNAL", "purchase", "Specialized meters, relays, or terminal blocks stock out"),
    ("PUR_PO_APPROVAL", "Special Component PO Approval Pending", "INTERNAL", "purchase", "Management commercial sign-off for component purchase"),
    
    # Production
    ("PRD_BUSBAR_FIT", "Busbar Fabrication & Assembly Delay", "INTERNAL", "production", "Copper punching, bending, or sleeve fitting complexity"),
    ("PRD_WIRING_ISSUE", "Panel Wiring & Termination Delay", "INTERNAL", "production", "Control wiring or harness routing complexity"),
    ("PRD_MACHINE_DOWN", "CNC Machine / Tooling Maintenance", "INTERNAL", "production", "Tool breakdown or routine shopfloor calibration"),
    ("PRD_MANPOWER", "Fitter / Wireman Workload Constraint", "INTERNAL", "production", "Workshop floor manpower balancing or shift absence"),
    
    # Quality Control (QC)
    ("QC_TESTING_FAIL", "Routine / High Voltage Testing Failure", "INTERNAL", "qc", "Megger, HV, or functional test failed requiring rework"),
    ("QC_CLIENT_INSPECT", "Customer Inspection Call Delay", "EXTERNAL", "qc", "Customer inspection call given, inspector visit scheduled late"),
    ("QC_COMPLIANCE", "Compliance Documentation Pending", "INTERNAL", "qc", "Test reports, calibration certificates, or warranty sheets"),
    
    # Dispatch
    ("DSP_PACKING_MAT", "Crate Wooden / Export Packing Delay", "EXTERNAL", "dispatch", "Special seaworthy or heavy wooden crate availability"),
    ("DSP_TRANSPORT", "Transporter / Vehicle Unavailable", "EXTERNAL", "dispatch", "Logistics partner truck delayed or trailer unavailable"),
    ("DSP_SITE_READY", "Client Site Delivery Clearance Pending", "EXTERNAL", "dispatch", "Customer requested holding dispatch due to site unreadiness"),
    
    # General / Other
    ("GEN_PRIORITY_SHIFT", "Emergency High-Priority Job Shift", "INTERNAL", "ALL", "Management diverted floor resources to critical job"),
    ("GEN_OTHER", "Other Unforeseen Reason", "INTERNAL", "ALL", "Miscellaneous reason with mandatory explanation in remarks")
]

async def seed():
    engine = create_async_engine(DB_URL, echo=False)
    async with engine.begin() as conn:
        print("1. Adding department column to delay_reasons table if needed...")
        await conn.execute(text("ALTER TABLE delay_reasons ADD COLUMN IF NOT EXISTS department VARCHAR(50) DEFAULT 'ALL';"))
        
        print("2. Seeding department-specific standardized delay reasons...")
        for code, lbl, d_type, dept, desc in DEPARTMENT_DELAY_REASONS:
            await conn.execute(text("""
                INSERT INTO delay_reasons (code, label, delay_type, department, description, active)
                VALUES (:c, :l, :dt, :dept, :desc, TRUE)
                ON CONFLICT (code) DO UPDATE 
                SET label = EXCLUDED.label, 
                    delay_type = EXCLUDED.delay_type, 
                    department = EXCLUDED.department,
                    description = EXCLUDED.description,
                    active = TRUE;
            """), {"c": code, "l": lbl, "dt": d_type, "dept": dept, "desc": desc})
        
        print("Done! All department delay reasons successfully updated in PostgreSQL.")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(seed())
