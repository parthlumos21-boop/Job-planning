const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Job = require('../src/models/Job');
const User = require('../src/models/User');
const Client = require('../src/models/Client');
const Account = require('../src/models/Account');
const Config = require('../src/models/Config');

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/jobplanning";
const DATA_FILE = path.join(__dirname, "data.json");

async function migrate() {
  console.log(`Connecting to MongoDB at ${MONGO_URI}...`);
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  console.log('Reading data.json...');
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  const state = JSON.parse(raw);

  console.log('Clearing existing MongoDB collections...');
  await Job.deleteMany({});
  await User.deleteMany({});
  await Client.deleteMany({});
  await Account.deleteMany({});
  await Config.deleteMany({});

  console.log('Migrating Config (departments, fieldDefs)...');
  const depts = state.departments || [];
  if (!depts.some(d => d.key === 'purchase')) {
    depts.push({ key: 'purchase', name: 'Purchase' });
  }

  const fDefs = state.fieldDefs || {};
  if (!fDefs.purchase) {
    fDefs.purchase = [
      "Switchgears PO No.",
      "Date",
      "Misc PO No.",
      "Date (Misc)"
    ];
  }

  await Config.create({
    key: 'system_config',
    departments: depts,
    fieldDefs: fDefs
  });

  console.log('Migrating Users...');
  const users = (state.users || []).map((u, idx) => ({ id: idx + 1, name: u.name, departments: u.departments || [] }));
  if (users.length) await User.insertMany(users);

  console.log('Migrating Accounts...');
  if (state.accounts && state.accounts.length) {
    await Account.insertMany(state.accounts);
  }

  console.log('Migrating Clients and Jobs...');
  let totalJobs = 0;
  for (const c of (state.clients || [])) {
    const client = await Client.create({ id: c.id, name: c.name, jobs: c.jobs.map(j => j.id) });
    
    for (const j of c.jobs) {
      await Job.create({
        id: j.id,
        clientId: client.id,
        clientName: client.name,
        srNo: j.srNo || j.id,
        jobNo: j.jobNo || '',
        panelName: j.panelName || '',
        projectName: j.projectName || '',
        qty: parseInt(j.qty) || 1,
        date: j.date || '',
        ttl: j.ttl || '',
        targetDepartment: j.targetDepartment || '',
        targetPosition: j.targetPosition || '',
        createdBy: j.createdBy || '',
        visibleToDepartments: j.visibleToDepartments || [],
        selected: !!j.selected,
        fields: j.fields || {},
        engineers: j.engineers || {}
      });
      totalJobs++;
    }
  }

  console.log(`Migration complete! Successfully migrated ${state.clients ? state.clients.length : 0} clients and ${totalJobs} jobs.`);
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
