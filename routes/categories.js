// File Location: routes/categories.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// GET /categories - Fetch all categories sorted alphabetically
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categories ORDER BY name ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch categories error:', err);
    res.status(500).json({ error: 'Failed to fetch categories.' });
  }
});

// POST /categories - Add a new category (Secured)
router.post('/', authenticateToken, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required.' });

  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

  try {
    const result = await pool.query(
      `INSERT INTO categories (name, slug) 
       VALUES ($1, $2) 
       ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name 
       RETURNING *`,
      [name.trim(), slug]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create category error:', err);
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

module.exports = router;