const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  fields: [{
    key: String,
    label: String,
    type: String,
    options: [String]
  }]
}, { timestamps: true });

module.exports = mongoose.model('Department', departmentSchema);
