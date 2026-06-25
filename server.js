const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(() => console.log('✅ Connected to PostgreSQL via Pool'))
  .catch(err => console.error('❌ DB connection error:', err));

// Root route
app.get('/', (req, res) => {
  res.send('Welcome to Koikoi Blog API! Try /posts to see posts.');
});

// Fetch all posts
app.get('/posts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM posts ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch posts error:', err.message);
    res.status(500).json({ error: 'Failed to fetch posts.' });
  }
});

// Create a new post
app.post('/posts', async (req, res) => {
  const { user_id, title, content } = req.body;

  if (!user_id || !title || !content) {
    return res.status(400).json({ error: 'User ID, title, and content are required.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO posts (user_id, title, content) VALUES ($1, $2, $3) RETURNING *',
      [user_id, title, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create post error:', err.message);
    res.status(500).json({ error: 'Failed to create post.' });
  }
});

// Signup with detailed error handling
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *',
      [username, password]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Signup error:', err.message);

    // Handle duplicate username (Postgres error code 23505)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already exists. Please choose another.' });
    }

    res.status(500).json({ error: 'Internal server error. Please try again later.' });
  }
});

// Signin with clear feedback
app.post('/signin', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username=$1 AND password=$2',
      [username, password]
    );

    if (result.rows.length > 0) {
      res.json({ success: true, user: result.rows[0] });
    } else {
      res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }
  } catch (err) {
    console.error('Signin error:', err.message);
    res.status(500).json({ error: 'Internal server error. Please try again later.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
