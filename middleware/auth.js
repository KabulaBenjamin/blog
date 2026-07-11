const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Session expired or invalid." });
    req.user = user;
    next();
  });
};

module.exports = { authenticateToken };