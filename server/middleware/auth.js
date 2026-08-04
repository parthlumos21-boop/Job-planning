const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY || SECRET_KEY === 'your_super_secret_key') {
  console.error("FATAL ERROR: JWT_SECRET environment variable is missing or insecure!");
  process.exit(1);
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

module.exports = authenticateToken;
