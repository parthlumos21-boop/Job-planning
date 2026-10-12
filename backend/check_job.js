const mongoose = require('mongoose');
const Job = require('./src/models/Job');

async function check() {
  await mongoose.connect('mongodb://localhost:27017/swati_switchgears_db');
  const job = await Job.findOne({});
  console.log(JSON.stringify(job, null, 2));
  process.exit(0);
}
check();
