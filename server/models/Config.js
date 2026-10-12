const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // e.g., 'system_config'
  departments: [{
    key: String,
    name: String
  }],
  fieldDefs: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('Config', ConfigSchema);
