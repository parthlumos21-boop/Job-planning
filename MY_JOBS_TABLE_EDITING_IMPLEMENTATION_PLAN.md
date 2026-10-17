# Implementation Plan: `/my-jobs` Table Double-Click Inline Editing & pgAdmin 4 Auto-Save Persistence

> [!IMPORTANT]
> **Status:** Plan Only — Implementation is on hold until explicitly approved by the user. Do NOT implement until confirmed.

---

## 1. Executive Summary & Problem Diagnosis

### A. User Objective
> *"http://localhost:5174/my-jobs for all users and admin also into this can check editing issue any tables can double click editing after change can check pgadmin 4 can data store also did not editing issue can check it can check it into this auto save into this after editing into tables can check it into this can check it"*

Users and Admins navigating to `http://localhost:5174/my-jobs` experience issues when double-clicking table cells in the register:
1. After editing a cell and pressing Enter or clicking away, the cell often reverts to its previous value or fails to update.
2. Changes are not reliably persisted into the PostgreSQL database (inspectable in **pgAdmin 4**).
3. The table needs true **Auto-Save on edit** (both on dropdown change and on text input blur/Enter) with instant database persistence in PostgreSQL and zero UI reversion.

---

### B. Root Cause Analysis

Following code inspection of [client/src/jobs/MyJobs.jsx](file:///d:/Job%20planning%20update/client/src/jobs/MyJobs.jsx), [client/src/components/ExcelTable.jsx](file:///d:/Job%20planning%20update/client/src/components/ExcelTable.jsx), and [server-py/app/api/v1/jobs.py](file:///d:/Job%20planning%20update/server-py/app/api/v1/jobs.py):

#### Root Cause 1: Race Condition in `MyJobs.jsx` (`onJobUpdated={fetchJobs}`)
- In [MyJobs.jsx](file:///d:/Job%20planning%20update/client/src/jobs/MyJobs.jsx#L153):
  `<ExcelTable jobs={filteredJobs} user={user} onJobUpdated={fetchJobs} hideActions={false} />`
- When a cell edit finishes in `ExcelTable.jsx`, it calls `onJobUpdated()` **before** `await api.patch('/jobs/:id/field')` has finished writing to the database.
- `fetchJobs()` immediately sends `GET /api/jobs` to the backend. Because the `PATCH` transaction in PostgreSQL has not committed yet, `GET /api/jobs` returns the **stale old data**, resetting the cell right in front of the user!

#### Root Cause 2: Job ID Lookup Fails in `jobs.py` (`external_id` vs `id`)
- In [jobs.py](file:///d:/Job%20planning%20update/server-py/app/api/v1/jobs.py#L724):
  `stmt = select(Job).where(Job.external_id == id)`
- In `ExcelTable.jsx`, `editingCell.jobId` is passed as `job.id || job._id` (the PostgreSQL primary key integer, e.g. `1`).
- If a job's `external_id` differs from its `id` (or if `id` is passed), the query returns `None` and throws `HTTPException(404, detail="Job not found")`.
- `ExcelTable.jsx` catches this in `catch (err) { console.error('Failed to update field', err); }`, silently failing without persisting to PostgreSQL.

#### Root Cause 3: Department Authorization 403 Rejection for Regular Users
- In [jobs.py](file:///d:/Job%20planning%20update/server-py/app/api/v1/jobs.py#L738):
  `if not is_admin and target_dept not in ["core", "marketing"] and target_dept not in user_depts:`
- `user.departments` in the database contains display strings like `["Design- Electrical"]`, `["Design- Mechanical"]`, `["Procurement"]`, or `["Marketing"]`.
- When editing a cell in `ExcelTable.jsx`, `req.department` sends the lowercase normalized key (e.g. `'design'`, `'mechanical'`, `'purchase'`).
- Because `'design'` is not in `{"Design- Electrical"}`, the backend raises `403 Forbidden: You are not authorized to update fields in the 'design' department`.

#### Root Cause 4: Direct Column Sync Misses camelCase Fields in PostgreSQL
- In [jobs.py](file:///d:/Job%20planning%20update/server-py/app/api/v1/jobs.py#L753):
  The backend checks for human-readable labels:
  `if req.field == "Job No.": job.job_no = str(req.value)`
  `elif req.field == "Name of Panel": job.panel_name = str(req.value)`
  `elif req.field == "Responsible Engg. Name": job.responsible_engg_name = str(req.value)`
- However, `ExcelTable.jsx` uses `f[0]` as the field key, which is camelCase:
  `['jobNo', 'Job No.']` ➔ sends `req.field = 'jobNo'`
  `['panelName', 'Name of Panel']` ➔ sends `req.field = 'panelName'`
  `['clientName']` ➔ sends `req.field = 'clientName'`
  `['responsibleEnggName', 'Responsible Engg. Name']` ➔ sends `req.field = 'responsibleEnggName'`
- Because `req.field` does not equal `"Job No."` or `"Name of Panel"`, the direct columns in PostgreSQL (`job_no`, `panel_name`, `client_name`, `responsible_engg_name`) **never get updated** in the `jobs` table in pgAdmin 4!

---

## 2. End-to-End Data Flow Architecture (pgAdmin 4 & Frontend)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. USER ACTION: Double-click cell in http://localhost:5174/my-jobs                    │
│    • Double-click opens inline input (text, date picker, or select dropdown)           │
│    • User edits value and triggers Auto-Save (dropdown onChange, input onBlur/Enter)   │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. OPTIMISTIC FRONTEND STATE UPDATE (Instant Feedback, Zero Revert)                    │
│    • React state in `MyJobs.jsx` updates immediately in memory                         │
│    • Displays subtle green save checkmark / saving indicator                           │
│    • NO premature network reload (kills race condition)                                │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           │ PATCH /api/jobs/{jobId}/field
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. FASTAPI BACKEND VALIDATION & PERSISTENCE (`jobs.py`)                                │
│    • Robust ID lookup: `Job.id == id OR Job.external_id == id`                         │
│    • Department Normalization: matches `Design- Electrical` to `design` (no 403s)      │
│    • Writes to JSONB `job.fields[department][field] = value`                           │
│    • Direct Column Sync: supports both camelCase & label (`jobNo`, `panelName`, etc.) │
│    • Calls `db.commit()` and `flag_modified(job, "fields")`                            │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 4. POSTGRESQL DATABASE PERSISTENCE (VERIFIED IN PGADMIN 4)                             │
│    • `public.jobs.fields` JSONB updated immediately                                    │
│    • `public.jobs.job_no`, `panel_name`, `client_name`, `responsible_engg_name` updated│
│    • Changes permanently stored and visible on fresh page refresh                      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Proposed File Changes

### Task 1: Optimistic State Update in `MyJobs.jsx` (Eliminate Race Condition)
- **Target File:** [client/src/jobs/MyJobs.jsx](file:///d:/Job%20planning%20update/client/src/jobs/MyJobs.jsx)
- **Problem:** Passing `onJobUpdated={fetchJobs}` causes `GET /jobs` to race with `PATCH` before PostgreSQL commits.
- **Solution:** Implement local state updater `handleJobUpdated` that updates the in-memory `jobs` state immediately:
  ```javascript
  const handleJobUpdated = (jobId, department, field, value) => {
    setJobs(prevJobs => prevJobs.map(job => {
      const jId = job.id || job._id;
      const jExtId = job.externalId || job.external_id;
      if (jId !== jobId && jExtId !== jobId) return job;

      const isCore = department === 'marketing';
      if (isCore) {
        return { ...job, [field]: value };
      }
      return {
        ...job,
        allDepartmentsData: {
          ...(job.allDepartmentsData || {}),
          [department]: {
            ...((job.allDepartmentsData || {})[department] || {}),
            [field]: value
          }
        },
        fields: {
          ...(job.fields || {}),
          [department]: {
            ...((job.fields || {})[department] || {}),
            [field]: value
          }
        }
      };
    }));
  };
  ```
  Pass `onJobUpdated={handleJobUpdated}` to `<ExcelTable />`.

---

### Task 2: Seamless Auto-Save & Visual Feedback in `ExcelTable.jsx`
- **Target File:** [client/src/components/ExcelTable.jsx](file:///d:/Job%20planning%20update/client/src/components/ExcelTable.jsx)
- **Enhancements:**
  1. **Dual ID Resolution:** Send `job.externalId || job.id` so the backend can resolve the record regardless of key format:
     ```javascript
     const jobId = job.externalId || job.external_id || job.id || job._id;
     ```
  2. **Instant Auto-Save on Dropdown Change:**
     For dropdown `<select>`, saving triggers immediately on `onChange` instead of waiting for `onBlur`:
     ```javascript
     onChange={(e) => {
       const newVal = e.target.value;
       setEditValue(newVal);
       handleSave(job, newVal);
     }}
     ```
  3. **Guaranteed Save Execution:**
     Update `handleSave` to accept optional `overrideValue`, apply optimistic state update, and `await api.patch(...)` with error feedback:
     ```javascript
     const handleSave = async (job, directValue = null) => {
       if (!editingCell) return;
       const { department, field } = editingCell;
       const val = directValue !== null ? directValue : editValue;
       const jobId = job.externalId || job.external_id || job.id || job._id;

       setEditingCell(null);
       if (onJobUpdated) onJobUpdated(jobId, department, field, val);

       try {
         await api.patch(`/jobs/${jobId}/field`, { department, field, value: val });
         // Also handle associated date field auto-population if engineer assigned
         ...
       } catch (err) {
         console.error('Failed to update field in PostgreSQL:', err);
         alert(`Failed to save changes: ${err.response?.data?.detail || err.message}`);
       }
     };
     ```
  4. **Active Saving Indicator:** Add a subtle indicator when a cell is actively saving to DB.

---

### Task 3: Backend Fixes in `server-py/app/api/v1/jobs.py`
- **Target File:** [server-py/app/api/v1/jobs.py](file:///d:/Job%20planning%20update/server-py/app/api/v1/jobs.py)
- **Enhancements in `PATCH /api/jobs/{id}/field`:**
  1. **Dual ID Lookup:**
     ```python
     stmt = select(Job).where(or_(Job.external_id == id, Job.id == id))
     res = await db.execute(stmt)
     job = res.scalar_one_or_none()
     if not job:
         raise HTTPException(status_code=404, detail="Job not found")
     ```
  2. **Department Authorization Normalization:**
     ```python
     def normalize_dept(d: str) -> str:
         s = (d or "").lower()
         if "market" in s: return "marketing"
         if "mech" in s: return "mechanical"
         if "elect" in s or "design" in s: return "design"
         if "purch" in s or "proc" in s: return "purchase"
         if "prod" in s or "qc" in s or "disp" in s: return "production"
         return s

     user_dept_keys = {normalize_dept(d) for d in (user.departments or [])}
     target_dept_key = normalize_dept(target_dept)

     # Admin & Keval can edit all departments
     if not is_admin:
         if target_dept_key == "marketing" and "marketing" not in user_dept_keys:
             raise HTTPException(status_code=403, detail="Only Marketing users can edit marketing fields")
         elif target_dept_key != "marketing" and target_dept_key not in user_dept_keys:
             raise HTTPException(status_code=403, detail=f"Unauthorized: You cannot edit '{target_dept}' fields")
     ```
  3. **Direct Column Persistence for Both camelCase and Label:**
     ```python
     # Sync core columns in PostgreSQL `jobs` table
     f_lower = req.field.lower().replace(" ", "").replace(".", "")
     if f_lower in ["jobno"]:
         job.job_no = str(req.value)
     elif f_lower in ["nameofpanel", "panelname"]:
         job.panel_name = str(req.value)
     elif f_lower in ["projectname"]:
         job.project_name = str(req.value)
     elif f_lower in ["clientname", "customername"]:
         job.client_name = str(req.value)
     elif f_lower in ["responsibleenggname", "responsibleengineer"]:
         job.responsible_engg_name = str(req.value)
     elif f_lower in ["typeofindustries"]:
         job.type_of_industries = str(req.value)
     elif f_lower in ["typeofpanel"]:
         job.type_of_panel = str(req.value)
     elif f_lower in ["incomerrating"]:
         job.incomer_rating = str(req.value)
     elif f_lower in ["qty"]:
         try:
             job.qty = int(req.value)
         except Exception:
             pass

     await db.commit()
     await db.refresh(job)
     ```

---

## 4. Verification in pgAdmin 4

After implementing, verify directly in PostgreSQL via pgAdmin 4:
```sql
-- 1. Inspect direct column updates
SELECT id, external_id, job_no, panel_name, client_name, responsible_engg_name, qty
FROM public.jobs
ORDER BY id DESC LIMIT 5;

-- 2. Inspect JSONB department fields
SELECT id, job_no, fields->'marketing' AS marketing_fields, fields->'design' AS design_fields
FROM public.jobs
ORDER BY id DESC LIMIT 5;
```

---

## 5. Verification Checklist

| Step | User / Role | Action | Expected Result |
| :---: | :--- | :--- | :--- |
| **1** | Any User / Admin | Navigate to `http://localhost:5174/my-jobs` | Table loads without error. |
| **2** | Marketing User / Admin | Double-click `Panel Name` or `Client Name`, edit, press Enter | Cell updates immediately without revert. `jobs.panel_name` in pgAdmin 4 updates. |
| **3** | Marketing User / Admin | Double-click `Responsible Engg. Name` dropdown, select an engineer | Dropdown auto-saves immediately on change. `jobs.responsible_engg_name` in pgAdmin 4 updates. |
| **4** | Design User / Admin | Double-click `Rev R0 GA Name of Person` dropdown, select engineer | Auto-saves without 403 Forbidden. `fields->'design'` in pgAdmin 4 updates. |
| **5** | Any User | Edit date field (e.g. `Delivery Date`), select date | Date picker auto-saves on blur. Stored in DB. |
| **6** | Any User | Refresh page (`F5`) | All edited values remain intact (persisted from PostgreSQL). |
| **7** | CLI | Run `npm run build` | Builds with 0 errors. |
