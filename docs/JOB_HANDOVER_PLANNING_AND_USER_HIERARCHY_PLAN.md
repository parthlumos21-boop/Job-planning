# Implementation Plan: Job Handover for Planning, User Hierarchy & Department Workflow

## Executive Summary
This document provides an exhaustive, production-grade architectural and implementation blueprint to extend the existing **Job Planning Management System** with a complete **Job Handover for Planning** module, configurable **User Hierarchy**, role-based workflow permissions, dynamic searchable **Responsible Engineer** assignment, **Planning Owner** lifecycle management, interactive **Handover Checklist**, acceptance/return loop, real-time notifications, and chronological audit trails.

> **Strict Directive Followed:** **DO NOT IMPLEMENT CODE.** This document serves as the implementation plan for your review and approval before any code modifications are made.

---

## 1. Inspection of Existing Application Architecture & Impact Assessment

An inspection of the existing codebase (`server-py`, `client`, and PostgreSQL schema) revealed the following architecture:

### 1.1 Job Creation Page & Existing Fields
- **Route:** `http://localhost:5174/jobs/new` rendered by `NewJobForm.jsx`.
- **Core Job State:** `jobNo`, `panelName`, `clientName`, `projectName`, `typeOfIndustries`, `qty`, `incomerRating`, `typeOfPanel`, `poNo`, `poDate`, `deliveryPeriod`, `deliveryDate`, `dataGivenToDesign`, `deliveryAddress`, `contactPerson`, `responsibleEnggName`.
- **Department Fields:** Stored in PostgreSQL as a JSONB column `jobs.fields` with department keys (`marketing`, `design`, `purchase`, `mechanical`, `production`, `dispatch`).
- **Current Responsible Engineer Dropdown:** Located on line 600 of `NewJobForm.jsx`. Currently reads from a static string array (`DEPARTMENT_USER_OPTIONS.marketing`) instead of querying the live database user master.

### 1.2 User Master & Department Mapping
- **Database Tables:**
  - `public.users`: Contains `id`, `external_id`, `name`, `departments` (`VARCHAR[]`), `is_active` (`BOOLEAN`).
  - `public.accounts`: Contains `id`, `username`, `hashed_password`, `role` (`VARCHAR(50)`), `departments` (`VARCHAR[]`).
- **User API:** `GET /api/users?department={dept}` in `server-py/app/api/v1/users.py` returns all active users filtered by department.

### 1.3 Database Models & Relationships
- **`public.jobs` (`server-py/app/models/__init__.py`):**
  - Columns: `id`, `external_id`, `job_no`, `panel_name`, `client_name`, `responsible_engg_name`, `assigned_engineer_id`, `current_worker_id`, `previous_worker_id`, `next_worker_id`, `lifecycle_status`, `fields` (JSONB), `engineers` (JSONB), `department_status` (JSONB).
- **`public.job_handovers`:**
  - Exists with columns: `id`, `job_id`, `from_worker_id`, `from_worker_position`, `to_worker_id`, `to_worker_position`, `handover_at`, `reason`, `notes`, `work_completed_summary`, `performed_by`.
- **`public.department_activities`:**
  - Audit logging table with `job_id`, `department`, `action`, `old_value`, `new_value`, `updated_by`, `created_at`.

### 1.4 Notification & Broadcasting Infrastructure
- **Server-Sent Events (SSE):** Already active via `MonitoringBroadcaster` in `server-py/app/core/events.py`.
- **Client Toast System:** Handled in `KevalDashboard.jsx` listening to SSE stream `/api/job-monitoring/stream`.

### 1.5 Concise Impact Assessment
- **Zero Breaking Changes:** We will extend the existing `jobs` table with non-breaking nullable columns (`handover_status`, `planning_owner_id`, `planning_owner_name`, `handover_checklist`, `handover_return_reason`, `handover_submitted_at`, `handover_accepted_at`).
- **Historical Data Preservation:** Existing jobs retain their string-based `responsible_engg_name` while new/edited jobs link both `responsible_engg_name` (display) and `assigned_engineer_id` (foreign key).
- **Reusing Handover Table:** We will extend `job_handovers` with a `handover_type` column (`'PLANNING'` vs `'SHIFT'`) so historical shift logs and planning handover logs co-exist cleanly.

