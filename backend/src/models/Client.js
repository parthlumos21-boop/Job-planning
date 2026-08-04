const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  jobs: [{ type: Number }] // array of Job IDs
}, { timestamps: true });

module.exports = mongoose.model('Client', ClientSchema);
