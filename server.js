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
// POSTGRESQL INITIALIZATION (Fixed for Supabase SSL)
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
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

// Server-rendered Full Client Frontend Dashboard
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Koikoi Blog</title>
  <link href="https://cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet">
  <script src="https://cdn.quilljs.com/1.3.6/quill.js"></script>
  <style>
    :root {
      --primary: #0070f3;
      --danger: #ff0000;
      --text: #333;
      --gray: #666;
      --bg: #fafafa;
      --card-bg: #ffffff;
      --border-color: #eaeaea;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      max-width: 800px;
      margin: 0 auto;
      padding: 20px 20px 80px 20px; /* space for nav bar */
    }
    .post-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.01);
    }
    .post-meta-counters {
      font-size: 0.9rem;
      color: var(--gray);
      margin: 15px 0 5px 0;
      display: flex;
      gap: 10px;
    }
    /* Action Buttons row matches user design specs */
    .post-actions-row {
      display: flex;
      border-top: 1px solid #f0f0f0;
      border-bottom: 1px solid #f0f0f0;
      padding: 5px 0;
      margin-top: 5px;
    }
    .action-btn {
      flex: 1;
      background: none;
      border: none;
      cursor: pointer;
      font-weight: 500;
      font-size: 0.9rem;
      color: var(--gray);
      padding: 8px 0;
      text-align: center;
      transition: background 0.15s;
    }
    .action-btn:hover {
      background: #f5f5f5;
    }
    .action-btn.edit-btn { color: #2e7d32; }
    .action-btn.delete-btn { color: #c62828; }

    /* Creator Editor Section Form CSS */
    #editor-section {
      background: white;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      display: none;
    }
    .form-group { margin-bottom: 15px; }
    .form-group input {
      width: 100%; padding: 10px; box-sizing: border-box;
      border: 1px solid #ddd; border-radius: 4px; font-size: 1rem;
    }
    .btn-submit {
      background: var(--primary); color: white; border: none;
      padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 1rem;
    }

    /* Fixed Bottom Mobile-Friendly Tab Bar Navigation */
    .nav-tabs {
      position: fixed; bottom: 0; left: 0; right: 0; height: 60px;
      background: white; border-top: 1px solid var(--border-color);
      display: flex; justify-content: space-around; align-items: center;
      box-shadow: 0 -2px 10px rgba(0,0,0,0.05); z-index: 1000;
    }
    .nav-tab-item {
      background: none; border: none; cursor: pointer;
      display: flex; flex-direction: column; align-items: center;
      font-size: 0.75rem; color: var(--gray);
    }
    .nav-tab-item.active { color: var(--primary); }
    .nav-tab-item span { font-size: 1.4rem; margin-bottom: 2px; }
  </style>
</head>
<body>

  <div id="feed-view">
    <h1>🚀 Koikoi Blog Feed</h1>
    <div id="posts-container">Loading posts...</div>
  </div>

  <div id="editor-section">
    <h2 id="editor-title-heading">Create New Post</h2>
    <input type="hidden" id="editing-post-id" value="">
    
    <div class="form-group">
      <input type="text" id="post-title-input" placeholder="Post Title">
    </div>
    <div class="form-group">
      <div id="quill-editor-box" style="height: 250px;"></div>
    </div>
    <button class="btn-submit" onclick="submitPostForm()">Publish Post</button>
    <button class="btn-submit" style="background:#aaa; margin-left:10px;" onclick="switchView('home')">Cancel</button>
  </div>

  <div class="nav-tabs">
    <button class="nav-tab-item active" id="tab-home" onclick="switchView('home')"><span>🏠</span>Home</button>
    <button class="nav-tab-item" id="tab-post" onclick="switchView('post')"><span>➕</span>Post</button>
    <button class="nav-tab-item"><span>👤</span>Profile</button>
    <button class="nav-tab-item"><span>🔔</span>Notifications</button>
    <button class="nav-tab-item"><span>⚙️</span>Settings</button>
  </div>

  <script>
    const API_BASE = window.location.origin;
    const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const WS_URL = \`\${WS_PROTOCOL}\${window.location.host}/websocket\`;

    // Global session configuration
    let currentUser = { id: 1, username: "Benjamin" };
    let quill;

    // Initialize Rich Text Quill Instance
    document.addEventListener("DOMContentLoaded", () => {
      quill = new Quill('#quill-editor-box', {
        theme: 'snow',
        placeholder: 'Compose your masterpiece content here...',
        modules: { toolbar: [['bold', 'italic', 'underline'], ['image', 'link', 'blockquote']] }
      });
    });

    // Toggle between feed display and the write/edit scene
    function switchView(view) {
      document.getElementById('tab-home').classList.remove('active');
      document.getElementById('tab-post').classList.remove('active');

      if (view === 'home') {
        document.getElementById('feed-view').style.display = 'block';
        document.getElementById('editor-section').style.display = 'none';
        document.getElementById('tab-home').classList.add('active');
        clearEditorFields();
      } else if (view === 'post') {
        document.getElementById('feed-view').style.display = 'none';
        document.getElementById('editor-section').style.display = 'block';
        document.getElementById('tab-post').classList.add('active');
        document.getElementById('editor-title-heading').innerText = "Create New Post";
      }
    }

    function clearEditorFields() {
      document.getElementById('editing-post-id').value = "";
      document.getElementById('post-title-input').value = "";
      quill.setContents([]);
    }

    async function fetchAndRenderPosts() {
      try {
        const res = await fetch(\`\${API_BASE}/posts\`);
        const posts = await res.json();
        const container = document.getElementById('posts-container');
        if(posts.length === 0) {
          container.innerHTML = "<p>No posts available yet.</p>";
          return;
        }
        container.innerHTML = posts.map(post => renderPostCardHTML(post)).join('');
      } catch (err) {
        console.error(err);
      }
    }

    function renderPostCardHTML(post) {
      const isAuthor = Number(post.user_id) === Number(currentUser.id);
      const commentsCount = Array.isArray(post.comments) ? post.comments.length : 0;

      return \`
        <div class="post-card" id="post-\${post.id}">
          <div class="post-content">\${post.content}</div>
          <div style="font-size:0.9rem; color:var(--gray); margin-bottom:10px;">By: \${post.username || 'Anonymous'}</div>
          
          <div class="post-meta-counters">
            <span>👍 \span id="likes-count-\${post.id}">\${post.likes || 0}</span></span> | 
            <span>💬 \${commentsCount}</span>
          </div>

          <div class="post-actions-row">
            <button class="action-btn" onclick="likePost(\${post.id})">Like</button>
            <button class="action-btn">Comment</button>
            <button class="action-btn">Share</button>
            \${isAuthor ? \`
              <button class="action-btn edit-btn" onclick="openPostInQuillEditor(\${post.id})">Edit</button>
              <button class="action-btn delete-btn" onclick="triggerDeletePost(\${post.id})">Delete</button>
            \` : ''}
          </div>
        </div>
      \`;
    }

    async function likePost(id) {
      try { await fetch(\`\${API_BASE}/posts/\${id}/like\`, { method: 'POST' }); } catch(e){}
    }

    // ✏️ FETCH CURRENT DATA ROW AND POPULATE INTO QUILL
    async function openPostInQuillEditor(id) {
      try {
        const res = await fetch(\`\${API_BASE}/posts/\${id}\`);
        if (!res.ok) throw new Error("Could not load post content details");
        const post = await res.json();

        // Populate hidden fields and input targets
        document.getElementById('editing-post-id').value = post.id;
        document.getElementById('post-title-input').value = post.title || "";
        
        // Inject structural text html inside quill instance layer cleanly
        quill.clipboard.dangerouslyPasteHTML(post.content);

        // Transition layout view panel focus state
        document.getElementById('feed-view').style.display = 'none';
        document.getElementById('editor-section').style.display = 'block';
        document.getElementById('editor-title-heading').innerText = "Edit Your Post";
        window.scrollTo(0,0);
      } catch (err) {
        alert(err.message);
      }
    }

    // Process dispatch updates or raw creation saves
    async function submitPostForm() {
      const postId = document.getElementById('editing-post-id').value;
      const title = document.getElementById('post-title-input').value.trim();
      const content = quill.root.innerHTML; // Extract rich HTML text output string

      if (!title || content === '<p><br></p>') {
        return alert("Please provide valid inputs for title and content layers.");
      }

      const url = postId ? \`\${API_BASE}/posts/\${postId}\` : \`\${API_BASE}/posts\`;
      const method = postId ? 'PUT' : 'POST';

      try {
        const res = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser.id, title, content })
        });

        if (res.ok) {
          switchView('home');
        } else {
          alert("Error processing transaction request payload");
        }
      } catch(err) {
        console.error(err);
      }
    }

    async function triggerDeletePost(id) {
      if (!confirm("Are you sure you want to permanently remove this post?")) return;
      try {
        await fetch(\`\${API_BASE}/posts/\${id}\`, { method: 'DELETE' });
      } catch (err) { console.error(err); }
    }

    function initializeWebSocket() {
      const socket = new WebSocket(WS_URL);
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.action === 'CREATE' || data.action === 'UPDATE') {
          fetchAndRenderPosts();
        } else if (data.action === 'DELETE') {
          const element = document.getElementById(\`post-\${data.id}\`);
          if (element) element.remove();
        }
      };
      socket.onclose = () => setTimeout(initializeWebSocket, 5000);
    }

    fetchAndRenderPosts();
    initializeWebSocket();
  </script>
</body>
</html>
  `);
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

// ✏️ UPDATE A POST
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
    
    // Fetch username so the frontend WebSocket can render the author name immediately
    const userLookup = await pool.query('SELECT username FROM users WHERE id = $1', [updatedPost.user_id]);
    updatedPost.username = userLookup.rows[0]?.username || 'Unknown';

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
    const result = await pool.query('DELETE FROM posts WHERE id=$1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    broadcast({ action: 'DELETE', id });
    res.json({ success: true, message: 'Post and inline comments removed completely.', deleted: result.rows[0] });
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