const express = require("express");
const db = require("../../database/db");
const {
  canManageJobCore,
  canViewJob,
  visibleDepartmentsForJob,
} = require("../utils/jobAccess");

const router = express.Router();

router.get("/", async (req, res) => {
  let { department, user, client, search, selectedOnly } = req.query;
  
  const isAdmin = req.user.role === 'admin' || req.user.role === 'executive';

  if (!isAdmin) {
    // Backend must always filter using department == loggedInUser.department
    // Force department to the user's primary department if not admin
    if (req.user.departments && req.user.departments.length > 0) {
      department = req.user.departments[0];
    } else {
      return res.status(403).json({ error: "User has no department assigned" });
    }
  }

  let jobs = await db.queryJobs({ department, user, client, search });

  jobs = jobs.filter((j) => canViewJob(req.user, j, department));

  if (selectedOnly === "true") {
    jobs = jobs.filter((j) => j.selected);
  }

  // Sort descending by ID so newest jobs are at the top
  jobs.sort((a, b) => b.id - a.id);

  const rows = jobs.map((j) => {
    const departmentEngineers = department ? (j.engineers || {})[department] || [] : [];
    const marketingEngineers = (j.engineers || {}).marketing || [];
    const targetEngineers = j.targetDepartment ? (j.engineers || {})[j.targetDepartment] || [] : [];
    const displayEngineers = department
      ? departmentEngineers.length ? departmentEngineers : marketingEngineers.length ? marketingEngineers : targetEngineers
      : j.engineers;

    return ({
    id: j.id,
    _id: j._id,
    clientId: j.clientId,
    clientName: j.clientName,
    srNo: j.srNo,
    jobNo: j.jobNo,
    panelName: j.panelName,
    qty: j.qty,
    projectName: j.projectName,
    typeOfIndustries: j.typeOfIndustries || "",
    incomerRating: j.incomerRating || "",
    typeOfPanel: j.typeOfPanel || "",
    responsibleEnggName: j.responsibleEnggName || "",
    poNo: j.poNo || "",
    poDate: j.poDate || "",
    deliveryPeriod: j.deliveryPeriod || "",
    deliveryDate: j.deliveryDate || "",
    dataGivenToDesign: j.dataGivenToDesign || "",
    deliveryAddress: j.deliveryAddress || "",
    contactPerson: j.contactPerson || "",
    ttl: j.ttl || "",
    date: j.date || j.createdAt || "",
    targetDepartment: j.targetDepartment || "",
    targetPosition: j.targetPosition || "",
    visibleToDepartments: j.visibleToDepartments || visibleDepartmentsForJob(j),
    selected: !!j.selected,
    departmentFields: department ? (j.fields || {})[department] || {} : undefined,
    marketingFields: (j.fields || {}).marketing || {},
    allFields: j.fields || {},
    engineers: displayEngineers,
    });
  });

  res.json({ count: rows.length, jobs: rows });
});

router.get("/:id", async (req, res) => {
  const job = await db.getJobById(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (!canViewJob(req.user, job)) {
    return res.status(403).json({ error: "Access denied to this job" });
  }
  res.json(job);
});

router.delete("/:id", async (req, res) => {
  if (!canManageJobCore(req.user)) {
    return res.status(403).json({ error: "Access denied to delete this job" });
  }
  const job = await db.getJobById(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  try {
    await db.deleteJob(req.params.id);
    res.json({ success: true, message: "Job deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete job" });
  }
});

router.patch("/:id/select", async (req, res) => {
  const { selected } = req.body;
  const existing = await db.getJobById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Job not found" });
  if (!canViewJob(req.user, existing)) {
    return res.status(403).json({ error: "Access denied to this job" });
  }
  const job = await db.setJobSelection(req.params.id, selected);
  res.json({ id: job.id, selected: job.selected });
});

router.patch("/:id/field", async (req, res) => {
  const { department, field, value } = req.body;
  const job = await db.getJobById(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (!canViewJob(req.user, job)) {
    return res.status(403).json({ error: "Access denied to this job" });
  }
  const targetDept = department === 'marketing-lock' ? 'marketing' : department;
  
  if (req.user.role !== 'admin' && req.user.role !== 'executive') {
    const isCore = department === 'core';
    const isOwnDept = req.user.departments && req.user.departments.includes(targetDept);

    if (isCore) {
      if (!canManageJobCore(req.user)) {
        return res.status(403).json({ error: "Only admins and marketing can edit core fields" });
      }
    } else {
      if (!isOwnDept) {
        return res.status(403).json({ error: "Access denied to edit this department's fields" });
      }
      
      // Design Department Permissions Enforcement
      if (targetDept === 'design') {
        if (req.user.username !== 'designadmin') {
          const designEngineers = job.engineers?.design || [];
          if (!designEngineers.includes(req.user.username)) {
            return res.status(403).json({ error: "Only the assigned engineer or designadmin can edit this job" });
          }
        }
      }
    }
  }

  await db.updateJobField(req.params.id, targetDept, field, value);
  res.json({ ok: true });
});

router.post("/select-bulk", async (req, res) => {
  const { ids, selected } = req.body;
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: "ids must be an array" });
  }
  const allowedIds = [];
  for (const id of ids) {
    const job = await db.getJobById(id);
    if (job && canViewJob(req.user, job)) {
      allowedIds.push(id);
    }
  }
  const jobs = await db.setBulkSelection(allowedIds, selected);
  res.json({ updated: jobs.length });
});

router.post("/clear-selection", async (req, res) => {
  if (req.user.role === "admin") {
    await db.clearAllSelections();
  } else {
    const allJobs = await db.getAllJobs();
    const visibleIds = allJobs
      .filter((job) => canViewJob(req.user, job))
      .map((job) => job.id);
    await db.setBulkSelection(visibleIds, false);
  }
  res.json({ ok: true });
});

router.post("/", async (req, res) => {
  if (!canManageJobCore(req.user)) {
    return res.status(403).json({ error: "Only admins and marketing can add new jobs" });
  }

  const departments = await db.getDepartments();
  const allDepartmentKeys = departments.map((d) => d.key).filter(Boolean);

  const payload = {
    ...req.body,
    targetDepartment: req.body.targetDepartment || "marketing",
    departmentFields: req.body.departmentFields || req.body.customFields || {},
    createdBy: req.user.username,
    visibleToDepartments: allDepartmentKeys,
  };

  let job;
  try {
    job = await db.createJob(payload);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (payload.targetDepartment) {
    if (req.body.customFields) {
      for (const [key, value] of Object.entries(req.body.customFields)) {
        if (value) {
          await db.updateJobField(job.id, "marketing", key, value);
        }
      }
    }
  }

  if (req.body.allDepartmentsData) {
    for (const [deptKey, fieldsObj] of Object.entries(req.body.allDepartmentsData)) {
      if (!fieldsObj) continue;
      for (const [key, value] of Object.entries(fieldsObj)) {
        if (value) {
          await db.updateJobField(job.id, deptKey, key, value);
        }
      }
    }
  }
    if (req.body.engineers && req.body.engineers.length > 0) {
      await db.allocateEngineers(job.id, payload.targetDepartment, req.body.engineers);
    }

  res.status(201).json(job);
});

module.exports = router;