---

## 2. User Hierarchy & Permission Matrix

The application's role and department model is designed to be **fully collaborative, flexible, and non-restrictive**, allowing all departments and team members to create jobs, assign engineers, submit handovers, review/accept/return handovers, and complete planning stages without artificial barriers:

| Role / Department | Accounts | Create Job | Assign / Change Resp. Engg | Submit Handover | Accept / Return Handover | Assign Planning Owner | Complete Planning Stage |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Admin** | `keval v shah`, `admin`, `kevalvshah`, `admin2` | ✅ | ✅ (Any Engineer) | ✅ (Any Stage) | ✅ (With audit log) | ✅ | ✅ |
| **Marketing** | `swatisales`, `swatisales2`, `mktadmin` | ✅ (**Allowed**) | ✅ (**Allowed / Changeable**) | ✅ (**Allowed**) | ✅ (**Allowed**) | ✅ (**Allowed**) | ✅ (**Allowed**) |
| **Planning** | `hasmukh`, `krunal patel`, etc. | ✅ (**Allowed**) | ✅ (**Allowed / Changeable**) | ✅ (**Allowed**) | ✅ (**Allowed**) | ✅ (**Allowed**) | ✅ (**Allowed**) |
| **Design — Electrical** | `swatidesign`, `swatidesign2`, `designadmin` | ✅ (**Allowed**) | ✅ (**Allowed / Changeable**) | ✅ (**Allowed**) | ✅ (**Allowed**) | ✅ (**Allowed**) | ✅ (**Allowed**) |
| **Design — Mechanical** | `mechdesign1`, `mechdesign2`, `machinedesign` | ✅ (**Allowed**) | ✅ (**Allowed / Changeable**) | ✅ (**Allowed**) | ✅ (**Allowed**) | ✅ (**Allowed**) | ✅ (**Allowed**) |
| **Procurement** | `swatipurchase`, `swatipurchase2`, `purchaseadmin` | ✅ (**Allowed**) | ✅ (**Allowed / Changeable**) | ✅ (**Allowed**) | ✅ (**Allowed**) | ✅ (**Allowed**) | ✅ (**Allowed**) |
| **Production / QC / Dispatch** | `swatiproduction`, `swatiqc`, `prodadmin` | ✅ (**Allowed**) | ✅ (**Allowed / Changeable**) | ✅ (**Allowed**) | ✅ (**Allowed**) | ✅ (**Allowed**) | ✅ (**Allowed**) |

> [!IMPORTANT]
> **Key User Requirement Alignment:**
> 1. **Universal Access for All Departments:** Every action—creating jobs, assigning responsible engineers, submitting handovers, accepting/returning handovers, assigning planning owners, and completing planning stages—is **unlocked and permitted for all departments and accounts**.
> 2. **Accountability via Audit Trail:** While actions are open to all departments, the system records **who performed each action** (`user_id`, `name`, `timestamp`, and `remarks`) in the audit log so history and accountability are 100% transparent.
> 3. **Mandatory Return Reason Preserved:** If any user returns a handover for correction, entering an explanatory reason (min 10 characters) remains mandatory so the recipient knows exactly what needs to be fixed.
> 4. **Fully Changeable & Configurable (Zero Hardcoded Blocks):** Permissions are governed by a central, changeable configuration module (`WORKFLOW_CONFIG`). No rigid `if (role !== 'planning')` checks are hardcoded.

---

### 2.1 Department Account Mapping Matrix

The system dynamically resolves permissions and department contexts using the existing PostgreSQL accounts:

- **Marketing:** `swatisales`, `swatisales2`, `mktadmin`
- **Design — Electrical:** `swatidesign`, `swatidesign2`, `designadmin`
- **Design — Mechanical:** `mechdesign1`, `mechdesign2`, `machinedesign`
- **Procurement (Purchase):** `swatipurchase`, `swatipurchase2`, `purchaseadmin`
- **Production & QC & Dispatch:** `swatiproduction`, `swatiqc`, `prodadmin`
- **Administration & Executive:** `keval v shah`, `admin`, `keval`, `kevalvshah`, `admin2`

