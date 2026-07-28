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
    if (err) return res.status(403).json({ error: 'Invalid or expired session token' });

    const userId = decoded.id || decoded.userId || decoded.user_id || decoded.sub;
    const tokenUsername = decoded.username;

    // Fast-track if token explicitly states Blog_Admin
    if (tokenUsername === 'Blog_Admin') {
      req.adminUser = { username: 'Blog_Admin', role: 'admin' };
      return next();
    }

    try {
      // Query user safely using text cast
      const userResult = await pool.query(
        `SELECT id, username, role FROM users 
         WHERE CAST(id AS TEXT) = $1 OR username = $2 LIMIT 1;`,
        [String(userId || ''), String(tokenUsername || '')]
      );

      const user = userResult.rows[0];

      // Grant access if username is Blog_Admin OR role is admin
      if (user && (user.username === 'Blog_Admin' || user.role === 'admin')) {
        req.adminUser = user;
        return next();
      }

      return res.status(403).json({ error: 'Access denied: Superuser privileges required' });
    } catch (dbErr) {
      console.error('⚠️ Admin middleware check error:', dbErr.message);
      // Fallback: If DB query fails but token username is Blog_Admin, permit access
      if (tokenUsername === 'Blog_Admin') {
        req.adminUser = { username: 'Blog_Admin', role: 'admin' };
        return next();
      }
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
        (SELECT COALESCE(SUM(views), 0) FROM posts) AS total_views;
    `);

    let users = [];
    try {
      const usersQuery = await pool.query(`
        SELECT u.id, u.username, u.email, COALESCE(u.role, 'user') as role, u.created_at,
               COUNT(p.id) AS post_count,
               COALESCE(SUM(p.views), 0) AS total_views
        FROM users u
        LEFT JOIN posts p ON CAST(p.user_id AS TEXT) = CAST(u.id AS TEXT) OR p.user_id::text = u.username
        GROUP BY u.id, u.username, u.email, u.role, u.created_at
        ORDER BY u.created_at DESC;
      `);
      users = usersQuery.rows;
    } catch (e) {
      console.warn('⚠️ User list fallback query activated:', e.message);
      const fallbackUsers = await pool.query(`SELECT id, username, email, role, created_at FROM users;`);
      users = fallbackUsers.rows.map(u => ({ ...u, post_count: 0, total_views: 0 }));
    }

    let posts = [];
    try {
      const postsQuery = await pool.query(`
        SELECT p.id, p.title, COALESCE(p.views, 0) as views, p.created_at, COALESCE(u.username, p.user_id::text) AS author
        FROM posts p
        LEFT JOIN users u ON CAST(p.user_id AS TEXT) = CAST(u.id AS TEXT)
        ORDER BY p.created_at DESC;
      `);
      posts = postsQuery.rows;
    } catch (e) {
      console.warn('⚠️ Post moderation query fallback activated:', e.message);
      const fallbackPosts = await pool.query(`SELECT id, title, views, created_at FROM posts;`);
      posts = fallbackPosts.rows;
    }

    res.status(200).json({
      summary: statsQuery.rows[0] || { total_users: 0, total_posts: 0, total_views: 0 },
      users: users,
      posts: posts
    });
  } catch (err) {
    console.error('❌ Admin Dashboard Fetch Error:', err);
    res.status(500).json({ error: 'Failed to fetch admin stats: ' + err.message });
  }
});

// 🗑️ 2. Admin: Delete Any User
router.delete('/users/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
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