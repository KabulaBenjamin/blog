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

// Service Diagnostics Route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', database: 'connected', timestamp: new Date() });
});

server.listen(PORT, () => {
  console.log(`🚀 Modular Architecture Server running on port ${PORT}`);
});