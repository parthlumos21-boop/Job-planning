/**
 * database/import.js
 * -----------------------------------------------------------------------
 * Re-builds database/data.json from a "Job Planning & Tracking Register"
 * Excel workbook, using the same layout as the original file:
 *
 *   Row 2      -> department names (merged cells)
 *   Row 3-5    -> field names (merged / multi-level headers)
 *   Row 6+     -> data. A "client header" row looks like "12)" in column A
 *                 with the client/company name in column B. Rows below it,
 *                 until the next client header, are that client's jobs.
 *                 Rows whose column C reads "Total Qty" are subtotal rows
 *                 and are skipped.
 *
 * Usage:
 *   node database/import.js /path/to/register.xlsx
 *
 * If no path is given, it looks for register.xlsx in this folder.
 * -----------------------------------------------------------------------
 */
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");

const DEPT_RANGES = [
  ["marketing", "Marketing Department", 1, 19],
  ["design", "Electrical Design Department", 20, 79],
  ["purchase", "Purchase", 80, 83],
  ["mechanical", "Mechanical/Fabricator/Assembly Department", 84, 110],
  ["production", "Production Department/QC Department", 111, 122],
  ["dispatch", "Dispatch Department", 123, 126],
];

const NAME_HINTS = [
  "engg", "engineer", "person", "fabricator", "assembler",
  "painter", "fiter", "wireman", "peson",
];

function colDept(col) {
  for (const [key, name, lo, hi] of DEPT_RANGES) {
    if (col >= lo && col <= hi) return { key, name };
  }
  return { key: "other", name: "Other" };
}

function isNameField(col, fieldName) {
  if (col === 3) return false;
  const low = fieldName.toLowerCase();
  if (low.includes("panel")) return false;
  if (NAME_HINTS.some((h) => low.includes(h))) return true;
  if (low.startsWith("name of") && !low.includes("panel")) return true;
  return false;
}

function looksLikeName(p) {
  if (!p || p.length < 2 || p.length > 40) return false;
  const letters = (p.match(/[a-zA-Z]/g) || []).length;
  if (letters < Math.max(2, p.length * 0.5)) return false;
  if (/\d{2,}/.test(p)) return false;
  return true;
}

function splitNames(raw) {
  if (raw === null || raw === undefined) return [];
  const s = String(raw);
  const parts = s.split(/[\/,&]| AND | and /);
  const out = [];
  for (let p of parts) {
    p = p.trim().replace(/\.+$/, "").trim();
    if (!p) continue;
    if (["NA", "N.A", "N.A.", "-", "0", "VERBAL"].includes(p.toUpperCase())) continue;
    if (!looksLikeName(p)) continue;
    out.push(p);
  }
  return out;
}

function fmtVal(v) {
  if (v === undefined || v === null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && Number.isInteger(v)) return v;
  return v;
}

