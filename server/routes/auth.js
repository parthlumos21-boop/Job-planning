const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../database/db');

const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET || 'your_super_secret_key';

router.post('/login', async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "").trim();

  const account = await db.getAccountByUsername(username);

  if (!account || account.password !== password) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  const token = jwt.sign(
    {
      username: account.username,
      role: account.role,
      departments: account.departments,
    },
    SECRET_KEY,
    { expiresIn: '24h' }
  );

  res.json({ token, user: { username: account.username, role: account.role, departments: account.departments } });
});

module.exports = router;
