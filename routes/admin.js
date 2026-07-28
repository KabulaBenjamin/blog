// File Location: routes/admin.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

let pool;
try { pool = require('../config/db'); } catch(e) {
  try { pool = require('../utils/db'); } catch(e) { pool = require('../db'); }
}

// 🛡️ Middleware: Auth & Superuser Check
const requireAdmin = (req, res, next) => {
  const token = req.cookies?.token || (req.headers['authorization']?.split(' ')[1]);
  if (!token) return res.status(401).json({ error: 'Access denied: Token missing' });

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });

    const tokenUsername = decoded.username;
    
    // Fast-pass for Blog_Admin
    if (tokenUsername === 'Blog_Admin') {
      req.adminUser = { username: 'Blog_Admin', role: 'admin' };
      return next();
    }

    try {
      const userResult = await pool.query(
        `SELECT id, username FROM users WHERE username = $1 LIMIT 1;`,
        [tokenUsername]
      );
      if (userResult.rows[0]?.username === 'Blog_Admin') {
        req.adminUser = userResult.rows[0];
        return next();
      }
      return res.status(403).json({ error: 'Access denied: Superuser required' });
    } catch (dbErr) {
      return res.status(500).json({ error: 'Authorization error' });
    }
  });
};

// 📊 1. Superuser Dashboard Data Endpoint
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    // 1. Overall Platform Metrics
    const totalUsers = await pool.query('SELECT COUNT(*) FROM users;');
    const totalPosts = await pool.query('SELECT COUNT(*) FROM posts;');
    
    let totalViewsCount = 0;
    try {
      const viewsQuery = await pool.query('SELECT SUM(COALESCE(views, 0)) FROM posts;');
      totalViewsCount = viewsQuery.rows[0]?.sum || 0;
    } catch (e) {
      totalViewsCount = 0;
    }

    // 2. Fetch Users List
    const usersRes = await pool.query(`
      SELECT id, username, COALESCE(email, '') as email, COALESCE(created_at, NOW()) as created_at 
      FROM users 
      ORDER BY id DESC;
    `);

    // 3. Fetch Posts List
    const postsRes = await pool.query(`
      SELECT id, title, COALESCE(views, 0) as views, COALESCE(created_at, NOW()) as created_at, user_id
      FROM posts 
      ORDER BY id DESC;
    `);

    // Format safe response structure
    res.status(200).json({
      summary: {
        total_users: totalUsers.rows[0]?.count || 0,
        total_posts: totalPosts.rows[0]?.count || 0,
        total_views: totalViewsCount
      },
      users: usersRes.rows.map(u => ({
        ...u,
        role: u.username === 'Blog_Admin' ? 'admin' : 'user',
        post_count: postsRes.rows.filter(p => String(p.user_id) === String(u.id) || String(p.user_id) === u.username).length,
        total_views: postsRes.rows.filter(p => String(p.user_id) === String(u.id) || String(p.user_id) === u.username).reduce((acc, curr) => acc + (parseInt(curr.views) || 0), 0)
      })),
      posts: postsRes.rows.map(p => ({
        ...p,
        author: usersRes.rows.find(u => String(u.id) === String(p.user_id))?.username || String(p.user_id || 'Unknown')
      }))
    });

  } catch (err) {
    console.error('❌ Superuser dashboard fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch admin stats: ' + err.message });
  }
});

// 🗑️ Delete User
router.delete('/users/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM posts WHERE user_id::text = $1', [String(id)]);
    await pool.query('DELETE FROM users WHERE id::text = $1', [String(id)]);
    res.status(200).json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// 🗑️ Delete Post
router.delete('/posts/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM posts WHERE id::text = $1', [String(id)]);
    res.status(200).json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

module.exports = router;