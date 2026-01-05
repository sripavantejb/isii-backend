const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

const app = express();

// CORS configuration - MUST be the very first middleware
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://isii-v1.vercel.app',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:3000',
].filter(Boolean);

// Log allowed origins for debugging
console.log('🔒 CORS Allowed Origins:', allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    // Log incoming origin for debugging
    if (process.env.NODE_ENV !== 'production') {
      console.log('🌐 CORS Request Origin:', origin);
    }
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Normalize origin (remove trailing slash)
    const normalizedOrigin = origin.replace(/\/$/, '');
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowed => {
      const normalizedAllowed = allowed.replace(/\/$/, '');
      return normalizedOrigin === normalizedAllowed || normalizedOrigin === allowed;
    });
    
    if (isAllowed) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ CORS: Origin allowed');
      }
      callback(null, true);
    } else {
      // Deny origin - cors package will not set CORS headers for denied origins
      console.warn('❌ CORS: Origin not allowed:', origin);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: [],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

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

