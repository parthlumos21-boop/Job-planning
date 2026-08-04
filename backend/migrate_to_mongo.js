require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('./src/models/User');
const Client = require('./src/models/Client');
const Department = require('./src/models/Department');
const Job = require('./src/models/Job');

const dataPath = path.join(__dirname, 'database', 'data.json');
const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/jobtracker');
    console.log('Connected to MongoDB');

    // Clear existing
    await User.deleteMany({});
    await Client.deleteMany({});
    await Department.deleteMany({});
    await Job.deleteMany({});

    // Migrate Users
    for (const acc of rawData.accounts) {
      await User.create({
        username: acc.username,
        password: acc.password,
        role: acc.role,
        departments: acc.departments || []
      });
    }
    console.log('Users migrated');

    // Migrate Departments
    for (const dept of rawData.departments) {
      await Department.create(dept);
    }
    console.log('Departments migrated');

    // Migrate Clients and Jobs
    for (const client of rawData.clients) {
      await Client.create({ id: client.id, name: client.name });
      if (client.jobs) {
        for (const job of client.jobs) {
          await Job.create(job);
        }
      }
    }
    console.log('Clients and Jobs migrated');

    console.log('Migration Complete');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

migrate();
