# Implementation Plan: Regular User Job Detail & pgAdmin 4 Database Persistence

> [!IMPORTANT]
> **Status:** Plan Only — Implementation is on hold until explicitly approved by the user. Do NOT implement until confirmed.

---

## 1. Executive Summary & Core Directives

### A. Critical Boundary & Scope Rule
1. **Regular Department Users ONLY (`role !== 'admin'`)**:
   - The Job Detail page (`/jobs/:id`) strictly follows the **6-section layout** scoped for regular department users.
   - Non-owning departments cannot see foreign department tasks, cannot edit unauthorized tasks, cannot perform cross-department handovers, and cannot see other departments' history.
2. **Admin Part 100% UNTOUCHED (`admin`, `keval v shah`, `executive`)**:
   - Zero changes to the Admin Dashboard, Admin Job Detail page, Admin Control Center View (`/jobs/handover`), Admin reports, Live Monitor, Live Activity, or universal oversight features.
   - Admins retain universal access across all 5 departments and all master audit controls.
3. **ZERO Backend Touching**:
   - Backend `server-py/` code, tables, and existing FastAPI endpoints remain stable and untouched.

---

## 2. PostgreSQL (pgAdmin 4) Database Persistence & Data Pipeline

> [!NOTE]
> Every piece of data displayed on the frontend originates directly from the PostgreSQL database (`job_planning_db`) viewable in **pgAdmin 4**. There is zero hardcoded or mock state.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        POSTGRESQL DATABASE (VIEWABLE IN PGADMIN 4)                     │
│                                                                                        │
│  [ jobs ]                   [ department_tasks ]         [ job_handovers ]            │
│  • job_no, panel_name       • task_name                  • from_department            │
│  • client_name, project     • assigned_user_name         • to_department              │
│  • current_department       • start_date, target_date    • responsible_engg_name      │
│  • current_workflow_status  • progress_percentage        • notes                      │
│  • expected_date            • status, completion_remarks • is_current_pending         │
│                             • actual_effort_hours                                      │
│                                                                                        │
│  [ department_activity ]                                                              │
│  • action, department, updated_by, new_value, created_at                              │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           │ SQL Query / AsyncSession (FastAPI)
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        FASTAPI REST ENDPOINTS (JSON RESPONSE)                          │
│  • GET /api/jobs/{id}                 --> Master job record                            │
│  • GET /api/jobs/{id}/workflow-state  --> Task, Readiness, Handover, and History      │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           │ HTTP Axios Fetch
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      FRONTEND REGULAR USER UI (REACT - 6 SECTIONS)                     │
│  1. Job Information           <-- Fetched directly from `jobs` table                   │
│  2. My Department Stage       <-- Fetched from `jobs.current_department`               │
│  3. My Task & Work Execution  <-- Fetched directly from `department_tasks` table       │
│  4. Readiness Check           <-- Computed from `jobs.fields` & required gates         │
│  5. Next Action               <-- Dynamically unlocked via DB state                    │
│  6. My Department History     <-- Filtered from `department_activity` table            │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           │ User Submits Action (Accept / Handover / Update)
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│               PERSISTENCE WRITE-BACK TO POSTGRESQL (IMMEDIATE IN PGADMIN 4)            │
│  • Accept Job       --> Updates `jobs` status + `department_tasks` + logs activity    │
│  • Update Progress  --> Updates `department_tasks.progress_percentage` in DB          │
│  • Handover Job     --> Inserts into `job_handovers` + updates `jobs.current_department│
│  • Add Note         --> Inserts new row directly into `department_activity`            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Database Table Mapping in pgAdmin 4

| UI Section | PostgreSQL Table (pgAdmin 4) | Key Columns Fetched & Displayed |
| :--- | :--- | :--- |
| **1. Job Information** | `public.jobs` | `job_no`, `panel_name`, `client_name`, `project_name`, `qty`, `expected_date`, `current_workflow_status` |
| **2. My Department Stage** | `public.jobs` | `current_department`, `current_workflow_status` |
| **3. My Task & Execution** | `public.department_tasks` | `task_name`, `assigned_user_name`, `start_date`, `target_date`, `estimated_effort_hours`, `actual_effort_hours`, `progress_percentage`, `status`, `completion_remarks` |
| **4. Readiness Validation** | `public.jobs` | `fields` (JSONB specification checklists, approvals, document completion) |
| **5. Next Primary Action** | `public.jobs` & `public.job_handovers` | `is_current_pending`, `from_department`, `to_department`, `status_at_handover` |
| **6. My Department History** | `public.department_activity` | `action`, `department`, `updated_by`, `new_value`, `created_at` |

---

## 3. Regular User 6-Section Page Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. JOB INFORMATION                                                                     │
│    Job No: JOB-45 • Panel: 37KW VFD Panel • Client: Elite Electricals • Qty: 1 Unit    │
│    Project: Grid Sync Panel • Expected Date: 25-Oct-2026 • Status: [ In Progress ]     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. MY DEPARTMENT WORKFLOW STAGE                                                        │
│    [ ⚡ 2. Electrical Design (Active) ]     <-- (Only own department stage shown)       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. MY TASK & WORK EXECUTION                                            [Direct Assign] │
│    Task: Electrical Schematic & GA Drafting   • Assigned: swatidesign                  │
│    Start: 17-Oct-2026 • Target: 22-Oct-2026 • Effort: 4.0h est / 2.5h act             │
│    Progress: [████████████████░░░░] 80% • Status: In Progress                          │
│    Remarks / Delay Reason: Pending vendor confirmation on ACB sizing                   │
│    Actions: [Update Progress] [Mark Task Completed] (Active ONLY for authorized user)  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. READINESS CHECK & VALIDATION                                                        │
│    Checks Passed: 4/5 Requirements                                                     │
│    ✓ Single Line Diagram (SLD)        ✓ GA Drawing Approval                            │
│    ✓ Bill of Materials (BOM)          ✓ Client Technical Specs                         │
│    ✗ Control Wiring Schematic (Missing - Upload or complete before handover)           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. NEXT ACTION (SINGLE CONTEXTUAL PRIMARY ACTION)                                      │
│    • If In Progress & Ready: [ HANDOVER TO PROCUREMENT ]                               │
│    • If In Progress & Incomplete: "Complete My Task & Readiness Check to Unlock"       │
│    • If Pending Acceptance: [ ACCEPT JOB ] or [ RETURN FOR CLARIFICATION ]             │
│    • If in Another Department: Section 5 is HIDDEN (No locked warning banners)         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 6. MY DEPARTMENT HISTORY & AUDIT LOG                                   [+ Add Note]    │
│    Showing Electrical Design History Only (Other department logs hidden)               │
│    • Oct 17, 11:55 AM: TASK_PROGRESS_UPDATED (80%) by swatidesign                      │
│    • Oct 17, 11:30 AM: JOB_ACCEPTED by swatidesign                                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Section-by-Section Specification (`UserJobDetail.jsx`)

### Section 1: Job Information
- **Database Origin:** Direct DB query from `jobs` table (`job_no`, `panel_name`, `client_name`, `project_name`, `qty`, `expected_date`, `current_workflow_status`).
- **Permissions:** Clean hero banner. `[Edit Specifications]` is rendered **only** for users authorized for the active stage (or Admin).

### Section 2: My Department Workflow Stage
- **Database Origin:** Derived from `jobs.current_department`.
- **Behavior:**
  - For **Regular Users**: Displays **ONLY their own permitted department's stage badge** (`Marketing`, `Electrical Design`, `Mechanical Design`, `Procurement`, or `Production`).
  - For **Admin / Keval**: Displays the complete 5-stage pipeline.

### Section 3: My Task & Work Execution
- **Database Origin:** Direct query from `department_tasks` table.
- **Fields:** Title, Assigned User, Start Date, Target Date, Estimated/Actual Effort, Progress Bar, Status, Completion Remarks, Delay Reason.
- **Permissions:**
  - **Own Department (`isOwnDepartment === true`)**: `[Direct Assign]`, `[Update Progress]`, and `[Mark Task Completed]` are active. Submitting updates writes directly to `department_tasks` table in PostgreSQL.
  - **Other Department (`isOwnDepartment === false`)**: Action buttons hidden; clean view-only badge shown.

### Section 4: Readiness Check & Validation
- **Database Origin:** Computed from `jobs.fields` JSONB data in PostgreSQL.
- **Behavior:** Evaluates mandatory prerequisites. Explains missing items. Prevents handover until all checks pass and task is completed.

### Section 5: Next Action
- **Rule:** Displays **ONLY ONE** primary action based on the database workflow state:
  1. **Job Active in User's Department (`isOwnDepartment === true`)**:
     - `Pending Acceptance`: `[Accept Job]` and `[Return for Clarification]`.
     - `In Progress & Ready`: `[Handover to Next Department]`.
     - `In Progress & Incomplete`: Guidance message explaining what is missing.
  2. **Job Active in Another Department (`isOwnDepartment === false`)**:
     - **Section 5 is COMPLETELY REMOVED from the DOM**. No confusing handover buttons or locked view-only banners.
  3. **For Admin (`isAdmin === true`)**:
     - Universal primary action bar remains active across all departments.

### Section 6: My Department History
- **Database Origin:** Direct DB query from `department_activity` table.
- **Behavior:**
  - **Regular Users (`!isAdmin`)**: Filtered strictly to **own department** rows (`h.department === userPrimaryDept`). Foreign department logs are hidden.
  - **Admin (`isAdmin`)**: Displays all events across all departments.

---

## 5. Verification Checklist

| # | Verification Step | Area | Expected Result in pgAdmin 4 & Frontend |
| :---: | :--- | :--- | :--- |
| **1** | DB Integrity | pgAdmin 4 | All data is stored in `jobs`, `department_tasks`, `job_handovers`, and `department_activity`. |
| **2** | `swatisales` (Marketing) | Job Detail (`/jobs/1` - Design Job) | **Section 5 (Next Action) is COMPLETELY HIDDEN**. No locked warning banners. |
| **3** | `swatidesign` (Design) | Job Detail (`/jobs/1` - Design Job) | **Section 5 is VISIBLE**. Shows single primary action (`[Accept Job]` or `[Handover]`). |
| **4** | `swatidesign` (Design) | Section 3 (Task) | Task fields populated from `department_tasks`. Progress slider updates DB in real time. |
| **5** | `swatidesign` (Design) | Section 6 (History) | **Only Design department logs visible** (fetched from `department_activity`). |
| **6** | `admin` / `keval` | Any Job (`/jobs/1`) | Full master controls, all 5 pipeline stages, all sections, and global history visible. |
| **7** | CLI | `npm run build` | Builds with **0 errors**. |
| **8** | Backend | `server-py/` | **Zero lines modified in backend**. |
