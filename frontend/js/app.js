/**
 * frontend/js/app.js
 * -----------------------------------------------------------------------
 * Vanilla-JS single page app for the Job Planning & Tracking Register.
 * Talks to the backend REST API (see backend/src/routes/*.js) at /api/*.
 * No build step required - open via the backend server (it serves this
 * folder as static files) and everything just works.
 * -----------------------------------------------------------------------
 */
const API = "/api";

const DEFAULT_DEPARTMENTS = [
  { key: "marketing", name: "Marketing Department", fields: [] },
  { key: "design", name: "Electrical Design Department", fields: [] },
  { key: "purchase", name: "Purchase", fields: [] },
  { key: "mechanical", name: "Mechanical/Fabricator/Assembly Department", fields: [] },
  { key: "production", name: "Production Department/QC Department", fields: [] },
  { key: "dispatch", name: "Dispatch Department", fields: [] },
];

const state = {
  departments: [],
  currentDept: null,
  clients: [],
  users: [],
  visibleFields: {},     // { [deptKey]: Set(fieldName) }  -- checkbox column selection
  selectedJobs: new Set(),
  showSelectedOnly: false,
  jobs: [],
  currentPage: 1,
  pageSize: 10,
  allDepartments: [],
  user: null
};

const el = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const token = localStorage.getItem("token");
  if (token) {
    opts.headers = { ...opts.headers, Authorization: `Bearer ${token}` };
  }
  const res = await fetch(API + path, opts);
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login.html";
    return;
  }
  if (!res.ok) {
    let message = `API error ${res.status} on ${path}`;
    try {
      const data = await res.json();
      message = data.error || data.message || message;
    } catch (e) {}
    throw new Error(message);
  }
  return res.json();
}

async function downloadFile(path, filename) {
  const token = localStorage.getItem("token");
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(API + path, { headers });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login.html";
    return;
  }
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------- boot ---

async function boot() {
  const token = localStorage.getItem("token");
  const userJson = localStorage.getItem("user");
  if (!token || !userJson) {
    window.location.href = "/login.html";
    return;
  }
  state.user = JSON.parse(userJson);
  el("userNameDisplay").textContent = `${state.user.username} (${state.user.role})`;

  let [departments, clients, users] = await Promise.all([
    api("/departments"),
    api("/clients"),
    api("/users"),
  ]);

  if (!Array.isArray(departments) || departments.length === 0) {
    departments = DEFAULT_DEPARTMENTS;
  }

  state.allDepartments = departments;

  if (state.user.role === 'user') {
    departments = departments.filter(d => state.user.departments.includes(d.key));
  }

  state.departments = departments;
  state.clients = clients;
  state.users = users;

  departments.forEach((d) => {
    const stored = loadVisibleFields(d.key);
    state.visibleFields[d.key] = stored || new Set((d.fields || []).slice(0, 8));
  });

  renderTopbarStats();
  renderDeptTabs();
  renderClientFilter();
  if (departments.length > 0) {
    renderUserFilter(departments[0].key);
    state.currentDept = departments[0].key;
  }

  bindStaticEvents();

  if (canManageJobs()) {
    el("newJobBtn").style.display = 'inline-block';
  } else {
    el("newJobBtn").style.display = 'none';
  }

  await refreshJobs();
}

function canManageJobs() {
  return state.user && (
    state.user.role === "admin" ||
    state.user.role === "executive" ||
    (state.user.departments || []).includes("marketing")
  );
}

function renderTopbarStats() {
  const totalJobs = state.departments.length
    ? null
    : null;
  api("/jobs").then(({ count }) => {
    el("topbarStats").innerHTML = `
      <div><b>${state.clients.length}</b>Clients</div>
      <div><b>${count}</b>Jobs</div>
      <div><b>${state.users.length}</b>Users</div>
    `;
  });
}

// ------------------------------------------------------------ dept tabs --

function renderDeptTabs() {
  const wrap = el("deptTabs");
  wrap.innerHTML = "";
  state.departments.forEach((d, i) => {
    const btn = document.createElement("div");
    btn.className = "dept-tab" + (i === 0 ? " active" : "");
    btn.textContent = d.name;
    btn.dataset.key = d.key;
    btn.addEventListener("click", () => switchDepartment(d.key));
    wrap.appendChild(btn);
  });
}

