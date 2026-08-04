const mongoose = require('mongoose');

const DepartmentAssignmentSchema = new mongoose.Schema({
  jobId: { type: Number, required: true },
  department: { type: String, required: true },
  assignedUsers: [{ type: String }],
  assignedBy: { type: String },
  assignedDate: { type: Date, default: Date.now },
  status: { type: String, default: "Pending" }
}, { timestamps: true });

module.exports = mongoose.model('DepartmentAssignment', DepartmentAssignmentSchema);
