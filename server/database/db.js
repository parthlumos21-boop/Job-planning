const Job = require('../models/Job');
const User = require('../models/User');
const Client = require('../models/Client');
const Account = require('../models/Account');
const Config = require('../models/Config');
const DepartmentForm = require('../models/DepartmentForm');
const DepartmentAssignment = require('../models/DepartmentAssignment');
const DepartmentActivity = require('../models/DepartmentActivity');
const { DEFAULT_DEPARTMENTS, DEFAULT_FIELD_DEFS } = require('../constants/workflow');

async function getDepartments() {
  const config = await Config.findOne({ key: 'system_config' }).lean();
  return config && Array.isArray(config.departments) && config.departments.length
    ? config.departments
    : DEFAULT_DEPARTMENTS;
}

async function getFieldDefs() {
  const config = await Config.findOne({ key: 'system_config' }).lean();
  return config && config.fieldDefs && Object.keys(config.fieldDefs).length
    ? config.fieldDefs
    : DEFAULT_FIELD_DEFS;
}

async function getUsers() {
  const accounts = await Account.find().lean();
  return accounts.map(a => ({
    name: a.username,
    departments: a.departments || [],
    jobCount: 0
  })).sort((a, b) => a.name.localeCompare(b.name));
}

async function getAccounts() {
  return await Account.find().lean();
}

async function getAccountByUsername(username) {
  const value = String(username || "").trim();
  if (!value) return null;
  return await Account.findOne({
    username: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  }).lean();
}

async function getClients() {
  return await Client.find().lean();
}

async function getAllJobs() {
  return await Job.find().sort({ id: -1 }).lean();
}

async function getJobById(id) {
  if (!id || id === 'undefined' || isNaN(Number(id))) return null;
  const j = await Job.findOne({ id: Number(id) }).lean();
  if (!j) return null;
  
  j.engineers = {};
  j.fields = {};
  
  const jAssignments = await DepartmentAssignment.find({ jobId: j.id }).lean();
  for (const a of jAssignments) {
    j.engineers[a.department] = a.assignedUsers || [];
  }

  const jForms = await DepartmentForm.find({ jobId: j.id }).lean();
  for (const f of jForms) {
    j.fields[f.department] = f.fields || {};
  }
  
  return j;
}

function visibleDepartmentsForJob(job) {
  const visible = new Set();
  if (job.targetDepartment) visible.add(job.targetDepartment);
  if (Array.isArray(job.visibleToDepartments)) {
    job.visibleToDepartments.forEach((d) => d && visible.add(d));
  }
  Object.entries(job.fields || {}).forEach(([dept, fields]) => {
    if (fields && Object.keys(fields).length > 0) visible.add(dept);
  });
  Object.entries(job.engineers || {}).forEach(([dept, names]) => {
    if (Array.isArray(names) && names.length > 0) visible.add(dept);
  });
  return Array.from(visible);
}

async function getJobByJobNo(jobNo) {
  const needle = String(jobNo || "").trim().toLowerCase();
  if (!needle) return null;
  const jobs = await Job.find().lean();
  return jobs.find((j) => String(j.jobNo || "").trim().toLowerCase() === needle);
}

