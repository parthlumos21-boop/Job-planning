const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { EJSON } = require('bson');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/job_planning_db";
const BACKUP_DIR = path.join(__dirname, '..', 'mongo_backup');

async function importDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to database...");
    
    if (!fs.existsSync(BACKUP_DIR)) {
      console.error("No mongo_backup folder found. Please place the folder in the root directory.");
      process.exit(1);
    }

    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'));
    for (let file of files) {
      const collectionName = file.replace('.json', '');
      const collection = mongoose.connection.db.collection(collectionName);
      
      const data = EJSON.parse(fs.readFileSync(path.join(BACKUP_DIR, file), 'utf8'));
      
      if (data.length > 0) {
        await collection.deleteMany({}); // Clear existing data to prevent duplicate keys
        await collection.insertMany(data);
        console.log(`Imported ${data.length} records into ${collectionName}`);
      }
    }
    
    console.log("Database import complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error during import:", err);
    process.exit(1);
  }
}

importDB();
