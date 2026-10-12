const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  clientId: { type: Number, required: true },
  clientName: { type: String },
  srNo: { type: Number },
  jobNo: { type: String, default: "" },
  panelName: { type: String, default: "" },
  projectName: { type: String, default: "" },
  qty: { type: mongoose.Schema.Types.Mixed, default: 1 },
  date: { type: String, default: "" },
  ttl: { type: String, default: "" },
  
  // Marketing Core fields
  typeOfIndustries: { type: String, default: "" },
  incomerRating: { type: String, default: "" },
  typeOfPanel: { type: String, default: "" },
  responsibleEnggName: { type: String, default: "" },
  poNo: { type: String, default: "" },
  poDate: { type: String, default: "" },
  deliveryPeriod: { type: String, default: "" },
  deliveryDate: { type: String, default: "" },
  dataGivenToDesign: { type: String, default: "" },
  deliveryAddress: { type: String, default: "" },
  contactPerson: { type: String, default: "" },

  targetDepartment: { type: String, default: "" },
  targetPosition: { type: String, default: "" },
  createdBy: { type: String, default: "" },
  visibleToDepartments: [{ type: String }],
  selected: { type: Boolean, default: false },
  
  fields: { type: mongoose.Schema.Types.Mixed, default: {} },
  engineers: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true, minimize: false });

module.exports = mongoose.model('Job', JobSchema);
