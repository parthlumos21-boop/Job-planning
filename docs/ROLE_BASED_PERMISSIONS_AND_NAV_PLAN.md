# Role-Based Permissions, Department Isolation, Navigation & Live Monitoring Plan

## 1. Executive Summary & Objective

This document outlines the detailed architectural and execution plan for:
1. **Sidebar Navigation Order (`http://localhost:5174/`)**:
   Reorder navigation items for all departments so **New Job** appears directly after **Dashboard**, followed by **My Jobs**:
   $$\text{Dashboard} \longrightarrow \text{New Job} \longrightarrow \text{My Jobs} \longrightarrow \text{Job Handover} \longrightarrow \text{View Jobs} \dots$$
2. **Exclusive Live Monitoring Access**:
   Ensure **Live Monitor & Analytics** (`/live-monitor`) is **strictly displayed and accessible only to Administrators and `keval v shah`**, and completely hidden and blocked for all operational departments (`swatidesign`, `swatipurchase`, `swatiproduction`, `mechdesign1`, etc.).
3. **Core Job Details Read-Only Protection**:
   Ensure that operational departments cannot edit Core Job Details. The section must be strictly view-only for them.
4. **Strict Departmental Field Isolation ("Own Section Only")**:
   Each department user can **only edit fields belonging to their own section**. All other department sections will be hidden or locked to prevent cross-department tampering.

---

## 2. Department & User Role Mapping

| Department Section | Specific Usernames Mentioned | Core Job Details | Department Editable Section | Other Department Access | Live Monitor (`/live-monitor`) |
| :--- | :--- | :---: | :--- | :--- | :---: |
| **Administrator / Executive** | `admin`, `keval v shah`, `admin2`, `keval` | **Full Edit** | Core Job Details, Purchase Order & Delivery, Marketing Remarks | Full access to create & update across all sections | 🟢 **Visible & Accessible** |
| **Marketing** | `swatisales`, `swatisales2`, `mktadmin` | **Full Edit** | Core Job Details, PO & Delivery, Marketing Remarks | Locked / Hidden | 🔴 **Hidden & Blocked** |
| **Design - Electrical** | `swatidesign`, `swatidesign2`, `designadmin` | **Read-Only** | Only Electrical Drawing Dates, BOM, Rev R0–R2 PDF, SLD, GA, BOQ, Control | Cannot edit Core or other departments | 🔴 **Hidden & Blocked** |
| **Procurement** | `swatipurchase`, `swatipurchase2`, `purchaseadmin` | **Read-Only** | Only Switchgear PO Number & Date, Misc PO Number & Date | Cannot edit Core or other departments | 🔴 **Hidden & Blocked** |
| **Production & QC & Dispatch** | `swatiproduction`, `swatiqc`, `prodadmin` | **Read-Only** | Only Production, Busbar, Wiring, Testing, Inspection & Dispatch Clearance | Cannot edit Core or other departments | 🔴 **Hidden & Blocked** |
| **Design - Mechanical** | `mechdesign1`, `mechdesign2`, `machinedesign` | **Read-Only** | Only Fabrication, Door Details, Laser, Punching, Bending, Welding, As-Built | Cannot edit Core or other departments | 🔴 **Hidden & Blocked** |

---

## 3. Core Job Details: Fields to Lock for Non-Marketing Users

The following fields in `NewJobForm.jsx` will be switched from editable inputs to read-only views for non-marketing users:

1. **Job Number (`core.jobNo`)**: e.g., `RA101/01`
2. **Panel Name (`core.panelName`)**: Dropdown selection
3. **Quantity (`core.qty`)**: Numeric input
4. **Industry Type (`core.typeOfIndustries`)**: Dropdown selection
5. **Project Name (`core.projectName`)**: Text input
6. **Customer Name (`core.clientName`)**: Dropdown selection
7. **Panel Type (`core.typeOfPanel`)**: Dropdown selection
8. **Responsible Engineer (`core.responsibleEnggName`)**: Static display with verified engineer badge (`SearchableUserSelect` disabled for non-marketing)
9. **Purchase Order Date (`core.poDate`)**: Date input
10. **Data Given to Design (`core.dataGivenToDesign`)**: Date input

---

## 4. Architectural Implementation Blueprint

### Step 1: Navigation Reordering & Live Monitoring Exclusivity in `Layout.jsx`
* **File**: `client/src/layouts/Layout.jsx`
* **Changes**:
  1. Define `isAdmin`:
     ```javascript
     const isAdmin = user?.role === 'admin' 
       || user?.role === 'executive' 
       || user?.username?.toLowerCase() === 'keval v shah';
     ```
  2. Order `navItems`:
     ```javascript
     const navItems = [
       { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
       { to: '/jobs/new', label: 'New Job', icon: <PlusCircle size={20} /> },
       { to: '/my-jobs', label: 'My Jobs', icon: <UserCheck size={20} /> },
       { to: '/jobs/handover', label: 'Job Handover', icon: <ArrowRightLeft size={20} />, badge: pendingHandoverCount },
       { to: '/jobs', label: 'View Jobs', icon: <Briefcase size={20} /> },
     ];

     // Strictly only for Admin and Keval V Shah
     if (isAdmin) {
       navItems.push({ to: '/live-monitor', label: 'Live Monitor & Analytics', icon: <Activity size={20} /> });
     }

     navItems.push({ to: '/reports', label: 'Reports', icon: <FileText size={20} /> });
     ```

