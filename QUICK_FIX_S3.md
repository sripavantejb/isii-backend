# Quick Fix for S3 Access Denied Error

## The Problem
You're getting "Access Denied" errors when trying to access files from S3 because the bucket is not configured for public access.

## Solution: Two Steps Required

### Step 1: Create Bucket Policy (Automatic or Manual)

#### Option A: Automatic (Recommended)
Run this command in your backend directory:
```bash
npm run fix-s3-access
```

Or directly:
```bash
node scripts/fixS3PublicAccess.js
```

This will automatically create a bucket policy that allows public read access.

#### Option B: Manual (If automatic doesn't work)

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
2. Click on your bucket: `isii-v2`
3. Go to **Permissions** tab
4. Scroll to **Bucket Policy** section
5. Click **Edit**
6. Paste this JSON (replace `isii-v2` with your bucket name if different):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::isii-v2/*"
    }
  ]
}
```

7. Click **Save changes**

### Step 2: Disable Block Public Access (REQUIRED - Must be done in AWS Console)

**This step MUST be done manually in AWS Console:**

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
2. Click on your bucket: `isii-v2`
3. Go to **Permissions** tab
4. Scroll to **Block Public Access** settings
5. Click **Edit**
6. **UNCHECK** this option:
   - ✅ "Block public access to buckets and objects granted through new public bucket or access point policies"
7. Click **Save changes**
8. Type **"confirm"** when prompted
9. Click **Confirm**

## Verify the Fix

After completing both steps:

1. Upload a new file through your application
2. Copy the S3 URL (e.g., `https://isii-v2.s3.ap-south-1.amazonaws.com/images/...`)
3. Open the URL in a browser
4. The file should now be accessible!

## Troubleshooting

### Still Getting Access Denied?

1. **Wait a few seconds** - Changes can take a moment to propagate
2. **Check all Block Public Access settings:**
   - All four settings should be OFF (or at least the policy-related one)
   - If they're all ON, public access is completely blocked
3. **Verify bucket policy:**
   - Make sure the policy JSON is valid
   - Check that the bucket name in the Resource ARN matches your bucket
4. **Check file URL:**
   - Format should be: `https://bucket-name.s3.region.amazonaws.com/path/to/file`
   - Make sure region matches: `ap-south-1`

### Can't Access AWS Console?

If you don't have access to AWS Console, you'll need to:
1. Ask your AWS administrator to:
   - Add the bucket policy (see Step 1, Option B above)
   - Disable Block Public Access for bucket policies (Step 2)
2. Or grant your AWS credentials the `s3:PutBucketPolicy` and `s3:PutBucketPublicAccessBlock` permissions

## Security Note

⚠️ **Public read access** means anyone with the URL can access your files. This is fine for public content like images and PDFs, but:
- Don't use this for sensitive/private files
- Consider using CloudFront with signed URLs for better security
- Regularly review what files are publicly accessible

## Need More Help?

See `backend/S3_PUBLIC_ACCESS_SETUP.md` for detailed documentation.
