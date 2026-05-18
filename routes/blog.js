const express = require('express');
const router  = express.Router();
const db      = require('../models/db');
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

// Configure marked
marked.setOptions({ breaks: true, gfm: true });

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function renderContent(content, type) {
  if (type === 'markdown') return marked(content);
  if (type === 'html')     return sanitizeHtml(content, { allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img','h1','h2','h3','h4','h5','h6','figure','figcaption','iframe','video','audio','source','pre','code']) });
  // plain text
  return `<p>${content.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
}

// ── Home / paginated list ──────────────────────────────────────────────
router.get('/', (req, res) => {
  const settings = getSettings();
  const page     = Math.max(1, parseInt(req.query.page) || 1);
  const perPage  = 6;
  const offset   = (page - 1) * perPage;
  const category = req.query.category || '';
  const search   = req.query.q || '';

  let where = "status = 'published'";
  const params = [];

  if (category) { where += ' AND category = ?'; params.push(category); }
  if (search)   { where += ' AND (title LIKE ? OR excerpt LIKE ? OR tags LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM posts WHERE ${where}`).get(...params).cnt;
  const posts = db.prepare(`SELECT * FROM posts WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, perPage, offset);
  const categories = db.prepare("SELECT DISTINCT category FROM posts WHERE status='published' ORDER BY category").all().map(r => r.category);

  res.render('index', {
    settings, posts, page,
    totalPages: Math.ceil(total / perPage),
    categories, category, search,
    title: settings.blog_title,
    meta_desc: settings.blog_tagline,
    canonical: `${process.env.BASE_URL || ''}`,
  });
});

// ── Single post ────────────────────────────────────────────────────────
router.get('/post/:slug', (req, res) => {
  const settings = getSettings();
  const post = db.prepare("SELECT * FROM posts WHERE slug = ? AND status = 'published'").get(req.params.slug);
  if (!post) return res.status(404).render('404', { settings, title: 'Not Found' });

  // Increment views
  db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(post.id);

  const htmlContent = renderContent(post.content, post.content_type);

  // Related posts
  const related = db.prepare(
    "SELECT id,title,slug,excerpt,cover_image,created_at FROM posts WHERE status='published' AND category=? AND id!=? ORDER BY created_at DESC LIMIT 3"
  ).all(post.category, post.id);

  res.render('post', {
    settings, post, htmlContent, related,
    title: post.title,
    meta_desc: post.meta_desc || post.excerpt || '',
    canonical: `${process.env.BASE_URL || ''}/post/${post.slug}`,
    tags: post.tags ? post.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
  });
});

// ── Category ──────────────────────────────────────────────────────────
router.get('/category/:cat', (req, res) => {
  res.redirect(`/?category=${encodeURIComponent(req.params.cat)}`);
});

// ── About ─────────────────────────────────────────────────────────────
router.get('/about', (req, res) => {
  const settings = getSettings();
  res.render('about', { settings, title: `About — ${settings.blog_title}`, meta_desc: `Learn more about ${settings.blog_author}`, canonical: `${process.env.BASE_URL || ''}/about` });
});

// ── Contact ───────────────────────────────────────────────────────────
router.get('/contact', (req, res) => {
  const settings = getSettings();
  res.render('contact', { settings, title: `Contact — ${settings.blog_title}`, meta_desc: 'Get in touch', canonical: `${process.env.BASE_URL || ''}/contact`, success: false });
});

router.post('/contact', (req, res) => {
  const settings = getSettings();
  const { name, email, message } = req.body;
  if (name && email && message) {
    db.prepare('INSERT INTO contacts (name,email,message) VALUES (?,?,?)').run(name.trim(), email.trim(), message.trim());
  }
  res.render('contact', { settings, title: `Contact — ${settings.blog_title}`, meta_desc: 'Get in touch', canonical: `${process.env.BASE_URL || ''}/contact`, success: true });
});

// ── Privacy Policy ─────────────────────────────────────────────────────
router.get('/privacy', (req, res) => {
  const settings = getSettings();
  res.render('privacy', { settings, title: `Privacy Policy — ${settings.blog_title}`, meta_desc: 'Privacy Policy', canonical: `${process.env.BASE_URL || ''}/privacy` });
});

// ── Sitemap ────────────────────────────────────────────────────────────
router.get('/sitemap.xml', (req, res) => {
  const base  = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const posts = db.prepare("SELECT slug, updated_at FROM posts WHERE status='published' ORDER BY updated_at DESC").all();

  res.header('Content-Type', 'application/xml');
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${base}/about</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${base}/contact</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${base}/privacy</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>`;

  for (const p of posts) {
    xml += `\n  <url><loc>${base}/post/${p.slug}</loc><lastmod>${p.updated_at.split(' ')[0]}</lastmod><changefreq>monthly</changefreq><priority>0.9</priority></url>`;
  }
  xml += '\n</urlset>';
  res.send(xml);
});

// ── Robots.txt ─────────────────────────────────────────────────────────
router.get('/robots.txt', (req, res) => {
  const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${base}/sitemap.xml`);
});

module.exports = router;
