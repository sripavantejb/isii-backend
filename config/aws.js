const { S3Client } = require('@aws-sdk/client-s3');
require('./loadEnv');

const isRunningInLambda = () => Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

// Lazy initialization function for S3Client
function getS3Client() {
  if (!process.env.AWS_REGION) {
    throw new Error('AWS_REGION must be set in environment variables');
  }

  if (!process.env.AWS_S3_BUCKET) {
    throw new Error('AWS_S3_BUCKET must be set in environment variables');
  }

  try {
    const clientConfig = {
      region: process.env.AWS_S3_REGION || process.env.AWS_REGION,
    };

    // In AWS Lambda, prefer the default credential provider chain so the
    // execution role can supply credentials automatically. Local development
    // can still use explicit env vars when they are present.
    if (
      !isRunningInLambda() &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY
    ) {
      clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      };
    }

    return new S3Client(clientConfig);
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
