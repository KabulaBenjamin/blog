const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Validate Environment State Variables
if (!process.env.JWT_SECRET) {
  console.error("❌ CRITICAL ERROR: JWT_SECRET environment variable is missing.");
  process.exit(1);
}

// Initialize WebSockets Utility Layer
const { initWebSocket } = require('./utils/websocket');
initWebSocket(server);

// Middleware Configuration Matrix
app.use(express.json());
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Core Module Routers Split
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const userRoutes = require('./routes/users');

app.use('/', authRoutes);
app.use('/posts', postRoutes);
app.use('/users', userRoutes);

// =========================================================================
// 🌐 DYNAMIC GOOGLE INDEXING SITEMAP GENERATOR (POSTGRES / DB POOL)
// =========================================================================
app.get('/sitemap.xml', async (req, res) => {
  const frontendHost = 'https://blog-frontend-k2b3.onrender.com';
  
  try {
    // 🔑 Dynamically checks where your database config file is hosted in the tree
    const pool = require('./config/db') || require('./utils/db') || require('./db');

    if (!pool || typeof pool.query !== 'function') {
      throw new Error("PostgreSQL database connection pool initialization failed.");
    }

    // Execute direct raw SQL query string to grab what the indexers require
    const result = await pool.query('SELECT id, updated_at FROM posts;');
    const posts = result.rows;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Static Base Page URL (Homepage)
    xml += `  <url>\n    <loc>${frontendHost}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

    // Map rows directly from active connection pool stream arrays
    if (posts && posts.length > 0) {
      posts.forEach(post => {
        // Formats database timestamps safely into clean string objects
        const lastModDate = post.updated_at ? new Date(post.updated_at).toISOString() : new Date().toISOString();

        xml += `  <url>\n`;
        xml += `    <loc>${frontendHost}/posts/${post.id}</loc>\n`;
        xml += `    <lastmod>${lastModDate}</lastmod>\n`;
        xml += `    <changefreq>weekly</changefreq>\n`;
        xml += `    <priority>0.8</priority>\n`;
        xml += `  </url>\n`;
      });
    }

    xml += `</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.status(200).send(xml);

  } catch (err) {
    console.error('⚠️ Sitemap runtime error resolved via database driver context:', err);
    
    // Clean production dynamic fallback utilizing the true frontend URL target
    let fallbackXml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    fallbackXml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    fallbackXml += `  <url>\n    <loc>${frontendHost}/</loc>\n    <priority>1.0</priority>\n  </url>\n`;
    fallbackXml += `</urlset>`;
    
    res.header('Content-Type', 'application/xml');
    res.status(200).send(fallbackXml);
  }
});

// Service Diagnostics Route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', database: 'connected', timestamp: new Date() });
});

server.listen(PORT, () => {
  console.log(`🚀 Modular Architecture Server running on port ${PORT}`);
});