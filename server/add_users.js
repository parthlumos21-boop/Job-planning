const fs = require("fs");
const path = require("path");
const { DEFAULT_ACCOUNTS } = require("./src/constants/accounts");

const dataFile = path.join(__dirname, "database", "data.json");
const data = JSON.parse(fs.readFileSync(dataFile, "utf-8"));

data.accounts = DEFAULT_ACCOUNTS;

fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf-8");
console.log(`Accounts added successfully. Total accounts: ${DEFAULT_ACCOUNTS.length}`);
