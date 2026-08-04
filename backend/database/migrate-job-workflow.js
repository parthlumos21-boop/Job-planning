require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Job = require("../src/models/Job");
const User = require("../src/models/User");
const Config = require("../src/models/Config");
const { DEFAULT_DEPARTMENTS, DEFAULT_FIELD_DEFS } = require("../src/constants/workflow");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/jobplanning";
const DATA_FILE = path.join(__dirname, "data.json");

function visibleDepartments(job) {
  const visible = new Set();
  if (job.targetDepartment) visible.add(job.targetDepartment);
  if (Array.isArray(job.visibleToDepartments)) {
    job.visibleToDepartments.forEach((dept) => dept && visible.add(dept));
  }
  Object.entries(job.fields || {}).forEach(([dept, fields]) => {
    if (fields && Object.keys(fields).length > 0) visible.add(dept);
  });
  Object.entries(job.engineers || {}).forEach(([dept, names]) => {
    if (Array.isArray(names) && names.length > 0) visible.add(dept);
  });
  if (visible.size === 0) visible.add("marketing");
  return Array.from(visible);
}

async function main() {
  await mongoose.connect(MONGO_URI);

  await User.collection.dropIndex("username_1").catch((err) => {
    if (err?.codeName !== "IndexNotFound") throw err;
  });

  await Config.updateOne(
    { key: "system_config" },
    {
      $set: {
        departments: DEFAULT_DEPARTMENTS,
        fieldDefs: DEFAULT_FIELD_DEFS,
      },
      $setOnInsert: { key: "system_config" },
    },
    { upsert: true }
  );

  let seededUsers = 0;
  if (fs.existsSync(DATA_FILE)) {
    const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    const sourceUsers = Array.isArray(state.users) ? state.users : [];
    const maxUser = await User.findOne({ id: { $exists: true } }).sort({ id: -1 }).lean();
    let nextUserId = maxUser?.id ? maxUser.id + 1 : 1;

    for (const user of sourceUsers) {
      const name = String(user.name || "").trim();
      if (!name) continue;
      const existing = await User.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).lean();
      if (existing) continue;

      await User.create({
        id: nextUserId++,
        name,
        departments: Array.isArray(user.departments) ? user.departments : [],
        isActive: true,
      });
      seededUsers += 1;
    }
  }

  const jobs = await Job.find();
  let updated = 0;

  for (const job of jobs) {
    const before = JSON.stringify({
      ttl: job.ttl,
      date: job.date,
      targetDepartment: job.targetDepartment,
      targetPosition: job.targetPosition,
      createdBy: job.createdBy,
      visibleToDepartments: job.visibleToDepartments,
    });

    const visible = visibleDepartments(job);
    job.ttl = job.ttl || "";
    job.date = job.date || "";
    job.targetDepartment = job.targetDepartment || visible[0] || "marketing";
    job.targetPosition = job.targetPosition || "";
    job.createdBy = job.createdBy || "migration";
    job.visibleToDepartments = Array.from(new Set([job.targetDepartment, ...visible]));

    const after = JSON.stringify({
      ttl: job.ttl,
      date: job.date,
      targetDepartment: job.targetDepartment,
      targetPosition: job.targetPosition,
      createdBy: job.createdBy,
      visibleToDepartments: job.visibleToDepartments,
    });

    if (before !== after) {
      updated += 1;
      await job.save();
    }
  }

  console.log(`Workflow migration complete. Updated ${updated} jobs. Seeded ${seededUsers} users.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
