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

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT posts.*, users.username FROM posts
      LEFT JOIN users ON posts.user_id = users.id WHERE posts.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch post.' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  const { title, content } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO posts (user_id, title, content) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, title, content]
    );
    const newPost = result.rows[0];
    newPost.username = req.user.username;
    broadcast({ action: 'CREATE', post: newPost });
    res.status(201).json(newPost);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create post.' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  const { title, content } = req.body;
  try {
    const postCheck = await pool.query('SELECT user_id FROM posts WHERE id = $1', [req.params.id]);
    if (postCheck.rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    if (String(postCheck.rows[0].user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized modification attempt.' });
    }
    const result = await pool.query(
      'UPDATE posts SET title=$1, content=$2 WHERE id=$3 RETURNING *',
      [title, content, req.params.id]
    );
    const updatedPost = result.rows[0];
    updatedPost.username = req.user.username;
    broadcast({ action: 'UPDATE', post: updatedPost });
    res.json(updatedPost);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update post.' });
  }
});

router.post('/:id/like', async (req, res) => {
  try {
    const result = await pool.query('UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    const post = result.rows[0];
    const userLookup = await pool.query('SELECT username FROM users WHERE id = $1', [post.user_id]);
    post.username = userLookup.rows[0]?.username || 'Anonymous';
    broadcast({ action: 'UPDATE', post });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Like error.' });
  }
});

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