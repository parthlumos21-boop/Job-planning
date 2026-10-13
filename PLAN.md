# Job Planning – Real-Time Dynamic Timeline, Pause Reasons, Resume, Automatic Time Tracking & Progress Plan

> **Document Version:** 2.0.0  
> **Target Dashboard URL:** [http://localhost:5174/live-monitor](http://localhost:5174/live-monitor)  
> **Backend:** Python FastAPI (`server-py`) + PostgreSQL (`job_planning_db`)  
> **Frontend:** React 19 + Vite (`client`)  
> **Operational Status:** **Plan Only — Do Not Implement Until Approved**

---

## 1. Executive Summary & Core Requirements

This update incorporates strict role-based access control, standardized lifecycle statuses, authoritative pause reason categories, truthful progress measurement, server-side concurrency safety, and detailed terminal process logging.

### 1.1 Non-Negotiable Directives
1. **Role-Based Visibility (Admin-Only Timeline):**
   - **Admin / Executive Only:** Full access to the Multi-Job Dynamic Timeline Gantt Chart, Live Monitor Dashboard (`/live-monitor`), Handover station, and supervisory management actions.
   - **Regular Employees / Users:** The live timeline chart is **strictly hidden**. Regular employees only view their assigned tasks/jobs and personal operational controls without team-wide Gantt inspection.
2. **Zero External Heavy Gantt Packages:** Built with a native React + SVG / CSS Grid engine (< 18 KB bundle footprint) using existing `date-fns` and Tailwind CSS.
3. **Zero Hardcoded Data:** All figures, worker names, pause reasons, handovers, and progress logs are persisted in and queried from PostgreSQL.
4. **Preserve Existing Structure:** Work strictly inside existing folders (`client/`, `server-py/`, `scripts/`).

---

## 2. Section A: Deep Audit & Verified Root Causes

| # | Feature Area | Existing Defect / Bug | Verified Root Cause | Architectural Solution |
| :--- | :--- | :--- | :--- | :--- |
| **A1** | **Role Visibility** | Timeline chart is rendered for all users regardless of role. | Missing role gate `<RoleGuard role={['admin', 'executive']}>` around `LiveTimelineChart` in `KevalDashboard.jsx` and route level. | Gate the timeline chart and live monitor route to `admin` and `executive` roles only. Show regular users their personal job queue. |
| **A2** | **Status Inconsistency** | UI uses `Running` and `Paused`, while specifications require `In Progress` and `On Hold`. | Column `jobs.lifecycle_status` contains inconsistent casing/names across legacy Mongo imports. | Standardize backend & frontend to map `In Progress` (active) and `On Hold` (paused) with backward-compatible aliases. |
| **A3** | **Time Tracking Integrity** | Timers calculate elapsed duration using local browser time (`Date.now()`). | Browser clock skew, page reloads, and tab throttling distort active work calculations. | Make server UTC timestamps and closed `job_execution_sessions` the single source of truth. Active time = sum of valid `WORK` sessions. |
| **A4** | **Pause Reason Classification** | Freeform text or limited arbitrary reasons. | Lack of strict schema validation for standardized reason categories. | Enforce 8 standardized reason categories on backend with mandatory detailed text when `Other` is selected. |
| **A5** | **Artificial Progress Fallback** | Time passing artificially increases progress bars or fallback fake percentages (`5%`, `+40%`). | Component rendered fake progress offsets when timestamps were null. | Truthful progress tracking: Progress is strictly derived from `completed_work_units / target_work_units * 100` or explicit verified milestone logs. Time passing never increments progress. |
| **A6** | **Handover Identity & State** | Handover overwrote current worker without checking if the job is paused. | Incomplete session handling during handover. | Handover permitted while paused: preserves `On Hold` state and existing pause session. Current worker is derived from active handover. |
| **A7** | **Concurrency & Duplicate Sessions** | Double-clicking Start or Resume creates multiple open work sessions. | Missing database-level session locks or uniqueness checks on open sessions (`ended_at IS NULL`). | Use atomic database transactions with concurrency checks: only one session can have `ended_at IS NULL` per job. |

---

## 3. Section B: Complete Pause Workflow

When an authorized user clicks **Pause Job**, open a modal popup:

### 3.1 Pause Modal Requirements
- **Standardized Reason Categories (Dropdown):**
  1. `Material unavailable`
  2. `Waiting for approval`
  3. `Machine breakdown`
  4. `Technical issue`
  5. `Employee unavailable`
  6. `Customer dependency`
  7. `Power outage`
  8. `Other`
- **Detailed Reason:** Mandatory text area if category is `Other` (min 10 characters). Optional note for other categories.
- **Paused By:** Automatically extracted from the authenticated JWT token (`user.username`). Employee cannot forge another user's identity.
- **Pause Timestamp:** Server-generated UTC timestamp (`now = datetime.now(timezone.utc)`). Client timestamp is ignored.
- **Expected Resume Time (Optional):** Optional datetime picker for scheduled restart.

### 3.2 State & Storage Rules on Pause
1. Validate request payload on the server. If category is `Other` without explanation, reject with HTTP 422.
2. The Pause button remains in a loading state until the backend returns HTTP 200.
3. Close the active `WORK` session: set `ended_at = now`, calculate `duration_seconds = now - started_at`.
4. Open a new `PAUSE` session in `job_execution_sessions` with `pause_reason = category`, `notes = detailed_reason`, `started_at = now`.
5. Update `jobs.lifecycle_status = "On Hold"`, `jobs.pause_started_at = now`.
6. Stop counting active working time immediately.
7. Preserve existing progress percentage and completed work units.
8. Terminal Process Log: Output formatted audit message to server terminal console.
9. Broadcast real-time event: `job_paused`.

---

## 4. Section C: Resume Job Workflow

When an authorized user clicks **Resume Job**:

### 4.1 State & Storage Rules on Resume
1. **Server-Side Validation:** Check that `job.lifecycle_status == "On Hold"`. If already running, completed, or draft, reject with HTTP 400.
2. **Close Active Pause Session:** Find the open `PAUSE` session (`ended_at IS NULL`), set `ended_at = now`, calculate pause interval `duration_seconds = now - started_at`.
3. **Accumulate Pause Duration:** Increment `job.total_paused_seconds += pause_duration`. Set `job.pause_started_at = None`.
4. **Open New Work Session:** Create a new `WORK` session in `job_execution_sessions` with `started_at = now`, `performed_by = user.username`, `worker_id = job.current_worker_id`.
5. **Update Job State:** Set `job.lifecycle_status = "In Progress"`.
6. **Preserve Complete History:** All historical pause and work intervals remain in database.
7. Terminal Process Log: Output formatted resume audit message to server terminal console.
8. Broadcast real-time event: `job_resumed`.

---

## 5. Section D: Automatic Time Tracking Engine

Time tracking is calculated dynamically from discrete historical session records rather than brittle client-side counters:

### 5.1 Time Duration Formulas (Server & Client Synchronized)
1. **Actual Active Working Duration:**
   $$\text{ActiveDuration} = \sum_{\text{closed WORK sessions}} \text{duration\_seconds} + \begin{cases} (\text{now} - \text{current\_session.started\_at}) & \text{if status} = \text{'In Progress'} \\ 0 & \text{otherwise} \end{cases}$$
2. **Total Accumulated Pause Duration:**
   $$\text{TotalPausedDuration} = \sum_{\text{closed PAUSE sessions}} \text{duration\_seconds} + \begin{cases} (\text{now} - \text{pause\_started\_at}) & \text{if status} = \text{'On Hold'} \\ 0 & \text{otherwise} \end{cases}$$
3. **Current Pause Duration:**
   $$\text{CurrentPauseDuration} = \begin{cases} (\text{now} - \text{pause\_started\_at}) & \text{if status} = \text{'On Hold'} \\ 0 & \text{otherwise} \end{cases}$$
4. **Total Elapsed Duration:**
   $$\text{TotalElapsed} = \text{ActiveDuration} + \text{TotalPausedDuration}$$
5. **Planned vs. Actual Variance:**
   $$\text{Variance} = \text{ActiveDuration} - \text{estimated\_duration\_seconds}$$
6. **Overdue Duration:**
   $$\text{Overdue} = \begin{cases} \max(0, \text{now} - \text{planned\_end\_at}) & \text{if status} \neq \text{'Completed' and now} > \text{planned\_end\_at} \\ 0 & \text{otherwise} \end{cases}$$

### 5.2 Persistence & Resiliency Guarantees
- All timestamps stored in **ISO 8601 UTC** in PostgreSQL.
- Browser refreshes, server restarts, and network disconnects do not distort time.
- If a client is offline, no simulated sessions or fake progress are created.

---

## 6. Section E: Truthful Progress Tracking Engine

Progress must reflect measurable physical reality, not elapsed clock time:

### 6.1 Progress Calculation Logic
- **Measurable Work Units (Primary):**
  $$\text{Progress \%} = \min\left(100.0, \frac{\text{completed\_work\_units}}{\text{target\_work\_units}} \times 100\right)$$
- **Manual Milestone Logging (Secondary):**
  - Allowed for authorized employees via `POST /api/jobs/{id}/progress`.
  - Validates `progress_percentage` in range `[0.0, 100.0]`.
  - Records an entry in `job_progress_history`: `job_id`, `progress_percentage`, `recorded_by`, `recorded_at`, `note`.
- **Zero Completion Side-Effects:**
  - A job reaching 100% progress **does NOT** automatically change status to `Completed`.
  - The job remains `In Progress` until the supervisor executes the explicit QA/Completion workflow.
- **State Preservation:** Progress is preserved untouched through pauses, resumes, and handovers.

---

## 7. Section F: Real-Time Gantt Timeline (Admin / Executive Only)

### 7.1 Access Control
- Component wrapper: `<RoleGuard role={['admin', 'executive']}>`.
- Regular employees visiting the application do not see the live timeline chart; they see their personal assigned task card list.

### 7.2 Visual States & Rendering
- **In Progress:** Solid Emerald green bar with animated pulse and active elapsed timer.
- **On Hold:** Amber/Orange bar with pause badge and pause reason tooltip.
- **Completed:** Indigo/Navy bar with total completion time.
- **Pending / Scheduled:** Translucent Blueprint Sky-blue bar showing planned window.
- **Overdue Indicator:** Crimson striped extension bar with warning badge: `⚠️ Delayed by +Xh`.
- **Handover Diamond Points:** Amber diamond markers placed along the track at the exact handover timestamp.
- **Live Moving Red Cursor:** 1-second interval vertical dashed cursor with live clock pill.
- **Interactive Tooltips & Drawers:** Hovering shows duration and pause reason. Clicking any bar opens the slide-out audit trail drawer.

---

## 8. Section G: Complete Handover History

Every handover records a permanent audit entry in `job_handovers`:

```json
{
  "jobId": 101,
  "fromWorkerId": 12,
  "fromWorkerName": "Disant",
  "fromWorkerPosition": "Panel Wireman",
  "toWorkerId": 24,
  "toWorkerName": "Aasif",
  "toWorkerPosition": "Electrical Design Lead",
  "handoverAt": "2026-10-13T06:30:00Z",
  "reason": "Shift Change",
  "notes": "Busbars fitted, control wiring pending",
  "workCompletedSummary": "Completed stage 1 wiring",
  "statusAtHandover": "In Progress",
  "progressAtHandover": 65.0,
  "performedBy": "admin"
}
```

### 8.1 Handover While Paused
- If a job is `On Hold`, handover is permitted.
- The job maintains its `On Hold` state and preserves the active pause reason.
- `job.current_worker_id` is updated to the new worker.
- When the new worker clicks Resume, the pause interval closes and the new work session attributes to the new worker.

---

## 9. Section H: Backend, Database & Security Architecture

### 9.1 Database Schema (PostgreSQL Non-Destructive Additions)
```sql
-- Ensure enum or check constraints on lifecycle_status
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(50) DEFAULT 'Pending';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS target_work_units INTEGER DEFAULT 100;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_work_units INTEGER DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pause_reason_category VARCHAR(100);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expected_resume_at TIMESTAMPTZ;

-- Indices for rapid timeline query
CREATE INDEX IF NOT EXISTS idx_sessions_job_active ON job_execution_sessions(job_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_handovers_job_time ON job_handovers(job_id, handover_at DESC);
```

### 9.2 Concurrency Safety (Preventing Duplicate Sessions)
```python
# Concurrency safe session management using row-level locking
async def create_work_session(db: AsyncSession, job_id: int, user_name: str, worker_id: int):
    # Lock job row for update
    stmt = select(Job).where(Job.id == job_id).with_for_update()
    job = (await db.execute(stmt)).scalar_one()
    
    # Close any accidental dangling sessions
    close_stmt = (
        update(JobExecutionSession)
        .where(JobExecutionSession.job_id == job_id, JobExecutionSession.ended_at.is_(None))
        .values(ended_at=datetime.now(timezone.utc))
    )
    await db.execute(close_stmt)
    
    # Insert single active session
    new_session = JobExecutionSession(
        job_id=job_id,
        session_type="WORK",
        started_at=datetime.now(timezone.utc),
        performed_by=user_name,
        worker_id=worker_id
    )
    db.add(new_session)
    await db.commit()
```

---

## 10. Section I: Real-Time Synchronization Specification

SSE (`/api/job-monitoring/stream`) broadcasts authorized JSON events:

| Event Name | Trigger Condition | Payload Data | Client Action |
| :--- | :--- | :--- | :--- |
| `job_started` | User starts execution | `{jobId, jobNo, workerId, workerName, startedAt, status}` | Transition bar to Emerald, start local ticker |
| `job_paused` | User pauses job | `{jobId, jobNo, reasonCategory, detailedReason, pausedBy, pausedAt, status}` | Transition bar to Amber, display pause badge & reason |
| `job_resumed` | User resumes job | `{jobId, jobNo, resumedBy, resumedAt, pauseDuration, status}` | Transition bar to Emerald, resume active timer |
| `job_progress_updated` | Progress logged | `{jobId, jobNo, progressPercentage, completedUnits, targetUnits, note}` | Update progress fill and milestone history |
| `job_handed_over` | Handover executed | `{jobId, jobNo, fromWorker, toWorker, reason, handoverAt, status}` | Place handover diamond point, update assignee badge |
| `job_completed` | Supervisor finishes job | `{jobId, jobNo, completedAt, totalActiveDuration, status}` | Transition bar to Indigo, mark finished |

---

## 11. Section J: Terminal Process Logging & Verification Test Suite

### 11.1 Terminal Process Logging Standard
All lifecycle events output structured audit lines to the Python backend console:
```text
[JOB-AUDIT 2026-10-13 12:15:02 UTC] START    | Job #101 (JOB-2024-001) started by 'kevalvshah' for worker 'Disant'
[JOB-AUDIT 2026-10-13 12:22:45 UTC] PAUSE    | Job #101 paused by 'kevalvshah' | Category: 'Material unavailable' | Notes: 'Awaiting busbar brackets'
[JOB-AUDIT 2026-10-13 12:35:10 UTC] RESUME   | Job #101 resumed by 'kevalvshah' | Paused interval: 745s | Status: 'In Progress'
[JOB-AUDIT 2026-10-13 12:40:00 UTC] PROGRESS | Job #101 progress updated by 'kevalvshah' | 65.0% (65/100 units) | Note: 'Stage 1 wiring complete'
[JOB-AUDIT 2026-10-13 12:45:18 UTC] HANDOVER | Job #101 transferred: 'Disant' -> 'Aasif' (Electrical Lead) | Reason: 'Shift Change'
```

### 11.2 10 Critical Test Scenarios
1. **Active Duration Verification:** Start a job and verify active seconds advance accurately without client time drift.
2. **Pause Validation Rejection:** Submit pause with category `Other` and blank text; verify HTTP 422 rejection.
3. **Pause Persistence Across Reload:** Pause with `Machine breakdown`, refresh browser; verify job remains `On Hold` with exact pause timestamp and reason.
4. **Resume Duration Calculation:** Resume job after 3 minutes; verify closed pause session duration is exactly ~180s and active timer restarts.
5. **Multiple Pause/Resume Cycles:** Pause and resume 3 times; verify all 3 pause intervals appear distinctly in history.
6. **Progress Time Independence:** Leave a job running for 30 minutes; verify progress percentage does not artificially increase with elapsed time.
7. **Handover History Audit:** Hand over job; verify historical employee records are preserved and new employee appears as active assignee.
8. **Timeline Visual States:** Verify visual states for `In Progress` (Emerald), `On Hold` (Amber), `Completed` (Indigo), `Pending` (Sky blue), and `Overdue` (Red stripe).
9. **Role-Based Visibility Gate:** Log in as regular user (`swatisales`, role: `user`); verify timeline chart is hidden. Log in as `admin`; verify timeline chart renders.
10. **Dual-Session Real-Time Broadcast:** Open two browser tabs; perform pause in tab 1 and verify tab 2 updates instantly via SSE without page refresh.
