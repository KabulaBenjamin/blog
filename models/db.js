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
  CREATE TABLE IF NOT EXISTS posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    slug       TEXT UNIQUE NOT NULL,
    excerpt    TEXT,
    content    TEXT NOT NULL,
    content_type TEXT DEFAULT 'markdown',  -- 'markdown' | 'html' | 'text'
    cover_image TEXT,
    category   TEXT DEFAULT 'General',
    tags       TEXT DEFAULT '',            -- comma-separated
    meta_desc  TEXT,
    status     TEXT DEFAULT 'draft',       -- 'draft' | 'published'
    views      INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
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

// Default settings
const defaultSettings = {
  blog_title:       'Benjamin Koikoi',
  blog_tagline:     'Tech · Theology · Life',
  blog_about:       'I am Benjamin Kabula Koikoi — Evangelist, Software Developer, and Author based in Nairobi, Kenya. I write at the intersection of technology, faith, and human flourishing.',
  blog_author:      'Benjamin Kabula Koikoi',
  blog_email:       'benjaminkoikoi@example.com',
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
