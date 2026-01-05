const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    const options = {
      serverSelectionTimeoutMS: 10000, // 10 seconds timeout
      socketTimeoutMS: 45000, // 45 seconds socket timeout
      family: 4, // Use IPv4, skip trying IPv6
      retryWrites: true,
      w: 'majority'
    };

    const conn = await mongoose.connect(process.env.MONGODB_URI, options);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`\n❌ MongoDB Connection Error: ${error.message}\n`);
    
    // Provide helpful guidance based on error type
    if (error.message.includes('IP') || error.message.includes('whitelist')) {
      console.error('💡 Solution: Your IP address needs to be whitelisted in MongoDB Atlas.');
      console.error('   1. Go to https://cloud.mongodb.com/');
      console.error('   2. Navigate to Network Access (or IP Whitelist)');
      console.error('   3. Click "Add IP Address"');
      console.error('   4. Click "Allow Access from Anywhere" (0.0.0.0/0) for development');
      console.error('      OR add your current IP address\n');
    } else if (error.message.includes('authentication')) {
      console.error('💡 Solution: Check your MongoDB credentials in the .env file');
      console.error('   Verify MONGODB_URI contains the correct username and password\n');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      console.error('💡 Solution: Check your internet connection and MongoDB URI');
      console.error('   Verify the MONGODB_URI in your .env file is correct\n');
    }
    
    console.error('📚 For more help, see: https://www.mongodb.com/docs/atlas/security-whitelist/\n');
    
    // Don't exit process in serverless environments (Vercel)
    if (require.main === module) {
      process.exit(1);
    }
    // In serverless, throw error instead of exiting
    throw error;
  }
};

module.exports = connectDB;

