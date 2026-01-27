/**
 * Quick Fix Script for S3 Public Access
 * 
 * This script attempts to create a bucket policy to allow public read access.
 * Run with: node scripts/fixS3PublicAccess.js
 * 
 * IMPORTANT: You may still need to disable Block Public Access in AWS Console
 */

require('dotenv').config();
const { S3Client, PutBucketPolicyCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const bucketName = process.env.AWS_S3_BUCKET;

async function fixS3PublicAccess() {
  console.log('🔧 Attempting to fix S3 public access...\n');
  console.log(`Bucket: ${bucketName}`);
  console.log(`Region: ${process.env.AWS_REGION}\n`);

  const bucketPolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'PublicReadGetObject',
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${bucketName}/*`,
      },
    ],
  };

  try {
    console.log('📝 Creating bucket policy...');
    const putPolicyCommand = new PutBucketPolicyCommand({
      Bucket: bucketName,
      Policy: JSON.stringify(bucketPolicy),
    });
    
    await s3Client.send(putPolicyCommand);
    console.log('✅ Bucket policy created successfully!\n');
    
    console.log('='.repeat(60));
    console.log('⚠️  IMPORTANT NEXT STEPS');
    console.log('='.repeat(60));
    console.log('The bucket policy has been created, but you MUST also:');
    console.log('');
    console.log('1. Go to AWS S3 Console: https://s3.console.aws.amazon.com/');
    console.log(`2. Click on your bucket: ${bucketName}`);
    console.log('3. Go to the "Permissions" tab');
    console.log('4. Scroll to "Block Public Access" settings');
    console.log('5. Click "Edit"');
    console.log('6. UNCHECK this option:');
    console.log('   "Block public access to buckets and objects granted through');
    console.log('    new public bucket or access point policies"');
    console.log('7. Click "Save changes"');
    console.log('8. Type "confirm" when prompted');
    console.log('');
    console.log('After this, your files should be publicly accessible!');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Failed to create bucket policy\n');
    console.error('Error:', error.name);
    console.error('Message:', error.message);
    console.error('');
    
    if (error.name === 'AccessDenied') {
      console.error('⚠️  Your AWS credentials do not have permission to set bucket policies.');
      console.error('   Required permission: s3:PutBucketPolicy');
      console.error('');
      console.error('SOLUTION:');
      console.error('1. Ask your AWS administrator to grant s3:PutBucketPolicy permission');
      console.error('2. OR manually add the bucket policy in AWS Console:');
      console.error('');
      console.log('Bucket Policy JSON:');
      console.log(JSON.stringify(bucketPolicy, null, 2));
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      console.error('⚠️  Network connectivity issue.');
      console.error('   Please check your internet connection and AWS region configuration.');
    } else {
      console.error('Please check the error above and try again.');
    }
  }
}

fixS3PublicAccess();
