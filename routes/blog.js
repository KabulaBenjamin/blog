const express = require('express');
const router = express.Router();
const db = require('../models/db'); // adjust if your db connection file differs
const multer = require('multer');
const upload = multer({ dest: 'media/' });

// CREATE post
router.post('/posts', upload.single('file'), async (req, res) => {
  try {
    const { user_id, title, content, editor_type, live_link } = req.body;
    const media_url = req.file ? `/media/${req.file.filename}` : null;

    const result = await db.query(
      `INSERT INTO posts (user_id, title, content, editor_type, live_link, media_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [user_id, title, content, editor_type || 'quill', live_link, media_url]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating post:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// UPDATE post
router.put('/posts/:id', upload.single('file'), async (req, res) => {
  try {
    const { title, content, editor_type, live_link } = req.body;
    const media_url = req.file ? `/media/${req.file.filename}` : null;

    const result = await db.query(
      `UPDATE posts
       SET title = $1,
           content = $2,
           editor_type = $3,
           live_link = $4,
           media_url = COALESCE($5, media_url),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [title, content, editor_type || 'quill', live_link, media_url, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating post:', err);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// DELETE post
router.delete('/posts/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting post:', err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// GET all posts
router.get('/posts', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM posts ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching posts:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

module.exports = router;
