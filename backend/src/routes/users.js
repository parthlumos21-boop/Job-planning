const express = require("express");
const db = require("../../database/db");
const { canManageJobCore } = require("../utils/jobAccess");

const router = express.Router();

// GET /api/users?department=marketing - list users, optionally scoped to a department
router.get("/", async (req, res) => {
  const { department } = req.query;
  if (department) {
    if (
      req.user.role === "user" &&
      !canManageJobCore(req.user) &&
      !req.user.departments.includes(department)
    ) {
      return res.status(403).json({ error: "Access denied to this department" });
    }
    return res.json(await db.getUsersByDepartment(department));
  }
  res.json(await db.getUsers());
});

module.exports = router;
