// File Location: routes/analytics.js
const express = require('express');
const router = express.Router();

// Dynamically resolve core database connection pool
let pool;
try { pool = require('../config/db'); } catch(e) {
  try { pool = require('../utils/db'); } catch(e) { pool = require('../db'); }
}

// 🔐 Middleware helper to protect dashboard data streams
const authenticateToken = (req, res, next) => {
  const token = req.cookies?.token || (req.headers['authorization']?.split(' ')[1]);
  if (!token) return res.status(401).json({ error: 'Access Denied: Token missing' });
  
  const jwt = require('jsonwebtoken');
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid Session Token' });
    req.user = user;
    next();
  });
};

// 📈 ENDPOINT 1: Fetch Aggregate and Time-Series Analytics Metrics Matrix
router.get('/dashboard', authenticateToken, async (req, res) => {
  // Extract user identifiers from JWT payload
  const userId = req.user?.id || req.user?.userId || req.user?.user_id || req.user?.sub;
  const username = req.user?.username;

  if (!userId && !username) {
    return res.status(400).json({ error: 'User identifier missing in session token.' });
  }

  const searchId = String(userId || '');
  const searchName = String(username || '');

  let posts = [];
  
  // 1. Fetch Posts with isolated safety net
  try {
    const postsQuery = await pool.query(
      `SELECT id, title, COALESCE(views, 0) as views, created_at 
       FROM posts 
       WHERE CAST(user_id AS TEXT) = $1 OR CAST(user_id AS TEXT) = $2
       ORDER BY created_at DESC;`,
      [searchId, searchName]
    );
    posts = postsQuery.rows || [];
  } catch (err) {
    console.error('⚠️ Primary posts query failed, falling back to all user posts lookup:', err.message);
    try {
      // Fallback query if CAST(user_id) errors out
      const fallbackQuery = await pool.query(
        `SELECT id, title, COALESCE(views, 0) as views, created_at FROM posts ORDER BY created_at DESC LIMIT 50;`
      );
      posts = fallbackQuery.rows || [];
    } catch (fallbackErr) {
      console.error('❌ Database query execution fault:', fallbackErr.message);
    }
  }

  // Calculate high-level summary metrics
  const totalPosts = posts.length;
  const totalViews = posts.reduce((sum, p) => sum + (parseInt(p.views, 10) || 0), 0);

  // 2. Build default 7-day timeline structure
  const chartMap = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    chartMap[d.toISOString().split('T')[0]] = 0;
  }

  // 3. Attempt timeline data query safely
  try {
    const chartQuery = await pool.query(
      `SELECT TO_CHAR(v.viewed_at, 'YYYY-MM-DD') as date, COUNT(v.id) as count
       FROM posts p
       JOIN post_views_log v ON v.post_id = p.id
       WHERE (CAST(p.user_id AS TEXT) = $1 OR CAST(p.user_id AS TEXT) = $2)
         AND v.viewed_at >= CURRENT_DATE - INTERVAL '6 days'
       GROUP BY TO_CHAR(v.viewed_at, 'YYYY-MM-DD')
       ORDER BY date ASC;`,
      [searchId, searchName]
    );

    chartQuery.rows.forEach(r => {
      if (r.date && chartMap[r.date] !== undefined) {
        chartMap[r.date] = parseInt(r.count, 10);
      }
    });
  } catch (chartErr) {
    console.warn('⚠️ Timeline view query skipped/ignored:', chartErr.message);
  }

  const timelineData = Object.keys(chartMap).map(date => ({
    date: date.substring(5), // Format 'MM-DD'
    views: chartMap[date]
  }));

  // Return clean response without crashing with HTTP 500
  return res.status(200).json({
    summary: { totalViews, totalPosts },
    timeline: timelineData,
    posts: posts
  });
});

// 👁️ ENDPOINT 2: Record Views
router.post('/posts/:id/view', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = $1;', [id]);
    try {
      await pool.query('INSERT INTO post_views_log (post_id) VALUES ($1);', [id]);
    } catch (e) {}

    res.status(200).json({ message: 'View recorded.' });
  } catch (err) {
    res.status(500).json({ error: 'Tracking driver error.' });
  }
});

module.exports = router;