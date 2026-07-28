// File Location: routes/admin.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

let pool;
try { pool = require('../config/db'); } catch(e) {
  try { pool = require('../utils/db'); } catch(e) { pool = require('../db'); }
}

// 🛡️ Middleware: Auth & Superuser Access
const requireAdmin = (req, res, next) => {
  try {
    const token = req.cookies?.token || (req.headers['authorization']?.split(' ')[1]);
    if (!token) return res.status(401).json({ error: 'Access denied: Token missing' });

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) return res.status(403).json({ error: 'Invalid or expired token' });

      const tokenUsername = decoded?.username;
      
      // Fast-pass authorization for Blog_Admin
      if (tokenUsername === 'Blog_Admin') {
        req.adminUser = { username: 'Blog_Admin', role: 'admin' };
        return next();
      }

      try {
        const userResult = await pool.query(
          `SELECT username FROM users WHERE username = $1 LIMIT 1;`,
          [tokenUsername]
        );
        if (userResult.rows[0]?.username === 'Blog_Admin') {
          req.adminUser = userResult.rows[0];
          return next();
        }
        return res.status(403).json({ error: 'Access denied: Superuser required' });
      } catch (dbErr) {
        // Fallback pass if username in token is Blog_Admin
        if (tokenUsername === 'Blog_Admin') return next();
        return res.status(403).json({ error: 'Authorization validation failed' });
      }
    });
  } catch (e) {
    return res.status(500).json({ error: 'Middleware error' });
  }
};

// 📊 1. Superuser Dashboard Endpoint (Fail-safe)
router.get('/dashboard', requireAdmin, async (req, res) => {
  let totalUsersCount = 0;
  let totalPostsCount = 0;
  let totalViewsCount = 0;
  let usersList = [];
  let postsList = [];

  // 1. Fetch Users
  try {
    const uRes = await pool.query(`SELECT * FROM users ORDER BY id DESC;`);
    usersList = uRes.rows.map(u => ({
      id: u.id,
      username: u.username || 'Anonymous',
      email: u.email || 'N/A',
      role: u.username === 'Blog_Admin' || u.role === 'admin' ? 'admin' : 'user',
      created_at: u.created_at || new Date()
    }));
    totalUsersCount = usersList.length;
  } catch (err) {
    console.error('⚠️ Admin users query notice:', err.message);
  }

  // 2. Fetch Posts
  try {
    const pRes = await pool.query(`SELECT * FROM posts ORDER BY id DESC;`);
    postsList = pRes.rows.map(p => ({
      id: p.id,
      title: p.title || 'Untitled',
      views: parseInt(p.views) || 0,
      user_id: p.user_id || p.author || p.created_by || '',
      created_at: p.created_at || new Date()
    }));
    totalPostsCount = postsList.length;
    totalViewsCount = postsList.reduce((acc, curr) => acc + curr.views, 0);
  } catch (err) {
    console.error('⚠️ Admin posts query notice:', err.message);
  }

  // 3. Map relations safely
  const formattedUsers = usersList.map(u => {
    const userPosts = postsList.filter(
      p => String(p.user_id) === String(u.id) || String(p.user_id) === String(u.username)
    );
    return {
      ...u,
      post_count: userPosts.length,
      total_views: userPosts.reduce((acc, curr) => acc + curr.views, 0)
    };
  });

  const formattedPosts = postsList.map(p => {
    const authorObj = usersList.find(
      u => String(u.id) === String(p.user_id) || String(u.username) === String(p.user_id)
    );
    return {
      ...p,
      author: authorObj ? authorObj.username : (p.user_id || 'Unknown')
    };
  });

  // Always return 200 OK with formatted state
  return res.status(200).json({
    summary: {
      total_users: totalUsersCount,
      total_posts: totalPostsCount,
      total_views: totalViewsCount
    },
    users: formattedUsers,
    posts: formattedPosts
  });
});

// 🗑️ Delete User safely
router.delete('/users/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    try { await pool.query('DELETE FROM posts WHERE CAST(user_id AS TEXT) = $1', [String(id)]); } catch(e){}
    await pool.query('DELETE FROM users WHERE CAST(id AS TEXT) = $1', [String(id)]);
    return res.status(200).json({ message: 'User deleted' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

// 🗑️ Delete Post safely
router.delete('/posts/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM posts WHERE CAST(id AS TEXT) = $1', [String(id)]);
    return res.status(200).json({ message: 'Post deleted' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete post' });
  }
});

module.exports = router;