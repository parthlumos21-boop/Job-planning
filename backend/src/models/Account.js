const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Not hashed in the current system, kept simple as requested
  role: { type: String, enum: ['admin', 'user', 'executive'], default: 'user' },
  departments: [{ type: String }] // Only used if role is 'user'
}, { timestamps: true });

module.exports = mongoose.model('Account', AccountSchema);
