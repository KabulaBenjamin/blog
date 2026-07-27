const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/sitemap.xml', async (req, res) => {
  const frontendHost = 'https://blog-frontend-k2b3.onrender.com';
  
  try {
    if (!pool || typeof pool.query !== 'function') {
      throw new Error("PostgreSQL database connection pool initialization failed.");
    }

    const result = await pool.query('SELECT id, updated_at FROM posts;');
    const posts = result.rows;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    xml += `  <url>\n    <loc>${frontendHost}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

    if (posts && posts.length > 0) {
      posts.forEach(post => {
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
    return res.status(200).send(xml);

  } catch (err) {
    console.error('⚠️ Sitemap runtime error:', err);
    
    let fallbackXml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    fallbackXml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    fallbackXml += `  <url>\n    <loc>${frontendHost}/</loc>\n    <priority>1.0</priority>\n  </url>\n`;
    fallbackXml += `</urlset>`;
    
    res.header('Content-Type', 'application/xml');
    return res.status(200).send(fallbackXml);
  }
});

module.exports = router;