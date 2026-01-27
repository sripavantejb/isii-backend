# S3 Public Access Configuration Guide

## Problem: Access Denied Error

If you're getting "Access Denied" errors when trying to access uploaded files from S3, it's because the files are not publicly accessible. This guide explains how to fix this issue.

## Understanding the Issue

AWS S3 buckets created after April 2023 have **ACLs disabled by default** (Object Ownership = "Bucket owner enforced"). This means:

- The `acl: 'public-read'` setting in the upload code will be **ignored**
- You **cannot** set ACLs on individual files
- You **must** use a **Bucket Policy** for public access instead

## Solution Options

### Option 1: Enable ACLs (If Possible)

If you can enable ACLs on your bucket:

1. Go to AWS S3 Console → Your Bucket → **Permissions** tab
2. Scroll to **Object Ownership** section
3. Click **Edit**
4. Select **"ACLs enabled"** (requires bucket owner to accept)
5. Save changes
6. Scroll to **Block Public Access** settings
7. Click **Edit**
8. Uncheck **"Block public access to buckets and objects granted through new access control lists (ACLs)"**
9. Save changes

After this, the `acl: 'public-read'` setting in the code will work.

### Option 2: Use Bucket Policy (Recommended for New Buckets)

If ACLs are disabled (which is the default for new buckets), use a bucket policy:

1. Go to AWS S3 Console → Your Bucket → **Permissions** tab
2. Scroll to **Bucket Policy** section
3. Click **Edit**
4. Paste the following policy (replace `YOUR_BUCKET_NAME` with your actual bucket name):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    }
  ]
}
```

5. Click **Save changes**

**Important:** Make sure **Block Public Access** settings allow public access:
- Go to **Block Public Access** settings
- At minimum, uncheck: **"Block public access to buckets and objects granted through new public bucket or access point policies"**
- Save changes

## Verifying the Fix

After applying either solution:

1. Upload a new file through your application
2. Copy the S3 URL from the response
3. Open the URL in a browser (or use curl)
4. The file should be accessible without authentication

## Troubleshooting

### Still Getting Access Denied?

1. **Check Block Public Access Settings:**
   - All four Block Public Access settings should be **OFF** (or at least the policy-related ones)
   - If they're all ON, public access is completely blocked

2. **Verify Bucket Policy:**
   - Make sure the bucket policy JSON is valid
   - Replace `YOUR_BUCKET_NAME` with your actual bucket name
   - The policy should allow `s3:GetObject` action

3. **Check File URL Format:**
   - Correct: `https://bucket-name.s3.region.amazonaws.com/path/to/file.jpg`
   - Make sure the region matches your bucket's region

4. **Test with AWS CLI:**
   ```bash
   aws s3api get-object-acl --bucket YOUR_BUCKET_NAME --key images/example.jpg
   ```
   If this fails with "AccessControlListNotSupported", ACLs are disabled (use bucket policy).

## Using the Utility Functions

The code includes utility functions to help manage file permissions:

### Check File Permissions
```bash
GET /api/upload/check/images/example.jpg
```

### Update File ACL (if ACLs are enabled)
```bash
POST /api/upload/fix-acl/images/example.jpg
```

## Security Considerations

- **Public read access** means anyone with the URL can access the file
- Consider using **CloudFront** with signed URLs for better security
- For sensitive files, use **presigned URLs** instead of public access
- Regularly review your bucket policy and public access settings

## Additional Resources

- [AWS S3 Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- [AWS S3 Bucket Policies](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-policies.html)
- [AWS S3 Object Ownership](https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html)