### 2.2 Configurable Workflow Policy Engine
To guarantee the system is **changeable** and never locked into hardcoded rules:
- Workflow capabilities are abstracted into a central configuration object:
  ```javascript
  // client/src/config/workflowConfig.js
  export const WORKFLOW_CONFIG = {
    allowAllCreateJob: true,              // All departments can create jobs
    allowAllAssignResponsibleEngg: true,  // All departments can assign/reassign Responsible Engg
    allowAllSubmitHandover: true,         // All departments can submit handovers
    allowAllAcceptReturnHandover: true,   // All departments can review, accept, or return handovers
    allowAllAssignPlanningOwner: true,    // All departments can assign/reassign Planning Owner
    allowAllCompletePlanningStage: true,  // All departments can finalize planning milestones and forward
    requireReturnReason: true,            // Mandatory reason when returning handovers (ensures quality & context)
  };
  ```
- This architecture enables instant adjustments without rewriting component code or backend endpoints.

## 3. Dynamic Searchable Responsible Engineer Dropdown (`/jobs/new` & All Forms)

### 3.1 Deficiencies in Current Implementation
- Line 603 of `NewJobForm.jsx` and `departmentUserOptions.js` rely on static, hardcoded Javascript arrays (`RAW_DEPARTMENT_USER_OPTIONS.marketing`).
- Currently, non-marketing users see a read-only input or restricted dropdown, preventing authorized team members from updating the Responsible Engineer.
- Adding a new employee or renaming an engineer currently requires modifying code in `departmentUserOptions.js`.

### 3.2 Dynamic, Non-Hardcoded Architecture
1. **Dynamic Database Loading via API:**
   - Dropdown options are loaded in real-time from `GET /api/users` (which queries PostgreSQL `public.users` where `is_active = true` and `public.accounts`).
   - If a new engineer is hired or added in PostgreSQL, they **immediately appear** in the dropdown without altering a single line of frontend code.
   - If an engineer leaves or is marked inactive (`is_active = false`), they are automatically filtered out.
2. **Open & Changeable Across All Departments:**
   - On `/jobs/new`, `/jobs/:id/edit`, and department update forms, the Responsible Engineer dropdown is **editable and changeable by ALL departments and roles**.
   - If Design, Planning, or Production needs to update or assign the Responsible Engineer for a job, the dropdown remains interactive and enabled.
3. **Change Tracking & Audit History:**
   - When any user changes the Responsible Engineer, the system records:
     - Old Engineer name & ID
     - New Engineer name & ID
     - User who made the change (`performed_by`)
     - Timestamp
     - Reason / Remarks (optional or logged in `department_activities`)
4. **Search Experience (`SearchableUserSelect`):**
   - Fast, searchable typeahead filtering by engineer name.
   - Displays real names (e.g. `"Jay Pandya"`).
   - Internally binds both:
     - `core.responsibleEnggName = user.name` (for legacy reports and sheet registers).
     - `core.assignedEngineerId = user.id` (stable PostgreSQL relational key).
5. **Robust Fallback for Historical Jobs:**
   - If an older job has a `responsibleEnggName` that is no longer in the active user list, the dropdown smoothly displays the existing string without blanking out or throwing an error.

---

## 4. Planning Owner Module

### Purpose
The **Planning Owner** is the designated Planning department lead accountable for resource allocation, scheduling, and milestone validation. They are distinct from the Marketing **Responsible Engineer**.

### Implementation Specification
- **Database Columns in `jobs`:**
  - `planning_owner_id` (`INTEGER NULL REFERENCES users(id)`).
  - `planning_owner_name` (`VARCHAR(255) NULL`).
- **Planning Owner Dropdown:**
  - Populated via `GET /api/users?department=planning`.
  - Accessible only to Planning users and Admin.
  - Supports reassignment with mandatory audit entry (`DepartmentActivity`).
  - Does NOT overwrite the `responsible_engg_name`.
- **Visibility:**
  - Displayed prominently in **Job Details** (`/jobs/:id`), **Planning Handover Inbox** (`/jobs/handover/planning`), and **Keval Dashboard**.

---

