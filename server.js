require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet     = require('helmet');
const compression = require('compression');
const path       = require('path');
const fs         = require('fs');

const app = express();

// ── Data dir ───────────────────────────────────────────────────────────
const DATA_DIR = process.env.DB_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Security & performance ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'https://pagead2.googlesyndication.com', 'https://www.googletagmanager.com', 'https://www.google-analytics.com'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'https:', 'https://pagead2.googlesyndication.com'],
      frameSrc:    ["'self'", 'https://googleads.g.doubleclick.net'],
      connectSrc:  ["'self'", 'https://www.google-analytics.com'],
    }
  }
}));
app.use(compression());

// ── View engine ────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Static files ───────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

// ── Body parsing ───────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// ── Sessions ───────────────────────────────────────────────────────────
app.use(session({
  store:  new SQLiteStore({ dir: DATA_DIR, db: 'sessions.db' }),
  secret: process.env.SESSION_SECRET || 'blog-secret-key-change-in-prod-please',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   24 * 60 * 60 * 1000, // 1 day
  }
}));

// ── Routes ─────────────────────────────────────────────────────────────
app.use('/',       require('./routes/blog'));
app.use('/admin',  require('./routes/admin'));

// ── 404 ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  const db       = require('./models/db');
  const settings = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, r.value]));
  res.status(404).render('404', { settings, title: '404 — Page Not Found' });
});

// ── Error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('<h1>500 — Internal Server Error</h1><p>' + err.message + '</p>');
});

// ── Start ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  Blog running at http://localhost:${PORT}`);
  console.log(`🔐  Admin panel: http://localhost:${PORT}/admin`);
  console.log(`🔑  Default password: changeme123  (change in /admin/settings)`);
});
