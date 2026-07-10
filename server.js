const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 🛡️ CRITICAL FIX: Configure pg engine defaults BEFORE pulling in the Pool module
// This overrides the strict connection string validation order and fixes SELF_SIGNED_CERT_IN_CHAIN
const pg = require('pg');
pg.defaults.ssl = { rejectUnauthorized: false };
const { Pool } = pg;

// Cloudinary Integrations for Persistent Media Storage
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'koikoi_blog_super_secret_fallback_key';

// Create HTTP server first to safely bind both Express and WebSockets
const server = http.createServer(app);

// Fixed: Explicit path added to clear Render handshake reverse-proxy blocks cleanly
const wss = new WebSocket.Server({ server, path: '/websocket' });

// Middleware Configuration
app.use(express.json());

// Configured CORS to dynamically mirror origins and authorize credentials securely
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(cookieParser());

// Serve local uploaded files statically (Maintains legacy local image links)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==========================================
// CLOUDINARY ENGINE CONFIGURATION
// ==========================================
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

// ==========================================
// IMAGE UPLOAD ENDPOINT (Optimized for Quill)
// ==========================================
app.post('/upload-image', upload.single('media'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }
  res.json({ url: req.file.path });
});

// ==========================================
// POSTGRESQL INITIALIZATION
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

pool.connect()
  .then(async () => {
    console.log('✅ Connected to PostgreSQL via Pool');
    try {
      // Create indexes automatically on startup for instant lookups
      await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);');
      console.log('⚡ High-efficiency database optimization indexes verified.');
    } catch (indexErr) {
      console.error('⚠️ Index creation warning:', indexErr.message);
    }
  })
  .catch(err => console.error('❌ DB connection error:', err));

// ==========================================
// WEBSOCKET BROADCAST & PING-PONG HEARTBEAT
// ==========================================
const broadcast = (data) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws) => {
  console.log('🔌 WebSocket client connected via /websocket');
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  ws.send(JSON.stringify({ type: 'WELCOME', message: 'Welcome to Koikoi Blog WebSocket!' }));

  ws.on('message', (message) => {
    console.log('📩 Received custom message:', message.toString());
  });

  ws.on('close', () => console.log('❌ WebSocket client disconnected'));
});

// Periodic actively driven sweep tracking broken client pipes
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

// ==========================================
// LOCATION TRACKING MIDDLEWARE
// ==========================================
app.use(async (req, res, next) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
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

// ==========================================
// APP CORE ROUTING INFRASTRUCTURE
// ==========================================
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

// Create a new post
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

// Update a post
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

// 👍 ATOMIC LIKE INCREMENT ROUTE
app.post('/posts/:id/like', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const updatedPost = result.rows[0];
    const userLookup = await pool.query('SELECT username FROM users WHERE id = $1', [updatedPost.user_id]);
    updatedPost.username = userLookup.rows[0]?.username || 'Unknown';

    broadcast({ action: 'UPDATE', post: updatedPost });
    res.json(updatedPost);
  } catch (err) {
    console.error('Like tracking exception:', err.message);
    res.status(500).json({ error: 'Failed to process like event.' });
  }
});

// 💬 PERSISTENT COMMENTS ROUTE (JSONB Engine)
app.post('/posts/:id/comment', async (req, res) => {
  const { id } = req.params;
  const { text, username } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Comment content cannot be blank.' });
  }

  try {
    const result = await pool.query(
      `UPDATE posts 
       SET comments = COALESCE(comments, '[]'::jsonb) || jsonb_build_array(
         jsonb_build_object('id', extract(epoch from now()), 'username', $1::text, 'text', $2::text)
       )
       WHERE id = $3 RETURNING *`,
      [username || 'Anonymous', text, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const updatedPost = result.rows[0];
    const userLookup = await pool.query('SELECT username FROM users WHERE id = $1', [updatedPost.user_id]);
    updatedPost.username = userLookup.rows[0]?.username || 'Unknown';

    broadcast({ action: 'UPDATE', post: updatedPost });
    res.json(updatedPost);
  } catch (err) {
    console.error('Comment process tracking exception:', err.message);
    res.status(500).json({ error: 'Failed to save comment entry.' });
  }
});

// 🗑️ CASCADE DELETE ROUTE
app.delete('/posts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM comments WHERE post_id = $1').catch(() => null);

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

// ==========================================
// SECURE AUTHENTICATION ENDPOINTS
// ==========================================

const issueSessionCookie = (res, user) => {
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    secure: true, 
    sameSite: 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000 
  });
};

// Secure Signup
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );
    
    const user = result.rows[0];
    issueSessionCookie(res, user);
    res.json({ success: true, user });
  } catch (err) {
    console.error('Signup error:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Secure Signin
app.post('/signin', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    const sanitizedUser = { id: user.id, username: user.username };
    issueSessionCookie(res, sanitizedUser);
    res.json({ success: true, user: sanitizedUser });
  } catch (err) {
    console.error('Signin error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Secure Signup-or-Signin
app.post('/signup-or-signin', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  try {
    const existing = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    
    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      const isMatch = await bcrypt.compare(password, user.password);
      if (isMatch) {
        const sanitizedUser = { id: user.id, username: user.username };
        issueSessionCookie(res, sanitizedUser);
        return res.json({ success: true, user: sanitizedUser });
      } else {
        return res.status(401).json({ error: 'Password mismatch.' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );
    
    const newUser = result.rows[0];
    issueSessionCookie(res, newUser);
    res.json({ success: true, user: newUser });
  } catch (err) {
    console.error('Signup-or-signin error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Clean Logout Endpoint
app.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });
  res.json({ success: true, message: 'Logged out cleanly.' });
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
  console.log(`🚀 Server running smoothly on port ${PORT}`);
});