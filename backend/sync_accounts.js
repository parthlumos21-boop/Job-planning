const mongoose = require("mongoose");
const Account = require("./src/models/Account");
const { DEFAULT_ACCOUNTS } = require("./src/constants/accounts");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/swati_switchgears_db";

async function syncAccounts() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.");

    // Update Account model if needed. Account role enum might be restricted to 'admin', 'user'.
    // Need to ensure 'executive' is allowed, or we can just change Account model to allow it.
    for (const acc of DEFAULT_ACCOUNTS) {
      await Account.updateOne(
        { username: acc.username },
        { $set: { password: acc.password, role: acc.role, departments: acc.departments } },
        { upsert: true }
      );
    }
    console.log("Accounts synchronized successfully.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

syncAccounts();
