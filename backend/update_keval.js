const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/swati_switchgears_db').then(async () => {
  const Account = mongoose.model('Account', new mongoose.Schema({username: String}, {strict: false}));
  
  // Set the new password for 'keval v shah'
  await Account.updateOne(
    { username: 'keval v shah' },
    { $set: { password: 'SwatiUser2026', role: 'admin' } } // Setting role to admin ensures they have all access
  );
  
  // Remove the other keval accounts to avoid confusion
  await Account.deleteMany({ username: { $in: ['kevalvshah', 'keval'] } });
  
  console.log('Updated keval v shah password and access');
  process.exit(0);
}).catch(console.error);
