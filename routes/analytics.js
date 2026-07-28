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
  // Safe extraction of all possible User Identifiers from the JWT payload
  const userId = req.user?.id || req.user?.userId || req.user?.user_id || req.user?.sub;
  const username = req.user?.username;

  if (!userId && !username) {
    return res.status(400).json({ error: 'User identifier missing in session token.' });
  }

  try {
    // 1. Query posts matching EITHER user_id OR username (with ::text cast to prevent type errors)
    const postsResult = await pool.query(
      `SELECT id, title, COALESCE(views, 0) as views, created_at, updated_at 
       FROM posts 
       WHERE user_id::text = $1::text OR user_id::text = $2::text 
       ORDER BY created_at DESC;`,
      [String(userId || ''), String(username || '')]
    );

    const posts = postsResult.rows || [];
    const totalPosts = posts.length;
    const totalViews = posts.reduce((sum, p) => sum + (parseInt(p.views, 10) || 0), 0);

    // 2. Build default empty 7-day timeline map
    const chartMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      chartMap[dateStr] = 0;
    }

    // 3. Query 7-day view logs safely without failing if post_views_log is empty or missing
    try {
      const chartQuery = await pool.query(
        `SELECT TO_CHAR(v.viewed_at, 'YYYY-MM-DD') as date, COUNT(v.id) as count
         FROM posts p
         JOIN post_views_log v ON v.post_id = p.id
         WHERE (p.user_id::text = $1::text OR p.user_id::text = $2::text)
           AND v.viewed_at >= CURRENT_DATE - INTERVAL '6 days'
         GROUP BY TO_CHAR(v.viewed_at, 'YYYY-MM-DD')
         ORDER BY date ASC;`,
        [String(userId || ''), String(username || '')]
      );

      chartQuery.rows.forEach(r => {
        if (r.date && chartMap[r.date] !== undefined) {
          chartMap[r.date] = parseInt(r.count, 10);
        }
      });
    } catch (chartErr) {
      console.warn('⚠️ Timeline view query skipped:', chartErr.message);
    }

    const timelineData = Object.keys(chartMap).map(date => ({
      date: date.substring(5), // Clean format 'MM-DD'
      views: chartMap[date]
    }));

    return res.status(200).json({
      summary: { totalViews, totalPosts },
      timeline: timelineData,
      posts: posts
    });

  } catch (err) {
    console.error('❌ Dashboard data generation failure:', err);
    res.status(500).json({ error: 'Internal Server Metrics Error' });
  }
});

// 👁️ ENDPOINT 2: Process and Record a Unique Content Interaction View
router.post('/posts/:id/view', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = $1;', [id]);
    try {
      await pool.query('INSERT INTO post_views_log (post_id) VALUES ($1);', [id]);
    } catch (e) {}

    res.status(200).json({ message: 'View updated.' });
  } catch (err) {
    console.error('⚠️ Views logging failure context:', err);
    res.status(500).json({ error: 'Telemetry driver tracking fault.' });
  }
});

module.exports = router;