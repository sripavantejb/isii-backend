const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

const app = express();

// CORS configuration - MUST be the very first middleware
// Manual CORS middleware that runs before everything else
// Primary domain: https://isii.global
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Always set CORS headers - be very permissive
  // Allows requests from isii.global and other origins
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    // If no origin, allow all (for testing)
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  res.header('Access-Control-Max-Age', '86400');
  
  // Handle preflight requests immediately
  if (req.method === 'OPTIONS') {
    console.log('✅ CORS: Handling OPTIONS preflight request from:', origin);
    return res.status(204).end();
  }
  
  console.log('🌐 CORS: Request from origin:', origin || '(no origin)');
  next();
});

// Also use cors package as backup
app.use(cors({
  origin: true, // Allow all origins
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

// Increase body size limits to support file uploads (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// Global error handler - ensure CORS headers are always set
app.use((err, req, res, next) => {
  const origin = req.headers.origin;
  
  // Always set CORS headers even on errors
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  
  // Handle 413 Payload Too Large errors specifically
  if (err.status === 413 || err.statusCode === 413 || err.message?.includes('413') || err.message?.includes('too large') || err.message?.includes('payload')) {
    console.error('❌ 413 Payload Too Large Error:', err.message);
    return res.status(413).json({
      message: 'File upload too large. Maximum file size is 10MB per file. Note: Vercel free tier has a 4.5MB request body limit. Consider upgrading to Vercel Pro for larger uploads or compress your files.',
      error: 'Payload too large',
      maxFileSize: '10MB',
      platformLimit: '4.5MB (Vercel free tier)'
    });
  }
  
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

