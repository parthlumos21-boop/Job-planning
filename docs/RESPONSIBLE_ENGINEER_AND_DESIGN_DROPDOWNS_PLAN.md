# Updated Implementation Plan: Responsible Engineer Display & Design Department Integration

> **Target URL:** [http://localhost:5174/jobs/new](http://localhost:5174/jobs/new)  
> **Target Component:** `client/src/jobs/NewJobForm.jsx`  
> **Status:** **Planning Phase Only — Do Not Implement Until Approved**

---

## 1. User Feedback & Requirements Incorporated

1. **"Select Existing Job" Dropdown (For Design & Non-Marketing Departments):**
   - **User Directive:** In the `Select Existing Job` section (`Only Marketing can create new jobs. Select a job to add your department's details`), the dropdown currently only shows `{jobNo} - {panelName}`. The Responsible Engineer's name must be included directly in the dropdown label so department users instantly see who is responsible for each job.
   - **Implementation:** Display format:
     `{j.jobNo} - {j.panelName} — Responsible: {j.responsibleEnggName || 'Not Assigned'}`
2. **Selected Job Banner & Context:**
   - When a job is selected from this dropdown, prominently display the **Originating Responsible Engineer** in the job header card above the department form.
3. **Design Department Dropdown Integration:**
   - In the Design department section:
     - All engineer dropdowns (`Drawing Submission Engineer Name`, `BOM Prepare Engnieer Name`, `Rev R0/R1/R2 PDF Name of Person`) will include the selected **Responsible Engineer** at the top of the list, clearly tagged:
       `{core.responsibleEnggName} - Responsible Engineer`
     - Display an informative badge in the Design header:
       `Responsible Engineer: {core.responsibleEnggName}`
4. **Dynamic User Catalog:**
   - Fetch all 97+ registered system users from `/api/users` so that any user added in the database dynamically appears in dropdowns.

---

## 2. Technical Architecture & Proposed Changes

### Component: `client/src/jobs/NewJobForm.jsx`

### 2.1 Update "Select Existing Job" Dropdown (Lines 524–531)
```diff
  <select value={selectedJobId} onChange={handleJobSelect} className={...}>
    <option value="">-- Select Job No. --</option>
    {jobs.map(j => {
+     const respEngg = j.responsibleEnggName || (j.marketingFields && j.marketingFields['Responsible Engg. Name']) || '';
      return (
        <option key={j.id} value={j.id}>
-         {j.jobNo} - {j.panelName}
+         {j.jobNo} - {j.panelName} {respEngg ? `— Responsible: ${respEngg}` : ''}
        </option>
      );
    })}
  </select>
```

### 2.2 Selected Job Header Badge for Non-Marketing Users
Directly below the "Select Existing Job" dropdown, when a job is selected, display an informative summary card:
```jsx
{selectedJobId && (
  <div className="mt-4 p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 flex flex-wrap items-center justify-between gap-3">
    <div>
      <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Selected Job</span>
      <div className="text-base font-bold text-slate-900 mt-0.5">
        #{core.jobNo} — {core.projectName}
      </div>
      <div className="text-xs text-slate-600 mt-0.5">
        Panel: <span className="font-semibold text-slate-800">{core.panelName}</span> • Client: <span className="font-semibold text-slate-800">{core.clientName}</span>
      </div>
    </div>
    <div className="px-3.5 py-2 bg-white rounded-lg border border-blue-200 shadow-xs">
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">Responsible Engineer</span>
      <span className="text-sm font-bold text-blue-700">{core.responsibleEnggName || 'Not Assigned'}</span>
    </div>
  </div>
)}
```

### 2.3 Design Department Dropdown Integration (Lines 696–721 & Lines 804, 887)
In all Design dropdowns, prepend the originating Responsible Engineer to the options list:
```javascript
const getDesignEngineerOptions = () => {
  const baseOptions = liveUsersByDept.design.length > 0 ? liveUsersByDept.design : DEPARTMENT_USER_OPTIONS.design;
  if (!core.responsibleEnggName) return baseOptions;
  
  // Ensure responsible engineer is at the top with a clear badge label
  const respOption = `${core.responsibleEnggName} - Responsible Engineer`;
  const cleanBase = baseOptions.filter(opt => opt.toLowerCase() !== core.responsibleEnggName.toLowerCase());
  return [respOption, ...cleanBase];
};
```
And in the Design section header:
```jsx
<div className="px-6 py-4 border-b border-gray-200 bg-blue-100/70 flex items-center justify-between">
  <div>
    <h3 className="text-lg font-bold text-blue-900">Design - Electrical Details</h3>
    <p className="text-xs text-blue-800 mt-0.5">Enter electrical design drawings, dates and revisions</p>
  </div>
  {core.responsibleEnggName && (
    <div className="px-3 py-1 bg-white/90 rounded-md border border-blue-200 text-xs text-blue-900">
      <span className="font-medium">Responsible Engg:</span> <span className="font-bold">{core.responsibleEnggName}</span>
    </div>
  )}
</div>
```

### 2.4 Dynamic User Catalog Fetching
Fetch `/api/users` on component mount to dynamically populate all department engineer dropdowns (with fallback to `departmentUserOptions.js` for offline reliability).

---

## 3. Interaction Workflow Summary

```
Non-Marketing / Design User opens http://localhost:5174/jobs/new
   │
   ▼
1. "Select Existing Job" Dropdown opens:
   Shows: "JOB-101 - Main LT Panel — Responsible: Jay Pandya"
          "JOB-102 - APFC Panel — Responsible: Bhavesh Prajapati"
   │
   ▼
2. User selects JOB-101:
   - Header displays: "Responsible Engineer: Jay Pandya"
   - Core details are populated (Read-Only)
   │
   ▼
3. User fills Design Department section:
   - "Drawing Submission Engineer Name" dropdown offers:
     • Jay Pandya - Responsible Engineer
     • Aasif - Design
     • Jaivik - Design
     • Janak - Design
     • ...
   - User can select Jay Pandya or any Design engineer
```

---

## 4. Verification & Testing Plan

### Automated Checks
- Run `npm run build` in `client/` to verify zero compilation errors.

### Manual Verification (`http://localhost:5174/jobs/new`)
1. **Design User Login:**
   - Log in as `swatidesign` (or non-marketing user).
   - Navigate to `http://localhost:5174/jobs/new`.
2. **"Select Existing Job" Dropdown:**
   - Click the dropdown.
   - Verify each option displays: `{Job No} - {Panel Name} — Responsible: {Responsible Engineer}`.
3. **Selection Context:**
   - Select a job.
   - Verify the summary card displays the Responsible Engineer clearly.
4. **Design Dropdowns:**
   - Scroll to the Design section.
   - Verify `Drawing Submission Engineer Name` and `BOM Prepare Engnieer Name` dropdowns list the Responsible Engineer.
5. **Marketing User Login:**
   - Log in as `swatisales` / `admin`.
   - Verify Marketing can create jobs with the dynamic Responsible Engineer dropdown containing all system users.
