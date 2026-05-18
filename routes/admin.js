const express  = require('express');
const router   = express.Router();
const db       = require('../models/db');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const slugify  = require('slug');

// ── Multer setup ───────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ── Auth middleware ────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect('/admin/login');
}

// ── Login ──────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('admin/login', { error: null, settings: getSettings(), title: 'Admin Login' });
});

router.post('/login', (req, res) => {
  const settings = getSettings();
  const { password } = req.body;
  if (password === settings.admin_password) {
    req.session.admin = true;
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'Wrong password. Try again.', settings, title: 'Admin Login' });
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ── Dashboard ──────────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const settings = getSettings();
  const posts     = db.prepare('SELECT * FROM posts ORDER BY created_at DESC').all();
  const stats     = {
    total:     posts.length,
    published: posts.filter(p => p.status === 'published').length,
    drafts:    posts.filter(p => p.status === 'draft').length,
    views:     posts.reduce((s, p) => s + (p.views || 0), 0),
  };
  res.render('admin/dashboard', { settings, posts, stats, title: 'Admin Dashboard' });
});

// ── New post ───────────────────────────────────────────────────────────
router.get('/new', requireAuth, (req, res) => {
  res.render('admin/editor', {
    settings: getSettings(),
    post: null,
    title: 'New Post',
    error: null,
  });
});

router.post('/new', requireAuth, upload.single('cover_image'), (req, res) => {
  const { title, content, content_type, excerpt, category, tags, meta_desc, status } = req.body;
  let slug = slugify(title, { lower: true, strict: true });

  // Ensure unique slug
  let base = slug, i = 1;
  while (db.prepare('SELECT id FROM posts WHERE slug=?').get(slug)) {
    slug = `${base}-${i++}`;
  }

  const cover_image = req.file ? `/uploads/${req.file.filename}` : '';

  try {
    db.prepare(`
      INSERT INTO posts (title,slug,excerpt,content,content_type,cover_image,category,tags,meta_desc,status)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(title, slug, excerpt||'', content, content_type||'markdown', cover_image, category||'General', tags||'', meta_desc||'', status||'draft');
    res.redirect('/admin');
  } catch (e) {
    res.render('admin/editor', { settings: getSettings(), post: req.body, title: 'New Post', error: e.message });
  }
});

// ── Edit post ──────────────────────────────────────────────────────────
router.get('/edit/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!post) return res.redirect('/admin');
  res.render('admin/editor', { settings: getSettings(), post, title: `Edit: ${post.title}`, error: null });
});

router.post('/edit/:id', requireAuth, upload.single('cover_image'), (req, res) => {
  const { title, content, content_type, excerpt, category, tags, meta_desc, status } = req.body;
  const existing = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!existing) return res.redirect('/admin');

  const cover_image = req.file ? `/uploads/${req.file.filename}` : existing.cover_image;

  db.prepare(`
    UPDATE posts SET title=?,excerpt=?,content=?,content_type=?,cover_image=?,category=?,tags=?,meta_desc=?,status=?,updated_at=datetime('now')
    WHERE id=?
  `).run(title, excerpt||'', content, content_type||'markdown', cover_image, category||'General', tags||'', meta_desc||'', status||'draft', req.params.id);

  res.redirect('/admin');
});

// ── Delete post ────────────────────────────────────────────────────────
router.post('/delete/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM posts WHERE id=?').run(req.params.id);
  res.redirect('/admin');
});

// ── Settings ───────────────────────────────────────────────────────────
router.get('/settings', requireAuth, (req, res) => {
  res.render('admin/settings', { settings: getSettings(), title: 'Settings', success: false });
});

router.post('/settings', requireAuth, (req, res) => {
  const allowed = ['blog_title','blog_tagline','blog_about','blog_author','blog_email','adsense_client','adsense_slot','ga_id','admin_password'];
  const update  = db.prepare('UPDATE settings SET value=? WHERE key=?');
  for (const key of allowed) {
    if (req.body[key] !== undefined) update.run(req.body[key], key);
  }
  res.render('admin/settings', { settings: getSettings(), title: 'Settings', success: true });
});

// ── Contacts ───────────────────────────────────────────────────────────
router.get('/contacts', requireAuth, (req, res) => {
  const contacts = db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all();
  res.render('admin/contacts', { settings: getSettings(), contacts, title: 'Contact Messages' });
});

// ── Live preview ───────────────────────────────────────────────────────
router.post('/preview', requireAuth, (req, res) => {
  const { content, type } = req.body;
  const { marked } = require('marked');
  const sanitizeHtml = require('sanitize-html');
  marked.setOptions({ breaks: true, gfm: true });

  let html = '';
  if (type === 'markdown') html = marked(content || '');
  else if (type === 'html') html = sanitizeHtml(content || '', { allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img','h1','h2','h3','h4','h5','h6','pre','code','figure','figcaption']) });
  else html = `<p>${(content||'').replace(/\n\n+/g,'</p><p>').replace(/\n/g,'<br>')}</p>`;

  res.json({ html });
});

// ── Image upload (AJAX) ────────────────────────────────────────────────
router.post('/upload-image', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.json({ error: 'No file' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

module.exports = router;
