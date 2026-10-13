# Implementation Plan: Live Active Jobs Table Refinement & PostgreSQL Storage Audit

## Executive Summary
This implementation plan addresses your request to:
1. **Refine the UI of the "Live Active Jobs & Handover Station" table** in `KevalDashboard.jsx` into a clean, proper, and spacious layout.
2. **Remove the search bar** (`Search job, panel, worker...`) from the table header to eliminate visual clutter.
3. **Verify and map PostgreSQL database persistence**, confirming exactly where and how all 9 columns (Job info, Priority, Status, Worker & Position, Prev/Next Assignee, Live Timer, Progress, Handover, and Execution Controls) are stored in PostgreSQL and can be inspected in pgAdmin / database clients.

> **Strict Instruction Followed:** **DO NOT IMPLEMENT CODE.** This document is an implementation plan for your review and approval before any code modifications are made.

---

## 1. PostgreSQL Database Storage Audit & pgAdmin Verification

All actions and fields in the **Live Active Jobs & Handover Station** table are stored directly in PostgreSQL database tables (`job_planning_db`). Below is the exact database schema and column mapping for inspection in pgAdmin:

### Table 1: `public.jobs` (Primary Job State & Worker Assignment)

| UI Table Column | Data Displayed | PostgreSQL Table & Column Name | Type | Notes / pgAdmin Query |
|:---|:---|:---|:---:|:---|
| **Job ID & Panel** | Job Number, Panel Name, Client Name | `jobs.job_no`<br>`jobs.panel_name`<br>`jobs.client_name`<br>`jobs.external_id` | `VARCHAR(100)`<br>`VARCHAR(255)`<br>`VARCHAR(255)`<br>`INTEGER` | Unique job identification |
| **Priority** | Normal / High / Urgent | `jobs.priority` | `VARCHAR(20)` | Defaults to `'Normal'`, updated via schedule/edit |
| **Status** | Draft, Scheduled, Running, Paused, Completed | `jobs.lifecycle_status` | `VARCHAR(50)` | Transitions automatically on Start, Pause, Resume, Finish |
| **Current Worker & Position** | Worker Name, Position / Designation | `jobs.current_worker_id`<br>`jobs.current_worker_position`<br>`jobs.assigned_engineer_id` | `INTEGER`<br>`VARCHAR(100)`<br>`INTEGER` | References `users.id` and user position |
| **Prev / Next Assignee** | Previous Worker, Next Handover Target | `jobs.previous_worker_id`<br>`jobs.next_worker_id`<br>`jobs.last_handover_at` | `INTEGER`<br>`INTEGER`<br>`TIMESTAMPTZ` | Shift handover continuity chain |
| **Live Elapsed Time** | Active running duration (excl. pauses), Budget | `jobs.actual_start_at`<br>`jobs.total_paused_seconds`<br>`jobs.actual_duration_seconds`<br>`jobs.estimated_duration_seconds` | `TIMESTAMPTZ`<br>`INTEGER`<br>`INTEGER`<br>`INTEGER` | Live ticking calculated as `(NOW - actual_start_at) - total_paused_seconds` |
| **Progress / Budget** | Progress %, Completed vs Target Units | `jobs.progress_percentage`<br>`jobs.completed_work_units`<br>`jobs.target_work_units` | `NUMERIC(5,2)`<br>`INTEGER`<br>`INTEGER` | Updated via inline Progress Modal |
| **Handover** | Shift Handover history | `jobs.last_handover_at`<br>`jobs.handover_notes` | `TIMESTAMPTZ`<br>`TEXT` | Summary of latest shift handover |
| **Execution Controls** | Start, Pause, Resume, Finish timestamps | `jobs.actual_start_at`<br>`jobs.pause_started_at`<br>`jobs.actual_end_at` | `TIMESTAMPTZ`<br>`TIMESTAMPTZ`<br>`TIMESTAMPTZ` | Timestamp audit trails |

---

### Table 2: `public.job_execution_sessions` (Work & Pause Intervals)
Every time a user clicks **Start**, **Pause**, **Resume**, or **Finish**, an immutable session record is inserted into `job_execution_sessions`:
- `id` (`SERIAL PRIMARY KEY`)
- `job_id` (`INTEGER`): foreign key to `jobs.id`
- `session_type` (`VARCHAR(20)`): `'WORK'` or `'PAUSE'`
- `started_at` (`TIMESTAMPTZ`): Start of session
- `ended_at` (`TIMESTAMPTZ`): End of session
- `duration_seconds` (`INTEGER`): Active duration
- `performed_by` (`VARCHAR(100)`): Username of the operator
- `worker_id` (`INTEGER`): Worker assigned during this session
- `pause_reason` (`VARCHAR(255)`): Category (e.g., Material unavailable, Machine breakdown)

