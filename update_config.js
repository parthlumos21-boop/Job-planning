const mongoose = require('mongoose');
const { EXCEL_FIELD_DEFS } = require('./backend/src/constants/excelFormat');

mongoose.connect('mongodb://localhost:27017/swati_switchgears_db').then(async () => {
  const Config = mongoose.model('Config', new mongoose.Schema({key: String}, {strict: false}));
  await Config.updateOne({key: 'system_config'}, {$set: {fieldDefs: EXCEL_FIELD_DEFS}});
  console.log('Updated config in DB');
  process.exit(0);
}).catch(console.error);
