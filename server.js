const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

const app = express();

// CORS configuration - MUST be the very first middleware
// Simplified and more permissive for development
app.use(cors({
  origin: function (origin, callback) {
    // Log incoming origin for debugging
    console.log('🌐 CORS Request Origin:', origin || '(no origin)');
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('✅ CORS: Allowing request with no origin');
      return callback(null, true);
    }
    
    // Normalize origin (remove trailing slash)
    const normalizedOrigin = origin.replace(/\/$/, '');
    
    // Always allow localhost origins (safe for development and testing)
    if (normalizedOrigin.includes('localhost') || normalizedOrigin.includes('127.0.0.1')) {
      console.log('✅ CORS: Allowing localhost origin');
      return callback(null, true);
    }
    
    // Allow specific production origins
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'https://isii-v1.vercel.app',
      'https://isii-v1.vercel.app/',
    ].filter(Boolean);
    
    const isAllowed = allowedOrigins.some(allowed => {
      const normalizedAllowed = allowed.replace(/\/$/, '');
      return normalizedOrigin === normalizedAllowed;
    });
    
    if (isAllowed) {
      console.log('✅ CORS: Origin allowed');
      callback(null, true);
    } else {
      // In development, be more permissive
      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ CORS: Allowing origin in development mode');
        return callback(null, true);
      }
      
      console.warn('❌ CORS: Origin not allowed:', origin);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: [],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Explicit OPTIONS handler for all routes (handles preflight requests)
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  
  // Set CORS headers for preflight
  if (origin) {
    if (origin.includes('localhost') || origin.includes('127.0.0.1') || process.env.NODE_ENV !== 'production') {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      const allowedOrigins = [
        process.env.FRONTEND_URL,
        'https://isii-v1.vercel.app',
      ].filter(Boolean);
      
      if (allowedOrigins.some(allowed => origin === allowed.replace(/\/$/, ''))) {
        res.header('Access-Control-Allow-Origin', origin);
      }
    }
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Max-Age', '86400');
  res.status(204).end();
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
    
    // Provide more helpful error messages
    let errorMessage = 'Database connection error';
    if (error.message.includes('MONGODB_URI environment variable')) {
      errorMessage = 'MongoDB connection string is not configured. Please set MONGODB_URI in Vercel environment variables.';
    } else if (error.message.includes('uri parameter') || error.message.includes('openUri')) {
      errorMessage = 'MongoDB connection string is missing or invalid. Please check your MONGODB_URI environment variable.';
    }
    
    res.status(500).json({
      message: errorMessage,
      error: process.env.NODE_ENV === 'production' 
        ? 'Please check server configuration' 
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