function run(srcPath) {
  const wb = XLSX.readFile(srcPath, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const maxCol = Math.min(range.e.c + 1, 127); // 1-indexed, cap at DV (126) + buffer

  const cell = (r, c) => {
    const addr = XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });
    const cellObj = ws[addr];
    return cellObj ? cellObj.v : null;
  };

  // Build column -> field-name map from header rows 3/4/5
  const colNames = {};
  for (let col = 1; col <= maxCol; col++) {
    const r3 = cell(3, col);
    const r4 = cell(4, col);
    const r5 = cell(5, col);
    const name = r5 || r4 || r3;
    if (name === null || name === undefined || name === "") continue;
    colNames[col] = String(name).trim();
  }

  // Dedupe field names within a department
  const seen = new Set();
  const fieldKey = {};
  for (const [colStr, name] of Object.entries(colNames)) {
    const col = Number(colStr);
    const { key: deptKey } = colDept(col);
    const dedupeKey = `${deptKey}::${name}`;
    if (seen.has(dedupeKey)) {
      const letter = XLSX.utils.encode_col(col - 1);
      fieldKey[col] = `${name} (${letter})`;
    } else {
      seen.add(dedupeKey);
      fieldKey[col] = name;
    }
  }

  const clients = [];
  let currentClient = null;
  let jobCounter = 0;
  const allUsers = new Map(); // upper name -> {name, departments:Set, jobIds:Set}

  const maxRow = range.e.r + 1; // 1-indexed

  for (let r = 6; r <= maxRow; r++) {
    const a = cell(r, 1);
    const b = cell(r, 2);
    const c = cell(r, 3);
    const d = cell(r, 4);

    const isClientHeader = typeof a === "string" && /^\d+\)\s*$/.test(a.trim());
    if (isClientHeader) {
      const clientName = b || c || `Client ${clients.length + 1}`;
      currentClient = {
        id: clients.length + 1,
        name: String(clientName).trim(),
        jobs: [],
      };
      clients.push(currentClient);
      continue;
    }

    if (typeof c === "string" && c.toLowerCase().includes("total qty")) continue;
    if (a === null && c === null && d === null) continue;

    const srOk =
      a !== null &&
      (typeof a === "number" || (typeof a === "string" && /^\d+$/.test(a.trim())));
    if (!srOk || !currentClient || c === null) continue;

    jobCounter += 1;
    const fields = {};
    DEPT_RANGES.forEach(([key]) => (fields[key] = {}));
    const engineersByDept = {};

    for (let col = 1; col <= maxCol; col++) {
      if (!fieldKey[col]) continue;
      const val = fmtVal(cell(r, col));
      if (val === null) continue;
      const { key: deptKey } = colDept(col);
      const fname = fieldKey[col];
      fields[deptKey][fname] = val;

      if (isNameField(col, fname)) {
        for (const person of splitNames(val)) {
          const upper = person.toUpperCase();
          if (!allUsers.has(upper)) {
            allUsers.set(upper, { name: person, departments: new Set(), jobIds: new Set() });
          }
          const u = allUsers.get(upper);
          u.departments.add(deptKey);
          u.jobIds.add(jobCounter);
          (engineersByDept[deptKey] = engineersByDept[deptKey] || new Set()).add(person);
        }
      }
    }

    const job = {
      id: jobCounter,
      clientId: currentClient.id,
      clientName: currentClient.name,
      srNo: fmtVal(a),
      jobNo: fmtVal(b),
      panelName: fmtVal(c),
      qty: fmtVal(d),
      projectName: fmtVal(cell(r, 6)),
      incomerRating: fmtVal(cell(r, 7)),
      fields,
      engineers: Object.fromEntries(
        Object.entries(engineersByDept).map(([k, v]) => [k, Array.from(v).sort()])
      ),
      selected: false,
    };
    currentClient.jobs.push(job);
  }

  const finalClients = clients.filter((c) => c.jobs.length > 0);

  const departments = DEPT_RANGES.map(([key, name]) => ({ key, name }));
  const BASE_COLS = new Set([1, 2, 3, 4, 6]); // Sr.No, Job No, Panel Name, Qty, Project Name - always shown
  const fieldDefs = {};
  for (const [deptKey, , lo, hi] of DEPT_RANGES) {
    const cols = [];
    for (let c = lo; c <= hi; c++) if (fieldKey[c] && !BASE_COLS.has(c)) cols.push(c);
    fieldDefs[deptKey] = cols.map((c) => fieldKey[c]);
  }

  const users = Array.from(allUsers.values())
    .map((u) => ({
      name: u.name,
      departments: Array.from(u.departments).sort(),
      jobCount: u.jobIds.size,
    }))
    .sort((a, b) => a.name.toUpperCase().localeCompare(b.name.toUpperCase()));

  const output = {
    generatedAt: new Date().toISOString(),
    departments,
    fieldDefs,
    users,
    clients: finalClients,
  };

  const outPath = path.join(__dirname, "data.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");

  console.log(`Imported ${finalClients.length} clients, ` +
    `${finalClients.reduce((n, c) => n + c.jobs.length, 0)} jobs, ` +
    `${users.length} users.`);
  console.log(`Written to ${outPath}`);
}

if (require.main === module) {
  const arg = process.argv[2];
  const srcPath = arg
    ? path.resolve(arg)
    : path.join(__dirname, "register.xlsx");
  if (!fs.existsSync(srcPath)) {
    console.error(`Source Excel file not found: ${srcPath}`);
    console.error("Usage: node database/import.js /path/to/register.xlsx");
    process.exit(1);
  }
  run(srcPath);
}

module.exports = { run };
