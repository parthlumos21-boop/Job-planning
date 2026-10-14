# JOB PLANNING CONTROL CENTER – COMPLETE IMPLEMENTATION PLAN

## Executive Summary
This document provides an exhaustive, production-grade architectural and implementation blueprint to upgrade and transform the existing Job Handover area into a professional, industrial-grade **Job Planning Control Center**.

> [!IMPORTANT]
> **Strict Directive Followed:** **DO NOT IMPLEMENT CODE.** This document serves as the comprehensive implementation plan for your review and approval before any code modifications are made.

The purpose of this module is to control and trace the complete transition of a job:
$$\text{Responsible Engineer} \longrightarrow \text{Department Handover} \longrightarrow \text{Verification} \longrightarrow \text{Planning Readiness} \longrightarrow \text{Planning Owner Assignment} \longrightarrow \text{Planning Active} \longrightarrow \text{Completion} \longrightarrow \text{Release to Next Department}$$

The system answers four foundational questions for every action:
$$\mathbf{WHO \longrightarrow WHAT \longrightarrow WHY \longrightarrow WHEN}$$

### Core Plan Integrity & Revisions Incorporated:
1. **Formal Planning Owner Assignment Action**:
   - Replaced silent dropdown selection with a dedicated, formal **Assign Planning Owner** dialog.
   - Assignment Reason is **strictly mandatory** (disallowing silent `Assign → Done`).
   - Dual-tier structured reasoning: **Reason Category** dropdown + **Additional Explanation** free-text.
2. **Controlled Reassignment Workflow**:
   - Dedicated **Reassign Planning Owner** modal displaying `Current Owner → New Owner`.
   - Mandatory Reassignment Reason + Optional Additional Note.
   - Automatic chronological timeline recording: *"Planning Owner changed from [Previous] to [New]. Reason: [Reason]"*.
3. **Previously Approved Rules Maintained As-Is**:
   - The word **"Station"** remains completely removed.
   - **Stage Durations & Time Tracking**: Strictly restricted to **Admins and `keval v shah` only** (hidden for department users).
   - **Core Job Details**: Read-only protection for non-marketing users.
   - **Department Isolation**: Users edit only their own department section.
   - **Navigation Order**: `Dashboard` $\to$ `New Job` $\to$ `My Jobs` $\to$ `Planning Control Center` $\to$ `View Jobs` (with `Live Monitor` for Admins only).

---

## 1. Codebase Inspection & Impact Assessment

