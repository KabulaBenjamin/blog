// File Location: routes/analytics.js
const express = require('express');
const router = express.Router();

let pool;
try { pool = require('../config/db'); } catch(e) {
  try { pool = require('../utils/db'); } catch(e) { pool = require('../db'); }
}

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

router.get('/dashboard', authenticateToken, async (req, res) => {
  const userId = req.user?.id || req.user?.userId || req.user?.user_id || req.user?.sub;
  const username = req.user?.username;

  if (!userId && !username) {
    return res.status(400).json({ error: 'User identifier missing in session token.' });
  }

  const searchId = String(userId || '');
  const searchName = String(username || '');

  // 1. Build date array for past 7 days
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }

  let posts = [];
  
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
    console.error('⚠️ Posts query error:', err.message);
  }

  // 2. Fetch past 7 days views per post
  let postLogs = [];
  try {
    const logsQuery = await pool.query(
      `SELECT v.post_id, TO_CHAR(v.viewed_at, 'YYYY-MM-DD') as date, COUNT(v.id) as count
       FROM posts p
       JOIN post_views_log v ON v.post_id = p.id
       WHERE (CAST(p.user_id AS TEXT) = $1 OR CAST(p.user_id AS TEXT) = $2)
         AND v.viewed_at >= CURRENT_DATE - INTERVAL '6 days'
       GROUP BY v.post_id, TO_CHAR(v.viewed_at, 'YYYY-MM-DD');`,
      [searchId, searchName]
    );
    postLogs = logsQuery.rows || [];
  } catch (err) {
    console.warn('⚠️ Per-post view logs query skipped:', err.message);
  }

  // Map 7-day timeline arrays directly into each individual post
  const postsWithCharts = posts.map(post => {
    const postChartMap = {};
    days.forEach(d => { postChartMap[d] = 0; });

    postLogs
      .filter(log => String(log.post_id) === String(post.id))
      .forEach(log => {
        if (log.date && postChartMap[log.date] !== undefined) {
          postChartMap[log.date] = parseInt(log.count, 10);
        }
      });

    const postTimeline = days.map(d => ({
      date: d.substring(5),
      views: postChartMap[d]
    }));

    return {
      ...post,
      timeline: postTimeline
    };
  });

  // Aggregate global user timeline
  const overallMap = {};
  days.forEach(d => { overallMap[d] = 0; });
  postLogs.forEach(log => {
    if (log.date && overallMap[log.date] !== undefined) {
      overallMap[log.date] += parseInt(log.count, 10);
    }
  });

  const overallTimeline = days.map(d => ({
    date: d.substring(5),
    views: overallMap[d]
  }));

  const totalPosts = postsWithCharts.length;
  const totalViews = postsWithCharts.reduce((sum, p) => sum + (parseInt(p.views, 10) || 0), 0);

  return res.status(200).json({
    summary: { totalViews, totalPosts },
    timeline: overallTimeline,
    posts: postsWithCharts
  });
});

router.post('/posts/:id/view', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = $1;', [id]);
    try { await pool.query('INSERT INTO post_views_log (post_id) VALUES ($1);', [id]); } catch (e) {}
    res.status(200).json({ message: 'View recorded.' });
  } catch (err) {
    res.status(500).json({ error: 'Tracking driver error.' });
  }
});

module.exports = router;