---

### Step 2: Route Protection in `App.jsx`
* **File**: `client/src/App.jsx`
* **Changes**:
  Ensure `AdminOnlyRoute` strictly gates `/live-monitor`:
  ```javascript
  function AdminOnlyRoute({ children }) {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' 
      || user?.role === 'executive' 
      || user?.username?.toLowerCase() === 'keval v shah';
    return isAdmin ? children : <Navigate to="/" replace />;
  }
  ```

---

### Step 3: Core Job Details Read-Only Guard in `NewJobForm.jsx`
* **File**: `client/src/jobs/NewJobForm.jsx`
* **Changes**:
  1. Define permission checker:
     ```javascript
     const canEditCore = user?.role === 'admin' 
       || user?.role === 'executive' 
       || user?.username?.toLowerCase() === 'keval v shah' 
       || primaryDept === 'marketing';
     ```
  2. In the "Core Job Details" section:
     - When `canEditCore === true`: Keep editable `<input>`, `<select>`, and `<SearchableUserSelect />`.
     - When `canEditCore === false`:
       - Replace input elements with formatted read-only displays (disabled input with `bg-slate-100 text-slate-700 cursor-not-allowed` or formatted badge values).
       - Badge at the top of the card will display `"View Only (Managed by Marketing)"` instead of `"Editable Across Workflow"`.
       - `SearchableUserSelect` will be disabled, showing a static badge for the assigned engineer.

---

### Step 4: Department Section Isolation ("Own Section Only")
* **File**: `client/src/jobs/NewJobForm.jsx`
* **Changes**:
  1. For departmental engineers (`primaryDept` is `design`, `purchase`, `mechanical`, or `production`):
     - Hide other department cards so users cannot interact with fields outside their purview.
     - When submitting (`handleSubmit`), filter payload so it only patches fields belonging to `primaryDept`.
  2. For Admin / Keval:
     - Retain full visibility (`showAllForms === true`) to audit or update any department section.

---

### Step 5: Backend API Enforcement in `server-py`
* **File**: `server-py/app/api/v1/jobs.py`
* **Changes**:
  1. **Core Column Modification Guard**:
     Inside `PATCH /api/jobs/{id}/field`:
     ```python
     if (target_dept == "core" or target_dept == "marketing") and not can_manage_core(user):
         raise HTTPException(
             status_code=403,
             detail="Forbidden: Only Marketing and Admins can modify core job details"
         )
     ```
  2. **Department Isolation Guard**:
     Inside `PATCH /api/jobs/{id}/field`:
     ```python
     user_depts = set(user.departments or [])
     is_admin = user.role in ["admin", "executive"] or is_keval(user)

     if not is_admin and target_dept not in user_depts:
         raise HTTPException(
             status_code=403,
             detail=f"Forbidden: You are not authorized to update fields in the '{target_dept}' department"
         )
     ```
  3. **Live Monitoring Backend Guard**:
     Inside `server-py/app/api/v1/job_monitoring.py` and `job_analytics.py`:
     - Confirm all endpoints enforce `require_admin` (`is_admin_or_keval`).

---

## 5. Verification & Testing Matrix

| Test ID | Account Tested | Target Action | Expected Result |
| :--- | :--- | :--- | :--- |
| **T-01** | Any account | Open `http://localhost:5174/` | Sidebar shows: `Dashboard` $\to$ `New Job` $\to$ `My Jobs` $\to$ `Job Handover` $\to$ `View Jobs` |
| **T-02** | `admin` / `keval v shah` | Open sidebar & `/live-monitor` | **Live Monitor & Analytics** is visible and fully operational |
| **T-03** | `swatidesign` / `swatipurchase` / `swatiproduction` / `mechdesign1` | Check sidebar & attempt `/live-monitor` URL | **Live Monitor is NOT visible** in sidebar; direct URL redirects to `/` |
| **T-04** | Direct API call with non-admin token | Attempt GET `/api/job-monitoring/stream` or `/api/job-monitoring/*` | HTTP 403 Forbidden returned |
| **T-05** | `swatidesign` / `designadmin` | Open Job in `NewJobForm` | Core details are read-only; only "Design - Electrical" fields are editable |
| **T-06** | `swatipurchase` / `purchaseadmin` | Open Job in `NewJobForm` | Core details are read-only; only "Procurement" fields are editable |
| **T-07** | `swatiproduction` / `prodadmin` | Open Job in `NewJobForm` | Core details are read-only; only "Production & QC" fields are editable |
| **T-08** | `mechdesign1` / `machinedesign` | Open Job in `NewJobForm` | Core details are read-only; only "Design - Mechanical" fields are editable |
| **T-09** | `admin` / `keval v shah` | Open Job in `NewJobForm` | Full editing rights across Core details and all department sections |
| **T-10** | Direct API call with non-admin token | Attempt to PATCH `/api/jobs/{id}/field` for foreign department or core columns | HTTP 403 Forbidden returned with descriptive error |

---

## 6. Execution Readiness

- **Status**: Updated plan finalized and documented.
- **Action**: Waiting for your explicit approval before modifying any code files.
