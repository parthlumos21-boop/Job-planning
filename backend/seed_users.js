const mongoose = require('mongoose');
const Account = require('./src/models/Account');

const usersToSeed = [
  { username: 'swatisales', role: 'user', departments: ['marketing'] },
  { username: 'swatisales2', role: 'user', departments: ['marketing'] },
  { username: 'mktadmin', role: 'user', departments: ['marketing'] },
  { username: 'swatidesign', role: 'user', departments: ['design'] },
  { username: 'swatidesign2', role: 'user', departments: ['design'] },
  { username: 'designadmin', role: 'user', departments: ['design'] },
  { username: 'mechdesign1', role: 'user', departments: ['mechanical'] },
  { username: 'mechdesign2', role: 'user', departments: ['mechanical'] },
  { username: 'machinedesign', role: 'user', departments: ['mechanical'] },
  { username: 'swatipurchase', role: 'user', departments: ['purchase'] },
  { username: 'swatipurchase2', role: 'user', departments: ['purchase'] },
  { username: 'purchaseadmin', role: 'user', departments: ['purchase'] },
  { username: 'swatiproduction', role: 'user', departments: ['production', 'qc', 'dispatch'] },
  { username: 'swatiqc', role: 'user', departments: ['production', 'qc', 'dispatch'] },
  { username: 'prodadmin', role: 'user', departments: ['production', 'qc', 'dispatch'] }
];

async function seed() {
  await mongoose.connect('mongodb://localhost:27017/swati_switchgears_db');
  console.log("Connected to DB.");

  for (const u of usersToSeed) {
    const existing = await Account.findOne({ username: u.username });
    if (!existing) {
      await Account.create({
        username: u.username,
        password: 'password123', // Default password
        role: u.role,
        departments: u.departments
      });
      console.log(`Created user: ${u.username}`);
    } else {
      // Update departments to match new spec just in case
      existing.departments = u.departments;
      await existing.save();
      console.log(`Updated user: ${u.username}`);
    }
  }

  console.log("Seeding complete.");
  process.exit(0);
}

seed();
