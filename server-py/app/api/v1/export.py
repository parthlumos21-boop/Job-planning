import io
from typing import TypedDict, Any, cast
from fastapi import APIRouter, Depends, Query, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import openpyxl
from openpyxl.worksheet.worksheet import Worksheet
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models import Job
from app.schemas import UserPayload

router = APIRouter(prefix="/export", tags=["Export"])

class DeptExportConfig(TypedDict):
    key: str
    title: str
    color: str
    headers: list[str]

def get_field_val(fields: dict | None, *candidate_keys) -> str:
    """Helper to safely extract field values matching exact or normalized keys."""
    if not fields or not isinstance(fields, dict):
        return ""
    # 1. Exact match
    for k in candidate_keys:
        if k in fields and fields[k] is not None and str(fields[k]).strip() != "":
            return str(fields[k])
    # 2. Normalized match (lowercase, alphanumeric only)
    norm_map = {
        "".join(ch for ch in str(k).lower() if ch.isalnum()): str(v)
        for k, v in fields.items()
        if v is not None and str(v).strip() != ""
    }
    for k in candidate_keys:
        norm_key = "".join(ch for ch in str(k).lower() if ch.isalnum())
        if norm_key in norm_map:
            return norm_map[norm_key]
    return ""

DEPT_CONFIGS: list[DeptExportConfig] = [
    {
        "key": "marketing",
        "title": "Marketing Register",
        "color": "0B5CAD",
        "headers": [
            "Sr. No.", "Job No.", "Name of Panel", "Qty.", "Type of Industries",
            "Project Name", "Incomer Rating", "Type of Panel", "Responsible Engg. Name",
            "Purchase Order", "Purchase Order Date", "Delivery Period as per P.O.",
            "Delivery Date as per P.O.", "Data Given To Design Dept.", "Delivery Address",
            "Contact Person & Ph. No.", "Transportation", "Packing", "Inspection Call Date"
        ]
    },
    {
        "key": "design",
        "title": "Electrical Design Register",
        "color": "1E8449",
        "headers": [
            "Sr. No.", "Job No.", "Name of Panel", "Qty.", "Client Name",
            "Planned Date", "Drawing Submission Date", "Drawing Submission Engineer Name",
            # Rev R0
            "Rev R0 GA START DATE", "Rev R0 GA END DATE", "Rev R0 GA Engineer",
            "Rev R0 SLD START DATE", "Rev R0 SLD END DATE", "Rev R0 SLD Engineer",
            "Rev R0 BOQ START DATE", "Rev R0 BOQ END DATE", "Rev R0 BOQ Engineer",
            "Rev R0 CONTROL START DATE", "Rev R0 CONTROL END DATE", "Rev R0 CONTROL Engineer",
            "Rev R0 PDF Date", "Rev R0 PDF Engineer", "CLIENT SUBMISSION DATE R0",
            # Rev R1
            "Rev R1 GA START DATE", "Rev R1 GA END DATE", "Rev R1 GA Engineer",
            "Rev R1 SLD START DATE", "Rev R1 SLD END DATE", "Rev R1 SLD Engineer",
            "Rev R1 BOQ START DATE", "Rev R1 BOQ END DATE", "Rev R1 BOQ Engineer",
            "Rev R1 CONTROL START DATE", "Rev R1 CONTROL END DATE", "Rev R1 CONTROL Engineer",
            "Rev R1 PDF Date", "Rev R1 PDF Engineer", "CLIENT SUBMISSION DATE R1",
            # Rev R2
            "Rev R2 GA START DATE", "Rev R2 GA END DATE", "Rev R2 GA Engineer",
            "Rev R2 SLD START DATE", "Rev R2 SLD END DATE", "Rev R2 SLD Engineer",
            "Rev R2 BOQ START DATE", "Rev R2 BOQ END DATE", "Rev R2 BOQ Engineer",
            "Rev R2 CONTROL START DATE", "Rev R2 CONTROL END DATE", "Rev R2 CONTROL Engineer",
            "Rev R2 PDF Date", "Rev R2 PDF Engineer", "CLIENT SUBMISSION DATE R2",
            # Approvals & ERP
            "Final Approved Drawings Received Date", "BOM Released To Purchase",
            "SO No. of ERP System", "BOM Prepare Engnieer Name", "Status"
        ]
    },
    {
        "key": "purchase",
        "title": "Purchase Register",
        "color": "B7950B",
        "headers": [
            "Sr. No.", "Job No.", "Name of Panel", "Qty.", "Client Name",
            "Switchgear PO Number", "Switchgear Date", "Misc PO Number", "Misc Date", "Status"
        ]
    },
    {
        "key": "mechanical",
        "title": "Mechanical Register",
        "color": "7D3C98",
        "headers": [
            "Sr. No.", "Job No.", "Name of Panel", "Qty.", "Client Name",
            "Drafting File Handover Date", "DFT Prepare Engineer", "Release to programme",
            "Programmer Engineer Name", "Programme Start date", "Programme End date",
            "Programming release to", "Puching & Laser Start", "Puching & Laser End",
            "Drawing start Date", "Drawing Complete Date", "Drawign Prepare",
            "Door Details Sent Date", "Door Details Prepare Engineer Name", "Door and Service Plate",
            "Bending start date", "Bending complete", "Name of Fabricator",
            "Welding start date", "Welding complete", "Name of Fabrication Engineer",
            "Release to Painting", "Recived to painting", "Name of painter",
            "Panel Assembly Start", "Panel Assembly Complete", "Name of Assembler",
            "Painting and Asembley Responsible Job engg. Name",
            "Fabrication Release Date", "Swati / Oursource Fabricator Name",
            "Fabrication Prepare Engnieer Name", "EXECUTION FILE DATE",
            "EXECUTION (PDF) PREPARED ENGINEER", "AS BUILT SUBMISSION DATE",
            "AS BUILT PREPARED BY ENGINEER (PRODUCTION)",
            "AS BUILT(PDF) PREPARED BY ENGINEER (DESIGN)",
            "Status"
        ]
    },
    {
        "key": "production",
        "title": "Production & QC Register",
        "color": "C0392B",
        "headers": [
            "Sr. No.", "Job No.", "Name of Panel", "Qty.", "Client Name",
            "Responsible Job Engineer", "Busbar Work Start Date", "Busbar Work Complete Date",
            "Responsible Fitter", "Wiring Start Date", "Wiring Complete Date",
            "Responsible Wireman", "Testing Start Date", "Testing Complete Date",
            "Testing Done By Engineer", "Actual Inspection Date",
            "Compliance / Dispatch Clearance Date", "Status"
        ]
    },
    {
        "key": "dispatch",
        "title": "Dispatch Register",
        "color": "117864",
        "headers": [
            "Sr. No.", "Job No.", "Name of Panel", "Qty.", "Client Name",
            "Packing Start Date", "Packing Complete Date",
            "Name of Responsible Person Checked Before Packing", "Dispatch Date", "Status"
        ]
    }
]

