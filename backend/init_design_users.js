const mongoose = require('mongoose');
const Account = require('./src/models/Account');

async function initDesignUsers() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/jobplanning');
    console.log('Connected to MongoDB');

    const usersToCreate = [
      { username: 'swatidesign', role: 'user', departments: ['design'] },
      { username: 'swatidesign2', role: 'user', departments: ['design'] },
      { username: 'designadmin', role: 'user', departments: ['design'] }
    ];

    for (const userData of usersToCreate) {
      const existing = await Account.findOne({ username: userData.username });
      if (!existing) {
        await Account.create({
          ...userData,
          password: 'password123' // default password, they can change it later if implemented
        });
        console.log(`Created user: ${userData.username}`);
      } else {
        console.log(`User ${userData.username} already exists. Ensuring departments are correct.`);
        existing.role = userData.role;
        existing.departments = ['design']; // Strictly enforce isolation
        await existing.save();
      }
    }

    console.log('Design users initialization complete.');
    process.exit(0);
  } catch (error) {
    console.error('Error initializing design users:', error);
    process.exit(1);
  }
}

initDesignUsers();
