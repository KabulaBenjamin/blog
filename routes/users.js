const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. GET USER POSTS ENDPOINT
router.get('/:id/posts', async (req, res) => {
  const userId = req.params.id;
  try {
    const result = await pool.query(
      'SELECT * FROM posts WHERE user_id = $1 ORDER BY created_at DESC', 
      [userId]
    );
    res.json(result.rows); 
  } catch (err) {
    console.error('Error fetching user posts:', err);
    res.status(500).json({ error: 'Database error fetching posts.' });
  }
});

// 2. GET USER STATS ENDPOINT (With proper 0 verification handlers)
router.get('/:id/stats', async (req, res) => {
  const userId = req.params.id;
  try {
    const statsQuery = `
      SELECT 
        COUNT(id) as total_posts,
        COALESCE(SUM(likes), 0) as total_likes,
        0 as total_comments
      FROM posts 
      WHERE user_id = $1
    `;
    const result = await pool.query(statsQuery, [userId]);
    
    if (result.rows.length === 0 || result.rows[0].total_posts === '0') {
      return res.json({ total_posts: 0, total_likes: 0, total_comments: 0 });
    }

    const row = result.rows[0];
    res.json({
      total_posts: parseInt(row.total_posts, 10),
      total_likes: parseInt(row.total_likes, 10),
      total_comments: parseInt(row.total_comments, 10)
    });
  } catch (err) {
    console.error('Error calculating metrics:', err);
    res.status(500).json({ error: 'Database error computing analytics profile.' });
  }
});

module.exports = router;