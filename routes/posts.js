const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { broadcast } = require('../utils/websocket');

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'koikoi_blog_media',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'gif']
  },
});
const upload = multer({ storage: storage });

router.post('/upload-image', upload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });
  res.json({ url: req.file.path });
});

// GET all posts
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT posts.*, users.username FROM posts
      LEFT JOIN users ON posts.user_id = users.id
      ORDER BY posts.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts.' });
  }
});

// GET single post (🎯 Dynamic Views Counting Added here!)
router.get('/:id', async (req, res) => {
  try {
    const postId = req.params.id;

    // 1. Automatically increment the views count on fetch
    await pool.query(
      'UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = $1',
      [postId]
    );

    // 2. Query the post along with creator's username
    const result = await pool.query(`
      SELECT posts.*, users.username FROM posts
      LEFT JOIN users ON posts.user_id = users.id WHERE posts.id = $1
    `, [postId]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    
    // Broadcast the updated view count live to active WebSockets clients
    broadcast({ action: 'UPDATE', post: result.rows[0] });

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Fetch post / views error:', err);
    res.status(500).json({ error: 'Failed to fetch post.' });
  }
});

// CREATE a post
router.post('/', authenticateToken, async (req, res) => {
  const { title, content, live_link, category, tags } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO posts (user_id, title, content, live_link, category, tags, views, liked_by_users) 
       VALUES ($1, $2, $3, $4, $5, $6, 0, '{}') RETURNING *`,
      [req.user.id, title, content, live_link || '', category || 'tech', tags || '']
    );
    const newPost = result.rows[0];
    newPost.username = req.user.username;
    broadcast({ action: 'CREATE', post: newPost });
    res.status(201).json(newPost);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create post.' });
  }
});

// UPDATE a post
router.put('/:id', authenticateToken, async (req, res) => {
  const { title, content, live_link, category, tags } = req.body;
  try {
    const postCheck = await pool.query('SELECT user_id FROM posts WHERE id = $1', [req.params.id]);
    if (postCheck.rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    if (String(postCheck.rows[0].user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized modification attempt.' });
    }
    const result = await pool.query(
      `UPDATE posts 
       SET title=$1, content=$2, live_link=$3, category=$4, tags=$5 
       WHERE id=$6 RETURNING *`,
      [title, content, live_link || '', category || 'tech', tags || '', req.params.id]
    );
    const updatedPost = result.rows[0];
    updatedPost.username = req.user.username;
    broadcast({ action: 'UPDATE', post: updatedPost });
    res.json(updatedPost);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update post.' });
  }
});

// POST toggle like (🔒 Secured with authentication, prevents duplicates)
router.post('/:id/like', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const postId = req.params.id;

  try {
    // 1. Fetch the post to check if user has already liked it
    const postCheck = await pool.query('SELECT liked_by_users FROM posts WHERE id = $1', [postId]);
    if (postCheck.rows.length === 0) return res.status(404).json({ error: 'Post not found' });

    const likedByUsers = postCheck.rows[0].liked_by_users || [];
    const hasLiked = likedByUsers.includes(userId);

    let result;

    if (hasLiked) {
      // 2a. Unlike: Remove user ID from array and decrement the count
      result = await pool.query(`
        UPDATE posts 
        SET 
          liked_by_users = array_remove(liked_by_users, $1),
          likes = GREATEST(0, COALESCE(likes, 1) - 1)
        WHERE id = $2
        RETURNING *
      `, [userId, postId]);
    } else {
      // 2b. Like: Add user ID to array (uniquely) and increment the count
      result = await pool.query(`
        UPDATE posts 
        SET 
          liked_by_users = array_append(COALESCE(liked_by_users, '{}'), $1),
          likes = COALESCE(likes, 0) + 1
        WHERE id = $2
        RETURNING *
      `, [userId, postId]);
    }

    const post = result.rows[0];
    const userLookup = await pool.query('SELECT username FROM users WHERE id = $1', [post.user_id]);
    post.username = userLookup.rows[0]?.username || 'Anonymous';
    
    broadcast({ action: 'UPDATE', post });
    res.json(post);
  } catch (err) {
    console.error('Like toggle execution failed:', err);
    res.status(500).json({ error: 'Like transaction error.' });
  }
});

// DELETE a post
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const postCheck = await pool.query('SELECT user_id FROM posts WHERE id = $1', [req.params.id]);
    if (postCheck.rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    if (String(postCheck.rows[0].user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized deletion attempt.' });
    }
    await pool.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
    broadcast({ action: 'DELETE', id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete post.' });
  }
});

module.exports = router;