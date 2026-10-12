require("dotenv").config();
const mongoose = require("mongoose");
const Account = require("../models/Account");
const { DEFAULT_ACCOUNTS } = require("../constants/accounts");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/jobplanning";

function normalize(account) {
  return {
    username: String(account.username || "").trim().toLowerCase(),
    password: String(account.password || "").trim(),
    role: account.role === "admin" ? "admin" : "user",
    departments: Array.isArray(account.departments) ? account.departments : [],
  };
}

async function main() {
  await mongoose.connect(MONGO_URI);

  let upserted = 0;
  for (const rawAccount of DEFAULT_ACCOUNTS) {
    const account = normalize(rawAccount);
    if (!account.username || !account.password) continue;

    await Account.updateOne(
      { username: account.username },
      { $set: account },
      { upsert: true }
    );
    upserted += 1;
  }

  console.log(`Seeded ${upserted} login accounts.`);
}

main()
  .catch((err) => {
    console.error("Account seeding failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