---

### Table 3: `public.job_handovers` (Shift Handover Audit Log)
Every time the **Handover** button is clicked and submitted, an audit record is stored:
- `job_id` (`INTEGER`)
- `from_worker_id` (`INTEGER`) & `to_worker_id` (`INTEGER`)
- `from_position` (`VARCHAR(100)`) & `to_position` (`VARCHAR(100)`)
- `handover_notes` (`TEXT`)
- `performed_by` (`VARCHAR(100)`)
- `created_at` (`TIMESTAMPTZ`)

---

### Table 4: `public.job_progress_history` (Incremental Work Log)
Every time the **Progress** button is clicked and updated:
- `job_id` (`INTEGER`)
- `previous_percentage` (`NUMERIC(5,2)`)
- `new_percentage` (`NUMERIC(5,2)`)
- `completed_units` (`INTEGER`) & `target_units` (`INTEGER`)
- `notes` (`TEXT`)
- `updated_by` (`VARCHAR(100)`)
- `created_at` (`TIMESTAMPTZ`)

---

## 2. Proposed UI/UX Refinement for Live Active Jobs Table

### 1. Header Cleanup (Search Bar Removal)
- **Current State:** The header contains a search input box (`Search job, panel, worker...`), which takes up horizontal space and is unnecessary when viewing active shop floor jobs.
- **Proposed State:** **Remove the search input completely.**
- **Header Replacement:** A clean, modern header featuring:
  - Left side: Table Title (`Live Active Jobs & Handover Station`), active job count badge, and a subtle live indicator (`● Live SSE Sync`).
  - Right side: Quick KPI filter indicator (if an analytics card is clicked above) with a simple reset button.

---

### 2. Table Layout & Cell Styling Upgrades

#### Detailed Column Styling:
1. **Job ID & Panel (Col 1):**
   - High-contrast job number in a crisp badge (`#45`).
   - Panel name in semi-bold slate-900 typography.
   - Client name in subdued slate-500 typography.
   - Clickable row / eye icon to highlight the job in the Gantt chart above.
2. **Priority (Col 2):**
   - Distinct, subtle pill badges:
     - `Normal`: Slate-100 / Slate-700
     - `High`: Amber-50 / Amber-700 with amber border
     - `Urgent`: Rose-50 / Rose-700 with pulsing dot
3. **Status (Col 3):**
   - High-visibility status chips with icons:
     - `Running`: Emerald badge with animated pulsing green dot
     - `Paused`: Amber badge with pause icon
     - `Draft / Scheduled`: Slate badge with clock icon
     - `Completed`: Blue badge with checkmark
4. **Current Worker & Position (Col 4):**
   - Avatar icon + bold worker name.
   - Distinct position pill badge (`Engineer`, `Technician`, `Supervisor`) below name.
5. **Prev / Next Assignee (Col 5):**
   - Compact stacked view:
     - `Prev:` Subdued text with name or `—`
     - `Next:` Amber/Slate tag showing assigned shift successor or `Not yet assigned`
6. **Live Elapsed Time (Col 6):**
   - Monospace font (`font-mono text-sm font-bold`) with live 1-second ticking animation.
   - Estimated budget line (`Est: 8.0h`) in small font below.
7. **Progress / Budget (Col 7):**
   - Clean horizontal progress bar with percentage indicator (`0% used` / `65% completed`).
   - Dynamic bar color: Emerald (<80%), Amber (80–100%), Rose (>100% overrun).
8. **Handover & Details (Col 8):**
   - Modern button group:
     - `⇄ Handover` button (Amber tint, opens shift transfer modal)
     - `📊 Progress` button (Indigo tint, opens units & % update modal)
     - `🕒 History` button (Slate tint, opens timeline drawer)
9. **Execution Controls (Col 9):**
   - High-contrast action buttons:
     - If Draft/Scheduled: `▶ Start` (Emerald green)
     - If Running: `⏸ Pause` (Amber) and `✓ Finish` (Blue)
     - If Paused: `▶ Resume` (Emerald green) and `✓ Finish` (Blue)
     - Disabled during API transit with spinner to prevent double-clicks.