An inspection of the active codebase ([`server-py`](file:///d:/Job%20planning%20update/server-py), [`client`](file:///d:/Job%20planning%20update/client), and PostgreSQL database) revealed:

### 1.1 Architecture & Database Reality
- **Database Engine**: PostgreSQL with `asyncpg` and SQLAlchemy 2.0 (Active Backend: [`server-py`](file:///d:/Job%20planning%20update/server-py)).
- **Legacy Compatibility**: The repository contains legacy Node.js/MongoDB directories (`backend/`, `server/`, `mongo_backup/`), but the live production application runs on FastAPI + PostgreSQL. All data persistence will safely extend PostgreSQL without destructive migrations.
- **Existing Tables to Extend**:
  - `jobs`: Currently holds `job_no`, `panel_name`, `client_name`, `responsible_engg_name`, `assigned_engineer_id`, `handover_status`, `planning_owner_id`, `planning_owner_name`, `handover_checklist`, `handover_return_reason`, `handover_submitted_at`, `handover_accepted_at`, `attachments`.
  - `job_handovers`: Currently logs `handover_type`, `from_department`, `to_department`, `reason`, `notes`, `work_completed_summary`, `checklist_snapshot`, `performed_by`.
  - `department_activities`: Immutable audit table with `job_id`, `department`, `action`, `old_value`, `new_value`, `updated_by`, `created_at`.
- **Existing Frontend Route**:
  - Route: `/jobs/handover` and `/jobs/handover/planning` in [`client/src/App.jsx`](file:///d:/Job%20planning%20update/client/src/App.jsx).
  - Page: [`client/src/jobs/PlanningHandoverInbox.jsx`](file:///d:/Job%20planning%20update/client/src/jobs/PlanningHandoverInbox.jsx).
  - Modal: [`client/src/jobs/DepartmentHandoverModal.jsx`](file:///d:/Job%20planning%20update/client/src/jobs/DepartmentHandoverModal.jsx).

### 1.2 Zero-Regression Guarantee
- No existing columns or records will be deleted or renamed.
- All existing Job Planning fields, customer details, panel specifications, and role-based permissions remain 100% functional.
- The new stages will map smoothly to existing historical data using backwards-compatible fallback logic.

---

## 2. Module Identity & Naming Standards

* **Replaces**: "Job Handover" *(The word "Station" is completely removed)*.
* **New Module Name**: **Job Planning Control Center**
* **Subtitle**: *"Control the transition of jobs into planning — verify inputs, establish ownership, resolve missing information, and release completed planning work."*
* **Design Language**: Industrial engineering & production planning management style (clean slate/indigo palette, high data density, readable monospace numbers, clear status tags, zero distracting decorative animations).
* **Navigation Entry**: Sidebar item updated to **"Planning Control Center"** (maintaining `/jobs/handover` route path for zero broken bookmarks).

---

## 3. Core Lifecycle Stages & Status Groups

The system introduces 7 formal lifecycle stages replacing generic CRM statuses:

```
  [ INCOMING ] 
       │
       ▼
 [ VERIFICATION ] ◄─────────────────────────┐
       │                                    │
       ├───► [ NEEDS CLARIFICATION ]        │ (Correction Submitted)
       │            │                       │
       │            └──► [ CORRECTION ] ────┘
       ▼
[ PLANNING READY ]
       │
       ▼
[ PLANNING ASSIGNED ]
       │
       ▼
 [ PLANNING ACTIVE ]
       │
       ▼
   [ RELEASED ] (To Next Department: Production, Mechanical, Purchase, etc.)
```

### Stage Definitions & Backwards-Compatible Status Mapping:
1. **Incoming (`INCOMING`)**: Job submitted from previous department (e.g., Marketing); pending initial review.
2. **Verification (`VERIFICATION`)**: Information and checklist requirements are actively being checked.
3. **Needs Clarification (`NEEDS_CLARIFICATION`)**: Required information or drawings missing; returned with mandatory reason.
4. **Planning Ready (`PLANNING_READY`)**: All mandatory checklist items verified (e.g. 5/5 verified); ready for owner assignment.
5. **Planning Assigned (`PLANNING_ASSIGNED`)**: Planning Owner formally assigned with mandatory assignment reason.
6. **Planning Active (`PLANNING_ACTIVE`)**: Planning lead has clicked "Start Planning"; duration timer running.
7. **Released (`RELEASED`)**: Planning package complete; released to next department with mandatory forwarding reason.

---

## 4. User Hierarchy & Role Permissions

The existing authentication and role system will be utilized with clear departmental responsibilities:

```
ADMIN / SYSTEM OWNER (keval v shah, admin)
        ↓
DEPARTMENT ADMIN (designadmin, purchaseadmin, prodadmin, mktadmin)
        ↓
DEPARTMENT RESPONSIBLE USERS (Engineers assigned to departments)
        ↓
JOB RESPONSIBLE ENGINEER (Specific engineer named on the job)
        ↓
PLANNING OWNER (Planning lead assigned to execute the planning milestone)
        ↓
NEXT DEPARTMENT OWNER (Assigned recipient in Production, Design, etc.)
```

### Complete Permission & Visibility Matrix:

| Role / Department | User Accounts | Core Job Details | Own Section | Live Monitor (`/live-monitor`) | Stage Durations & Time Tracking | Control Center Queue |
|:---|:---|:---:|:---:|:---:|:---:|:---:|
| **Admin / Keval V Shah** | `admin`, `keval v shah`, `admin2`, `keval` | ✅ Full Edit | ✅ Full Edit | 🟢 **Visible & Accessible** | 🟢 **Full Visibility (All Stage Durations & Bottlenecks)** | Global Queue (All Jobs) |
| **Department Admin** | `designadmin`, `purchaseadmin`, `prodadmin` | ❌ Read-Only | ✅ Full Edit | 🔴 Hidden & Blocked | 🔴 **Hidden (Action log only, no durations)** | Department Queue |
| **Marketing** | `swatisales`, `swatisales2`, `mktadmin` | ✅ Full Edit | ✅ Full Edit | 🔴 Hidden & Blocked | 🔴 **Hidden (Action log only, no durations)** | Department Queue |
| **Design — Electrical** | `swatidesign`, `swatidesign2` | ❌ Read-Only | ✅ Full Edit | 🔴 Hidden & Blocked | 🔴 **Hidden (Action log only, no durations)** | Department Queue |
| **Procurement** | `swatipurchase`, `swatipurchase2` | ❌ Read-Only | ✅ Full Edit | 🔴 Hidden & Blocked | 🔴 **Hidden (Action log only, no durations)** | Department Queue |
| **Production & QC** | `swatiproduction`, `swatiqc` | ❌ Read-Only | ✅ Full Edit | 🔴 Hidden & Blocked | 🔴 **Hidden (Action log only, no durations)** | Department Queue |
| **Design — Mechanical** | `mechdesign1`, `mechdesign2` | ❌ Read-Only | ✅ Full Edit | 🔴 Hidden & Blocked | 🔴 **Hidden (Action log only, no durations)** | Department Queue |

---

## 5. Control Center UI Architecture (`http://localhost:5174/jobs/handover`)

### 5.1 Top Header & KPI Summary Cards
```
+--------------------------------------------------------------------------------------------------------------------+
| 🏭 Job Planning Control Center                                                             [● Live Real-Time Sync] |
| Control the transition of jobs into planning — verify inputs, establish ownership, resolve missing info & release.  |
+--------------------------------------------------------------------------------------------------------------------+
| [ Incoming: 8 ] [ Verification: 3 ] [ Planning Ready: 5 ] [ Assigned: 7 ] [ Active: 12 ] [ Clarification: 2 ]   |
| [ Released Today: 6 ]                                                                                              |
+--------------------------------------------------------------------------------------------------------------------+
| 🎯 MY ACTIONS: [ Waiting for Me (2) ] [ Assigned to Me (5) ] [ Returned to Me (1) ] [ Due Today (3) ] [ Overdue (1) ]|
+--------------------------------------------------------------------------------------------------------------------+
```

### 5.2 Multi-Dimensional Search & Filtering Toolbar
- **Full-Text Search**: Matches Job No, Panel Name, Project Name, Customer, Responsible Engineer, Planning Owner.
- **Stage Filter**: All, Incoming, Verification, Planning Ready, Planning Assigned, Planning Active, Needs Clarification, Released.
- **Department Filter**: Marketing, Design - Electrical, Design - Mechanical, Procurement, Production & QC.
- **Responsible Engineer Filter**: Dynamic list from active engineers.
- **Planning Owner Filter**: Dynamic list from eligible Planning users.
- **Priority Filter**: Low, Normal, High, Urgent.
- **Attention Filters (Bottlenecks)**:
  - Missing Information
  - Unassigned Planning Owner
  - Overdue
  - Returned for Correction
  - Ready to Start

---

### 5.3 Professional Industrial Planning Work Card
Each job in the queue is rendered as a structured work card:

```
+----------------------------------------------------------------------------------------------------+
| RA101/01  •  15KW VFD Panel                                                  [ Priority: HIGH ]    |
| Project: Unit-2 Expansion  •  Client: Tata Chemicals Limited                 [ Stage: PLANNING ACTIVE ]
+----------------------------------------------------------------------------------------------------+
| 👤 Responsible Engineer: Rajesh Patel (Marketing)                                                  |
| ⚡ Current Responsibility: Planning → Amit Shah (Started: 14 Oct 10:21 AM | Due: 16 Oct 2026)        |
| 🎯 Current Action: Complete Electrical BOM & Drawing Review                                        |
| ⏳ Why Waiting: "Awaiting final drawing signoff from design"                                        |
+----------------------------------------------------------------------------------------------------+
| READINESS: [✓ Job Info] [✓ Client Info] [✓ PO Verified] [✓ Resp Engg] [⚠ Design Input] [✓ Checklist]|
+----------------------------------------------------------------------------------------------------+
| [ Open Control Review ]   [ View Timeline ]   [ Reassign Owner ]   [ Request Clarification ]       |
+----------------------------------------------------------------------------------------------------+
```

---

## 6. Job Control Review & Detail Workspace (`/jobs/:id`)

When opening a job from the Control Center, a structured tabbed review workspace is presented:

### Tab 1: Overview
- Complete commercial & technical identifiers.
- Lifecycle Progress Stepper (Received $\to$ Verified $\to$ Owner Assigned $\to$ Planning Active $\to$ Released).
- **"Why is this waiting?"** callout card explaining current bottleneck if stalled.

### Tab 2: Planning Readiness
- Summary scorecard (e.g. `5 / 6 Requirements Ready`).
- Evaluates:
  1. Core Job Information (Ready)
  2. Customer & Project Confirmation (Ready)
  3. Commercial PO Information (Ready)
  4. Responsible Engineer Verification (Ready)
  5. Design & Technical Drawings Input (Pending / Review Required)
  6. Document Attachments (PO PDF, Technical Specs)

### Tab 3: Planning Checklist Verification
Interactive checklist table storing WHO, WHAT, WHEN for each item:

| Requirement Item | Mandatory | Status | Verified By | Verified At | Actions |
| :--- | :---: | :---: | :--- | :--- | :--- |
| **Job Number & Series Verified** | Yes | Verified | Keval V Shah | 14 Oct 10:12 AM | [Toggle] |
| **PO Date & Commercial Terms** | Yes | Verified | Rajesh Patel | 14 Oct 09:45 AM | [Toggle] |
| **Panel Scope & Quantity Confirmed** | Yes | Verified | Keval V Shah | 14 Oct 10:14 AM | [Toggle] |
| **Responsible Engineer Assigned** | Yes | Verified | Rajesh Patel | 14 Oct 09:45 AM | [Toggle] |
| **Design / SLD Input Attached** | Yes | ⚠ Missing | — | — | [Verify] [Mark Missing] [Comment] |
| **Customer Delivery Date Feasible** | No | Verified | Amit Shah | 14 Oct 10:20 AM | [Toggle] |

### Tab 4: Responsibility Chain & Assignment History
- **Current Chain**: `Responsible Engineer (Rajesh Patel) → Handover → Planning Owner (Amit Shah) → Next: Production (Pending)`
- **Assignment History Table**:
  - Previous Owner
  - New Owner
  - Assigned By
  - Assignment Date & Time
  - Assignment Reason Category
  - Detailed Explanation

---

### Tab 5: Activity Timeline (WHO → WHAT → WHY → WHEN)
Chronological, append-only log with event-type filters (`All`, `Assignment`, `Verification`, `Checklist`, `Clarification`, `Correction`, `Planning`, `Release`):

#### 🔒 Admin-Exclusive Stage Duration Breakdown:
> [!NOTE]
> **Admin & Keval V Shah Exclusive**: The following stage duration analysis section is rendered **ONLY** when logged in as an Administrator (`role === 'admin'`, `'executive'`, or `keval v shah`). It is completely omitted for regular departmental users.

```
+------------------------------------------------------------------------------------+
| ⏱️ Stage Duration Analysis (Admin Oversight)                                        |
+------------------------------------------------------------------------------------+
| • Incoming Stage:               16 minutes  (09:42 → 09:58)                        |
| • Verification Stage:           20 minutes  (09:58 → 10:18)                        |
| • Waiting for Owner Assignment:  3 minutes  (10:18 → 10:21)                        |
| • Planning Active:              5h 19m      (10:21 → 15:40)                        |
| • Total Workflow Elapsed:       5h 58m                                             |
+------------------------------------------------------------------------------------+
```

#### Department User View:
Regular departmental users see the chronological events (who performed what action, when, and any notes/reasons), but the executive duration analytics and bottleneck timing breakdown are hidden.

---

### Tab 6: Documents & Attachments
- File upload interface with drag-and-drop.
- Previews for PO PDF, Technical Specification PDFs, and Single Line Diagrams.

---

## 7. Formal Assignment, Reassignment & Workflow Dialogs

### 7.1 Formal Planning Owner Assignment Dialog
Assignment is a formal control gate, **never a silent inline dropdown**. Clicking *"Assign Planning Owner"* triggers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Assign Planning Owner                                                   │
├─────────────────────────────────────────────────────────────────────────┤
│ Planning Owner *                                                        │
│ [ Amit Shah (Active: 4 | Waiting: 1 | Overdue: 0)                  ▼ ]  │
│                                                                         │
│ Reason Category *                                                       │
│ [ Skill / specialization                                           ▼ ]  │
│                                                                         │
│ Assignment Reason / Additional Explanation *                            │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Assigned to Amit Shah because he is currently handling the          │ │
│ │ electrical planning queue for this project category.                │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Priority                                                                │
│ [ Normal                                                           ▼ ]  │
│                                                                         │
│ Expected Start Date                        Target Completion Date       │
│ [ 14-Oct-2026 📅 ]                         [ 16-Oct-2026 📅 ]           │
│                                                                         │
│ [ Cancel ]                                         [ Assign Owner → ]   │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Assignment Rules & Validation:
1. **Candidate Workload Display**:
   - The user selector displays current candidate workload:
     `Amit Shah (Active: 4 | Waiting: 1 | Overdue: 0)`
     `Rahul Patel (Active: 2 | Waiting: 0 | Overdue: 0)`
2. **Structured Reason Category (Mandatory Dropdown)**:
   - `Department workload`
   - `Skill / specialization`
   - `Job type`
   - `Existing project ownership`
   - `Customer priority`
   - `Urgent requirement`
   - `Availability`
   - `Management instruction`
   - `Reassignment`
   - `Other`
3. **Additional Reason / Explanation (Mandatory Text Area)**:
   - Free-text explanation (minimum 10 characters). Disallows silent `Assign → Done`.
4. **Timeline Entry Created Automatically**:
   - `WHO`: Assigned By (`Keval V Shah`)
   - `WHAT`: `PLANNING_OWNER_ASSIGNED`
   - `WHY`: Reason category + detailed explanation
   - `WHEN`: Server timestamp
   - Stage updates: `PLANNING_READY` $\to$ `PLANNING_ASSIGNED`.

---

### 7.2 Formal Planning Owner Reassignment Dialog
When reassigning a job from one owner to another (e.g., `Amit Shah → Rahul Patel`), the system enforces:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Reassign Planning Owner                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ Current Owner                                                           │
│ [ Amit Shah (Planning Lead) - Active                                  ] │
│                                                                         │
│ New Owner *                                                             │
│ [ Rahul Patel (Active: 2 | Waiting: 0 | Overdue: 0)                ▼ ]  │
│                                                                         │
│ Reason Category *                                                       │
│ [ Department workload                                              ▼ ]  │
│                                                                         │
│ Reassignment Reason *                                                   │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Owner workload exceeded current capacity                            │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Additional Note (Optional)                                              │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Rahul is already handling the related panel package.                │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ [ Cancel ]                                 [ Confirm Reassignment → ]   │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Reassignment Rules & Automatic Timeline Audit:
1. **Current Owner Preserved**: Previous owner is permanently stored in history and never overwritten or erased.
2. **Mandatory Reassignment Reason**: Form cannot be submitted without selecting a category and providing an explanation.
3. **Automatic Timeline Entry**:
   ```
   🔄 Planning Owner Changed
   • Previous Owner: Amit Shah
   • New Owner:      Rahul Patel
   • Changed By:     Keval V Shah (Admin)
   • Reason:         Owner workload exceeded current capacity
   • Note:           Rahul is already handling the related panel package.
   • Timestamp:      14-Oct-2026, 14:05:22
   ```

---

### 7.3 Clarification Request & Correction Loop
- **Request Clarification Modal**:
  - Requested From: Responsible Engineer / Department Lead.
  - Reason Category: Missing Design Drawings, Commercial Ambiguity, Incomplete Technical Specs, Qty Mismatch, Delivery Conflict.
  - Detailed Explanation: Detailed instructions on what must be corrected.
  - Stage transitions immediately to **Needs Clarification**.
- **Submit Correction Modal**:
  - Used by Responsible Engineer or submitting department.
  - Requires Correction Summary and optional updated document attachment.
  - Stage transitions back to **Verification** with real-time notification to Planning.

---

### 7.4 Release to Next Department Modal
- **Next Department Selection**: Production, Design - Electrical, Design - Mechanical, Procurement, Dispatch.
- **Next Responsible User** (Optional / Assigned recipient).
- **Mandatory Forwarding Reason Categories**:
  - Planning Package Verified & Completed
  - BOM Released & Approved
  - Urgent Production Fast-Track
  - Management Directive
  - Other
- **Forwarding Notes** (Technical instructions for the receiving department).
- Stage transitions to **Released**, updating `target_department` and notifying receiving team.

---

## 8. Backend API & Database Architecture (`server-py`)

### 8.1 Database Schema Extensions ([`models/__init__.py`](file:///d:/Job%20planning%20update/server-py/app/models/__init__.py))
Non-breaking additions to `Job` table:
```python
# Stage & Control Center Fields
current_stage = Column(String(50), default="INCOMING", index=True)
current_action = Column(String(255), default="Review Incoming Job")
current_waiting_reason = Column(Text, nullable=True)
stage_started_at = Column(DateTime(timezone=True), server_default=func.now())
stage_due_date = Column(DateTime(timezone=True), nullable=True)
assignment_reason_category = Column(String(100), nullable=True)
assignment_explanation = Column(Text, nullable=True)
forwarding_reason_category = Column(String(100), nullable=True)
forwarding_note = Column(Text, nullable=True)
stage_durations = Column(JSONB, default=dict) # e.g. {"incoming": 960, "verification": 1200}
```

### 8.2 API Endpoints Specification ([`api/v1/job_handover.py`](file:///d:/Job%20planning%20update/server-py/app/api/v1/job_handover.py))
1. `GET /api/jobs/control-center/summary`: Returns live stage counts, My Actions counts, and bottleneck alerts.
2. `GET /api/jobs/control-center/queue`: Returns paginated jobs filtered by stage, department, engineer, owner, priority, and attention tags.
3. `POST /api/jobs/{id}/control/verify-item`: Toggles or updates checklist requirement verification with user and timestamp.
4. `POST /api/jobs/{id}/control/assign-owner`: Formal Planning Owner assignment with mandatory reason category, detailed explanation, workload logging, and audit record.
5. `POST /api/jobs/{id}/control/reassign-owner`: Formal Reassignment with previous owner preservation, mandatory reassignment reason, optional note, and timeline record.
6. `POST /api/jobs/{id}/control/request-clarification`: Moves stage to `NEEDS_CLARIFICATION`, logs clarification reason.
7. `POST /api/jobs/{id}/control/submit-correction`: Submits correction, returns job to `VERIFICATION`.
8. `POST /api/jobs/{id}/control/start-planning`: Transitions stage from `PLANNING_ASSIGNED` to `PLANNING_ACTIVE` and starts timer.
9. `POST /api/jobs/{id}/control/complete-planning`: Verifies planning checklist and marks planning milestone complete.
10. `POST /api/jobs/{id}/control/release`: Releases job to next department with mandatory forwarding reason and SSE broadcast.
11. `GET /api/jobs/{id}/control/timeline`: Returns complete chronological timeline events. **Stage durations are included only if user is admin / Keval V Shah**.
12. `GET /api/jobs/control/users-workload`: Returns active workload metrics for planning candidates during assignment.

---

## 9. Step-by-Step Implementation Map

| Phase | Component | Detailed Tasks | Files Affected |
| :---: | :--- | :--- | :--- |
| **Phase 1** | **Backend Models & Migration** | Add stage tracking, reason columns, checklist verification schema, and non-destructive column reflection. | `server-py/app/models/__init__.py`, `server-py/migrate_handover.py` |
| **Phase 2** | **Backend Control Center APIs** | Implement 12 logical endpoints for summary counts, queue filtering, checklist verification, assignment, clarification, and release (with Admin-only duration filtering). | `server-py/app/api/v1/job_handover.py` |
| **Phase 3** | **Control Center UI Hub** | Transform `PlanningHandoverInbox.jsx` into industrial Control Center with summary cards, My Actions, search/filters, and work cards (zero "Station" wording). | `client/src/jobs/PlanningHandoverInbox.jsx`, `client/src/layouts/Layout.jsx` |
| **Phase 4** | **Job Control Detail Workspace** | Upgrade `/jobs/:id` with 6 dedicated tabs: Overview, Planning Readiness, Checklist, Responsibility Chain, Documents, Timeline (Admin-only duration analysis). | `client/src/jobs/JobDetail.jsx` |
| **Phase 5** | **Action Dialogs** | Implement Assignment Dialog (with workload preview & mandatory reason), Reassignment Dialog (Current $\to$ New + reason), Clarification Modal, Correction Modal, and Release Modal. | `client/src/jobs/DepartmentHandoverModal.jsx` |
| **Phase 6** | **Real-Time SSE Sync** | Connect Control Center to live Server-Sent Events (`HANDOVER_SUBMITTED`, `STAGE_UPDATED`, etc.) for automatic UI updates. | `server-py/app/core/events.py`, `client/src/jobs/PlanningHandoverInbox.jsx` |
| **Phase 7** | **Testing & Verification** | Execute full test matrix across admin, department admin, and normal users; verify historical jobs and zero regression. | Full stack validation scripts |

---

## 10. End-to-End Verification & Testing Matrix

| Test ID | Test Scenario | Expected Outcome |
| :---: | :--- | :--- |
| **T-01** | Open `/jobs/handover` | Renders **Job Planning Control Center** header (no "Station"), live summary counts, and My Actions section. |
| **T-02** | Filter by Stage & Resp. Engg | Dynamic filtering updates queue instantly without full page reloads. |
| **T-03** | Verify Checklist Item | Verification timestamp and user name recorded; progress updates to e.g. `5/5 Verified`. |
| **T-04** | Formal Assign Planning Owner | Reason category and detailed explanation are mandatory; candidate workload shown; audit timeline logged. |
| **T-05** | Formal Reassign Planning Owner | Displays Current Owner $\to$ New Owner; mandatory reassignment reason enforced; timeline logs change with previous owner preserved. |
| **T-06** | Request Clarification | Job enters `NEEDS_CLARIFICATION`; Responsible Engineer sees it in *Returned to Me* and *Waiting for Me*. |
| **T-07** | Submit Correction | Responsible Engineer submits summary; job moves back to `VERIFICATION` with timestamp. |
| **T-08** | Start & Complete Planning | Stage moves to `PLANNING_ACTIVE` with duration tracking; completion checks readiness. |
| **T-09** | Release to Next Department | Forwarding reason mandatory; target department updated; receiving department notified. |
| **T-10** | **Admin Stage Duration Check** | Logged in as `admin` or `keval v shah`: **Stage Duration Analysis** is visible with exact stage times (e.g. 16m, 20m, 5h 19m). |
| **T-11** | **User Stage Duration Check** | Logged in as `swatidesign`, `swatipurchase`, etc.: **Stage Duration Analysis is HIDDEN**; user only sees event log. |
| **T-12** | Historical Job Safety | Older jobs without new fields load gracefully with sensible fallback defaults. |

---

## 11. Execution Readiness

- **Status**: Updated implementation plan finalized and documented.
- **Action**: Waiting for your explicit approval before modifying any code files.
