const express = require("express");
const db = require("../database/db");

const router = express.Router();

// GET /api/clients - list clients with job counts (no full field data, keeps payload small)
router.get("/", async (req, res) => {
  const clientsData = await db.getClients();
  const clients = clientsData.map((c) => ({
    id: c.id,
    name: c.name,
    jobCount: c.jobs ? c.jobs.length : 0,
  }));
  res.json(clients);
});

module.exports = router;
