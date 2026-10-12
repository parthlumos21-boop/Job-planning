const XLSX = require("xlsx-js-style");
const fs = require("fs");

const EXPORT_CONFIG = [
  {
    key: "marketing",
    departmentName: "Marketing",
    tableName: "Marketing Register",
    color: "FF0B5CAD",
    users: "swatisales, swatisales2, mktadmin",
    columns: [
      { name: "Sr. No.", get: (j, i) => i + 1 },
      { name: "Job No.", get: j => j.jobNo },
      { name: "Name of Panel", get: j => j.panelName },
      { name: "Qty.", get: j => j.qty },
      { name: "Type of Industries", get: j => j.fields?.marketing?.["Type of Industries"] || j.fields?.marketing?.["Industry Type"] }
    ]
  }
];

function canViewJob(user, job, department) { return true; }

function applyCustomSheetFormat(ws, rowsCount, columnCount, isMaster = false, merges = []) {
  ws["!cols"] = Array.from({ length: columnCount }, () => ({ wch: 22 }));
  ws["!cols"][0] = { wch: 8 };
  ws["!cols"][1] = { wch: 15 };

  ws["!freeze"] = { xSplit: 2, ySplit: isMaster ? 3 : 7 };
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: isMaster ? 2 : 6, c: 0 }, e: { r: isMaster ? 2 : 6, c: columnCount - 1 } }) };
  
  if (merges.length > 0) {
    ws["!merges"] = merges;
  }
}
function safeSheetName(name) { return String(name).replace(/[\\/?*[\]:]/g, " ").slice(0, 31); }

// Same buildWorkbook as in export.js
function buildWorkbook(jobs, _deps, _fields, user) {
  const wb = XLSX.utils.book_new();
  
  const masterData = [];
  masterData.push(["JOB PLANNING REGISTER"]);
  masterData.push(["Master Register - Financial Year 2026-27 | Exported: " + new Date().toLocaleString("en-IN")]);
  
  const masterSuperHeaders = [];
  const masterHeaders = [];
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } }
  ];

  let currentMasterCol = 0;
  EXPORT_CONFIG.forEach(dept => {
    masterSuperHeaders.push(dept.tableName);
    for (let i = 1; i < dept.columns.length; i++) {
      masterSuperHeaders.push("");
    }
    merges.push({ s: { r: 2, c: currentMasterCol }, e: { r: 2, c: currentMasterCol + dept.columns.length - 1 } });
    
    dept.columns.forEach(col => {
      masterHeaders.push(col.subsection ? `${col.subsection} - ${col.name}` : col.name);
    });
    
    currentMasterCol += dept.columns.length;
  });

  masterData.push(masterSuperHeaders);
  masterData.push(masterHeaders);

  jobs.forEach((job, idx) => {
    const row = [];
    EXPORT_CONFIG.forEach(dept => {
      dept.columns.forEach(col => {
        row.push(col.get(job, idx) || "");
      });
    });
    masterData.push(row);
  });

  const wsMaster = XLSX.utils.aoa_to_sheet(masterData);
  
  for (let R = 0; R < masterData.length; R++) {
    for (let C = 0; C < masterHeaders.length; C++) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!wsMaster[cellAddress]) continue;
      
      let style = { 
        font: { name: "Calibri", sz: 11 }, 
        border: { 
          top: { style: "thin", color: { rgb: "FF000000" } }, 
          bottom: { style: "thin", color: { rgb: "FF000000" } }, 
          left: { style: "thin", color: { rgb: "FF000000" } }, 
          right: { style: "thin", color: { rgb: "FF000000" } } 
        },
        alignment: { vertical: "center", wrapText: true }
      };
      wsMaster[cellAddress].s = style;
    }
  }

  applyCustomSheetFormat(wsMaster, masterData.length, masterHeaders.length, true, merges);
  XLSX.utils.book_append_sheet(wb, wsMaster, "MASTER REGISTER");
  
  return wb;
}

try {
  const jobs = [{ jobNo: "123", panelName: "Test", qty: 1 }];
  const wb = buildWorkbook(jobs, null, null, null);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  console.log("Success!");
} catch (e) {
  console.error("Error:", e);
}
