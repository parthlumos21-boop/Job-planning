const mongoose = require('mongoose');

const DepartmentFormSchema = new mongoose.Schema({
  jobId: { type: Number, required: true },
  department: { type: String, required: true },
  fields: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedBy: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('DepartmentForm', DepartmentFormSchema);
