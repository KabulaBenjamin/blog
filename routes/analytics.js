// File Location: routes/analytics.js
const express = require('express');
const router = express.Router();
// Dynamically resolve your core database connection pool
let pool;
try { pool = require('../config/db'); } catch(e) {
  try { pool = require('../utils/db'); } catch(e) { pool = require('../db'); }
}

// 🔐 Middleware helper to protect dashboard data streams
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token || (req.headers['authorization']?.split(' ')[1]);
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
  const userId = req.user.id;

  try {
    // A. Query total stats and post list metrics for this specific user
    const postsQuery = await pool.query(
      `SELECT id, title, views, created_at, updated_at 
       FROM posts 
       WHERE user_id = $1 
       ORDER BY views DESC, created_at DESC;`,
      [userId]
    );
    const posts = postsQuery.rows;

    // Calculate quick-read aggregate metrics
    const totalPosts = posts.length;
    const totalViews = posts.reduce((sum, p) => sum + (parseInt(p.views) || 0), 0);

    // B. Query the 7-day time-series data bucketed cleanly by date
    const chartQuery = await pool.query(
      `SELECT DATE(v.viewed_at) as date, COUNT(v.id) as count
       FROM post_views_log v
       JOIN posts p ON v.post_id = p.id
       WHERE p.user_id = $1 AND v.viewed_at >= CURRENT_DATE - INTERVAL '6 days'
       GROUP BY DATE(v.viewed_at)
       ORDER BY DATE(v.viewed_at) ASC;`,
      [userId]
    );

    // Formats empty date buckets so your timeline chart flows cleanly without empty gaps
    const chartMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      chartMap[dateStr] = 0;
    }
    chartQuery.rows.forEach(r => {
      const formattedDate = new Date(r.date).toISOString().split('T')[0];
      if (chartMap[formattedDate] !== undefined) chartMap[formattedDate] = parseInt(r.count);
    });

    const timelineData = Object.keys(chartMap).map(date => ({
      date: date.substring(5), // clean readable format like '07-13'
      views: chartMap[date]
    }));

    res.status(200).json({
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
    await pool.query('BEGIN');
    
    // Increment the counter on the target post row
    await pool.query('UPDATE posts SET views = views + 1 WHERE id = $1;', [id]);
    
    // Log the transaction time footprint record to feed the analytics charts
    await pool.query('INSERT INTO post_views_log (post_id) VALUES ($1);', [id]);
    
    await pool.query('COMMIT');
    res.status(200).json({ message: 'Unique tracking view telemetry processed.' });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('⚠️ Views logging failure context:', err);
    res.status(500).json({ error: 'Telemetry driver tracking fault.' });
  }
});

module.exports = router;