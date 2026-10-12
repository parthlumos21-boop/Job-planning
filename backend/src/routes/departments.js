const express = require("express");
const db = require("../../database/db");
const { canManageJobCore } = require("../utils/jobAccess");

const router = express.Router();

// GET /api/departments - list all departments + their field definitions
router.get("/", async (req, res) => {
  const departments = await db.getDepartments();
  const fieldDefs = await db.getFieldDefs();
  res.json(
    departments.map((d) => ({
      ...d,
      fields: fieldDefs[d.key] || [],
    }))
  );
});

// GET /api/departments/:key/users - who has worked in this department
router.get("/:key/users", async (req, res) => {
  if (
    req.user.role === "user" &&
    !canManageJobCore(req.user) &&
    !req.user.departments.includes(req.params.key)
  ) {
    return res.status(403).json({ error: "Access denied to this department" });
  }
  res.json(await db.getUsersByDepartment(req.params.key));
});

module.exports = router;
