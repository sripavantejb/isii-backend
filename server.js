const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

const app = express();

// CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://isii-v1.vercel.app',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:3000',
].filter(Boolean);

// Helper function to check if origin is allowed
const isOriginAllowed = (origin) => {
  if (!origin) return false;
  
  // Normalize origin (remove trailing slash)
  const normalizedOrigin = origin.replace(/\/$/, '');
  
  if (process.env.NODE_ENV === 'development' && (normalizedOrigin.includes('localhost') || normalizedOrigin.includes('127.0.0.1'))) {
    return true;
  }
  
  // Check exact match or normalized match
  return allowedOrigins.some(allowed => {
    const normalizedAllowed = allowed.replace(/\/$/, '');
    return normalizedOrigin === normalizedAllowed || normalizedOrigin === allowed;
  });
};

// CORS middleware - MUST be the very first middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isAllowed = isOriginAllowed(origin);
  
  // Debug logging (remove in production if needed)
  if (req.method === 'OPTIONS') {
    console.log('OPTIONS request:', { origin, isAllowed, allowedOrigins });
  }
  
  // Always set CORS headers for OPTIONS requests (preflight)
  if (req.method === 'OPTIONS') {
    if (isAllowed && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    } else {
      // For denied origins, still send CORS headers (browser will block, but headers must be present)
      // Note: Can't use '*' with credentials: true, so use the origin if provided
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      return res.status(403).end();
    }
  }
  
  // Handle regular requests - only set headers if origin is allowed
  if (isAllowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root health check (no DB required)
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// API health check (no DB required)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Middleware to ensure DB connection for API routes
const ensureDBConnection = async (req, res, next) => {
  // Skip DB connection for OPTIONS requests (preflight)
  if (req.method === 'OPTIONS') {
    return next();
  }
  
  try {
    // Check if already connected
    if (mongoose.connection.readyState === 1) {
      return next();
    }
    
    // Attempt to connect
    await connectDB();
    next();
  } catch (error) {
    console.error('Database connection error in middleware:', error.message);
    res.status(500).json({
      message: 'Database connection error',
      error: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message
    });
  }
};

// Routes (with DB connection middleware)
app.use('/api/auth', ensureDBConnection, require('./routes/auth'));
app.use('/api/articles', ensureDBConnection, require('./routes/articles'));
app.use('/api/upload', ensureDBConnection, require('./routes/upload'));

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Global error handler:', err);
  console.error('   Error name:', err.name);
  console.error('   Error message:', err.message);
  console.error('   Stack:', err.stack);
  
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// Export app for Vercel serverless functions
module.exports = app;

