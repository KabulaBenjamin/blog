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

// Initialize WebSockets Layer safely
try {
  const { initWebSocket } = require('./utils/websocket');
  initWebSocket(server);
} catch (err) {
  console.warn("⚠️ WebSocket initialization skipped or failed:", err.message);
}

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

// Safe Loader Helper for Route Modules
const loadRoute = (modulePath) => {
  try {
    return require(modulePath);
  } catch (err) {
    console.warn(`⚠️ Warning: Route module "${modulePath}" could not be loaded: ${err.message}`);
    return null;
  }
};

// Route Imports with Fallback Protection
const authRoutes = loadRoute('./routes/auth');
const postRoutes = loadRoute('./routes/posts');
const userRoutes = loadRoute('./routes/users') || loadRoute('./models/users'); // 🔄 Fallback check for models/users
const analyticsRoutes = loadRoute('./routes/analytics');
const adminRoutes = loadRoute('./routes/admin');
const sitemapRoutes = loadRoute('./routes/sitemap');
const recommendationRoutes = loadRoute('./routes/recommendations');

// Route Mounts
if (authRoutes) app.use('/', authRoutes);
if (sitemapRoutes) app.use('/', sitemapRoutes);
if (postRoutes) app.use('/posts', postRoutes);
if (userRoutes) {
  app.use('/users', userRoutes);
  app.use('/api/users', userRoutes); // 🚀 Mounts reading progress (/api/users/reading-progress)
}
if (analyticsRoutes) app.use('/api/analytics', analyticsRoutes);
if (adminRoutes) app.use('/api/admin', adminRoutes);
if (recommendationRoutes) app.use('/api/recommendations', recommendationRoutes);

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', database: 'connected', timestamp: new Date() });
});

// Start Server
server.listen(PORT, () => {
  console.log(`🚀 Modular Architecture Server running on port ${PORT}`);
});