const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

const authenticateToken = (req, res, next) => {
  // 1. Check for token in 'Authorization: Bearer <token>' header
  const authHeader = req.headers['authorization'];
  const tokenFromHeader = authHeader && authHeader.split(' ')[1];

  // 2. Check for token in HTTP-only Cookie as fallback
  const tokenFromCookie = req.cookies && req.cookies.token;

  const token = tokenFromHeader || tokenFromCookie;

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Session expired or invalid." });
    }
    req.user = user;
    next();
  });
};

module.exports = { authenticateToken };