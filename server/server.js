/**
 * src/server.js
 * -----------------------------------------------------------------------
 * Entry point for the Job Planning & Tracking Register backend.
 * Serves the JSON REST API under /api/* and the static frontend build.
 * -----------------------------------------------------------------------
 */
const path = require("path");
require("dotenv").config({ override: true });
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const compression = require("compression");

const departmentsRoutes = require("./routes/departments");
const usersRoutes = require("./routes/users");
const clientsRoutes = require("./routes/clients");
const jobsRoutes = require("./routes/jobs");
const exportRoutes = require("./routes/export");
const authRoutes = require("./routes/auth");
const authenticateToken = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3005;
const HOST = process.env.HOST || "0.0.0.0";

app.use(cors());
app.use(compression());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/departments", authenticateToken, departmentsRoutes);
app.use("/api/users", authenticateToken, usersRoutes);
app.use("/api/clients", authenticateToken, clientsRoutes);
app.use("/api/jobs", authenticateToken, jobsRoutes);
app.use("/api/export", authenticateToken, exportRoutes);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "Job Planning & Tracking Register API", db: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

// Serve the static frontend (client/dist)
const frontendDir = path.join(__dirname, "..", "client", "dist");
app.use(express.static(frontendDir));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(frontendDir, "index.html"));
});

// MongoDB Connection string (defaulting to local MongoDB if not set in .env)
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/swati_switchgears_db";

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log(`Connected to MongoDB at ${MONGO_URI}`);
    app.listen(PORT, HOST, () => {
      console.log(`Job Planning & Tracking Register server running at http://${HOST}:${PORT}`);
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n[ERROR] Port ${PORT} is already in use.`);
        console.error(`Please kill any existing processes using port ${PORT} before starting the server.\n`);
        process.exit(1);
      } else {
        throw err;
      }
    });
  })
  .catch(err => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });
