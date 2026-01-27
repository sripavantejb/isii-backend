/**
 * S3 Access Diagnostic Script
 * 
 * This script helps diagnose why S3 files are not publicly accessible.
 * Run with: node scripts/diagnoseS3Access.js
 */

require('dotenv').config();
const { S3Client, GetBucketAclCommand, GetBucketPolicyCommand, GetPublicAccessBlockCommand, PutBucketPolicyCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const bucketName = process.env.AWS_S3_BUCKET;

async function diagnoseS3Access() {
  console.log('🔍 Diagnosing S3 Public Access Configuration...\n');
  console.log(`Bucket: ${bucketName}`);
  console.log(`Region: ${process.env.AWS_REGION}\n`);

  const issues = [];
  const recommendations = [];

  try {
    // 1. Check Block Public Access settings
    console.log('1️⃣ Checking Block Public Access settings...');
    try {
      const blockPublicAccessCommand = new GetPublicAccessBlockCommand({
        Bucket: bucketName,
      });
      const blockPublicAccess = await s3Client.send(blockPublicAccessCommand);
      
      if (blockPublicAccess.PublicAccessBlockConfiguration) {
        const config = blockPublicAccess.PublicAccessBlockConfiguration;
        console.log('   Block Public Access Configuration:');
        console.log(`   - BlockPublicAcls: ${config.BlockPublicAcls}`);
        console.log(`   - IgnorePublicAcls: ${config.IgnorePublicAcls}`);
        console.log(`   - BlockPublicPolicy: ${config.BlockPublicPolicy}`);
        console.log(`   - RestrictPublicBuckets: ${config.RestrictPublicBuckets}`);

        if (config.BlockPublicPolicy || config.RestrictPublicBuckets) {
          issues.push('Block Public Access is preventing public access via bucket policy');
          recommendations.push('Disable "Block public access to buckets and objects granted through new public bucket or access point policies" in S3 console');
        }
        if (config.BlockPublicAcls || config.IgnorePublicAcls) {
          issues.push('Block Public Access is preventing public access via ACLs');
          recommendations.push('Disable "Block public access to buckets and objects granted through new access control lists (ACLs)" in S3 console');
        }
      } else {
        console.log('   ✅ Block Public Access is not configured (allowing public access)');
      }
    } catch (error) {
      if (error.name === 'NoSuchPublicAccessBlockConfiguration') {
        console.log('   ✅ Block Public Access is not configured (allowing public access)');
      } else {
        console.error('   ❌ Error checking Block Public Access:', error.message);
        issues.push(`Error checking Block Public Access: ${error.message}`);
      }
    }

    // 2. Check Bucket Policy
    console.log('\n2️⃣ Checking Bucket Policy...');
    try {
      const getPolicyCommand = new GetBucketPolicyCommand({
        Bucket: bucketName,
      });
      const policyResponse = await s3Client.send(getPolicyCommand);
      
      if (policyResponse.Policy) {
        const policy = JSON.parse(policyResponse.Policy);
        console.log('   ✅ Bucket Policy exists:');
        console.log('   Policy:', JSON.stringify(policy, null, 2));
        
        // Check if policy allows public GetObject
        const hasPublicGetObject = policy.Statement?.some(stmt => 
          stmt.Effect === 'Allow' &&
          (stmt.Principal === '*' || stmt.Principal?.AWS === '*') &&
          (stmt.Action === 's3:GetObject' || stmt.Action?.includes('s3:GetObject'))
        );

        if (hasPublicGetObject) {
          console.log('   ✅ Policy allows public GetObject access');
        } else {
          issues.push('Bucket policy exists but does not allow public GetObject access');
          recommendations.push('Update bucket policy to allow public GetObject access');
        }
      } else {
        console.log('   ⚠️  No bucket policy found');
        issues.push('No bucket policy configured');
        recommendations.push('Add a bucket policy to allow public GetObject access');
      }
    } catch (error) {
      if (error.name === 'NoSuchBucketPolicy') {
        console.log('   ⚠️  No bucket policy found');
        issues.push('No bucket policy configured');
        recommendations.push('Add a bucket policy to allow public GetObject access');
      } else {
        console.error('   ❌ Error checking bucket policy:', error.message);
        issues.push(`Error checking bucket policy: ${error.message}`);
      }
    }

    // 3. Check Bucket ACL
    console.log('\n3️⃣ Checking Bucket ACL...');
    try {
      const getAclCommand = new GetBucketAclCommand({
        Bucket: bucketName,
      });
      const aclResponse = await s3Client.send(getAclCommand);
      console.log('   ✅ Bucket ACL retrieved');
      console.log('   Owner:', aclResponse.Owner?.DisplayName || aclResponse.Owner?.ID);
      
      if (aclResponse.Grants && aclResponse.Grants.length > 0) {
        console.log('   Grants:', aclResponse.Grants.length);
        const publicGrant = aclResponse.Grants.find(g => 
          g.Grantee?.Type === 'Group' && g.Grantee?.URI === 'http://acs.amazonaws.com/groups/global/AllUsers'
        );
        if (publicGrant) {
          console.log('   ✅ Public read access granted via ACL');
        } else {
          console.log('   ⚠️  No public read access via ACL');
        }
      }
    } catch (error) {
      if (error.name === 'AccessControlListNotSupported') {
        console.log('   ℹ️  ACLs are disabled on this bucket (Object Ownership = Bucket owner enforced)');
        console.log('   ✅ This is normal for new buckets - use bucket policy instead');
      } else {
        console.error('   ❌ Error checking bucket ACL:', error.message);
        issues.push(`Error checking bucket ACL: ${error.message}`);
      }
    }

    // 4. Test file access
    console.log('\n4️⃣ Testing file access...');
    const testKey = 'images/test.jpg'; // You can change this to an actual file key
    try {
      const getObjectCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: testKey,
      });
      await s3Client.send(getObjectCommand);
      console.log(`   ✅ Successfully accessed test file: ${testKey}`);
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        console.log(`   ℹ️  Test file ${testKey} does not exist (this is OK)`);
      } else if (error.name === 'AccessDenied') {
        console.log(`   ❌ Access Denied for ${testKey}`);
        issues.push('Files are not publicly accessible');
      } else {
        console.log(`   ⚠️  Error accessing test file: ${error.message}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 DIAGNOSIS SUMMARY');
    console.log('='.repeat(60));

    if (issues.length === 0) {
      console.log('✅ No issues found! Files should be publicly accessible.');
      console.log('   If you still get Access Denied, check:');
      console.log('   - Individual file permissions');
      console.log('   - CORS configuration (if accessing from browser)');
    } else {
      console.log('❌ Issues found:');
      issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`);
      });

      console.log('\n💡 Recommendations:');
      recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });

      console.log('\n📖 See backend/S3_PUBLIC_ACCESS_SETUP.md for detailed instructions');
    }

    // Offer to create bucket policy
    if (issues.some(i => i.includes('No bucket policy'))) {
      console.log('\n' + '='.repeat(60));
      console.log('🔧 QUICK FIX: Create Bucket Policy');
      console.log('='.repeat(60));
      console.log('Would you like to automatically create a bucket policy?');
      console.log('Run this script with --fix flag: node scripts/diagnoseS3Access.js --fix');
    }

  } catch (error) {
    console.error('\n❌ Fatal error during diagnosis:', error);
    console.error('   Error name:', error.name);
    console.error('   Error message:', error.message);
  }
}

// Check if --fix flag is provided
const shouldFix = process.argv.includes('--fix');

if (shouldFix) {
  console.log('🔧 Attempting to fix S3 public access...\n');
  
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

  (async () => {
    try {
      const putPolicyCommand = new PutBucketPolicyCommand({
        Bucket: bucketName,
        Policy: JSON.stringify(bucketPolicy),
      });
      
      await s3Client.send(putPolicyCommand);
      console.log('✅ Bucket policy created successfully!');
      console.log('\n⚠️  IMPORTANT: You still need to disable Block Public Access settings:');
      console.log('   1. Go to S3 Console → Your Bucket → Permissions');
      console.log('   2. Edit "Block Public Access" settings');
      console.log('   3. Uncheck "Block public access to buckets and objects granted through new public bucket or access point policies"');
      console.log('   4. Save changes');
    } catch (error) {
      console.error('❌ Failed to create bucket policy:', error.message);
      if (error.name === 'AccessDenied') {
        console.error('   Your AWS credentials may not have permission to set bucket policies.');
        console.error('   You need s3:PutBucketPolicy permission.');
      }
    }
  })();
} else {
  diagnoseS3Access();
}
