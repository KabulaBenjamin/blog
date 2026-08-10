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

// 2. GET USER STATS ENDPOINT
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

// 3. SAVE READING PROGRESS ENDPOINT
router.post('/reading-progress', async (req, res) => {
  const { userId, postId, scrollPercentage } = req.body;

  if (!userId || !postId) {
    return res.status(400).json({ error: 'Missing userId or postId.' });
  }

  try {
    const query = `
      INSERT INTO reading_progress (user_id, post_id, scroll_percentage, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, post_id) 
      DO UPDATE SET scroll_percentage = $3, updated_at = NOW();
    `;
    await pool.query(query, [userId, postId, scrollPercentage]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving reading progress:', err);
    res.status(500).json({ error: 'Database error saving reading progress.' });
  }
});

// 4. GET READING PROGRESS ENDPOINT
router.get('/:userId/reading-progress/:postId', async (req, res) => {
  const { userId, postId } = req.params;

  try {
    const result = await pool.query(
      'SELECT scroll_percentage, updated_at FROM reading_progress WHERE user_id = $1 AND post_id = $2',
      [userId, postId]
    );

    if (result.rows.length === 0) {
      return res.json({ scroll_percentage: 0 });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching reading progress:', err);
    res.status(500).json({ error: 'Database error fetching reading progress.' });
  }
});

module.exports = router;