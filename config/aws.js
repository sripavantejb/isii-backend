const { S3Client } = require('@aws-sdk/client-s3');
require('dotenv').config();

// Lazy initialization function for S3Client
function getS3Client() {
  // Validate required environment variables
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set in .env file');
  }

  if (!process.env.AWS_REGION) {
    throw new Error('AWS_REGION must be set in .env file');
  }

  if (!process.env.AWS_S3_BUCKET) {
    throw new Error('AWS_S3_BUCKET must be set in .env file');
  }

  try {
    return new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  } catch (error) {
    console.error('Failed to initialize S3Client:', error.message);
    throw error;
  }
}

// Create s3Client on first access
let s3Client = null;
Object.defineProperty(module.exports, 's3Client', {
  get: function() {
    if (!s3Client) {
      s3Client = getS3Client();
    }
    return s3Client;
  }
});

