const express = require('express');
const db = require('../database/db');
const {
  canManageJobCore,
  canViewJob,
  isKeval,
  visibleDepartmentsForJob,
} = require('../utils/jobAccess');

const router = express.Router();

// GET /api/jobs/stats — dashboard stats for all departments
router.get('/stats', async (req, res) => {
  const departments = ['marketing', 'design', 'mechanical', 'purchase', 'production'];
  const stats = {};
  
  stats.overall = await db.getJobStats(null);
  
  for (const dept of departments) {
    stats[dept] = await db.getJobStats(dept);
  }
  
  res.json(stats);
});

router.get('/', async (req, res) => {
  let { department, user, client, search, selectedOnly } = req.query;
  
  // We no longer restrict non-admins to their own department. Anyone can see all jobs.
  let jobs = await db.queryJobs({ department, user, client, search });

  if (selectedOnly === 'true') {
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
      clientId: j.clientId,
      clientName: j.clientName,
      srNo: j.srNo,
      jobNo: j.jobNo,
      panelName: j.panelName,
      qty: j.qty,
      projectName: j.projectName,
      typeOfIndustries: j.typeOfIndustries || '',
      incomerRating: j.incomerRating || '',
      typeOfPanel: j.typeOfPanel || '',
      responsibleEnggName: j.responsibleEnggName || '',
      poNo: j.poNo || '',
      poDate: j.poDate || '',
      deliveryPeriod: j.deliveryPeriod || '',
      deliveryDate: j.deliveryDate || '',
      dataGivenToDesign: j.dataGivenToDesign || '',
      deliveryAddress: j.deliveryAddress || '',
      contactPerson: j.contactPerson || '',
      ttl: j.ttl || '',
      date: j.date || j.createdAt || '',
      targetDepartment: j.targetDepartment || '',
      targetPosition: j.targetPosition || '',
      visibleToDepartments: j.visibleToDepartments || visibleDepartmentsForJob(j),
      departmentStatus: j.departmentStatus || {},
      selected: !!j.selected,
      departmentFields: department ? (j.fields || {})[department] || {} : undefined,
      marketingFields: (j.fields || {}).marketing || {},
      engineers: displayEngineers,
      fields: j.fields || {},
      allDepartmentsData: j.allDepartmentsData || {},
    });
  });

  res.json({ count: rows.length, jobs: rows });
});

router.post('/', async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'executive' && !isKeval(req.user)) {
    if (!req.user.departments || !req.user.departments.includes('marketing')) {
      return res.status(403).json({ error: 'Only admins and marketing can create jobs' });
    }
  }
  const job = await db.createJob({ ...req.body, createdBy: req.user.username });
  res.json(job);
});

router.post('/select', async (req, res) => {
  const { ids, selected } = req.body;
  const job = await db.setJobSelection(ids[0], selected);
  res.json({ id: job.id, selected: job.selected });
});

router.patch('/:id/select', async (req, res) => {
  const { selected } = req.body;
  const existingJob = await db.getJobById(req.params.id);
  if (!existingJob) return res.status(404).json({ error: 'Job not found' });
  const job = await db.setJobSelection(req.params.id, selected);
  res.json({ id: job.id, selected: job.selected });
});

router.patch('/:id/field', async (req, res) => {
  const { department, field, value } = req.body;
  const job = await db.getJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const targetDept = department === 'marketing-lock' ? 'marketing' : department;
  
  if (req.user.role !== 'admin' && req.user.role !== 'executive' && !isKeval(req.user)) {
    const isCore = department === 'core';
    if (isCore && !canManageJobCore(req.user)) {
      return res.status(403).json({ error: 'Only admins and marketing can edit core fields' });
    }
  }

  await db.updateJobField(req.params.id, targetDept, field, value);
  res.json({ ok: true });
});

router.post('/select-bulk', async (req, res) => {
  const { ids, selected } = req.body;
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'ids must be an array' });
  }
  const allowedIds = ids;
  const jobs = await db.setBulkSelection(allowedIds, selected);
  res.json({ updated: jobs.length });
});

router.post('/clear-selection', async (req, res) => {
  await db.clearAllSelections();
  res.json({ ok: true });
});

router.get('/:id', async (req, res) => {
  const job = await db.getJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

router.patch('/:id/status', async (req, res) => {
  const { department, status } = req.body;
  if (!['pending', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const job = await db.getJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  
  await db.updateJobDepartmentStatus(req.params.id, department, status);
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  const isAdmin = req.user.role === 'admin' || req.user.role === 'executive';
  if (!isAdmin && !isKeval(req.user)) {
    return res.status(403).json({ error: 'Only admins can delete jobs' });
  }
  await db.deleteJob(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