## 5. Job Handover for Planning Screen (`/jobs/handover/planning`)

We will introduce a dedicated, high-productivity screen accessible via `/jobs/handover/planning` and linked in the sidebar.

### 5.1 Sub-Views / Tabs in Handover Inbox
1. **Pending Review:** Newly submitted handovers awaiting Planning evaluation.
2. **Accepted:** Handovers accepted by Planning, awaiting Planning Owner assignment or scheduling.
3. **Returned:** Incomplete handovers returned to Marketing with reasons.
4. **Planning In Progress:** Jobs currently being scheduled, BOM finalized, drawing planned dates set.
5. **Completed:** Jobs where Planning has finished its stage and forwarded to Design/Engineering.
6. **Overdue:** Jobs exceeding planning due dates.

### 5.2 Handover Details & Interactive Review Modal
Clicking **[Review]** opens the full Handover Review Drawer/Modal displaying:
- **Core Identifiers:** Job No., Panel Name, Project Name, Customer Name, Incomer Rating, Panel Type, Qty.
- **Commercial & Delivery:** PO Number, PO Date, Delivery Period, Delivery Date, Delivery Address.
- **Responsible Engineer:** Displayed name with verified user badge.
- **Planning Owner:** Dropdown to assign or reassign Planning lead.
- **Handover Checklist Review:** Real-time checklist status.
- **Attachments:** PO PDF, Technical Specification documents, client single line diagrams.
- **Action Buttons:**
  - **[Accept Handover]** (Green): Marks as Accepted, records Planning Owner, sets status to `Accepted`.
  - **[Return for Correction]** (Rose): Requires mandatory return reason modal, sets status to `Returned for Correction`, sends notification to Marketing.
  - **[Forward to Design]** (Blue): Active once Planning work is complete, sets target department to `design`.

---

## 6. Handover Checklist Engine

The Handover Checklist ensures that no Job enters the engineering and manufacturing lifecycle without verified inputs.

### 6.1 Standard Checklist Items
1. ✅ **Job Core Details Verified:** Job No., Panel Name, Qty., and Customer confirmed.
2. ✅ **Customer Purchase Order Verified:** Valid PO number and PO date entered.
3. ✅ **Delivery & Site Conditions Specified:** Delivery date, site address, and transport requirements set.
4. ✅ **Responsible Engineer Assigned:** Active engineer selected from user master.
5. 📄 **Customer PO / Specifications Attached:** Document uploaded or reference documented.
6. 📝 **Planning Instructions & Remarks Provided:** Handover remarks or special client requirements documented.

### 6.2 Validation Rules
- **Before Marketing can click "Submit to Planning":**
  - Items 1, 2, 3, and 4 are **MANDATORY**.
  - If mandatory items are missing, the submit button is disabled with an explanatory banner: *"Cannot submit: Please assign a Responsible Engineer and verify PO details."*
- **Checklist State Persistence:**
  - Stored as JSONB in `jobs.handover_checklist` (e.g. `{"core_verified": true, "po_verified": true, ...}`).

---

## 7. State Machine Lifecycle & Controlled Transitions

### 7.1 Transition Rules & Guardrails
1. **Draft → Submitted for Planning:** Only Marketing or Admin. Requires complete mandatory checklist.
2. **Pending Review → Accepted:** Only Planning or Admin. Assigns Planning Owner.
3. **Pending Review → Returned for Correction:** Only Planning or Admin. Requires `return_reason` (min 10 characters).
4. **Returned → Submitted for Planning:** Only Marketing or Admin. Same job record is preserved (NO duplicate jobs created).
5. **Planning In Progress → Planning Completed:** Validates that planning milestones (BOM planned dates, drawing planned dates) are entered.
6. **Planning Completed → Design:** Transitions `target_department` to `design`, making it visible to Electrical & Mechanical design engineers.

---

## 8. Database Architecture & Schema Migration Plan

We will execute non-breaking alterations on the PostgreSQL database (`job_planning_db`):

