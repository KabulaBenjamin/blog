const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Configure pg engine defaults before initialization
const pg = require('pg');
pg.defaults.ssl = { rejectUnauthorized: false };
const { Pool } = pg;

// Cloudinary Integrations for Persistent Media Storage
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("❌ CRITICAL ERROR: JWT_SECRET environment variable is missing.");
  process.exit(1);
}

// Create HTTP server to safely bind both Express and WebSockets
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/websocket' });

// Middleware Configuration
app.use(express.json());
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(cookieParser());
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

// Image Upload Endpoint (Optimized for Quill)
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
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(async () => {
    console.log('✅ Connected to PostgreSQL database');
    try {
      await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);');
    } catch (indexErr) {
      console.error('⚠️ Index verification warning:', indexErr.message);
    }
  })
  .catch(err => console.error('❌ DB connection error:', err));

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Session expired or invalid." });
    req.user = user;
    next();
  });
};

// ==========================================
// WEBSOCKET BROADCAST ENGINE
// ==========================================
const broadcast = (data) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

function heartbeat() { this.isAlive = true; }

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);
});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

// ==========================================
// CORE APPLICATION ROUTING
// ==========================================

// Main Application View Delivery
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
      padding: 20px 20px 80px 20px;
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
    .post-actions-row {
      display: flex;
      border-top: 1px solid #f0f0f0;
      border-bottom: 1px solid #f0f0f0;
      padding: 5px 0;
      margin-top: 5px;
    }
    .action-btn {
      flex: 1; background: none; border: none; cursor: pointer;
      font-weight: 500; font-size: 0.9rem; color: var(--gray);
      padding: 8px 0; text-align: center; transition: background 0.15s;
    }
    .action-btn:hover { background: #f5f5f5; }
    .action-btn.edit-btn { color: #2e7d32; }
    .action-btn.delete-btn { color: #c62828; }
    #editor-section {
      background: white; border: 1px solid var(--border-color);
      border-radius: 8px; padding: 20px; margin-bottom: 20px; display: none;
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

    /* Quill Font Formatting Overrides */
    .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="times-new-roman"]::before,
    .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="times-new-roman"]::before {
      content: 'Times New Roman'; font-family: 'Times New Roman', Times, serif;
    }
    .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="arial"]::before,
    .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="arial"]::before {
      content: 'Arial'; font-family: Arial, sans-serif;
    }
    .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="georgia"]::before,
    .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="georgia"]::before {
      content: 'Georgia'; font-family: Georgia, serif;
    }
    .ql-font-times-new-roman { font-family: 'Times New Roman', Times, serif; }
    .ql-font-arial { font-family: Arial, sans-serif; }
    .ql-font-georgia { font-family: Georgia, serif; }
  </style>
</head>
<body>

  <div id="feed-view">
    <h1>🚀 Koikoi Blog Feed</h1>
    <div id="posts-container">Loading feed...</div>
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

    let currentUser = null;
    let quill;

    // Register Whitelisted Typography Fonts inside local Quill engine context
    const Font = Quill.import('formats/font');
    Font.whitelist = ['serif', 'monospace', 'sans-serif', 'times-new-roman', 'arial', 'georgia'];
    Quill.register(Font, true);

    // Canvas image compression pipeline helper
    function compressImageFile(file) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target.result;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            let width = img.width;
            let height = img.height;

            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
              const compressedFile = new File([blob], file.name, { type: 'image/jpeg' });
              resolve(compressedFile);
            }, 'image/jpeg', 0.75);
          };
        };
      });
    }

    async function verifyUserSession() {
      try {
        const res = await fetch(\`\${API_BASE}/me\`);
        if (res.ok) {
          currentUser = await res.json();
        }
      } catch (err) {
        console.error("Session verification failed:", err);
      }
      fetchAndRenderPosts();
    }

    document.addEventListener("DOMContentLoaded", () => {
      quill = new Quill('#quill-editor-box', {
        theme: 'snow',
        placeholder: 'Compose your content...',
        modules: { 
          toolbar: {
            container: [
              [{ 'font': ['serif', 'monospace', 'sans-serif', 'times-new-roman', 'arial', 'georgia'] }],
              [{ 'header': [1, 2, false] }],
              ['bold', 'italic', 'underline'],
              ['link', 'image'],
              [{ 'list': 'ordered'}, { 'list': 'bullet' }],
              ['clean']
            ],
            handlers: {
              image: function() {
                const input = document.createElement('input');
                input.setAttribute('type', 'file');
                input.setAttribute('accept', 'image/*');
                input.click();

                input.onchange = async () => {
                  const file = input.files[0];
                  if (!file) return;

                  try {
                    const optimizedFile = await compressImageFile(file);
                    const formData = new FormData();
                    formData.append('media', optimizedFile);

                    const res = await fetch(\`\${API_BASE}/upload-image\`, {
                      method: 'POST',
                      body: formData
                    });

                    if (res.ok) {
                      const data = await res.json();
                      const range = quill.getSelection(true);
                      quill.insertEmbed(range.index, 'image', data.url);
                      quill.setSelection(range.index + 1);
                    } else {
                      alert('Image upload failed.');
                    }
                  } catch (err) {
                    console.error('Image upload pipeline error:', err);
                  }
                };
              }
            }
          }
        }
      });
      verifyUserSession();
    });

    function switchView(view) {
      document.getElementById('tab-home').classList.remove('active');
      document.getElementById('tab-post').classList.remove('active');

      if (view === 'home') {
        document.getElementById('feed-view').style.display = 'block';
        document.getElementById('editor-section').style.display = 'none';
        document.getElementById('tab-home').classList.add('active');
        clearEditorFields();
      } else if (view === 'post') {
        if (!currentUser) return alert("Please log in to make a post.");
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
      const isAuthor = currentUser && String(post.user_id) === String(currentUser.id);
      const commentsCount = Array.isArray(post.comments) ? post.comments.length : 0;

      return \`
        <div class="post-card" id="post-\${post.id}">
          <div class="post-content">\${post.content}</div>
          <div style="font-size:0.9rem; color:var(--gray); margin-bottom:10px;"><strong>By:</strong> \${post.username || 'Anonymous'}</div>
          
          <div class="post-meta-counters">
            <span>👍 <span id="likes-count-\${post.id}">\${post.likes || 0}</span></span> | 
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

    async function openPostInQuillEditor(id) {
      try {
        const res = await fetch(\`\${API_BASE}/posts/\${id}\`);
        if (!res.ok) throw new Error("Could not load post content details");
        const post = await res.json();

        document.getElementById('editing-post-id').value = post.id;
        document.getElementById('post-title-input').value = post.title || "";
        quill.clipboard.dangerouslyPasteHTML(post.content);

        document.getElementById('feed-view').style.display = 'none';
        document.getElementById('editor-section').style.display = 'block';
        document.getElementById('editor-title-heading').innerText = "Edit Your Post";
        window.scrollTo(0,0);
      } catch (err) {
        alert(err.message);
      }
    }

    async function submitPostForm() {
      const postId = document.getElementById('editing-post-id').value;
      const title = document.getElementById('post-title-input').value.trim();
      const content = quill.root.innerHTML;

      if (!title || content === '<p><br></p>') {
        return alert("Please enter a title and content.");
      }

      const url = postId ? \`\${API_BASE}/posts/\${postId}\` : \`\${API_BASE}/posts\`;
      const method = postId ? 'PUT' : 'POST';

      try {
        const res = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content })
        });

        if (res.ok) {
          switchView('home');
        } else {
          alert("Failed to submit post.");
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

    initializeWebSocket();
  </script>
</body>
</html>
  `);
});

