const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server first to safely bind both Express and WebSockets
const server = http.createServer(app);

// Fixed: Explicit path added to clear Render handshake reverse-proxy blocks cleanly
const wss = new WebSocket.Server({ server, path: '/websocket' });

// Middleware
app.use(express.json());
app.use(cors());
app.use(cookieParser());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(() => console.log('✅ Connected to PostgreSQL via Pool'))
  .catch(err => console.error('❌ DB connection error:', err));

// Real-time broadcast helper function
const broadcast = (data) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

// WebSocket Event Handling
wss.on('connection', (ws) => {
  console.log('🔌 WebSocket client connected via /websocket');
  ws.send(JSON.stringify({ type: 'WELCOME', message: 'Welcome to Koikoi Blog WebSocket!' }));
  
  ws.on('message', (message) => {
    console.log('📩 Received custom message:', message.toString());
  });
  
  ws.on('close', () => console.log('❌ WebSocket client disconnected'));
});

// Location tracking middleware: Safe, completely non-blocking execution flow
app.use(async (req, res, next) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Dynamic import to bypass ESM node-fetch limitation safely in CommonJS
    const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
    
    // Fetch geo data with a strict catch to ensure it never hangs the routing lifecycle
    const response = await fetch(`https://ipapi.co/${ip}/json/`).catch(() => null);
    
    if (response && response.ok) {
      const data = await response.json();
      req.userLocation = {
        ip,
        city: data.city,
        region: data.region,
        country: data.country_name
      };

      if (!req.cookies.consent) {
        res.cookie('consent', 'true', { httpOnly: true, maxAge: 365*24*60*60*1000 });
      }
    } else {
      req.userLocation = null;
    }
  } catch (err) {
    console.error('Optional location tracking skipped:', err.message);
    req.userLocation = null;
  }
  next();
});

// Root route
app.get('/', (req, res) => {
  res.send('Welcome to Koikoi Blog API! Try /posts to see posts.');
});

// Fetch all posts with usernames
app.get('/posts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT posts.*, users.username
      FROM posts
      JOIN users ON posts.user_id = users.id
      ORDER BY posts.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch posts error:', err.message);
    res.status(500).json({ error: 'Failed to fetch posts.' });
  }
});

// Fetch a single post by ID 
app.get('/posts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT posts.*, users.username
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Fetch single post error:', err.message);
    res.status(500).json({ error: 'Failed to fetch post.' });
  }
});

// Create a new post (with real-time broadcasting)
app.post('/posts', upload.single('media'), async (req, res) => {
  const { user_id, title, content, editor_type, live_link } = req.body;
  if (!user_id || !title || !content) {
    return res.status(400).json({ error: 'User ID, title, and content are required.' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO posts (user_id, title, content, editor_type, live_link) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [user_id, title, content, editor_type || 'quill', live_link]
    );
    
    const newPost = result.rows[0];
    broadcast({ action: 'CREATE', post: newPost });
    
    res.status(201).json(newPost);
  } catch (err) {
    console.error('Create post error:', err.message);
    res.status(500).json({ error: 'Failed to create post.' });
  }
});

// Update a post (with real-time broadcasting)
app.put('/posts/:id', upload.single('media'), async (req, res) => {
  const { id } = req.params;
  const { title, content, editor_type, live_link } = req.body;
  try {
    const result = await pool.query(
      'UPDATE posts SET title=$1, content=$2, editor_type=$3, live_link=$4 WHERE id=$5 RETURNING *',
      [title, content, editor_type || 'quill', live_link, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const updatedPost = result.rows[0];
    broadcast({ action: 'UPDATE', post: updatedPost });
    
    res.json(updatedPost);
  } catch (err) {
    console.error('Update post error:', err.message);
    res.status(500).json({ error: 'Failed to update post.' });
  }
});

// Delete a post (with real-time broadcasting)
app.delete('/posts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM posts WHERE id=$1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    broadcast({ action: 'DELETE', id });
    
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error('Delete post error:', err.message);
    res.status(500).json({ error: 'Failed to delete post.' });
  }
});

// Signup
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, password]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Signup error:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already exists. Please choose another.' });
    }
    res.status(500).json({ error: 'Internal server error. Please try again later.' });
  }
});

// Signin
app.post('/signin', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  try {
    const result = await pool.query(
      'SELECT id, username, password FROM users WHERE username=$1 AND password=$2',
      [username, password]
    );
    if (result.rows.length > 0) {
      res.json({ success: true, user: { id: result.rows[0].id, username: result.rows[0].username } });
    } else {
      res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }
  } catch (err) {
    console.error('Signin error:', err.message);
    res.status(500).json({ error: 'Internal server error. Please try again later.' });
  }
});

// Signup or auto-create user and signin
app.post('/signup-or-signin', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  try {
    const existing = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (existing.rows.length > 0) {
      if (existing.rows[0].password === password) {
        return res.json({ success: true, user: { id: existing.rows[0].id, username: existing.rows[0].username } });
      } else {
        return res.status(401).json({ error: 'Password mismatch.' });
      }
    }
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, password]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Signup-or-signin error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Fetch current user details by ID
app.get('/me/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT id, username FROM users WHERE id=$1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Fetch user error:', err.message);
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// Start Server cleanly bound to the HTTP + WS setup
server.listen(PORT, () => {
  console.log(`🚀 Server running smoothly on http://localhost:${PORT}`);
});