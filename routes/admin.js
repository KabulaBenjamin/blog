// File Location: routes/admin.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

let pool;
try { pool = require('../config/db'); } catch(e) {
  try { pool = require('../utils/db'); } catch(e) { pool = require('../db'); }
}

// 🛡️ Middleware: Ensure user is authenticated AND an admin
const requireAdmin = (req, res, next) => {
  const token = req.cookies?.token || (req.headers['authorization']?.split(' ')[1]);
  if (!token) return res.status(401).json({ error: 'Access denied: Token missing' });

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });

    try {
      const userId = decoded.id || decoded.userId || decoded.user_id;
      const userResult = await pool.query('SELECT id, username, role FROM users WHERE id = $1', [userId]);
      const user = userResult.rows[0];

      if (!user || (user.role !== 'admin' && user.username !== 'Blog_Admin')) {
        return res.status(403).json({ error: 'Access denied: Superuser privileges required' });
      }

      req.adminUser = user;
      next();
    } catch (dbErr) {
      return res.status(500).json({ error: 'Authorization validation failed' });
    }
  });
};

// 📊 1. Superuser Master Dashboard Analytics
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const statsQuery = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM posts) AS total_posts,
        (SELECT COALESCE(SUM(views), 0) FROM posts) AS total_views
    `);

    const usersQuery = await pool.query(`
      SELECT u.id, u.username, u.email, u.role, u.created_at,
             COUNT(p.id) AS post_count,
             COALESCE(SUM(p.views), 0) AS total_views
      FROM users u
      LEFT JOIN posts p ON CAST(p.user_id AS TEXT) = CAST(u.id AS TEXT)
      GROUP BY u.id, u.username, u.email, u.role, u.created_at
      ORDER BY u.created_at DESC
    `);

    const postsQuery = await pool.query(`
      SELECT p.id, p.title, p.views, p.created_at, u.username AS author
      FROM posts p
      LEFT JOIN users u ON CAST(p.user_id AS TEXT) = CAST(u.id AS TEXT)
      ORDER BY p.created_at DESC
    `);

    res.status(200).json({
      summary: statsQuery.rows[0],
      users: usersQuery.rows,
      posts: postsQuery.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin stats: ' + err.message });
  }
});

// 🗑️ 2. Admin: Delete Any User
router.delete('/users/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    // Delete associated user posts first
    await pool.query('DELETE FROM posts WHERE CAST(user_id AS TEXT) = $1', [id]);
    await pool.query('DELETE FROM users WHERE CAST(id AS TEXT) = $1', [id]);
    res.status(200).json({ message: 'User and associated posts deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ✏️ 3. Admin: Edit Any Post
router.put('/posts/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  try {
    await pool.query(
      'UPDATE posts SET title = $1, content = $2 WHERE CAST(id AS TEXT) = $3',
      [title, content, id]
    );
    res.status(200).json({ message: 'Post updated successfully by admin' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to edit post' });
  }
});

// 🗑️ 4. Admin: Delete Any Post
router.delete('/posts/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM posts WHERE CAST(id AS TEXT) = $1', [id]);
    res.status(200).json({ message: 'Post deleted successfully by admin' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

module.exports = router;