@router.get("", response_description="Export department jobs to Excel")
@router.get("/xlsx", response_description="Export department jobs to Excel")
async def export_excel(
    department: str | None = Query(None),
    selectedOnly: str | None = Query(None),
    ids: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    if department == "marketing":
        user_name = (user.username or user.name or "").strip().lower()
        if user_name != "keval v shah" and (user.role or "").lower() not in ["admin", "superadmin", "executive"]:
            raise HTTPException(
                status_code=403,
                detail="Marketing report export is exclusively accessible to Keval V Shah."
            )

    stmt = select(Job).order_by(Job.external_id.asc())

    # Support filtering by comma-separated ids e.g. ?ids=1 or ?ids=1,2,3
    if ids:
        id_list = []
        for x in ids.split(","):
            try:
                id_list.append(int(x.strip()))
            except ValueError:
                pass
        if id_list:
            stmt = stmt.where(Job.external_id.in_(id_list))

    if selectedOnly == "true":
        stmt = stmt.where(Job.selected.is_(True))

    res = await db.execute(stmt)
    jobs = list(res.scalars().all())

    wb = openpyxl.Workbook()
    # Remove default sheet
    if wb.active is not None:
        wb.remove(wb.active)

    depts_to_export = [d for d in DEPT_CONFIGS if not department or d["key"] == department]
    if not depts_to_export:
        depts_to_export = DEPT_CONFIGS

    thin_border = Border(
        left=Side(style='thin', color='D0D5DD'),
        right=Side(style='thin', color='D0D5DD'),
        top=Side(style='thin', color='D0D5DD'),
        bottom=Side(style='thin', color='D0D5DD')
    )

    for cfg in depts_to_export:
        ws = cast(Worksheet, wb.create_sheet(title=cfg["title"][:31]))
        headers = cfg["headers"]
        fill_color = cfg["color"]
        dept_key = cfg["key"]

        # Write Header
        ws.append(headers)
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
            cell.fill = PatternFill(start_color=fill_color, end_color=fill_color, fill_type="solid")
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

        # Write Data Rows
        for row_idx, j in enumerate(jobs, start=1):
            raw_fields = getattr(j, "fields", None)
            fields_all: dict[str, Any] = dict(raw_fields) if isinstance(raw_fields, dict) else {}
            raw_dept = fields_all.get(dept_key)
            df: dict[str, Any] = dict(raw_dept) if isinstance(raw_dept, dict) else {}
            # Also fallback to full fields in case keys were flattened
            dept_fields: dict[str, Any] = {**fields_all, **df}

            raw_mkt = fields_all.get("marketing")
            mkt_df: dict[str, Any] = dict(raw_mkt) if isinstance(raw_mkt, dict) else {}
            mkt_fields: dict[str, Any] = {**fields_all, **mkt_df}

            raw_status = getattr(j, "department_status", None)
            status_map: dict[str, Any] = dict(raw_status) if isinstance(raw_status, dict) else {}
            status_val = status_map.get(dept_key, "pending")
            status_text = status_val.capitalize() if isinstance(status_val, str) else "Pending"

            if dept_key == "marketing":
                row_data = [
                    row_idx,
                    j.job_no or "",
                    j.panel_name or "",
                    j.qty or "1",
                    j.type_of_industries or get_field_val(mkt_fields, "Type of Industries"),
                    j.project_name or "",
                    j.incomer_rating or get_field_val(mkt_fields, "Incomer Rating"),
                    j.type_of_panel or get_field_val(mkt_fields, "Type of Panel"),
                    j.responsible_engg_name or get_field_val(mkt_fields, "Responsible Engg. Name", "Responsible Engg Name"),
                    j.po_no or get_field_val(mkt_fields, "Purchase Order", "poNo"),
                    j.po_date or get_field_val(mkt_fields, "Purchase Order Date", "poDate"),
                    j.delivery_period or get_field_val(mkt_fields, "Delivery Period as per P.O.", "deliveryPeriod"),
                    j.delivery_date or get_field_val(mkt_fields, "Delivery Date as per P.O.", "deliveryDate"),
                    j.data_given_to_design or get_field_val(mkt_fields, "Data Given To Design Dept.", "Data Given To Design"),
                    j.delivery_address or get_field_val(mkt_fields, "Delivery Address"),
                    j.contact_person or get_field_val(mkt_fields, "Contact Person & Ph. No.", "Contact Number"),
                    get_field_val(dept_fields, "Transportation"),
                    get_field_val(dept_fields, "Packing"),
                    get_field_val(dept_fields, "Inspection Call date", "Inspection Call Date", "Inspection Call")
                ]

            elif dept_key == "design":
                row_data = [
                    row_idx,
                    j.job_no or "",
                    j.panel_name or "",
                    j.qty or "1",
                    j.client_name or "",
                    get_field_val(dept_fields, "Design Planned Date", "Planned Date"),
                    get_field_val(dept_fields, "Drawing Submission Date"),
                    get_field_val(dept_fields, "Drawing Submission Engineer Name"),
                    # Rev R0
                    get_field_val(dept_fields, "Rev R0 GA START DATE", "Rev R0 GA Start Date"),
                    get_field_val(dept_fields, "Rev R0 GA END DATE", "Rev R0 GA End Date"),
                    get_field_val(dept_fields, "Rev R0 GA Name of Peson", "Rev R0 GA Name of Person"),
                    get_field_val(dept_fields, "Rev R0 SLD START DATE", "Rev R0 SLD Start Date"),
                    get_field_val(dept_fields, "Rev R0 SLD END DATE", "Rev R0 SLD End Date"),
                    get_field_val(dept_fields, "Rev R0 SLD Name of Peson", "Rev R0 SLD Name of Person"),
                    get_field_val(dept_fields, "Rev R0 BOQ START DATE", "Rev R0 BOQ Start Date"),
                    get_field_val(dept_fields, "Rev R0 BOQ END DATE", "Rev R0 BOQ End Date"),
                    get_field_val(dept_fields, "Rev R0 BOQ Name of Peson", "Rev R0 BOQ Name of Person"),
                    get_field_val(dept_fields, "Rev R0 CONTROL START DATE", "Rev R0 CONTROL Start Date"),
                    get_field_val(dept_fields, "Rev R0 CONTROL END DATE", "Rev R0 CONTROL End Date"),
                    get_field_val(dept_fields, "Rev R0 CONTROL Name of Peson", "Rev R0 CONTROL Name of Person"),
                    get_field_val(dept_fields, "Rev R0 PDF", "Rev R0 PDF Date"),
                    get_field_val(dept_fields, "Rev R0 PDF Name of Peson", "Rev R0 PDF Name of Person", "Rev R0 PDF Name"),
                    get_field_val(dept_fields, "CLIENT SUBMISSION DATE R0", "Client Submission Date R0"),
                    # Rev R1
                    get_field_val(dept_fields, "Rev R1 GA START DATE", "Rev R1 GA Start Date"),
                    get_field_val(dept_fields, "Rev R1 GA END DATE", "Rev R1 GA End Date"),
                    get_field_val(dept_fields, "Rev R1 GA Name of Peson", "Rev R1 GA Name of Person"),
                    get_field_val(dept_fields, "Rev R1 SLD START DATE", "Rev R1 SLD Start Date"),
                    get_field_val(dept_fields, "Rev R1 SLD END DATE", "Rev R1 SLD End Date"),
                    get_field_val(dept_fields, "Rev R1 SLD Name of Peson", "Rev R1 SLD Name of Person"),
                    get_field_val(dept_fields, "Rev R1 BOQ START DATE", "Rev R1 BOQ Start Date"),
                    get_field_val(dept_fields, "Rev R1 BOQ END DATE", "Rev R1 BOQ End Date"),
                    get_field_val(dept_fields, "Rev R1 BOQ Name of Peson", "Rev R1 BOQ Name of Person"),
                    get_field_val(dept_fields, "Rev R1 CONTROL START DATE", "Rev R1 CONTROL Start Date"),
                    get_field_val(dept_fields, "Rev R1 CONTROL END DATE", "Rev R1 CONTROL End Date"),
                    get_field_val(dept_fields, "Rev R1 CONTROL Name of Peson", "Rev R1 CONTROL Name of Person"),
                    get_field_val(dept_fields, "Rev R1 PDF", "Rev R1 PDF Date"),
                    get_field_val(dept_fields, "Rev R1 PDF Name of Peson", "Rev R1 PDF Name of Person", "Rev R1 PDF Name"),
                    get_field_val(dept_fields, "CLIENT SUBMISSION DATE R1", "Client Submission Date R1"),
                    # Rev R2
                    get_field_val(dept_fields, "Rev R2 GA START DATE", "Rev R2 GA Start Date"),
                    get_field_val(dept_fields, "Rev R2 GA END DATE", "Rev R2 GA End Date"),
                    get_field_val(dept_fields, "Rev R2 GA Name of Peson", "Rev R2 GA Name of Person"),
                    get_field_val(dept_fields, "Rev R2 SLD START DATE", "Rev R2 SLD Start Date"),
                    get_field_val(dept_fields, "Rev R2 SLD END DATE", "Rev R2 SLD End Date"),
                    get_field_val(dept_fields, "Rev R2 SLD Name of Peson", "Rev R2 SLD Name of Person"),
                    get_field_val(dept_fields, "Rev R2 BOQ START DATE", "Rev R2 BOQ Start Date"),
                    get_field_val(dept_fields, "Rev R2 BOQ END DATE", "Rev R2 BOQ End Date"),
                    get_field_val(dept_fields, "Rev R2 BOQ Name of Peson", "Rev R2 BOQ Name of Person"),
                    get_field_val(dept_fields, "Rev R2 CONTROL START DATE", "Rev R2 CONTROL Start Date"),
                    get_field_val(dept_fields, "Rev R2 CONTROL END DATE", "Rev R2 CONTROL End Date"),
                    get_field_val(dept_fields, "Rev R2 CONTROL Name of Peson", "Rev R2 CONTROL Name of Person"),
                    get_field_val(dept_fields, "Rev R2 PDF", "Rev R2 PDF Date"),
                    get_field_val(dept_fields, "Rev R2 PDF Name of Peson", "Rev R2 PDF Name of Person", "Rev R2 PDF Name"),
                    get_field_val(dept_fields, "CLIENT SUBMISSION DATE R2", "Client Submission Date R2"),
                    # Approvals & ERP
                    get_field_val(dept_fields, "Final Approved Drawings Received Date"),
                    get_field_val(dept_fields, "BOM Released To Purchase"),
                    get_field_val(dept_fields, "SO No. of ERP System"),
                    get_field_val(dept_fields, "BOM Prepare Engnieer Name"),
                    status_text
                ]

            elif dept_key == "purchase":
                row_data = [
                    row_idx,
                    j.job_no or "",
                    j.panel_name or "",
                    j.qty or "1",
                    j.client_name or "",
                    get_field_val(dept_fields, "Switchgear PO Number", "Switchgears PO No."),
                    get_field_val(dept_fields, "Switchgear Date", "Date"),
                    get_field_val(dept_fields, "Misc PO Number", "Misc PO No."),
                    get_field_val(dept_fields, "Misc Date", "Date (Misc)"),
                    status_text
                ]

            elif dept_key == "mechanical":
                row_data = [
                    row_idx,
                    j.job_no or "",
                    j.panel_name or "",
                    j.qty or "1",
                    j.client_name or "",
                    get_field_val(dept_fields, "Drafting File Handover Date"),
                    get_field_val(dept_fields, "DFT Prepare Engineer", "DPT Prepare Engineer"),
                    get_field_val(dept_fields, "Release to programme"),
                    get_field_val(dept_fields, "Programmer Engineer Name"),
                    get_field_val(dept_fields, "Programme Start date"),
                    get_field_val(dept_fields, "Programme End date"),
                    get_field_val(dept_fields, "Programming release to"),
                    get_field_val(dept_fields, "Puching & Laser Start"),
                    get_field_val(dept_fields, "Puching & Laser End"),
                    get_field_val(dept_fields, "Drawing start Date"),
                    get_field_val(dept_fields, "Drawing Complete Date"),
                    get_field_val(dept_fields, "Drawign Prepare"),
                    get_field_val(dept_fields, "Door Details Sent Date"),
                    get_field_val(dept_fields, "Door Details Prepare Engineer Name"),
                    get_field_val(dept_fields, "Door and Service Plate"),
                    get_field_val(dept_fields, "Bending start date"),
                    get_field_val(dept_fields, "Bending complete"),
                    get_field_val(dept_fields, "Name of Fabricator"),
                    get_field_val(dept_fields, "Welding start date"),
                    get_field_val(dept_fields, "Welding complete"),
                    get_field_val(dept_fields, "Name of Fabrication Engineer"),
                    get_field_val(dept_fields, "Release to Painting"),
                    get_field_val(dept_fields, "Recived to painting"),
                    get_field_val(dept_fields, "Name of painter"),
                    get_field_val(dept_fields, "Panel Assembly Start"),
                    get_field_val(dept_fields, "Panel Assembly Complete"),
                    get_field_val(dept_fields, "Name of Assembler"),
                    get_field_val(dept_fields, "Painting and Asembley Responsible Job engg. Name"),
                    get_field_val(dept_fields, "Fabrication Release Date"),
                    get_field_val(dept_fields, "Swati / Oursource Fabricator Name"),
                    get_field_val(dept_fields, "Fabrication Prepare Engnieer Name"),
                    get_field_val(dept_fields, "EXECUTION FILE DATE"),
                    get_field_val(dept_fields, "EXECUTION (PDF) PREPARED ENGINEER"),
                    get_field_val(dept_fields, "AS BUILT SUBMISSION DATE"),
                    get_field_val(dept_fields, "AS BUILT PREPARED BY ENGINEER (PRODUCTION)"),
                    get_field_val(dept_fields, "AS BUILT(PDF) PREPARED BY ENGINEER (DESIGN)"),
                    status_text
                ]

            elif dept_key == "production":
                row_data = [
                    row_idx,
                    j.job_no or "",
                    j.panel_name or "",
                    j.qty or "1",
                    j.client_name or "",
                    get_field_val(dept_fields, "Responsible Job Engineer"),
                    get_field_val(dept_fields, "Busbar Work Start Date", "Busbar work start date"),
                    get_field_val(dept_fields, "Busbar Work Complete Date", "Busbar work complete"),
                    get_field_val(dept_fields, "Responsible Fitter", "Name of responsible Fiter"),
                    get_field_val(dept_fields, "Wiring Start Date", "Wiring start Date"),
                    get_field_val(dept_fields, "Wiring Complete Date"),
                    get_field_val(dept_fields, "Responsible Wireman", "Name of ressponsible wireman"),
                    get_field_val(dept_fields, "Testing Start Date", "Testing start date"),
                    get_field_val(dept_fields, "Testing Complete Date", "Testing completedate"),
                    get_field_val(dept_fields, "Testing Done By Engineer", "Testing done by engg."),
                    get_field_val(dept_fields, "Actual Inspection Date", "Actual Inspection date"),
                    get_field_val(dept_fields, "Compliance / Dispatch Clearance Date", "Compliance/ Dispatch clearence Date"),
                    status_text
                ]

            elif dept_key == "dispatch":
                row_data = [
                    row_idx,
                    j.job_no or "",
                    j.panel_name or "",
                    j.qty or "1",
                    j.client_name or "",
                    get_field_val(dept_fields, "Packing Start Date", "Packing start date"),
                    get_field_val(dept_fields, "Packing Complete Date", "Packing complete date"),
                    get_field_val(dept_fields, "Name of Responsible Person Checked Before Packing", "Name of responsible person cheked"),
                    get_field_val(dept_fields, "Dispatch Date", "Dispatch date"),
                    status_text
                ]

            else:
                row_data = [
                    row_idx,
                    j.job_no or "",
                    j.panel_name or "",
                    j.qty or "1",
                    j.client_name or "",
                    *[get_field_val(dept_fields, h) for h in headers[5:-1]],
                    status_text
                ]

            ws.append(row_data)

            # Style data row cells
            for col_idx in range(1, len(row_data) + 1):
                cell = ws.cell(row=row_idx + 1, column=col_idx)
                cell.font = Font(name="Calibri", size=10)
                cell.border = thin_border
                cell.alignment = Alignment(vertical="center")

        # Auto-adjust column widths
        for col in ws.columns:
            if not col:
                continue
            col_idx = col[0].column
            if col_idx is None:
                continue
            max_len = max(len(str(cell.value or "")) for cell in col)
            col_letter = get_column_letter(col_idx)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # Save to memory buffer
    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    filename = f"Job_Register_{department or 'Master'}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

