const express = require("express");
const XLSX = require("xlsx-js-style");
const db = require("../database/db");
const { canViewJob } = require("../utils/jobAccess");

const router = express.Router();

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
      { name: "Type of Industries", get: j => j.fields?.marketing?.["Type of Industries"] || j.fields?.marketing?.["Industry Type"] },
      { name: "Project Name", get: j => j.projectName },
      { name: "Incomer Rating", get: j => j.fields?.marketing?.["Incomer Rating"] },
      { name: "Type of Panel", get: j => j.fields?.marketing?.["Type of Panel"] },
      { name: "Responsible Engg. Name", get: j => j.fields?.marketing?.["Responsible Engg. Name"] || j.fields?.marketing?.["Responsible Person"] || (j.engineers?.marketing || []).join(", ") },
      { name: "Purchase Order", get: j => j.fields?.marketing?.["Purchase Order"] },
      { name: "Purchase Order Date", get: j => j.fields?.marketing?.["Purchase Order Date"] || j.fields?.marketing?.["PO Date"] },
      { name: "Delivery Period as per P.O.", get: j => j.fields?.marketing?.["Delivery Period as per P.O."] },
      { name: "Delivery Date as per P.O.", get: j => j.fields?.marketing?.["Delivery Date as per P.O."] || j.fields?.marketing?.["Delivery Date (as per PO)"] },
      { name: "Data Given To Design Dept.", get: j => j.fields?.marketing?.["Data Given To Design Dept."] || j.fields?.marketing?.["Data Given To Design"] || j.fields?.marketing?.["Data Given to Design Date"] },
      { name: "Delivery Address", get: j => j.fields?.marketing?.["Delivery Address"] },
      { name: "Contact Person & Ph. No.", get: j => j.fields?.marketing?.["Contact Person & Ph. No."] || j.fields?.marketing?.["Contact Person & Phone Number"] },
      { name: "Transportation", get: j => j.fields?.marketing?.["Transportation"] },
      { name: "Packing", get: j => j.fields?.marketing?.["Packing"] },
      { name: "Inspection Call Date", get: j => j.fields?.marketing?.["Inspection Call Date"] },
    ]
  },
  {
    key: "design",
    departmentName: "Design - Electrical",
    tableName: "Electrical Design Register",
    color: "FF1E8449",
    users: "swatidesign, swatidesign2, designadmin",
    columns: [
      { name: "Planned Date", subsection: "Electrical Planning Register", get: j => j.fields?.design?.["Planned Date"] },
      { name: "Drawing Submission Date & Engineer Name", subsection: "Drawing Submission Register", get: j => j.fields?.design?.["Drawing Submission Date & Engineer Name"] },
      { name: "Rev R0 GA Start Date", subsection: "GA Drawing Register", get: j => j.fields?.design?.["Rev R0 GA Start Date"] },
      { name: "Rev R0 GA End Date", subsection: "GA Drawing Register", get: j => j.fields?.design?.["Rev R0 GA End Date"] },
      { name: "Rev R0 GA Engineer", subsection: "GA Drawing Register", get: j => j.fields?.design?.["Rev R0 GA Engineer"] },
      { name: "Rev R0 SLD Start Date", subsection: "SLD Drawing Register", get: j => j.fields?.design?.["Rev R0 SLD Start Date"] },
      { name: "Rev R0 SLD End Date", subsection: "SLD Drawing Register", get: j => j.fields?.design?.["Rev R0 SLD End Date"] },
      { name: "Rev R0 SLD Engineer", subsection: "SLD Drawing Register", get: j => j.fields?.design?.["Rev R0 SLD Engineer"] },
      { name: "Rev R0 BOQ Start Date", subsection: "BOQ Register", get: j => j.fields?.design?.["Rev R0 BOQ START DATE"] },
      { name: "Rev R0 BOQ End Date", subsection: "BOQ Register", get: j => j.fields?.design?.["Rev R0 BOQ END DATE"] },
      { name: "Rev R0 BOQ Engineer", subsection: "BOQ Register", get: j => j.fields?.design?.["Rev R0 BOQ Name of Person"] },
      { name: "Rev R0 Control Start Date", subsection: "Control Drawing Register", get: j => j.fields?.design?.["Rev R0 CONTROL START DATE"] },
      { name: "Rev R0 Control End Date", subsection: "Control Drawing Register", get: j => j.fields?.design?.["Rev R0 CONTROL END DATE"] },
      { name: "Rev R0 Control Engineer", subsection: "Control Drawing Register", get: j => j.fields?.design?.["Rev R0 CONTROL Name of Person"] },
      { name: "Rev R0 PDF", subsection: "Revision R0 Register", get: j => j.fields?.design?.["Rev R0 PDF"] },
      { name: "Client Submission Date R0", subsection: "Revision R0 Register", get: j => j.fields?.design?.["Client Submission Date R0"] },
      { name: "Rev R1 (Complete Group)", subsection: "Revision R1 Register", get: j => j.fields?.design?.["Rev R1 (Complete Group)"] },
      { name: "Rev R2 (Complete Group)", subsection: "Revision R2 Register", get: j => j.fields?.design?.["Rev R2 (Complete Group)"] },
      { name: "Final Approved Drawings Received Date", subsection: "Client Approval Register", get: j => j.fields?.design?.["Final Approved Drawings Received Date"] || j.fields?.design?.["Final Approved Date"] },
      { name: "BOM Released To Purchase", subsection: "BOM Release Register", get: j => j.fields?.design?.["BOM Released To Purchase"] || j.fields?.design?.["BOM Released"] || j.fields?.design?.["BOM Release Date"] },
      { name: "SO No. of ERP System", subsection: "ERP SO Register", get: j => j.fields?.design?.["SO No. of ERP System"] || j.fields?.design?.["SO No. of ERP"] },
      { name: "BOM Prepare Engineer Name", subsection: "BOM Release Register", get: j => j.fields?.design?.["BOM Prepare Engineer Name"] || j.fields?.design?.["BOM Prepare Name of Person"] }
    ]
  },
  {
    key: "mechanical",
    departmentName: "Design - Mechanical",
    tableName: "Mechanical Design Register",
    color: "FF8E44AD",
    users: "mechdesign1, mechdesign2, machinedesign",
    columns: [
      { name: "Fabrication Release Date", subsection: "Fabrication Release Register", get: j => j.fields?.mechanical?.["Fabrication Release Date"] },
      { name: "Swati / Outsource Fabricator Name", subsection: "Fabrication Release Register", get: j => j.fields?.mechanical?.["Swati / Outsource Fabricator Name"] },
      { name: "Fabrication Prepare Engineer Name", subsection: "Fabrication Release Register", get: j => j.fields?.mechanical?.["Fabrication Prepare Engineer Name"] || j.fields?.mechanical?.["Fabrication Prepare Engineer"] },
      { name: "Door Details Sent Date", subsection: "Door Details Register", get: j => j.fields?.mechanical?.["Door Details Sent Date"] },
      { name: "Door Details Prepare Engineer Name", subsection: "Door Details Register", get: j => j.fields?.mechanical?.["Door Details Prepare Engineer Name"] || j.fields?.mechanical?.["Door Details Prepare Engineer"] },
      { name: "Execution File Date", subsection: "Execution File Register", get: j => j.fields?.mechanical?.["Execution File Date"] },
      { name: "Execution (PDF) Prepared Engineer", subsection: "Execution File Register", get: j => j.fields?.mechanical?.["Execution (PDF) Prepared Engineer"] || j.fields?.mechanical?.["Execution PDF Prepare Engineer"] },
      { name: "As Built Submission Date", subsection: "As Built Drawing Register", get: j => j.fields?.mechanical?.["As Built Submission Date"] || j.fields?.production?.["As Built Submission Date"] },
      { name: "As Built Prepared by Engineer (Production)", subsection: "As Built Drawing Register", get: j => j.fields?.mechanical?.["As Built Prepared by Engineer (Production)"] || j.fields?.production?.["As Built Prepared By Engineer (Production)"] },
      { name: "As Built (PDF) Prepared by Engineer (Design)", subsection: "As Built Drawing Register", get: j => j.fields?.mechanical?.["As Built (PDF) Prepared by Engineer (Design)"] || j.fields?.production?.["As Built PDF Prepared By Engineer (Design)"] },
      { name: "Drawing Start Date", subsection: "Mechanical Drawing Register", get: j => j.fields?.mechanical?.["Drawing Start Date"] },
      { name: "Drawing Complete Date & Release to Programme", subsection: "Mechanical Drawing Register", get: j => j.fields?.mechanical?.["Drawing Complete Date & Release to Programme"] },
      { name: "Drawing Prepare Engineer Name", subsection: "Mechanical Drawing Register", get: j => j.fields?.mechanical?.["Drawing Prepare Engineer Name"] },
      { name: "Door & Service Plate Programming Date", subsection: "Door & Service Plate Register", get: j => j.fields?.mechanical?.["Door & Service Plate Programming Date"] },
      { name: "Door & Service Plate Prepare Engineer Name", subsection: "Door & Service Plate Register", get: j => j.fields?.mechanical?.["Door & Service Plate Prepare Engineer Name"] },
      { name: "Drafting File Handover Date", subsection: "Drafting Register", get: j => j.fields?.mechanical?.["Drafting File Handover Date"] },
      { name: "DFT Prepare Engineer Name", subsection: "DFT Register", get: j => j.fields?.mechanical?.["DFT Prepare Engineer Name"] },
      { name: "Release to Programme Date", subsection: "Programme Release Register", get: j => j.fields?.mechanical?.["Release to Programme Date"] || j.fields?.mechanical?.["Programming Release to Punching & Laser"] },
      { name: "Programme Start Date", subsection: "Programming Register", get: j => j.fields?.mechanical?.["Programme Start Date"] },
      { name: "Programme End Date", subsection: "Programming Register", get: j => j.fields?.mechanical?.["Programme End Date"] },
      { name: "Programmer Engineer Name", subsection: "Programming Register", get: j => j.fields?.mechanical?.["Programmer Engineer Name"] }
    ]
  },
  {
    key: "purchase",
    departmentName: "Procurement",
    tableName: "Procurement Register",
    color: "FFE67E22",
    users: "swatipurchase, swatipurchase2, purchaseadmin",
    columns: [
      { name: "Switchgears PO No.", get: j => j.fields?.purchase?.["Switchgears PO No."] || j.fields?.purchase?.["Switchgear PO Number"] },
      { name: "PO Date", get: j => j.fields?.purchase?.["PO Date"] || j.fields?.purchase?.["Switchgear Date"] },
      { name: "Misc PO No.", get: j => j.fields?.purchase?.["Misc PO No."] || j.fields?.purchase?.["Misc PO Number"] },
      { name: "Misc PO Date", get: j => j.fields?.purchase?.["Misc PO Date"] || j.fields?.purchase?.["Misc Date"] }
    ]
  },
  {
    key: "production",
    departmentName: "Production & QC & Dispatch",
    tableName: "Production, QC & Dispatch Register",
    color: "FFB03A2E",
    users: "swatiproduction, swatiqc, prodadmin",
    columns: [
      { name: "Programming Release to Punching & Laser Date", subsection: "Production", get: j => j.fields?.production?.["Programming Release to Punching & Laser Date"] || j.fields?.mechanical?.["Programming Release to Punching & Laser"] },
      { name: "Punching & Laser Start Date", subsection: "Production", get: j => j.fields?.production?.["Punching & Laser Start Date"] || j.fields?.mechanical?.["Punching Start Date"] },
      { name: "Punching & Laser Complete Date", subsection: "Production", get: j => j.fields?.production?.["Punching & Laser Complete Date"] || j.fields?.mechanical?.["Punching Complete Date"] },
      { name: "Bending Start Date", subsection: "Production", get: j => j.fields?.production?.["Bending Start Date"] || j.fields?.mechanical?.["Bending Start Date"] },
      { name: "Bending Complete Date", subsection: "Production", get: j => j.fields?.production?.["Bending Complete Date"] || j.fields?.mechanical?.["Bending Complete Date"] },
      { name: "Welding Start Date", subsection: "Production", get: j => j.fields?.production?.["Welding Start Date"] || j.fields?.mechanical?.["Welding Start Date"] },
      { name: "Welding Complete Date", subsection: "Production", get: j => j.fields?.production?.["Welding Complete Date"] || j.fields?.mechanical?.["Welding Complete Date"] },
      { name: "Name of Fabricator", subsection: "Production", get: j => j.fields?.production?.["Name of Fabricator"] || j.fields?.mechanical?.["Name of Fabricator"] },
      { name: "Name of Fabrication Engineer", subsection: "Production", get: j => j.fields?.production?.["Name of Fabrication Engineer"] || j.fields?.mechanical?.["Name of Fabrication Engineer"] },
      { name: "Release to Painting Date", subsection: "Production", get: j => j.fields?.production?.["Release to Painting Date"] || j.fields?.mechanical?.["Release to Painting Date"] },
      { name: "Received to Painting Date", subsection: "Production", get: j => j.fields?.production?.["Received to Painting Date"] || j.fields?.mechanical?.["Received to Painting Date"] },
      { name: "Name of Painter", subsection: "Production", get: j => j.fields?.production?.["Name of Painter"] || j.fields?.mechanical?.["Name of Painter"] },
      { name: "Panel Assembly Start Date", subsection: "Production", get: j => j.fields?.production?.["Panel Assembly Start Date"] || j.fields?.mechanical?.["Panel Assembly Start Date"] },
      { name: "Panel Assembly Complete Date", subsection: "Production", get: j => j.fields?.production?.["Panel Assembly Complete Date"] || j.fields?.mechanical?.["Panel Assembly Complete Date"] },
      { name: "Name of Assembler", subsection: "Production", get: j => j.fields?.production?.["Name of Assembler"] || j.fields?.mechanical?.["Name of Assembler"] },
      { name: "Painting & Assembly Checked by Engineer", subsection: "Production", get: j => j.fields?.production?.["Painting & Assembly Checked by Engineer"] || j.fields?.mechanical?.["Painting & Assembly Checked By Engineer"] },
      { name: "Responsible Job Engineer Name", subsection: "Production", get: j => j.fields?.production?.["Responsible Job Engineer Name"] || j.fields?.production?.["Responsible Job Engineer"] },
      { name: "Busbar Work Start Date", subsection: "QC", get: j => j.fields?.production?.["Busbar Work Start Date"] },
      { name: "Busbar Work Complete Date", subsection: "QC", get: j => j.fields?.production?.["Busbar Work Complete Date"] },
      { name: "Name of Responsible Fitter", subsection: "QC", get: j => j.fields?.production?.["Name of Responsible Fitter"] || j.fields?.production?.["Responsible Fitter"] },
      { name: "Wiring Start Date", subsection: "QC", get: j => j.fields?.production?.["Wiring Start Date"] },
      { name: "Wiring Complete Date", subsection: "QC", get: j => j.fields?.production?.["Wiring Complete Date"] },
      { name: "Name of Responsible Wireman", subsection: "QC", get: j => j.fields?.production?.["Name of Responsible Wireman"] || j.fields?.production?.["Responsible Wireman"] },
      { name: "Testing Start Date", subsection: "QC", get: j => j.fields?.production?.["Testing Start Date"] },
      { name: "Testing Complete Date", subsection: "QC", get: j => j.fields?.production?.["Testing Complete Date"] },
      { name: "Testing Done by Engineer", subsection: "QC", get: j => j.fields?.production?.["Testing Done by Engineer"] || j.fields?.production?.["Testing Done By Engineer"] },
      { name: "Actual Inspection Date", subsection: "QC", get: j => j.fields?.production?.["Actual Inspection Date"] },
      { name: "Compliance / Dispatch Clearance Date", subsection: "QC", get: j => j.fields?.production?.["Compliance / Dispatch Clearance Date"] },
      { name: "Packing Start Date", subsection: "Dispatch", get: j => j.fields?.dispatch?.["Packing Start Date"] },
      { name: "Packing Complete Date", subsection: "Dispatch", get: j => j.fields?.dispatch?.["Packing Complete Date"] },
      { name: "Name of Responsible Person Checked Before Packing", subsection: "Dispatch", get: j => j.fields?.dispatch?.["Name of Responsible Person Checked Before Packing"] },
      { name: "Dispatch Date", subsection: "Dispatch", get: j => j.fields?.dispatch?.["Dispatch Date"] }
    ]
  }
];

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