async function switchDepartment(key) {
  state.currentDept = key;
  document.querySelectorAll(".dept-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.key === key);
  });
  renderUserFilter(key);
  el("userFilter").value = "";
  renderColumnsPanel();
  await refreshJobs();
}

// ------------------------------------------------------------- filters --

function renderClientFilter() {
  const sel = el("clientFilter");
  sel.innerHTML = '<option value="">All clients</option>';
  state.clients
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.name} (${c.jobCount})`;
      sel.appendChild(opt);
    });
}

async function renderUserFilter(deptKey) {
  const sel = el("userFilter");
  sel.innerHTML = '<option value="">All users</option>';
  const users = await api(`/departments/${deptKey}/users`);
  users.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u.name;
    opt.textContent = `${u.name} (${u.jobCount})`;
    sel.appendChild(opt);
  });
}

function currentFilters() {
  return {
    department: state.currentDept,
    client: el("clientFilter").value,
    user: el("userFilter").value,
    search: el("searchBox").value,
  };
}

function buildQuery(params) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) q.set(k, v);
  });
  return q.toString();
}

// ------------------------------------------------------------- columns --

function fieldStorageKey(deptKey) {
  return `jobplan.columns.${deptKey}`;
}

function loadVisibleFields(deptKey) {
  try {
    const raw = localStorage.getItem(fieldStorageKey(deptKey));
    if (!raw) return null;
    return new Set(JSON.parse(raw));
  } catch (e) {
    return null;
  }
}

function saveVisibleFields(deptKey) {
  localStorage.setItem(
    fieldStorageKey(deptKey),
    JSON.stringify(Array.from(state.visibleFields[deptKey]))
  );
}

function normalizeName(value) {
  return String(value || "").trim();
}

function usersForDepartment(deptKey) {
  const mapping = {
    marketing: ['swatisales', 'swatisales2', 'mktadmin'],
    design: ['swatidesign', 'swatidesign2', 'designadmin'],
    mechanical: ['mechdesign1', 'mechdesign2', 'machinedesign'],
    purchase: ['swatipurchase', 'swatipurchase2', 'purchaseadmin'],
    production: ['swatiproduction', 'swatiqc', 'prodadmin'],
    qc: ['swatiproduction', 'swatiqc', 'prodadmin'],
    dispatch: ['swatiproduction', 'swatiqc', 'prodadmin']
  };

  const allowedNames = mapping[deptKey] || [];
  
  // Return the allowed names, ensuring proper casing matches state.users if they exist, or just fallback to the predefined string
  return allowedNames.map(name => {
    const userObj = state.users.find(u => normalizeName(u.name).toLowerCase() === name.toLowerCase());
    return userObj ? normalizeName(userObj.name) : name;
  });
}

function populateEngineerSelect(select, deptKey, placeholder = "-- Select Engineer --") {
  select.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = placeholder;
  select.appendChild(empty);

  usersForDepartment(deptKey).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

function marketingValue(fields, label) {
  const aliases = {
    "TTA / NON-TTA": ["TTA / NON-TTA", "Type of Panel"],
  };
  return (aliases[label] || [label]).map((key) => fields[key]).find((value) => value !== undefined && value !== null && value !== "") || "";
}

function getNewJobMarketingValues() {
  const getField = (label) => {
    const el = document.querySelector(`.dept-field[data-dept="marketing"][data-field="${label}"]`);
    return el ? el.value : "";
  };

  return {
    panelName: el("njPanelName")?.value === "__new"
      ? el("njPanelNameNew")?.value.trim() || ""
      : el("njPanelName")?.value || "",
    jobNo: el("njJobNo")?.value || "",
    projectName: el("njProjectName")?.value === "__new"
      ? el("njProjectNameNew")?.value.trim() || ""
      : el("njProjectName")?.value || "",
    respEngg: getField("Responsible Engg. Name") || "",
    poDate: getField("Purchase Order Date") || "",
    dataGiven: getField("Data Given To Design Department") || getField("Data Given To Design") || "",
    typeOfIndustries: getField("Type of Industries") || "",
  };
}

function isPeopleField(field) {
  return /engineer|person|fitter|wireman|painter|assembler|fabricator|done by|checked by|prepared by/i.test(field);
}

function isDateField(field) {
  return /(date|start|complete|submission|received|recived|release|relese|approval|approved|handover|inspection|dispatch|packing)/i.test(field);
}

function renderNewJobDepartmentFields() {
  const container = el("nj-all-departments-container");
  if (!container) return;
  container.innerHTML = "";

  const STATIC_OPTIONS = {
    "Type of Industries": ["Solar", "Chemical", "Water", "Engineering", "Textiles", "Steel", "Packaging", "Paint", "Construction", "Power Generation", "Manufacture", "PHARMA", "Other"],
    "Type of Panel": ["TTA (ABB Ar-tu-k)", "L&T Ti", "IMCC", "Drawout", "NON TTA"],
    "Transportation": ["Inclusive", "Exclusive"],
    "Packing": ["Polythene", "Crate Wooden", "Sea Worthy", "Export"]
  };

  const grid = document.createElement("div");
  grid.className = "form-grid";

  state.allDepartments.forEach((dept) => {
    const fields = Array.isArray(dept.fields) ? dept.fields : [];
    if (fields.length === 0) return;

    fields.forEach((field) => {
      const group = document.createElement("div");
      group.className = "form-group";

      const label = document.createElement("label");
      label.textContent = field;
      group.appendChild(label);

      let control;
      if (STATIC_OPTIONS[field]) {
        control = document.createElement("select");
        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = `-- Select ${field} --`;
        control.appendChild(defaultOpt);
        STATIC_OPTIONS[field].forEach(opt => {
          const option = document.createElement("option");
          option.value = opt;
          option.textContent = opt;
          control.appendChild(option);
        });
      } else if (isPeopleField(field)) {
        control = document.createElement("select");
        const targetDept = field === "Responsible Engg. Name" ? "design" : dept.key;
        populateEngineerSelect(control, targetDept, "-- Select Name --");
      } else {
        control = document.createElement("input");
        control.type = isDateField(field) ? "date" : "text";
      }

      control.classList.add("dept-field");
      control.dataset.dept = dept.key;
      control.dataset.field = field;
      group.appendChild(control);

      // Check if this is a Revision field
      const match = field.match(/^Rev R(\d+) (BOQ|CONTROL|PDF)/);
      if (match) {
        const rev = parseInt(match[1], 10);
        const category = match[2];
        group.classList.add("rev-field", `rev-field-${category}`, `rev-field-${category}-${rev}`);
        if (rev > 0) {
          group.style.display = "none";
        }
      }

      grid.appendChild(group);
    });

    // Add Revision Buttons for Design
    if (dept.key === "design") {
      const btnContainer = document.createElement("div");
      btnContainer.className = "rev-buttons-container";
      btnContainer.style.gridColumn = "1 / -1";
      btnContainer.style.display = "flex";
      btnContainer.style.gap = "10px";
      btnContainer.style.marginTop = "10px";

      ["BOQ", "CONTROL", "PDF"].forEach(category => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-outline btn-sm";
        btn.dataset.maxRev = 0;
        btn.addEventListener("click", () => {
          let maxRev = parseInt(btn.dataset.maxRev, 10);
          if (maxRev < 5) {
            maxRev++;
            btn.dataset.maxRev = maxRev;
            grid.querySelectorAll(`.rev-field-${category}-${maxRev}`).forEach(el => el.style.display = "");
          }
          if (maxRev >= 5) {
            btn.style.display = "none";
          }
        });
        btnContainer.appendChild(btn);
      });
      grid.appendChild(btnContainer);
    }
  });

  container.appendChild(grid);
}
function renderColumnsPanel() {
  const dept = state.departments.find((d) => d.key === state.currentDept);
  const list = el("columnsList");
  list.innerHTML = "";
  if (!dept) return;
  const visible = state.visibleFields[dept.key];

  (dept.fields || []).forEach((field) => {
    const id = `col-${dept.key}-${field.replace(/\W+/g, "_")}`;
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.checked = visible.has(field);
    cb.addEventListener("change", () => {
      if (cb.checked) visible.add(field);
      else visible.delete(field);
      saveVisibleFields(dept.key);
      renderTable();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(field));
    list.appendChild(label);
  });
}

// --------------------------------------------------------------- table --

async function refreshJobs() {
  const filters = currentFilters();
  const query = buildQuery({ ...filters, selectedOnly: state.showSelectedOnly });
  const { jobs } = await api(`/jobs?${query}`);
  state.jobs = jobs;
  state.currentPage = 1;
  renderColumnsPanel();
  renderTable();
}

function renderTable() {
  const dept = state.departments.find((d) => d.key === state.currentDept);
  const departmentFields = dept && dept.key !== "marketing" && Array.isArray(dept.fields)
    ? dept.fields
    : [];
  const head = el("jobsTableHead");
  head.innerHTML = "";
  const headCols = [
    { label: '<input type="checkbox" id="selectAllCb" />', raw: true },
    { label: "Name of Panel" },
    { label: "Job No." },
    { label: "Project Name" },
    { label: "TTA / NON-TTA" },
    { label: "Responsible Engg. Name" },
    { label: "Purchase Order Date" },
    { label: "Data Given To Design" },
    { label: "Type of Industries" },
    { label: "Delivery Date as per P.O." },
    ...departmentFields.map((field) => ({ label: field }))
  ];
  headCols.forEach((c) => {
    const th = document.createElement("th");
    if (c.raw) th.innerHTML = c.label;
    else th.textContent = c.label;
    head.appendChild(th);
  });

  const body = el("jobsTableBody");
  body.innerHTML = "";

  const totalPages = Math.max(1, Math.ceil(state.jobs.length / state.pageSize));
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  const start = (state.currentPage - 1) * state.pageSize;
  const pageJobs = state.jobs.slice(start, start + state.pageSize);

  if (state.jobs.length === 0) {
    body.innerHTML = `<tr><td colspan="${headCols.length}" class="empty-state">No jobs match the current filters.</td></tr>`;
  } else {
    pageJobs.forEach((job) => {
      const tr = document.createElement("tr");
      tr.className = state.selectedJobs.has(job.id) ? "is-selected" : "";

      const tdCb = document.createElement("td");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.selectedJobs.has(job.id);
      cb.addEventListener("change", () => toggleJobSelection(job.id, cb.checked));
      tdCb.appendChild(cb);
      tr.appendChild(tdCb);

      const engineerName = Array.isArray(job.engineers)
        ? job.engineers.join(", ")
        : "";
      const marketingFields = job.marketingFields || {};
      const values = [
        job.panelName,
        job.jobNo,
        job.projectName,
        marketingValue(marketingFields, "TTA / NON-TTA") || job.ttl,
        marketingValue(marketingFields, "Responsible Engg. Name") || engineerName,
        marketingValue(marketingFields, "Purchase Order Date"),
        marketingValue(marketingFields, "Data Given To Design"),
        marketingValue(marketingFields, "Type of Industries"),
        marketingValue(marketingFields, "Delivery Date as per P.O.")
      ];
      values.forEach((v, idx) => {
        const td = document.createElement("td");
        
        // Open job details from the panel name.
        if (idx === 0) {
          const link = document.createElement("a");
          link.href = "#";
          link.textContent = v ?? "";
          link.className = "client-link";
          link.addEventListener("click", (e) => {
            e.preventDefault();
            openJobModal(job.id);
          });
          td.appendChild(link);
        } else {
          td.textContent = v ?? "";
        }
        
        td.title = v ?? "";
        tr.appendChild(td);
      });

      departmentFields.forEach((field) => {
        const td = document.createElement("td");
        const value = (job.departmentFields || {})[field];
        td.textContent = value ?? "";
        td.title = value ?? "";
        tr.appendChild(td);
      });

      body.appendChild(tr);
    });
  }

  const from = state.jobs.length ? start + 1 : 0;
  const to = Math.min(start + pageJobs.length, state.jobs.length);
  el("resultCount").textContent = `${from}-${to} of ${state.jobs.length} job${state.jobs.length === 1 ? "" : "s"} shown`;
  el("pageInfo").textContent = `Page ${state.currentPage} of ${totalPages}`;
  el("prevPageBtn").disabled = state.currentPage <= 1;
  el("nextPageBtn").disabled = state.currentPage >= totalPages;
  updateSelectionUI();

  const selectAllCb = el("selectAllCb");
  if (selectAllCb) {
    selectAllCb.checked = pageJobs.length > 0 && pageJobs.every((j) => state.selectedJobs.has(j.id));
    selectAllCb.addEventListener("change", () => {
      pageJobs.forEach((j) => {
        if (selectAllCb.checked) state.selectedJobs.add(j.id);
        else state.selectedJobs.delete(j.id);
      });
      renderTable();
    });
  }
}

function toggleJobSelection(id, checked) {
  if (checked) state.selectedJobs.add(id);
  else state.selectedJobs.delete(id);
  api(`/jobs/${id}/select`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected: checked }),
  }).catch(() => {});
  renderTable();
}

function updateSelectionUI() {
  el("selectionCount").textContent = `${state.selectedJobs.size} selected`;
}

function showToast(message) {
  const toast = el("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2600);
}

// --------------------------------------------------------------- modal --

async function openJobModal(id) {
  const job = await api(`/jobs/${id}`);
  el("modalTitle").textContent = `${job.jobNo || "Job #" + job.id} — ${job.panelName || ""}`;

  const body = el("modalBody");
  body.innerHTML = "";

  const marketingFields = (job.fields && job.fields.marketing) || {};
  let marketingEng = "—";
  if (job.engineers && job.engineers.marketing && job.engineers.marketing.length > 0) {
    marketingEng = job.engineers.marketing.join(", ");
  }

  // 1. Common Information Section (Preview)
  const summary = document.createElement("div");
  summary.className = "dept-section common-preview";
  summary.innerHTML = `
    <h3 style="background: #2a3f54; color: white; padding: 10px; margin: -15px -15px 15px -15px; border-radius: 8px 8px 0 0;">Job Information Preview</h3>
    <div class="field-grid">
      ${fieldItem("Name of Panel", job.panelName, true, job.id, "core", "panelName")}
      ${fieldItem("Job No.", job.jobNo, true, job.id, "core", "jobNo")}
      ${fieldItem("Project Name", job.projectName, true, job.id, "core", "projectName")}
      ${fieldItem("Responsible Engg. Name", marketingValue(marketingFields, "Responsible Engg. Name") || marketingEng, true, job.id, "core", "engineers.marketing")}
      ${fieldItem("Purchase Order Date", marketingValue(marketingFields, "Purchase Order Date"), true, job.id, "marketing-lock", "Purchase Order Date")}
      ${fieldItem("Data Given To Design", marketingValue(marketingFields, "Data Given To Design"), true, job.id, "marketing-lock", "Data Given To Design")}
      ${fieldItem("Type of Industries", marketingValue(marketingFields, "Type of Industries"), true, job.id, "marketing-lock", "Type of Industries")}
    </div>`;
  body.appendChild(summary);

  // 2. Department-specific forms (Only show for the logged-in user's departments)
  const isAdmin = state.user.role === "admin" || state.user.role === "executive";
  const userDepts = state.user.departments || [];

  state.allDepartments.forEach((d) => {
    // Only show the department if the user is in it, or if they are an admin
    if (!isAdmin && !userDepts.includes(d.key)) return;
    
    // Skip marketing here because we already showed the common preview (unless you want to edit marketing-specific fields?)
    // Actually, marketing fields not in the common preview should still be editable for marketing users.
    
    const deptFields = (job.fields && job.fields[d.key]) || {};
    // Exclude fields already in the common preview to avoid duplicates
    const previewFieldNames = ["Name of Panel", "Job No.", "Project Name", "Responsible Engg. Name", "Purchase Order Date", "Data Given To Design", "Type of Industries"];
    
    const entries = Object.entries(deptFields).filter(([k, v]) => v !== undefined && v !== null && v !== "" && !previewFieldNames.includes(k));
    
    const section = document.createElement("div");
    section.className = "dept-section";
    
    if (entries.length === 0 && d.key !== "marketing") {
      // Don't show empty marketing sections
      section.innerHTML = `<h3>${escapeHtml(d.name)}</h3><p class="empty-note">No data recorded for this department.</p>`;
    } else if (entries.length > 0) {
      section.innerHTML = `<h3>${escapeHtml(d.name)}</h3><div class="field-grid">${entries
        .map(([k, v]) => fieldItem(k, v, false, job.id, d.key, k))
        .join("")}</div>`;
    }
    
    if (section.innerHTML !== "") {
      body.appendChild(section);
    }
  });

  el("jobModal").classList.remove("hidden");
}

function fieldItem(label, value, isSummary = true, jobId = null, dept = null, field = null) {
  if (label === "Date") return "";
  let editableHTML = "";
  
  const isAdmin = state.user && state.user.role === 'admin';
  const canEditCore = state.user && (state.user.role === 'admin' || (state.user.departments && state.user.departments.includes('marketing')));
  const canEditDept = state.user && state.user.departments && state.user.departments.includes(dept);
  const canEdit = (!isSummary && (isAdmin || canEditDept)) || isAdmin; // Admin can always edit
  const isCoreEditable = isSummary && canEditCore && dept === 'core';

  if (canEdit || isCoreEditable) {
    editableHTML = `
      <div class="field-val-container" data-jobid="${jobId}" data-dept="${escapeHtml(dept)}" data-field="${escapeHtml(field)}">
        <span class="v" data-val="${escapeHtml(value || "")}">${escapeHtml(value ?? "—")}</span>
        <span class="edit-pencil" title="Edit">✎</span>
      </div>
    `;
    return `<div class="field-item"><span class="k">${escapeHtml(label)}</span>${editableHTML}</div>`;
  }
  return `<div class="field-item"><span class="k">${escapeHtml(label)}</span><span class="v">${escapeHtml(
    value ?? "—"
  )}</span></div>`;
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Inline editing event delegation
document.querySelector("#modalBody").addEventListener("click", (e) => {
  if (e.target.classList.contains("edit-pencil")) {
    const container = e.target.closest(".field-val-container");
    const dept = container.dataset.dept;
    const isAdmin = state.user && state.user.role === 'admin';
    const canEditCore = state.user && (state.user.role === 'admin' || (state.user.departments && state.user.departments.includes('marketing')));
    const canEditDept = state.user && state.user.departments && state.user.departments.includes(dept);
    const canEdit = isAdmin || canEditDept;

    if (!(canEdit || (canEditCore && dept === 'core'))) {
       return;
    }

    const valSpan = container.querySelector(".v");
    const currentValue = valSpan.dataset.val || "";
    
    const field = container.dataset.field;
    
    if (field === "Type of Industries") {
      container.innerHTML = `
        <select class="inline-edit-input">
          <option value="">-- Select Industry --</option>
          <option value="Solar">Solar</option>
          <option value="Chemical">Chemical</option>
          <option value="Water">Water</option>
          <option value="Engineering">Engineering</option>
          <option value="Textiles">Textiles</option>
          <option value="Steel">Steel</option>
          <option value="Packaging">Packaging</option>
          <option value="Paint">Paint</option>
          <option value="Construction">Construction</option>
          <option value="Power Generation">Power Generation</option>
          <option value="Manufacture">Manufacture</option>
          <option value="PHARMA">PHARMA</option>
          <option value="Other">Other</option>
        </select>
      `;
      const select = container.querySelector("select");
      select.value = currentValue;
      select.focus();
    } else {
      const type = isDateField(field) ? "date" : "text";
      container.innerHTML = `<input class="inline-edit-input" type="${type}" value="${escapeHtml(currentValue)}" />`;
      container.querySelector("input").focus();
    }
    
    const input = container.querySelector(".inline-edit-input");
    const save = async () => {
      if (input.dataset.saving) return;
      input.dataset.saving = "true";
      const newValue = input.value;
      const jobId = container.dataset.jobid;
      const field = container.dataset.field;
      
      try {
        await api(`/jobs/${jobId}/field`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ department: dept, field: field, value: newValue })
        });
        
        valSpan.textContent = newValue || "—";
        valSpan.dataset.val = newValue;
        container.innerHTML = "";
        container.appendChild(valSpan);
        container.innerHTML += ` <span class="edit-pencil" title="Edit">✎</span>`;
        refreshJobs(); 
      } catch (err) {
        alert("Failed to save: " + err.message);
        input.dataset.saving = "";
      }
    };
    
    input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") save(); });
    input.addEventListener("blur", save);
  }
});

// -------------------------------------------------------------- events --

function bindStaticEvents() {
  el("clientFilter").addEventListener("change", refreshJobs);
  el("userFilter").addEventListener("change", refreshJobs);
  let searchTimer;
  el("searchBox").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refreshJobs, 250);
  });

  el("columnsBtn").addEventListener("click", () => {
    el("columnsPanel").classList.toggle("hidden");
  });
  el("columnsClose").addEventListener("click", () => el("columnsPanel").classList.add("hidden"));
  el("colSelectAll").addEventListener("click", () => {
    const dept = state.departments.find((d) => d.key === state.currentDept);
    state.visibleFields[dept.key] = new Set(dept.fields);
    saveVisibleFields(dept.key);
    renderColumnsPanel();
    renderTable();
  });
  el("colSelectNone").addEventListener("click", () => {
    const dept = state.departments.find((d) => d.key === state.currentDept);
    state.visibleFields[dept.key] = new Set();
    saveVisibleFields(dept.key);
    renderColumnsPanel();
    renderTable();
  });

  // Removed showSelectedBtn logic

  el("clearSelectionBtn").addEventListener("click", () => {
    state.selectedJobs.clear();
    api("/jobs/clear-selection", { method: "POST" }).catch(() => {});
    renderTable();
  });

  el("prevPageBtn").addEventListener("click", () => {
    if (state.currentPage > 1) {
      state.currentPage -= 1;
      renderTable();
    }
  });

  el("nextPageBtn").addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(state.jobs.length / state.pageSize));
    if (state.currentPage < totalPages) {
      state.currentPage += 1;
      renderTable();
    }
  });

  el("exportSelectedBtn").addEventListener("click", async () => {
    if (state.selectedJobs.size === 0) {
      alert("Select at least one job (checkbox) before exporting.");
      return;
    }
    const ids = Array.from(state.selectedJobs).join(",");
    await downloadFile(`/export/xlsx?department=${state.currentDept}&ids=${ids}`, "job-planning-selected.xlsx");
  });

  el("exportFilteredBtn").addEventListener("click", async () => {
    const query = buildQuery(currentFilters());
    await downloadFile(`/export/xlsx?${query}`, "job-planning-filtered.xlsx");
  });

  el("modalClose").addEventListener("click", () => el("jobModal").classList.add("hidden"));
  document.querySelector("#jobModal .modal-backdrop").addEventListener("click", () => el("jobModal").classList.add("hidden"));

  // Logout
  el("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login.html";
  });

  // New Job Modal
  el("newJobBtn").addEventListener("click", async () => {
    // Populate departments
    const deptSelect = el("njTargetDepartment");
    deptSelect.innerHTML = "";
    const departmentsForSelect = state.allDepartments.length ? state.allDepartments : DEFAULT_DEPARTMENTS;
    if (!departmentsForSelect.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No departments available";
      deptSelect.appendChild(opt);
    }
    departmentsForSelect.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.key;
      opt.textContent = d.name;
      deptSelect.appendChild(opt);
    });
    deptSelect.value = "marketing";
    renderNewJobDepartmentFields();

    // Marketing creates the job; it is displayed in every department by default.

    // Extract unique panel names and project names from all accessible jobs
    const { jobs } = await api("/jobs");
    const panels = new Set();
    const projects = new Set();
    jobs.forEach(j => {
      if (j.panelName) panels.add(j.panelName);
      if (j.projectName) projects.add(j.projectName);
    });

    const panelDropdown = el("njPanelName");
    panelDropdown.innerHTML = '<option value="">-- Select Panel --</option><option value="__new">+ Add new panel</option>';
    Array.from(panels).sort().forEach(p => {
      const opt = document.createElement("option"); opt.value = p; opt.textContent = p;
      panelDropdown.appendChild(opt);
    });
    el("njPanelNameNew").classList.add("hidden-control");
    el("njPanelNameNew").value = "";

    const projectSelect = el("njProjectName");
    projectSelect.innerHTML = '<option value="">-- Select Project --</option><option value="__new">+ Add new project</option>';
    Array.from(projects).sort().forEach(p => {
      const opt = document.createElement("option"); opt.value = p; opt.textContent = p;
      projectSelect.appendChild(opt);
    });
    el("njProjectNameNew").classList.add("hidden-control");
    el("njProjectNameNew").value = "";

    // Auto-fill dates
    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('.auto-date').forEach(input => {
      input.value = today;
    });
    bindMarketingPreviewSync();
    syncMarketingPreview();

    // Filter tabs based on user role
    const isAdmin = state.user && state.user.role === 'admin';
    const userDepts = state.user && state.user.departments ? state.user.departments : [];
    let firstVisibleTab = null;

    document.querySelectorAll(".nj-tab-btn").forEach(btn => {
      const target = btn.dataset.target;
      const deptKey = target.replace("nj-", "");
      // Strict isolation: users only see tabs for departments they belong to (or if they are admin).
      const hasAccess = isAdmin || userDepts.includes(deptKey);
      
      btn.style.display = hasAccess ? "block" : "none";
      btn.classList.remove("active");
      el(target).classList.remove("active");
      
      if (hasAccess && !firstVisibleTab) {
        firstVisibleTab = { btn, pane: el(target) };
      }
    });

    if (firstVisibleTab) {
      firstVisibleTab.btn.classList.add("active");
      firstVisibleTab.pane.classList.add("active");
    }

    el("newJobModal").classList.remove("hidden");
  });

  el("newJobModalClose").addEventListener("click", () => el("newJobModal").classList.add("hidden"));
  document.querySelector("#newJobModal .modal-backdrop").addEventListener("click", () => el("newJobModal").classList.add("hidden"));

  el("njProjectName").addEventListener("change", () => {
    const isNew = el("njProjectName").value === "__new";
    el("njProjectNameNew").classList.toggle("hidden-control", !isNew);
    el("njProjectNameNew").required = isNew;
    if (isNew) el("njProjectNameNew").focus();
    syncMarketingPreview();
  });

  el("njPanelName").addEventListener("change", () => {
    const isNew = el("njPanelName").value === "__new";
    el("njPanelNameNew").classList.toggle("hidden-control", !isNew);
    el("njPanelNameNew").required = isNew;
    if (isNew) el("njPanelNameNew").focus();
  });

  el("newJobForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const mValues = getNewJobMarketingValues();
    const payload = {
      clientId: "",
      clientName: "Marketing Department",
      jobNo: mValues.jobNo,
      panelName: mValues.panelName,
      projectName: mValues.projectName,
      ttl: mValues.ttl,
      date: el("njDate") ? el("njDate").value : "",
      qty: parseInt(el("njQty")?.value || "1", 10),
      targetDepartment: el("njTargetDepartment")?.value || "marketing",
      targetPosition: el("njTargetPosition")?.value || "",
      engineers: [], // Managed dynamically via allDepartmentsData
      customFields: {},
      allDepartmentsData: {}
    };

    document.querySelectorAll('.dept-field').forEach(input => {
      if (input.value) {
        const dept = input.dataset.dept;
        const field = input.dataset.field;
        if (!payload.allDepartmentsData[dept]) {
          payload.allDepartmentsData[dept] = {};
        }
        payload.allDepartmentsData[dept][field] = input.value;
      }
    });
    
    try {
      await api("/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      el("newJobModal").classList.add("hidden");
      el("newJobForm").reset();
      await refreshJobs();
      showToast("Job added successfully.");
    } catch (err) {
      alert(err.message);
    }
  });
}

boot().catch((err) => {
  console.error(err);
  document.getElementById("jobsTableBody").innerHTML =
    `<tr><td class="empty-state">Failed to load data: ${err.message}. Is the backend server running?</td></tr>`;
});

function initJobChart() {
  const btn = document.getElementById("jobChartBtn");
  if (!btn) return;
  // Only show for keval v shah
  if (state.user && state.user.username.toLowerCase() === "keval v shah") {
    btn.style.display = "inline-block";
  }

  btn.addEventListener("click", () => {
    window.location.href = "/charts.html";
  });
}
