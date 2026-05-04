const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
require('./config/loadEnv');

const applyCommonMiddleware = (app) => {
  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      res.header('Access-Control-Allow-Origin', '*');
    }

    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
    );
    res.header('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    console.log('🌐 CORS: Request from origin:', origin || '(no origin)');
    next();
  });

  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Access-Control-Request-Method',
        'Access-Control-Request-Headers',
      ],
      maxAge: 86400,
      preflightContinue: false,
      optionsSuccessStatus: 204,
    })
  );

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
};

const ensureDBConnection = async (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  try {
    if (mongoose.connection.readyState === 1) {
      return next();
    }

    await connectDB();
    next();
  } catch (error) {
    console.error('Database connection error in middleware:', error.message);
    res.status(500).json({
      message: 'Database connection error',
      error:
        process.env.NODE_ENV === 'production'
          ? 'Please check server configuration'
          : error.message,
    });
  }
};

const attachGlobalErrorHandler = (app) => {
  app.use((err, req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      res.header('Access-Control-Allow-Origin', '*');
    }
    res.header('Access-Control-Allow-Credentials', 'true');

    if (err.status === 413 || err.statusCode === 413 || err.message?.includes('413')) {
      console.error('❌ 413 Payload Too Large Error:', err.message);
      return res.status(413).json({
        message: 'File upload too large. Maximum file size is 10MB.',
        error: 'Payload too large',
      });
    }

    console.error('❌ Global error handler:', err);
    res.status(err.status || 500).json({
      message: err.message || 'Internal server error',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    });
  });
};

const createMainApp = () => {
  const app = express();

  applyCommonMiddleware(app);

  app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
  });

  app.use('/api/auth', ensureDBConnection, require('./routes/auth'));
  app.use('/api/articles', ensureDBConnection, require('./routes/articles'));
  app.use('/api/news', ensureDBConnection, require('./routes/news'));
  app.use('/api/reports', ensureDBConnection, require('./routes/reports'));
  app.use('/api/upload', ensureDBConnection, require('./routes/upload'));

  attachGlobalErrorHandler(app);
  return app;
};

const createServiceApp = (mountPath, router) => {
  const app = express();

  applyCommonMiddleware(app);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: mountPath, message: 'Service is running' });
  });

  app.use(mountPath, ensureDBConnection, router);

  attachGlobalErrorHandler(app);
  return app;
};

module.exports = {
  createMainApp,
  createServiceApp,
};
