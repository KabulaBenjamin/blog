const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.DB_DIR || path.join(__dirname, '../data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'blog.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT UNIQUE NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS posts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER,
    title        TEXT NOT NULL,
    slug         TEXT UNIQUE NOT NULL,
    excerpt      TEXT,
    content      TEXT NOT NULL,
    content_type TEXT DEFAULT 'markdown',
    cover_image  TEXT,
    category     TEXT DEFAULT 'tech',
    tags         TEXT DEFAULT '',
    meta_desc    TEXT,
    status       TEXT DEFAULT 'published',
    views        INTEGER DEFAULT 0,
    likes        INTEGER DEFAULT 0,
    live_link    TEXT DEFAULT '',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reading_progress (
    user_id           INTEGER NOT NULL,
    post_id           INTEGER NOT NULL,
    scroll_percentage INTEGER DEFAULT 0,
    updated_at        TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, post_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT,
    email      TEXT,
    message    TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Default Categories Seed
const defaultCategories = [
  ['Tech', 'tech', 'Software development and engineering'],
  ['Education', 'education', 'High school math and science'],
  ['AI Research', 'ai-research', 'Machine learning and neural networks'],
  ['Faith', 'faith', 'Reflections and theology']
];

const insertCategory = db.prepare(`INSERT OR IGNORE INTO categories (name, slug, description) VALUES (?, ?, ?)`);
for (const cat of defaultCategories) {
  insertCategory.run(...cat);
}

// Default settings
const defaultSettings = {
  blog_title:       'Publishing Community',
  blog_tagline:     'Tech · Theology · Science · Life',
  blog_about:       'An open platform for publishers, software developers, educators, and authors.',
  blog_author:      'Community Authors',
  blog_email:       'admin@example.com',
  adsense_client:   '',
  adsense_slot:     '',
  ga_id:            '',
  admin_password:   'changeme123',
};

const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

module.exports = db;