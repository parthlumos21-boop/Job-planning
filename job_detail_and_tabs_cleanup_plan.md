# Updated Implementation Plan: Status Tabs Cleanup & Marketing Job Detail Scoping

> [!IMPORTANT]
> **Status:** Plan Only — Implementation is on hold until explicitly approved by the user.

---

## 1. User Feedback Alignment

Based on direct feedback on the plan:
- **`All My Jobs`**: **DO NOT TOUCH**. Keep `All My Jobs` as the primary active tab/indicator for all users.
- **`Pending Review`, `Returned`, `Accepted`, `Completed`**: **REMOVE COMPLETELY**. These four status buttons will be removed for all users.
- **`http://localhost:5174/jobs/1` Handover Action**: Remove the "Handover to Design" action before/next to the edit button.
- **`http://localhost:5174/jobs/1` Department Scoping**: Marketing users will **only see their own department (Marketing)**.

---

## 2. File-by-File Changes

### Task 1: Keep "All My Jobs" & Remove 4 Status Tabs in `MyJobs.jsx`

- **Target File:** `client/src/jobs/MyJobs.jsx` (Lines 135–160)
- **Current Code:**
```jsx
<div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
  {[
    { id: 'all', label: 'All My Jobs' },
    { id: 'pending', label: 'Pending Review' },
    { id: 'returned', label: 'Returned' },
    { id: 'accepted', label: 'Accepted' },
    { id: 'completed', label: 'Completed' }
  ].map(tab => (
    ...
  ))}
</div>
```

- **Updated Modification:**
  - **Preserve `All My Jobs`** as the active view button (untouched style and functionality).
  - **Remove**:
    - ❌ `Pending Review`
    - ❌ `Returned`
    - ❌ `Accepted`
    - ❌ `Completed`

#### Planned Diff:
```diff
--- a/client/src/jobs/MyJobs.jsx
+++ b/client/src/jobs/MyJobs.jsx
@@ -137,23 +137,11 @@ export default function MyJobs() {
       {/* Search & Filters */}
       <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
         <div className="relative w-full sm:w-80">
           <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
           <input
             type="text"
             value={search}
             onChange={e => setSearch(e.target.value)}
             placeholder="Search job no, panel, client..."
             className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
           />
         </div>
 
         <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
-          {[
-            { id: 'all', label: 'All My Jobs' },
-            { id: 'pending', label: 'Pending Review' },
-            { id: 'returned', label: 'Returned' },
-            { id: 'accepted', label: 'Accepted' },
-            { id: 'completed', label: 'Completed' }
-          ].map(tab => (
-            <button ... />
-          ))}
+          <button
+            type="button"
+            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white border border-blue-600 shadow-sm whitespace-nowrap cursor-default"
+          >
+            All My Jobs
+          </button>
         </div>
       </div>
```

---

### Task 2: Remove "Handover to Design" on `http://localhost:5174/jobs/1`

- **Target Files:**
  - `client/src/jobs/UserJobDetail.jsx` (Lines 214–223)
  - `client/src/jobs/JobDetail.jsx` (Lines 438–478)

#### Planned Changes in `UserJobDetail.jsx`:
Remove the `Handover to Design →` button placed next to `Edit Details`:
```diff
--- a/client/src/jobs/UserJobDetail.jsx
+++ b/client/src/jobs/UserJobDetail.jsx
@@ -212,12 +212,3 @@
             </button>
           )}
-
-          {!isCompleted && (
-            <button
-              onClick={() => setHandoverModalOpen(true)}
-              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
-            >
-              <Send size={14} />
-              <span>Handover to Design →</span>
-            </button>
-          )}
         </div>
```

#### Planned Changes in `JobDetail.jsx`:
Remove lines 438–478 (the `Design Handover Status` accountability strip and `Handover Job →` button).

---

### Task 3: Marketing Users Only See Their Own Department on `http://localhost:5174/jobs/1`

- **Target Files:**
  - `client/src/jobs/JobDetail.jsx` (Lines 87–89 and 600–612)
  - `client/src/jobs/UserJobDetail.jsx` (Lines 260–285)

#### Planned Changes in `JobDetail.jsx`:
Enforce strict department scoping:
```javascript
// A marketing user is strictly scoped if they don't have admin/executive privileges
const isStrictMarketingUser = isMarketingUser(user) && !isAdmin;
const hasOtherAccess = !isStrictMarketingUser && (isAdmin || (user?.departments && user.departments.some(d => d !== 'marketing')));
```
When `isStrictMarketingUser` is `true`:
- `Engineering & Operational Planning Sections` (`design`, `mechanical`, `purchase`, `production`, `dispatch`, `qc`) are **NOT rendered**.
- Only `Core Job & Commercial Specifications` (`filterDepartments={['marketing']}`) is rendered.
- Other department-specific operational controls are hidden.

#### Planned Changes in `UserJobDetail.jsx`:
- For Marketing users, ensure non-marketing operational sections are not displayed so that only Marketing's own scope (Commercial details, Project & PO specifications, Marketing tasks) is visible.

---

## 3. Verification Plan

1. **Verify `/my-jobs`**:
   - Confirm **"All My Jobs"** is present and intact.
   - Confirm the 4 removed tabs (`Pending Review`, `Returned`, `Accepted`, `Completed`) do NOT appear for any user.
   - Confirm search by Job No, Panel, Client, or Responsible Engineer filters the register table cleanly.

2. **Verify `/jobs/:id` (e.g. `/jobs/1`)**:
   - Confirm the "Handover to Design" button is removed.
   - Confirm the "Edit Details" button remains functional.
   - As a Marketing user:
     - Verify they see **ONLY** the Marketing department data.
     - Verify Design, Mechanical, Purchase, Production, Dispatch, and QC sections are hidden.
   - As an Admin / Executive:
     - Verify multi-department access remains intact.
