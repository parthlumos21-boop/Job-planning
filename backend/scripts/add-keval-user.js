const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Account = require('../src/models/Account');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/job_planning_db';

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const username = 'keval v shah';
    const password = 'keval@123';
    const role = 'user';
    const departments = ['marketing'];

    let account = await Account.findOne({ username: new RegExp(`^${username}$`, "i") });
    if (account) {
      console.log('User already exists, updating password and role...');
      account.password = password;
      account.role = role;
      account.departments = departments;
      await account.save();
      console.log('User updated successfully');
    } else {
      console.log('User does not exist, creating...');
      account = new Account({
        username,
        password,
        role,
        departments
      });
      await account.save();
      console.log('User created successfully');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
}

run();
