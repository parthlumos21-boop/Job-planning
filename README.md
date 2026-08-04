# Job Planning & Tracking Register — Software

A complete, self-contained web application built from your
`Job_Planing_Register_-_2026-27-R` Excel register. It turns the register
into a searchable, department-wise and user-wise job tracking system with
checkbox-based column & row selection.

## What it does

- **Department-wise view** — 6 tabs matching your sheet: Marketing,
  Electrical Design, Purchase, Mechanical/Fabricator/Assembly,
  Production/QC, Dispatch. Each tab shows only that department's data.
- **User-wise view** — a "User / Engineer" dropdown (auto-built from every
  name found in the register) filters jobs to only the ones that person
  is responsible for, within the selected department.
- **Checkbox column selection** — click **Columns ▾** to tick exactly
  which of that department's fields you want to see as table columns.
  Your choice is remembered per department (saved in the browser).
- **Checkbox row selection** — tick jobs in the table (or "select all")
  to build a working set, then **Export selected (CSV)**. There's also
  **Export filtered view (CSV)** to export everything currently shown.
- **Full job detail** — click **View** on any row to see every field for
  that job, grouped by department, in one panel.
- **Client filter + free text search** across Job No, Panel Name, Project
  Name and Client.

Your original data: **58 clients, 253 jobs, ~126 tracked fields, 77
identified engineers/staff**, all extracted directly from your Excel file.

## Project structure

```
job-planning-software/
├── backend/                 Node.js + Express REST API
│   ├── src/
│   │   ├── server.js        App entry point (serves API + frontend)
│   │   └── routes/          departments.js, users.js, clients.js,
│   │                        jobs.js, export.js
│   ├── database/            The "database" layer
│   │   ├── db.js            Query/write functions (all data access goes
│   │   │                    through here — swap this for real SQL later)
│   │   ├── data.json        Your register, already imported and ready
│   │   └── import.js        Re-run this to rebuild data.json from an
│   │                        updated Excel file
│   └── package.json
├── frontend/                 Plain HTML/CSS/JS (no build step)
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
└── README.md                 (this file)
```

## Running it

Requires [Node.js](https://nodejs.org) 18+ installed on your machine.

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:4000** in your browser. The backend also
serves the frontend, so that's the only URL you need.

## VPS deployment

VPS notes are in `docs/VPS_DEPLOYMENT.md`. Use `backend/.env.example` as
the template for production environment variables.

## Updating the data later

When you get a new/updated version of the Excel register:

```bash
cd backend
node database/import.js "/path/to/your/updated-register.xlsx"
npm start
```

This re-parses the workbook using the same layout (department header row,
field header rows, client-header rows like `12) Client Name`, job rows
underneath) and rebuilds `database/data.json`. No other code changes
needed.

## Notes on how the data was structured

- Each **department** owns a fixed range of columns in your original
  sheet (e.g. Marketing = columns A–S, Electrical Design = T–CA, etc.),
  matching the merged department headers in row 2 of your file.
  Every job keeps its full original field data for every department.
- **User/engineer names** are auto-extracted from every column whose
  header mentions an engineer, person, fabricator, assembler, painter,
  fitter, wireman, or "Name of ...". Multiple names in one cell
  (separated by `/`, `&`, or "and") are split into individual users.
- The 5 always-visible base columns (Sr. No., Job No., Panel Name, Qty.,
  Project Name) are excluded from the optional column-picker since
  they're always shown.

## Extending it

- Swap `backend/database/db.js` for a real database (PostgreSQL/MySQL/
  SQLite) by re-implementing its exported functions — nothing else in the
  app needs to change, since routes and the frontend only ever call this
  module.
- Add authentication/roles (e.g. each department only sees its own tab)
  by adding middleware in `backend/src/server.js`.
- Add write/edit forms per department by adding new PATCH routes in
  `backend/src/routes/jobs.js` (the selection PATCH route is a working
  example to copy).
