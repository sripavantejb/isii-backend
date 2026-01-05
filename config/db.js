const mongoose = require('mongoose');
require('dotenv').config();

// Cache the connection promise to avoid multiple simultaneous connection attempts
let cachedConnection = null;

const connectDB = async () => {
  try {
    // Validate MONGODB_URI is set
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not set. Please configure it in your Vercel environment variables.');
    }

    // Check if already connected (readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting)
    if (mongoose.connection.readyState === 1) {
      console.log('MongoDB: Using existing connection');
      return mongoose.connection;
    }

    // If there's already a connection attempt in progress, wait for it
    if (cachedConnection) {
      console.log('MongoDB: Waiting for existing connection attempt');
      return await cachedConnection;
    }

    // Create new connection
    const options = {
      serverSelectionTimeoutMS: 10000, // 10 seconds timeout
      socketTimeoutMS: 45000, // 45 seconds socket timeout
      family: 4, // Use IPv4, skip trying IPv6
      retryWrites: true,
      w: 'majority'
    };

    // Cache the connection promise
    cachedConnection = mongoose.connect(process.env.MONGODB_URI, options).then((conn) => {
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      cachedConnection = null; // Clear cache on success
      return conn;
    }).catch((error) => {
      cachedConnection = null; // Clear cache on error to allow retry
      throw error;
    });

    const conn = await cachedConnection;
    return conn;
  } catch (error) {
    console.error(`\n❌ MongoDB Connection Error: ${error.message}\n`);
    
    // Provide helpful guidance based on error type
    if (error.message.includes('MONGODB_URI environment variable')) {
      console.error('💡 Solution: Set MONGODB_URI in your Vercel environment variables.');
      console.error('   1. Go to your Vercel project dashboard');
      console.error('   2. Navigate to Settings > Environment Variables');
      console.error('   3. Add MONGODB_URI with your MongoDB connection string');
      console.error('   4. Redeploy your application\n');
    } else if (error.message.includes('IP') || error.message.includes('whitelist')) {
      console.error('💡 Solution: Your IP address needs to be whitelisted in MongoDB Atlas.');
      console.error('   1. Go to https://cloud.mongodb.com/');
      console.error('   2. Navigate to Network Access (or IP Whitelist)');
      console.error('   3. Click "Add IP Address"');
      console.error('   4. Click "Allow Access from Anywhere" (0.0.0.0/0) for development');
      console.error('      OR add your current IP address\n');
    } else if (error.message.includes('authentication')) {
      console.error('💡 Solution: Check your MongoDB credentials');
      console.error('   Verify MONGODB_URI contains the correct username and password\n');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      console.error('💡 Solution: Check your internet connection and MongoDB URI');
      console.error('   Verify the MONGODB_URI is correct\n');
    } else if (error.message.includes('uri parameter') || error.message.includes('openUri')) {
      console.error('💡 Solution: MONGODB_URI is missing or invalid');
      console.error('   1. Check your Vercel environment variables');
      console.error('   2. Ensure MONGODB_URI is set correctly');
      console.error('   3. Format should be: mongodb+srv://username:password@cluster.mongodb.net/dbname\n');
    }
    
    console.error('📚 For more help, see: https://www.mongodb.com/docs/atlas/security-whitelist/\n');
    
    // Never exit process in serverless environments - throw error instead
    throw error;
  }
};

module.exports = connectDB;

