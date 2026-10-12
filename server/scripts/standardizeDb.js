const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Job = require('../models/Job');

const INDUSTRY_MAP = {
  "BEVERAGES": "Beverages",
  "Chemical": "Chemicals",
  "Chemicals": "Chemicals",
  "Construction": "Construction & Real Estate",
  "Engineering": "Engineering",
  "Fabric": "Fabrics & Textiles",
  "Fabrics": "Fabrics & Textiles",
  "HEALTHCARE": "Healthcare",
  "Jewellers (Commercial)": "Jewellery",
  "Manufacture": "Manufacturing",
  "Manufacturering": "Manufacturing",
  "Packaging": "Packaging",
  "Paint": "Paint",
  "PHARMA": "Pharmaceuticals",
  "Power Generation": "Power Generation",
  "Real estate and construction industries": "Construction & Real Estate",
  "Solar": "Solar",
  "SOLAR": "Solar",
  "Steel": "Steel",
  "Steel Manufacturing Industry": "Steel",
  "Textiles": "Fabrics & Textiles",
  "Water": "Water"
};

const PANEL_TYPE_MAP = {
  "33KV HT Panel": "33KV HT",
  "ABB Artuk": "ABB Ar-tu-k",
  "ABB ARTUK": "ABB Ar-tu-k",
  "IMCC,NON TTA": "IMCC (Non TTA)",
  "NON TTA": "Non TTA",
  "TTA and NON-TTA": "TTA and Non-TTA"
};

const USER_MAP = {
  "ATISH": "Atish",
  "Bhavesh prajapati": "Bhavesh Prajapati",
  "JAGRUTI PARMAR": "Jagruti Parmar",
  "Jay": "Jay Pandya",
  "JAY PANDYA": "Jay Pandya",
  "Krunal Panel": "Krunal Patel",
  "RAJESHREE PARMAR": "Rajeshree Parmar",
  "AASIF": "Aasif",
  "JAIVIK": "Jaivik",
  "JANAK": "Janak",
  "KEYUR": "Keyur",
  "KINJAL": "Kinjal",
  "KINJAL KEYUR": "Kinjal",
  "MEET": "Meet",
  "PRINCE": "Prince",
  "ROHIT": "Rohit",
  "Disant": "Dishant Panchal",
  "Dishant": "Dishant Panchal",
  "DISHANT PANCHAL": "Dishant Panchal",
  "HITESH": "Hitesh",
  "KESHAV91": "Keshav91",
  "KHUNIT": "Khunit",
  "MAHETAB": "Mahetab",
  "Presh": "Paresh",
  "RAMESHBHAI": "Rameshbhai",
  "RAVI": "Ravi",
  "SACHIN": "Sachin",
  "VIRVIJAY": "Virvijay",
  "swatipurchase": "Swati Purchase",
  "swatipurchase2": "Swati Purchase 2",
  "purchaseadmin": "Purchase Admin",
  "chirag panchal": "Chirag Panchal",
  "Gore lal": "Gore Lal",
  "Pandi ji": "Pandi Ji",
  "PIYUSH GAJERA": "Piyush Gajera",
  "Ravinder Kalu": "Ravinder Kalu",
  "SAURABH NIGAM": "Saurabh Nigam",
  "Shailesh": "Shailesh Chauhan",
  "SHAILESH CHAUHAN": "Shailesh Chauhan",
  "Shubham pandey": "Shubham Pandey",
  "SUSHIL": "Sushil",
  "Tejash": "Tejas",
  "swatiqc": "Swati QC",
  "prodadmin": "Prod Admin",
  "VIPUL": "Vipul"
};

const CLIENT_MAP = {
  "Chiripal Industries Limited (cotton spinning)": "Chiripal Industries Limited",
  "DORF-KETAL CHEMICALS INDIA LIMITED": "Dorf-Ketal Chemicals India Limited",
  "DRASHTA GREEN POWER LIMITED ( BIOTECH )": "Drashta Green Power Limited",
  "DRASHTA GREEN POWER LIMITED ( BIOTECH-2 )": "Drashta Green Power Limited",
  "DRASHTA GREEN POWER LIMITED ( Gulmahor )": "Drashta Green Power Limited",
  "DRASHTA GREEN POWER LIMITED ( Harmony Yarns Pvt Ltd) )": "Drashta Green Power Limited",
  "DRASHTA GREEN POWER LIMITED ( Shri Ram )": "Drashta Green Power Limited",
  "ELITE ELECTRICALS": "Elite Electricals",
  "FILATEX INDIA LIMITED": "Filatex India Limited",
  "HEC INFRA PROJECTS LIMITED": "HEC Infra Projects Limited",
  "KARAMTARA ENGINEERING LTD": "Karamtara Engineering Limited",
  "LINEMARK CROP CARE": "Linemark Crop Care",
  "M/S. STERLING AND WILSON PVT LTD.": "Sterling and Wilson Pvt Ltd.",
  "PRASHANTI MEDICAL SERVICES AND RESEARCH FOUNDATION": "Prashanti Medical Services And Research Foundation",
  "SHUKUN ETHANOL PVT. LTD.": "Shukun Ethanol Pvt. Ltd.",
  "SKAPS INDUSTRIES INDIA PVT. LTD., MUNDRA-SEZ UNIT-II": "SKAPS Industries India Pvt. Ltd.",
  "SNK FLEX PRIVATE LIMITED": "SNK Flex Private Limited",
  "THERMOSAG": "Thermosag India Pvt. Ltd",
  "UNISON PHARMACEUTICALS PVT. LTD.": "Unison Pharmaceuticals Pvt. Ltd.",
  "Waystar Realty Private Limited (15-F, GIFT Road, GIFT City-SEZ , Gandhinagar,)": "Waystar Realty Private Limited"
};

async function standardizeDb() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected to DB: ${process.env.MONGO_URI}`);

    const jobs = await Job.find({});
    let updatedCount = 0;

    for (let job of jobs) {
      let modified = false;

      // Standardize Core Fields
      if (job.typeOfIndustries && INDUSTRY_MAP[job.typeOfIndustries]) {
        job.typeOfIndustries = INDUSTRY_MAP[job.typeOfIndustries];
        modified = true;
      }
      
      if (job.typeOfPanel && PANEL_TYPE_MAP[job.typeOfPanel]) {
        job.typeOfPanel = PANEL_TYPE_MAP[job.typeOfPanel];
        modified = true;
      }

      if (job.clientName && CLIENT_MAP[job.clientName]) {
        job.clientName = CLIENT_MAP[job.clientName];
        modified = true;
      }

      if (job.responsibleEnggName && USER_MAP[job.responsibleEnggName]) {
        job.responsibleEnggName = USER_MAP[job.responsibleEnggName];
        modified = true;
      }

      // Standardize Fields (fields and allDepartmentsData)
      const standardizeObject = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        for (const key in obj) {
          if (typeof obj[key] === 'string') {
            if (USER_MAP[obj[key]]) {
              obj[key] = USER_MAP[obj[key]];
              modified = true;
            }
          } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            standardizeObject(obj[key]);
          }
        }
      };

      if (job.fields) standardizeObject(job.fields);
      if (job.allDepartmentsData) standardizeObject(job.allDepartmentsData);

      if (modified) {
        job.markModified('fields');
        job.markModified('allDepartmentsData');
        await job.save();
        updatedCount++;
      }
    }

    console.log(`Successfully standardized ${updatedCount} out of ${jobs.length} jobs.`);
    process.exit(0);
  } catch (err) {
    console.error('Error during standardization:', err);
    process.exit(1);
  }
}

standardizeDb();