function safeSheetName(name) {
  return String(name).replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
}

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

      if (R === 0) {
        style.font.sz = 16;
        style.font.bold = true;
        style.alignment.horizontal = "center";
      } else if (R === 1) {
        style.font.italic = true;
        style.font.color = { rgb: "FF555555" };
      } else if (R === 2) {
        style.font.bold = true;
        style.font.color = { rgb: "FFFFFFFF" };
        style.alignment.horizontal = "center";
        
        let targetDept = null;
        let cAcc = 0;
        for (const d of EXPORT_CONFIG) {
          cAcc += d.columns.length;
          if (C < cAcc) { targetDept = d; break; }
        }
        if (targetDept) {
          style.fill = { fgColor: { rgb: targetDept.color } };
        }
      } else if (R === 3) {
        style.font.bold = true;
        style.font.color = { rgb: "FFFFFFFF" };
        style.alignment.horizontal = "center";
        let targetDept = null;
        let cAcc = 0;
        for (const d of EXPORT_CONFIG) {
          cAcc += d.columns.length;
          if (C < cAcc) { targetDept = d; break; }
        }
        if (targetDept) {
          style.fill = { fgColor: { rgb: targetDept.color } };
        }
      } else {
        if (R % 2 === 1) style.fill = { fgColor: { rgb: "FFF9F9F9" } };
      }
      wsMaster[cellAddress].s = style;
    }
  }

  applyCustomSheetFormat(wsMaster, masterData.length, masterHeaders.length, true, merges);
  XLSX.utils.book_append_sheet(wb, wsMaster, "MASTER REGISTER");

  EXPORT_CONFIG.forEach(dept => {
    let deptCols = [];
    const hasBase = dept.columns.some(c => c.name === "Sr. No.");
    if (!hasBase) {
      deptCols = [
        { name: "Sr. No.", get: (j, i) => i + 1 },
        { name: "Job No.", get: j => j.jobNo },
        { name: "Name of Panel", get: j => j.panelName },
        { name: "Project Name", get: j => j.projectName },
        { name: "Responsible Engg. Name", get: j => j.responsibleEnggName },
        { name: "Purchase Order Date", get: j => j.poDate },
        { name: "Data", get: j => j.dataGivenToDesign },
        { name: "Type of Industries", get: j => j.typeOfIndustries },
        { name: "Qty.", get: j => j.qty },
        ...dept.columns
      ];
    } else {
      deptCols = dept.columns;
    }

    const deptJobs = jobs.filter(j => canViewJob(user, j, dept.key === "production" ? "production" : dept.key));
    const pendingCount = deptJobs.filter(j => (j.departmentStatus?.[dept.key] || 'pending') === 'pending').length;
    const completedCount = deptJobs.filter(j => (j.departmentStatus?.[dept.key] || 'pending') === 'completed').length;

    const deptData = [];
    deptData.push(["JOB PLANNING REGISTER"]);
    deptData.push([dept.departmentName]);
    deptData.push([dept.tableName]);
    deptData.push([`Assigned Users: ${dept.users}`]);
    deptData.push([`Total Jobs: ${deptJobs.length} | Pending: ${pendingCount} | Completed: ${completedCount}`]);
    deptData.push([""]);

    const headersRow = deptCols.map(c => c.subsection ? `${c.subsection} - ${c.name}` : c.name);
    deptData.push(headersRow);

    deptJobs.forEach((job, idx) => {
      const row = deptCols.map(c => c.get(job, idx) || "");
      deptData.push(row);
    });

    const wsDept = XLSX.utils.aoa_to_sheet(deptData);
    const deptMerges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 6 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: 6 } }
    ];

    for (let R = 0; R < deptData.length; R++) {
      for (let C = 0; C < deptCols.length; C++) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!wsDept[cellAddress]) continue;
        
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

        if (R === 0) {
          style.font.sz = 14; style.font.bold = true; style.alignment.horizontal = "center"; style.fill = { fgColor: { rgb: "FFEAEAEA" } };
        } else if (R >= 1 && R <= 4) {
          style.font.bold = true; style.fill = { fgColor: { rgb: "FFF2F2F2" } };
        } else if (R === 6) {
          style.font.bold = true;
          style.font.color = { rgb: "FFFFFFFF" };
          style.alignment.horizontal = "center";
          style.fill = { fgColor: { rgb: dept.color } };
        } else if (R > 6) {
          if (R % 2 === 0) style.fill = { fgColor: { rgb: "FFF9F9F9" } };
        }
        wsDept[cellAddress].s = style;
      }
    }

    applyCustomSheetFormat(wsDept, deptData.length, deptCols.length, false, deptMerges);
    XLSX.utils.book_append_sheet(wb, wsDept, safeSheetName(dept.departmentName));
  });

  return wb;
}

router.get("/xlsx", async (req, res) => {
  try {
    const user = req.user;
    const { department, client, search, ids } = req.query;

    let jobs;
    if (ids) {
      const idSet = new Set(String(ids).split(",").map(Number));
      const allJobs = await db.getAllJobs();
      jobs = allJobs.filter((job) => idSet.has(job.id));
    } else {
      jobs = await db.queryJobs({ department, user: req.query.user, client, search });
    }

    jobs = jobs.filter((job) => canViewJob(req.user, job, department));
    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const wb = buildWorkbook(jobs, null, null, user);
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `job-planning-export${department ? "-" + department : ""}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (error) {
    console.error("Export Error:", error);
    res.status(500).json({ error: "Failed to generate Excel file" });
  }
});

module.exports = router;