async function queryJobs({ department, user, client, search } = {}) {
  let jobs = await Job.find().sort({ id: -1 }).lean();

  if (client) {
    jobs = jobs.filter((j) => String(j.clientId) === String(client));
  }

  const allAssignments = await DepartmentAssignment.find({}).lean();
  const allForms = await DepartmentForm.find({}).lean();

  for (const j of jobs) {
    j.engineers = {};
    j.fields = {};
    
    const jAssignments = allAssignments.filter(a => a.jobId === j.id);
    for (const a of jAssignments) {
      j.engineers[a.department] = a.assignedUsers || [];
    }

    const jForms = allForms.filter(f => f.jobId === j.id);
    for (const f of jForms) {
      j.fields[f.department] = f.fields || {};
    }
  }

  if (department) {
    jobs = jobs.filter((j) => visibleDepartmentsForJob(j).includes(department));
  }

  if (user) {
    const needle = user.trim().toUpperCase();
    jobs = jobs.filter((j) => {
      const scope = department ? [department] : Object.keys(j.engineers || {});
      return scope.some((deptKey) =>
        (j.engineers[deptKey] || []).some((name) =>
          name.toUpperCase().includes(needle)
        )
      );
    });
  }

  if (search) {
    const needle = search.trim().toLowerCase();
    jobs = jobs.filter((j) =>
      [j.jobNo, j.panelName, j.projectName, j.clientName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }

  return jobs;
}

async function getUsersByDepartment(departmentKey) {
  const accounts = await Account.find({ 
    departments: departmentKey,
    role: { $ne: 'admin' }
  }).lean();
  return accounts.map(a => ({ name: a.username, jobCount: 0 })).sort((a, b) => a.name.localeCompare(b.name));
}

function requireValue(data, key, label = key) {
  if (data[key] === undefined || data[key] === null || String(data[key]).trim() === "") {
    throw new Error(`${label} is required`);
  }
}

function normalizeAssignedUsers(users) {
  const seen = new Set();
  const values = Array.isArray(users) ? users : [users];
  return values.reduce((acc, user) => {
    const name = String(user || '').trim();
    if (!name) return acc;
    const key = name.toLowerCase();
    if (seen.has(key)) return acc;
    seen.add(key);
    acc.push(name);
    return acc;
  }, []);
}

async function setJobSelection(id, selected) {
  const job = await Job.findOneAndUpdate({ id: Number(id) }, { selected: !!selected }, { new: true });
  return job;
}

async function setBulkSelection(ids, selected) {
  const idSet = ids.map(Number);
  await Job.updateMany({ id: { $in: idSet } }, { selected: !!selected });
  return await Job.find({ id: { $in: idSet } }).lean();
}

async function clearAllSelections() {
  await Job.updateMany({}, { selected: false });
}

async function createJob(data) {
  data.targetDepartment = data.targetDepartment || "marketing";
  requireValue(data, "jobNo", "Job No.");
  requireValue(data, "panelName", "Panel Name");
  requireValue(data, "projectName", "Project Name");
  requireValue(data, "date", "Date");
  requireValue(data, "targetDepartment", "Target Department");

  if (await getJobByJobNo(data.jobNo)) {
    throw new Error("Job No. already exists");
  }

  let client = data.clientId ? await Client.findOne({ id: Number(data.clientId) }) : null;
  if (!client && data.clientId) {
    client = await Client.create({ id: Number(data.clientId), name: data.clientName || 'New Client', jobs: [] });
  } else if (!client && data.clientName) {
    const lastClient = await Client.findOne().sort({ id: -1 });
    client = await Client.create({ id: lastClient ? lastClient.id + 1 : 1, name: data.clientName, jobs: [] });
  } else if (!client) {
    client = await Client.findOne();
  }

  const lastJob = await Job.findOne().sort({ id: -1 });
  const nextId = lastJob ? lastJob.id + 1 : 1;

  const newJob = new Job({
    id: nextId,
    clientId: client ? client.id : null,
    clientName: client ? client.name : null,
    srNo: nextId,
    jobNo: data.jobNo || '',
    panelName: data.panelName || '',
    projectName: data.projectName || '',
    responsibleEnggName: data.responsibleEnggName || '',
    poNo: data.poNo || '',
    poDate: data.poDate || '',
    deliveryPeriod: data.deliveryPeriod || '',
    deliveryDate: data.deliveryDate || '',
    dataGivenToDesign: data.dataGivenToDesign || '',
    deliveryAddress: data.deliveryAddress || '',
    contactPerson: data.contactPerson || '',
    typeOfIndustries: data.typeOfIndustries || '',
    incomerRating: data.incomerRating || '',
    typeOfPanel: data.typeOfPanel || '',
    ttl: data.ttl || '',
    date: data.date || '',
    targetDepartment: data.targetDepartment || '',
    targetPosition: data.targetPosition || '',
    createdBy: data.createdBy || '',
    visibleToDepartments: Array.from(new Set([
      data.targetDepartment,
      ...((Array.isArray(data.visibleToDepartments) && data.visibleToDepartments) || [])
    ].filter(Boolean))),
    qty: data.qty || 1,
    selected: false
  });

  await newJob.save();

  if (data.allDepartmentsData) {
    for (const [deptKey, customFields] of Object.entries(data.allDepartmentsData)) {
      if (!customFields || Object.keys(customFields).length === 0) continue;
      await DepartmentForm.create({
        jobId: nextId,
        department: deptKey,
        fields: customFields,
        updatedBy: data.createdBy || 'system'
      });
      
      let foundEngineers = [];
      for (const [k, v] of Object.entries(customFields)) {
        if (/engineer|person|fitter|wireman|painter|assembler|fabricator|done by|checked by|prepared by/i.test(k) && v) {
          foundEngineers = normalizeAssignedUsers([...foundEngineers, v]);
        }
      }
      
      if (foundEngineers.length > 0) {
         await DepartmentAssignment.create({
           jobId: nextId,
           department: deptKey,
           assignedUsers: foundEngineers,
           assignedBy: data.createdBy || 'system',
           status: 'Assigned'
         });
      }
    }
  }

  if (client) {
    client.jobs.push(newJob.id);
    await client.save();
  }
  return newJob;
}

async function updateJobField(id, department, field, value) {
  const job = await Job.findOne({ id: Number(id) });
  if (!job) return null;
  
  if (department === 'core') {
    if ([
      'panelName', 'projectName', 'jobNo', 'qty', 'date', 'ttl', 'targetPosition',
      'clientName', 'responsibleEnggName', 'poNo', 'poDate', 'deliveryPeriod', 'deliveryDate',
      'dataGivenToDesign', 'deliveryAddress', 'contactPerson', 'typeOfIndustries',
      'incomerRating', 'typeOfPanel'
    ].includes(field)) {
      job[field] = value;
      await job.save();
    } else if (field === 'targetDepartment') {
      job.targetDepartment = value;
      const visible = new Set(job.visibleToDepartments || []);
      if (value) visible.add(value);
      job.visibleToDepartments = Array.from(visible);
      await job.save();
    }
  } else {
    // Handling department specific fields via DepartmentForm
    const form = await DepartmentForm.findOne({ jobId: Number(id), department });
    if (form) {
      form.fields = { ...form.fields, [field]: value };
      form.markModified('fields');
      await form.save();
    } else {
      await DepartmentForm.create({
        jobId: Number(id),
        department,
        fields: { [field]: value },
        updatedBy: 'system'
      });
    }

    if (/engineer|person|fitter|wireman|painter|assembler|fabricator|done by|checked by|prepared by/i.test(field) && value) {
      const assignment = await DepartmentAssignment.findOne({ jobId: Number(id), department });
      if (assignment) {
        const assignedUsers = normalizeAssignedUsers([...(assignment.assignedUsers || []), value]);
        if (assignedUsers.length !== (assignment.assignedUsers || []).length) {
          assignment.assignedUsers = assignedUsers;
          assignment.markModified('assignedUsers');
          await assignment.save();
        }
      } else {
        await DepartmentAssignment.create({
          jobId: Number(id),
          department,
          assignedUsers: [value],
          assignedBy: 'system',
          status: 'Assigned'
        });
      }
    }
    
    if (department === 'marketing' && field === 'Type of Panel') {
      job.ttl = value;
      await job.save();
    }
  }
  
  return await getJobById(id);
}

async function updateJobDepartmentFields(id, department, fields, engineers = null, updater = null) {
  const job = await Job.findOne({ id: Number(id) });
  if (!job) throw new Error("Job not found");

  const form = await DepartmentForm.findOne({ jobId: Number(id), department });
  let oldFields = {};
  if (form) {
    oldFields = { ...form.fields };
    form.fields = { ...form.fields, ...fields };
    form.updatedBy = updater;
    form.markModified('fields');
    await form.save();
  } else {
    await DepartmentForm.create({
      jobId: Number(id),
      department,
      fields,
      updatedBy: updater
    });
  }

  await DepartmentActivity.create({
    jobId: Number(id),
    department,
    action: "Updated Fields",
    oldValue: oldFields,
    newValue: fields,
    updatedBy: updater
  });

  if (engineers !== null) {
    const assignedUsers = normalizeAssignedUsers(engineers);
    const assignment = await DepartmentAssignment.findOne({ jobId: Number(id), department });
    if (assignment) {
      assignment.assignedUsers = assignedUsers;
      assignment.assignedBy = updater;
      assignment.markModified('assignedUsers');
      await assignment.save();
    } else {
      await DepartmentAssignment.create({
        jobId: Number(id),
        department,
        assignedUsers,
        assignedBy: updater,
        status: "Assigned"
      });
    }
  }
}

async function allocateEngineers(id, department, engineers) {
  const assignedUsers = normalizeAssignedUsers(engineers);
  const assignment = await DepartmentAssignment.findOne({ jobId: Number(id), department });
  if (assignment) {
    assignment.assignedUsers = assignedUsers;
    assignment.markModified('assignedUsers');
    await assignment.save();
  } else {
    await DepartmentAssignment.create({
      jobId: Number(id),
      department,
      assignedUsers,
      assignedBy: 'system',
      status: "Assigned"
    });
  }
  return await getJobById(id);
}

async function getJobStats(department) {
  const allJobs = await Job.find().lean();
  let jobs = allJobs;
  
  if (department) {
    // Filter to jobs visible to this department
    const allAssignments = await DepartmentAssignment.find({}).lean();
  }
  return await getJobById(id);
}

async function getJobStats(department) {
  const allJobs = await Job.find().lean();
  let jobs = allJobs;
  
  if (department) {
    // Filter to jobs visible to this department
    const allAssignments = await DepartmentAssignment.find({}).lean();
    const allForms = await DepartmentForm.find({}).lean();
    for (const j of jobs) {
      j.engineers = {};
      j.fields = {};
      const jAssignments = allAssignments.filter(a => a.jobId === j.id);
      for (const a of jAssignments) {
        j.engineers[a.department] = a.assignedUsers || [];
      }
      const jForms = allForms.filter(f => f.jobId === j.id);
      for (const f of jForms) {
        j.fields[f.department] = f.fields || {};
      }
    }
    jobs = jobs.filter(j => visibleDepartmentsForJob(j).includes(department));
  }

  const total = jobs.length;
  let pending = 0, inProgress = 0, completed = 0;

  for (const j of jobs) {
    let status = 'pending';
    if (department) {
      status = (j.departmentStatus || {})[department] || 'pending';
    } else {
      const statuses = Object.values(j.departmentStatus || {});
      if (statuses.includes('in-progress')) {
        status = 'in-progress';
      } else if (statuses.length > 0 && statuses.every(s => s === 'completed')) {
        status = 'completed';
      }
    }

    if (status === 'completed') completed++;
    else if (status === 'in-progress') inProgress++;
    else pending++;
  }

  return { total, pending, inProgress, completed };
}

async function updateDepartmentStatus(jobId, department, status) {
  const job = await Job.findOne({ id: Number(jobId) });
  if (!job) return null;
  if (!job.departmentStatus) {
    job.departmentStatus = {};
  }
  job.departmentStatus[department] = status;
  job.markModified('departmentStatus');
  await job.save();
  return job;
}

module.exports = {
  getDepartments,
  getFieldDefs,
  getUsers,
  getClients,
  getAllJobs,
  getJobById,
  getJobByJobNo,
  visibleDepartmentsForJob,
  queryJobs,
  getAccounts,
  getAccountByUsername,
  getUsersByDepartment,
  setJobSelection,
  setBulkSelection,
  clearAllSelections,
  createJob,
  updateJobField,
  updateJobDepartmentFields,
  allocateEngineers,
  getJobStats,
  updateDepartmentStatus
};