// Identity verification route
app.get('/me', authenticateToken, (req, res) => {
  res.json(req.user);
});

// Fetch all posts with accurate author usernames
app.get('/posts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT posts.*, users.username
      FROM posts
      LEFT JOIN users ON posts.user_id = users.id
      ORDER BY posts.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts.' });
  }
});

// Fetch single post
app.get('/posts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT posts.*, users.username
      FROM posts
      LEFT JOIN users ON posts.user_id = users.id
      WHERE posts.id = $1
    `, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch post.' });
  }
});

// Create post
app.post('/posts', authenticateToken, async (req, res) => {
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

// Edit post
app.put('/posts/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  try {
    const postCheck = await pool.query('SELECT user_id FROM posts WHERE id = $1', [id]);
    if (postCheck.rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    if (String(postCheck.rows[0].user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized modification attempt.' });
    }

    const result = await pool.query(
      'UPDATE posts SET title=$1, content=$2 WHERE id=$3 RETURNING *',
      [title, content, id]
    );
    const updatedPost = result.rows[0];
    updatedPost.username = req.user.username;

    broadcast({ action: 'UPDATE', post: updatedPost });
    res.json(updatedPost);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update post.' });
  }
});

// Atomic Like Increment
app.post('/posts/:id/like', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = $1 RETURNING *', [id]);
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

// Delete Post
app.delete('/posts/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const postCheck = await pool.query('SELECT user_id FROM posts WHERE id = $1', [id]);
    if (postCheck.rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    if (String(postCheck.rows[0].user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized deletion attempt.' });
    }

    await pool.query('DELETE FROM posts WHERE id=$1', [id]);
    broadcast({ action: 'DELETE', id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete post.' });
  }
});

// ==========================================
// AUTHENTICATION SYSTEM INTERFACES
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

app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Fields required.' });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );
    issueSessionCookie(res, result.rows[0]);
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username taken.' });
    res.status(500).json({ error: 'Signup error.' });
  }
});

app.post('/signin', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });
    
    const isMatch = await bcrypt.compare(password, result.rows[0].password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials.' });

    const user = { id: result.rows[0].id, username: result.rows[0].username };
    issueSessionCookie(res, user);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: 'Signin error.' });
  }
});

// ==========================================
// PASSWORD RECOVERY ENDPOINTS
// ==========================================
app.post('/forgot-password', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required.' });
  try {
    const userCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userCheck.rows.length === 0) {
      return res.json({ success: true, message: 'If the account exists, a reset token has been generated.' });
    }
    const userId = userCheck.rows[0].id;
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 3600000);

    await pool.query(
      'UPDATE users SET reset_token = $1, token_expiry = $2 WHERE id = $3', 
      [resetToken, tokenExpiry, userId]
    );
    res.json({ success: true, message: 'Reset token generated successfully.', token: resetToken });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error processing request.' });
  }
});

app.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and password required.' });
  try {
    const result = await pool.query('SELECT id FROM users WHERE reset_token = $1 AND token_expiry > NOW()', [token]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Reset token is invalid or has expired.' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = $1, reset_token = NULL, token_expiry = NULL WHERE id = $2', 
      [hashedPassword, result.rows[0].id]
    );
    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error updating password.' });
  }
});

app.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });
  res.json({ success: true, message: 'Logged out cleanly.' });
});

server.listen(PORT, () => {
  console.log(`🚀 Production server operational on port ${PORT}`);
});