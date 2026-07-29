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

// 🌐 Trust proxy for secure cookies behind Render's reverse proxy
app.set('trust proxy', 1);

// Initialize WebSockets Layer
const { initWebSocket } = require('./utils/websocket');
initWebSocket(server);

// Middleware Configuration Matrix
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🌐 CORS Configuration (Web + Mobile Capacitor Support)
const allowedOrigins = [
  'https://blog-frontend-k2b3.onrender.com',
  'https://blog-frontend-k28r.onrender.com',
  'https://localhost',        // 📱 Capacitor Android (HTTPS Scheme)
  'http://localhost',         // 📱 Capacitor Android/iOS (HTTP Scheme)
  'capacitor://localhost'     // 📱 Capacitor Custom Scheme
];

app.use(cors({
  origin: function (origin, callback) {
    // !origin allows requests from native mobile apps, Postman, server-to-server calls, etc.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`Blocked by CORS: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Route Imports
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const userRoutes = require('./routes/users');
const analyticsRoutes = require('./routes/analytics');
const adminRoutes = require('./routes/admin'); // 👈 Import admin routes
const sitemapRoutes = require('./routes/sitemap');

// Route Mounts
app.use('/', authRoutes);
app.use('/', sitemapRoutes);
app.use('/posts', postRoutes);
app.use('/users', userRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes); // 👈 Mount admin routes here

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', database: 'connected', timestamp: new Date() });
});

// Start Server
server.listen(PORT, () => {
  console.log(`🚀 Modular Architecture Server running on port ${PORT}`);
});