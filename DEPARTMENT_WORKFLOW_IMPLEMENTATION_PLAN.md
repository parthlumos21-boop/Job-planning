# Implementation Plan: Unified Department Workflow & pgAdmin 4 Architecture

> [!IMPORTANT]
> **Status:** Plan Only — Implementation is on hold until explicitly approved by the user. Do NOT implement until confirmed.

---

## 1. User Feedback & Workflow Alignment

### A. Objectives & Direct User Feedback
Implement a unified, reusable department workflow engine across all stages without creating a separate application and preserving all existing jobs, authentication, and database records:
1. **Marketing Task Completion & Readiness Check:**
   - Marketing user (`swatisales2`) works on My Task: `Prepare Job for Design`.
   - Marketing marks task completed: `Task Status = Completed`.
   - System automatically displays the **Readiness Check** (Customer, Project, Panel, Qty, Responsible Engineer, Required Documents, Expected Date).
   - Once all mandatory checks pass, `Status = Ready for Handover` and button **`[ HANDOVER TO DESIGN ]`** is enabled.
2. **Dedicated "HANDOVER TO DESIGN" Modal Card:**
   - Clicking `[ HANDOVER TO DESIGN ]` opens the exact clean handover modal:
     ```
     ┌───────────────────────────────────────────────┐
     │ HANDOVER TO DESIGN                            │
     ├───────────────────────────────────────────────┤
     │                                               │
     │ JOB-45                                        │
     │ 37KW VFD Panel                                │
     │                                               │
     │ Customer                                      │
     │ Elite Electricals                             │
     │                                               │
     │ From Department                               │
     │ Marketing                                     │
     │                                               │
     │ Responsible Engineer                          │
     │ Hasmukh                                       │
     │                                               │
     │ ───────────────────────────────────────────── │
     │                                               │
     │ Send To                                       │
     │                                               │
     │ Department                                    │
     │ [ Electrical Design ▼ ]                       │
     │                                               │
     │ Responsible Engineer                          │
     │ [ Select Engineer ▼ ]                         │
     │                                               │
     │ Handover Note                                 │
     │ [ Technical package ready for design... ]     │
     │                                               │
     │ Readiness                                     │
     │ ✓ All required information complete           │
     │                                               │
     │              [Cancel] [Handover to Design]    │
     └───────────────────────────────────────────────┘
     ```
   - Target File for this modal: [client/src/jobs/SimpleHandoverModal.jsx](file:///d:/Job%20planning%20update/client/src/jobs/SimpleHandoverModal.jsx).
3. **Automated Display into Design "My Task" Upon Acceptance:**
   - After Marketing confirms handover, Marketing task is closed and job enters `Electrical Design` as `Pending Acceptance` in `Incoming Jobs`.
   - When Design user (`swatidesign`) clicks `[ ACCEPT JOB ]`:
     * Handover status becomes `Accepted`.
     * Current Department becomes `Electrical Design`.
     * Assigned User becomes `swatidesign`.
     * Status becomes `In Progress`.
     * **System automatically generates Design My Task** (`task_name = 'Design Review & Preparation'`, `start_date = CURRENT_DATE`).
     * The task **automatically displays in Design's My Task** in the sidebar and on the page without requiring manual task creation!
4. **Sidebar "My Tasks" for All Departments (Own Department Only):**
   - In the sidebar, **"My Tasks"** is enabled for **all departments** (`Marketing`, `Design- Electrical`, `Design- Mechanical`, `Procurement`, `Production & QC & Dispatch`).
   - Each logged-in user sees **only their own department's tasks** (e.g. `swatidesign` sees only Electrical Design tasks, `swatipurchase` sees only Procurement tasks).
5. **Direct Assignment into "My Task":**
   - Whenever a job is accepted or assigned to a user, the task is **directly added into their My Task** view.
   - Leads/users can also directly assign a department task to a specific team member, immediately reflecting in that user's **My Task** list (`task_name`, `department`, `assigned_user`, `start_date`, `target_date`, `estimated_effort`, `status = In Progress`).

---

### B. Strict Separation of Roles & Attributes

| Attribute | Definition | Practical Example |
| :--- | :--- | :--- |
| **Department** | The operational department that owns the active stage | `Marketing`, `Design- Electrical`, `Procurement` |
| **Responsible Engineer** | Technical engineer accountable for panel specs and drawings | `Hasmukh`, `Aasif`, `Jignesh` |
| **Assigned User** | The authenticated application user currently working on the job | `swatisales2`, `swatidesign`, `swatipurchase` |
| **Current Status** | Current stage lifecycle state | `Pending Acceptance`, `In Progress`, `Ready for Handover` |
| **My Task** | Department work item created automatically upon acceptance or direct assignment | `Prepare Job for Design`, `Design Review & Preparation` |
| **Readiness Check** | Automated validation checklist required before handover unlocks | Customer, panel specs, PO, SLD docs verified |
| **Handover** | Transfer record from Department $A$ to Department $B$ | `Marketing` $\rightarrow$ `Design- Electrical` |
| **History** | Audit log of all acceptances, tasks, completions, and returns | Timestamped logs with accountable user |

> [!NOTE]
> **Responsible Engineer** (e.g. Hasmukh) is strictly separated from **Assigned User** (e.g. `swatisales2`).

---

### C. Sidebar Headings & Department User Mapping

```
Marketing
├── swatisales
├── swatisales2
└── mktadmin

Design- Electrical
├── swatidesign
├── swatidesign2
└── designadmin

Design- Mechanical
├── mechdesign1
├── mechdesign2
└── machinedesign

Procurement
├── swatipurchase
├── swatipurchase2
└── purchaseadmin

Production & QC & Dispatch
├── swatiproduction
├── swatiqc
└── prodadmin
```

---

## 2. File-by-File Changes

---

### Task 1: pgAdmin 4 Database Schema & DDL Scripts

- **Target Files:**
  - [scripts/seed_postgres.py](file:///d:/Job%20planning%20update/scripts/seed_postgres.py)
  - PostgreSQL Database (`job_planning_db` in pgAdmin 4)

#### Planned SQL DDL (Execute in pgAdmin 4 Query Tool):
```sql
-- 1. Create Generalized department_tasks Table
CREATE TABLE IF NOT EXISTS public.department_tasks (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    department VARCHAR(50) NOT NULL, -- 'marketing', 'design', 'mechanical', 'purchase', 'production', 'qc', 'dispatch'
    task_name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    
    -- Assigned Application User
    assigned_user_id INTEGER REFERENCES public.accounts(id),
    assigned_user_name VARCHAR(255) NOT NULL,
    created_by_user_id INTEGER REFERENCES public.accounts(id),
    created_by_name VARCHAR(255) NOT NULL,
    
    -- Scheduling & Efforts
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    target_date DATE NOT NULL,
    completed_at TIMESTAMPTZ NULL,
    estimated_effort_hours NUMERIC(6, 2) DEFAULT 0.00,
    actual_effort_hours NUMERIC(6, 2) DEFAULT 0.00,
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
    
    -- Status & Remarks
    status VARCHAR(50) NOT NULL DEFAULT 'In Progress', -- 'In Progress', 'Completed', 'Blocked'
    blocked_reason TEXT DEFAULT '',
    completion_remarks TEXT DEFAULT '',
    
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dept_tasks_job_dept ON public.department_tasks(job_id, department);
CREATE INDEX IF NOT EXISTS idx_dept_tasks_assigned_user ON public.department_tasks(assigned_user_name, status);
CREATE INDEX IF NOT EXISTS idx_dept_tasks_dept ON public.department_tasks(department, status);

-- 2. Extend jobs table with normalized workflow columns (Non-breaking)
ALTER TABLE public.jobs 
    ADD COLUMN IF NOT EXISTS current_department VARCHAR(50) DEFAULT 'marketing',
    ADD COLUMN IF NOT EXISTS assigned_user_id INTEGER REFERENCES public.accounts(id),
    ADD COLUMN IF NOT EXISTS assigned_user_name VARCHAR(255) DEFAULT '',
    ADD COLUMN IF NOT EXISTS current_workflow_status VARCHAR(50) DEFAULT 'In Progress',
    ADD COLUMN IF NOT EXISTS expected_date DATE NULL;

-- 3. Enhance job_handovers table for clean workflow tracking
ALTER TABLE public.job_handovers
    ADD COLUMN IF NOT EXISTS target_assigned_user_id INTEGER REFERENCES public.accounts(id),
    ADD COLUMN IF NOT EXISTS target_assigned_user_name VARCHAR(255) DEFAULT '',
    ADD COLUMN IF NOT EXISTS responsible_engg_name VARCHAR(255) DEFAULT '',
    ADD COLUMN IF NOT EXISTS is_current_pending BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_handovers_pending ON public.job_handovers(to_department, is_current_pending);
```

#### Planned Changes in `scripts/seed_postgres.py`:
Ensure all 15 department accounts are seeded:
```python
DEFAULT_ACCOUNTS = [
    # Marketing
    {"username": "swatisales", "password": "swatisales", "role": "user", "departments": ["marketing"]},
    {"username": "swatisales2", "password": "swatisales2", "role": "user", "departments": ["marketing"]},
    {"username": "mktadmin", "password": "mktadmin", "role": "user", "departments": ["marketing"]},
    # Design- Electrical
    {"username": "swatidesign", "password": "swatidesign", "role": "user", "departments": ["design"]},
    {"username": "swatidesign2", "password": "swatidesign2", "role": "user", "departments": ["design"]},
    {"username": "designadmin", "password": "designadmin", "role": "user", "departments": ["design"]},
    # Design- Mechanical
    {"username": "mechdesign1", "password": "mechdesign1", "role": "user", "departments": ["mechanical"]},
    {"username": "mechdesign2", "password": "mechdesign2", "role": "user", "departments": ["mechanical"]},
    {"username": "machinedesign", "password": "machinedesign", "role": "user", "departments": ["mechanical"]},
    # Procurement
    {"username": "swatipurchase", "password": "swatipurchase", "role": "user", "departments": ["purchase"]},
    {"username": "swatipurchase2", "password": "swatipurchase2", "role": "user", "departments": ["purchase"]},
    {"username": "purchaseadmin", "password": "purchaseadmin", "role": "user", "departments": ["purchase"]},
    # Production & QC & Dispatch
    {"username": "swatiproduction", "password": "swatiproduction", "role": "user", "departments": ["production"]},
    {"username": "swatiqc", "password": "swatiqc", "role": "user", "departments": ["qc", "production"]},
    {"username": "prodadmin", "password": "prodadmin", "role": "user", "departments": ["production", "dispatch", "qc"]},
]
```

---

### Task 2: Backend Models & Reusable Workflow API

- **Target Files:**
  - [server-py/app/models/__init__.py](file:///d:/Job%20planning%20update/server-py/app/models/__init__.py)
  - [server-py/app/api/v1/job_handover.py](file:///d:/Job%20planning%20update/server-py/app/api/v1/job_handover.py)

#### Planned Changes in `app/models/__init__.py`:
```python
class DepartmentTask(Base):
    __tablename__ = "department_tasks"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    department = Column(String(50), nullable=False, index=True)
    task_name = Column(String(255), nullable=False)
    description = Column(Text, default="")

    assigned_user_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    assigned_user_name = Column(String(255), nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    created_by_name = Column(String(255), nullable=False)

    start_date = Column(Date, nullable=False, default=func.current_date())
    target_date = Column(Date, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    estimated_effort_hours = Column(Numeric(6, 2), default=0.00)
    actual_effort_hours = Column(Numeric(6, 2), default=0.00)
    progress_percentage = Column(Integer, default=0)

    status = Column(String(50), default="In Progress", nullable=False)
    blocked_reason = Column(Text, default="")
    completion_remarks = Column(Text, default="")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

#### Planned Changes in `app/api/v1/job_handover.py`:
Add standardized endpoints for the workflow engine:
1. `GET /api/jobs/{id}/workflow-state` — Consolidated 8-section payload.
2. `POST /api/jobs/{id}/workflow/accept` — Accepts handover, sets status `In Progress`, and **automatically creates `DepartmentTask`** for the destination department.
3. `POST /api/jobs/{id}/workflow/return` — Returns job with clarification reason; sets status `Needs Clarification`.
4. `PATCH /api/jobs/{id}/workflow/my-task` — Updates task progress, actual effort, or marks as `Completed`.
5. `POST /api/jobs/{id}/workflow/direct-assign` — Directly assigns a task/job to a user within the department, immediately creating or reassigning a `DepartmentTask` in their My Task view.
6. `GET /api/jobs/department-tasks/my-tasks` — Returns all active tasks for the current user's department (strictly filtered: regular users only get tasks from their own department; admins can filter by any department).
7. `GET /api/jobs/{id}/workflow/readiness` — Evaluates required fields and documents; returns ready status.
8. `POST /api/jobs/{id}/workflow/handover` — Verifies readiness, closes current department, creates pending incoming record for target department.

---

### Task 3: Sidebar Navigation: "My Tasks" for All Departments (Own Department Only)

- **Target Files:**
  - [client/src/layouts/Layout.jsx](file:///d:/Job%20planning%20update/client/src/layouts/Layout.jsx)
  - [client/src/components/Sidebar.jsx](file:///d:/Job%20planning%20update/client/src/components/Sidebar.jsx)
  - [client/src/App.jsx](file:///d:/Job%20planning%20update/client/src/App.jsx)

#### Planned Changes in `client/src/layouts/Layout.jsx`:
```diff
--- a/client/src/layouts/Layout.jsx
+++ b/client/src/layouts/Layout.jsx
@@ -84,9 +84,8 @@ export default function Layout() {
     { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
     { to: '/search-jobs', label: 'Search Jobs', icon: <Search size={20} /> },
     { to: '/jobs/new', label: 'New Job', icon: <PlusCircle size={20} /> },
+    { to: '/my-tasks', label: 'My Tasks', icon: <CheckSquare size={20} />, badge: pendingTaskCount },
+    { to: '/incoming-jobs', label: 'Incoming Jobs', icon: <ArrowRightLeft size={20} />, badge: pendingHandoverCount },
+    { to: '/my-jobs', label: 'My Jobs', icon: <UserCheck size={20} /> },
   ];
-
-  if (isMarketing) {
-    navItems.push({ to: '/my-tasks', label: 'My Tasks', icon: <CheckSquare size={20} /> });
-  }
-
-  navItems.push({ to: '/my-jobs', label: 'My Jobs', icon: <UserCheck size={20} /> });
```

#### Planned Changes in `client/src/App.jsx`:
Generalize the `/my-tasks` route from Marketing-only to `DepartmentMyTasksPage`, which automatically filters by `user.departments[0]` for regular users:
```diff
--- a/client/src/App.jsx
+++ b/client/src/App.jsx
@@ -18,1 +18,1 @@
-import MarketingMyTasksPage from './jobs/marketing/MarketingMyTasksPage';
+import DepartmentMyTasksPage from './jobs/DepartmentMyTasksPage';
...
@@ -44,1 +44,1 @@
-            <Route path="my-tasks" element={<MarketingMyTasksPage />} />
+            <Route path="my-tasks" element={<DepartmentMyTasksPage />} />
```

---

### Task 4: Handover to Design Modal (`SimpleHandoverModal.jsx`)

- **Target File:** [client/src/jobs/SimpleHandoverModal.jsx](file:///d:/Job%20planning%20update/client/src/jobs/SimpleHandoverModal.jsx)
- **Triggered From:**
  - [client/src/jobs/JobDetail.jsx](file:///d:/Job%20planning%20update/client/src/jobs/JobDetail.jsx)
  - [client/src/jobs/UserJobDetail.jsx](file:///d:/Job%20planning%20update/client/src/jobs/UserJobDetail.jsx)

#### UI Layout & Structure:
```jsx
export default function SimpleHandoverModal({ job, isOpen, onClose, onSuccess }) {
  // State for Send To
  const [targetDepartment, setTargetDepartment] = useState('design');
  const [selectedEngineer, setSelectedEngineer] = useState(job.responsible_engg_name || '');
  const [handoverNote, setHandoverNote] = useState('');
  
  // Available design engineers from departmentUserOptions
  const designEngineers = DEPARTMENT_USER_OPTIONS.design || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 tracking-tight">HANDOVER TO DESIGN</h3>
          <button onClick={onClose}><X size={18} className="text-slate-400 hover:text-slate-600" /></button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Top Job Summary */}
          <div className="space-y-3 pb-3 border-b border-slate-200">
            <div>
              <div className="text-sm font-black text-slate-900">{job.job_no}</div>
              <div className="text-xs text-slate-500 font-medium">{job.panel_name || 'Standard Panel'}</div>
            </div>
            
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Customer</label>
              <div className="text-xs font-semibold text-slate-800">{job.client_name || '—'}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">From Department</label>
                <div className="text-xs font-semibold text-slate-800">Marketing</div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Responsible Engineer</label>
                <div className="text-xs font-semibold text-slate-800">{job.responsible_engg_name || '—'}</div>
              </div>
            </div>
          </div>

          {/* Send To Section */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">Send To</div>

            {/* Department Selector */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500">Department</label>
              <select
                value={targetDepartment}
                onChange={(e) => setTargetDepartment(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
              >
                <option value="design">Electrical Design</option>
                <option value="mechanical">Mechanical Design</option>
              </select>
            </div>

            {/* Target Responsible Engineer Selector */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500">Responsible Engineer</label>
              <select
                value={selectedEngineer}
                onChange={(e) => setSelectedEngineer(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
              >
                <option value="">Select Engineer</option>
                {designEngineers.map((eng) => (
                  <option key={eng} value={eng}>{eng}</option>
                ))}
              </select>
            </div>

            {/* Handover Note */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500">Handover Note</label>
              <textarea
                rows={2}
                value={handoverNote}
                onChange={(e) => setHandoverNote(e.target.value)}
                placeholder="Technical package ready for design..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>

            {/* Readiness Summary */}
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span className="text-xs font-bold text-emerald-800">Readiness: ✓ All required information complete</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
            >
              Handover to Design
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

---

### Task 5: Simplified 8-Section Job Detail UI

- **Target Files:**
  - [client/src/jobs/JobDetail.jsx](file:///d:/Job%20planning%20update/client/src/jobs/JobDetail.jsx)
  - [client/src/jobs/UserJobDetail.jsx](file:///d:/Job%20planning%20update/client/src/jobs/UserJobDetail.jsx)

#### The 8 Clean Sections:
```jsx
<div className="max-w-6xl mx-auto space-y-5 pb-12">
  {/* 1. JOB HEADER */}
  <JobHeaderSection job={job} status={workflowState.currentStatus} />

  {/* 2. JOB PROGRESS */}
  <JobProgressStepper currentDept={workflowState.currentDepartment} status={workflowState.currentStatus} />

  {/* 3. JOB INFORMATION */}
  <JobInformationCard job={job} />

  {/* 4. CURRENT OWNERSHIP */}
  <CurrentOwnershipCard 
    department={workflowState.currentDepartment}
    responsibleEngg={job.responsible_engg_name}
    assignedUser={workflowState.assignedUser}
    status={workflowState.currentStatus}
  />

  {/* 5. MY TASK (Directly assigned or auto-created upon accept) */}
  <MyTaskSection 
    task={workflowState.myTask}
    onDirectAssign={handleDirectAssign}
    onUpdateTask={handleUpdateTask}
    onCompleteTask={handleCompleteTask}
  />

  {/* 6. READINESS CHECK */}
  <ReadinessCheckSection readiness={workflowState.readiness} />

  {/* 7. HANDOVER (Obvious single action) */}
  <HandoverActionSection 
    primaryAction={workflowState.primaryAction}
    onAccept={handleAcceptJob}
    onReturn={handleReturnForClarification}
    onHandover={() => setHandoverModalOpen(true)}
  />

  {/* 8. RECENT HISTORY */}
  <RecentHistorySection history={workflowState.history} />
</div>
```

---

## 3. The 10 Automation Rules

1. **Rule 1 (Handover Creates Incoming):** Handover creates an incoming record for the next department (`status = 'Pending Acceptance'`).
2. **Rule 2 (No Premature Start):** Handover does **not** create or start the target department's task prematurely.
3. **Rule 3 (Auto or Direct My Task Creation):** Acceptance automatically generates the department's My Task and displays it in My Task view. Direct assignment also immediately adds the task to the assigned user's My Task view.
4. **Rule 4 (Status Switch on Acceptance):** Acceptance changes status to `In Progress` and records `assigned_user`.
5. **Rule 5 (Task Completion Triggers Readiness):** Task completion automatically triggers the Readiness Check.
6. **Rule 6 (Readiness Gate for Handover):** Readiness completion (100%) enables the next Handover button. If incomplete, shows missing items with `[ Complete Missing Information ]`.
7. **Rule 7 (Clarification History Preservation):** Return for Clarification sends the job back to the previous department with status `Needs Clarification` and preserves full history.
8. **Rule 8 (No Duplicate Active Tasks):** Never create duplicate active tasks for the same department and job.
9. **Rule 9 (No Concurrent Handovers):** Never allow duplicate handovers while a handover is already `Pending Acceptance`.
10. **Rule 10 (Immutable Audit Trail):** Every acceptance, task creation, direct assignment, completion, handover, and return is recorded in `department_activities`.

---

## 4. Verification & Testing Plan

1. **Marketing Completion & Handover to Design:**
   - Log in as `swatisales2` (Marketing).
   - Complete My Task `Prepare Job for Design`.
   - Verify Readiness Check evaluates to `100% Ready`.
   - Click `[ HANDOVER TO DESIGN ]`.
   - Verify the exact modal card opens displaying:
     * `JOB-45`, `37KW VFD Panel`, `Elite Electricals`, `From Department: Marketing`, `Responsible Engineer: Hasmukh`.
     * `Send To`: `Department: Electrical Design`, `Responsible Engineer: [Select Engineer]`, `Handover Note`, and `Readiness: ✓ All required information complete`.
   - Select Engineer (e.g. `Aasif`), enter note, click `[ Handover to Design ]`.
   - Confirm job enters `Electrical Design` queue as `Pending Acceptance`.
2. **Design Acceptance & Automatic My Task Display:**
   - Log in as `swatidesign` (Design- Electrical).
   - Verify `Incoming Jobs [1]` displays `JOB-45`.
   - Click `[ ACCEPT JOB ]`.
   - **Confirm Automatic My Task Display:**
     * `Design Review & Preparation` is automatically generated.
     * It immediately displays in `swatidesign`'s **My Tasks** in the sidebar and on the page.
3. **Sidebar "My Tasks" Scoping:**
   - Log in as `swatidesign` (Design- Electrical). Verify **My Tasks** shows only Electrical Design tasks.
   - Log in as `swatipurchase` (Procurement). Verify **My Tasks** shows only Procurement tasks.
   - Log in as `swatisales2` (Marketing). Verify **My Tasks** shows only Marketing tasks.
4. **pgAdmin 4 Verification:** Run DDL script, confirm table `department_tasks` and columns in `jobs` and `job_handovers`.
5. **Downstream Flow:** Verify the same reusable cycle through `Procurement (swatipurchase)` $\rightarrow$ `Production & QC (swatiproduction)` $\rightarrow$ `Dispatch (prodadmin)` with zero data loss.
