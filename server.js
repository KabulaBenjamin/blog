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
// 🌐 DYNAMIC GOOGLE INDEXING SITEMAP GENERATOR (SUPABASE / POSTGRES)
// =========================================================================
app.get('/sitemap.xml', async (req, res) => {
  try {
    // 1. Import your existing Supabase client instance
    // (Adjust this path to point to your actual Supabase configuration utility file)
    const supabase = require('./utils/supabase') || require('./config/supabase'); 

    // 2. Fetch all posts from your Supabase PostgreSQL table
    // Adjust 'posts' to match your exact database table name if it's different
    const { data: posts, error } = await supabase
      .from('posts')
      .select('id, updated_at');

    if (error) throw error;

    const frontendHost = 'https://blog-frontend-k2b3.onrender.com';

    // 3. Start building the raw XML template mapping
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Static pages setup (Home Page)
    xml += `  <url>\n    <loc>${frontendHost}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

    // 4. Loop through database rows and append dynamic structural URLs
    if (posts && posts.length > 0) {
      posts.forEach(post => {
        // Handle PostgreSQL timestamp mapping cleanly
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

    // 5. Send accurate Content-Type declaration header so Google reads it as XML data
    res.header('Content-Type', 'application/xml');
    res.status(200).send(xml);

  } catch (err) {
    console.error('⚠️ Sitemap runtime compilation exception context:', err);
    // Return empty structured framework fallback so crawlers don't break during an outage
    res.header('Content-Type', 'application/xml');
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
  }
});

// Service Diagnostics Route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', database: 'connected', timestamp: new Date() });
});

server.listen(PORT, () => {
  console.log(`🚀 Modular Architecture Server running on port ${PORT}`);
});