### 8.1 Alterations to `public.jobs`
```sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_status VARCHAR(50) DEFAULT 'Draft';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS planning_owner_id INTEGER REFERENCES users(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS planning_owner_name VARCHAR(255);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_submitted_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_accepted_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_return_reason TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_checklist JSONB DEFAULT '{}'::jsonb;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_jobs_handover_status ON jobs(handover_status);
CREATE INDEX IF NOT EXISTS idx_jobs_planning_owner ON jobs(planning_owner_id);
```

### 8.2 Enhancements to `public.job_handovers`
Add columns to distinguish between Shift Handovers and Department Planning Handovers:
```sql
ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS handover_type VARCHAR(50) DEFAULT 'SHIFT';
ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS from_department VARCHAR(100);
ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS to_department VARCHAR(100);
ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS checklist_snapshot JSONB;
```

---

## 9. Handover History & Chronological Audit Trail

Every state transition writes an immutable audit record:
- In `job_handovers`: Full payload of the handover, from user, to user, reason, notes, checklist snapshot, timestamp.
- In `department_activities`: Lightweight event log (`action = 'HANDOVER_ACCEPTED'`, `old_value`, `new_value`, `updated_by`).

---

## 10. Real-Time SSE Notifications & Toast Alerts

Leveraging the existing `MonitoringBroadcaster` in `server-py/app/core/events.py`:
- **When Marketing Submits:** Broadcast `HANDOVER_SUBMITTED` -> Planning users receive a notification: *"Job #RA101 submitted for Planning review"*.
- **When Planning Accepts:** Broadcast `HANDOVER_ACCEPTED` -> Marketing and Responsible Engineer receive notification: *"Job #RA101 accepted by Planning"*.
- **When Planning Returns:** Broadcast `HANDOVER_RETURNED` -> Marketing receives high-priority toast: *"Job #RA101 returned: [Reason]"*.
- **When Planning Owner Assigned:** Broadcast `PLANNING_OWNER_ASSIGNED` -> Assigned Planning user notified.

---

## 11. Document & File Attachment Handling

To satisfy purchase order and drawing attachment requirements:
1. **Server Storage:**
   - Store files under `d:\Job planning update\server-py\uploads\jobs\{job_id}\`.
2. **Endpoints in `server-py`:**
   - `POST /api/jobs/{id}/attachments` (Multi-part upload supporting PDF, PNG, JPG, XLSX).
   - `GET /api/jobs/{id}/attachments` (List attached files with metadata).
   - `DELETE /api/jobs/{id}/attachments/{file_id}` (Admin and uploader only).
3. **Database Reference:**
   - File metadata stored in `jobs.attachments` JSONB array: `[{"id": "uuid", "filename": "PO_4500.pdf", "size": 102450, "uploadedBy": "Jay Pandya", "uploadedAt": "2026-10-14T..."}]`.

---

## 12. Frontend Screens & Files to be Created/Modified

### Files to Modify:
1. `client/src/jobs/NewJobForm.jsx`:
   - Enable Job Creation for ALL departments (remove the banner blocking non-marketing users from creating new jobs).
   - Replace static Responsible Engineer select with searchable dynamic dropdown fetching from `/api/users`.
   - Ensure Responsible Engineer is interactive and changeable across all departments.
   - Add Handover Checklist accordion before submission.
   - Add "Submit for Planning Handover" action button alongside "Save Draft" for all authorized users.
2. `client/src/layouts/Layout.jsx` & `client/src/components/Sidebar.jsx`:
   - Add navigation item for **Handover for Planning** (`/jobs/handover/planning`) with badge indicator for pending count.
3. `client/src/App.jsx`:
   - Register route `/jobs/handover/planning`.
4. `client/src/jobs/JobDetail.jsx`:
   - Display Handover Status badge, Planning Owner name, and chronological Handover History timeline.

### New Files to Create:
1. `client/src/jobs/SearchableUserSelect.jsx`: Reusable searchable user dropdown component with loading, empty, and active states.
2. `client/src/jobs/PlanningHandoverInbox.jsx`: The dedicated Planning Handover inbox with tabs, filters, and review modal.
3. `client/src/jobs/HandoverChecklistModal.jsx`: Checklist verification and return reason modal.
4. `server-py/app/api/v1/job_handover.py`: Dedicated API router handling `/api/jobs/{id}/handover/submit`, `/accept`, `/return`, `/planning-owner`.
