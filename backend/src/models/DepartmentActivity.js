const mongoose = require('mongoose');

const DepartmentActivitySchema = new mongoose.Schema({
  jobId: { type: Number, required: true },
  department: { type: String, required: true },
  action: { type: String },
  oldValue: { type: mongoose.Schema.Types.Mixed },
  newValue: { type: mongoose.Schema.Types.Mixed },
  updatedBy: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('DepartmentActivity', DepartmentActivitySchema);
