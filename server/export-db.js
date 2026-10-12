const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { EJSON } = require('bson');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/job_planning_db";
const BACKUP_DIR = path.join(__dirname, '..', 'mongo_backup');

async function exportDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to database...");
    
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR);
    }

    const collections = await mongoose.connection.db.collections();
    for (let collection of collections) {
      const data = await collection.find({}).toArray();
      const filePath = path.join(BACKUP_DIR, `${collection.collectionName}.json`);
      fs.writeFileSync(filePath, EJSON.stringify(data, { relaxed: false }, 2));
      console.log(`Exported ${data.length} records from ${collection.collectionName}`);
    }
    
    console.log("Database export complete! Files are in the mongo_backup folder.");
    process.exit(0);
  } catch (err) {
    console.error("Error during export:", err);
    process.exit(1);
  }
}

exportDB();
