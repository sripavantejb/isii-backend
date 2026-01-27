const { PutObjectAclCommand, GetObjectAclCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

/**
 * S3 Utility Functions
 * 
 * These utilities help manage S3 file permissions, particularly for making files publicly accessible.
 * 
 * IMPORTANT NOTES:
 * - If your bucket has "Object Ownership = Bucket owner enforced", ACLs are disabled
 * - In that case, you MUST use a bucket policy for public access instead
 * - These functions will fail if ACLs are disabled on the bucket
 */

/**
 * Update a file's ACL to public-read
 * @param {Object} s3Client - The S3 client instance
 * @param {string} bucket - The S3 bucket name
 * @param {string} key - The S3 object key (file path)
 * @returns {Promise<Object>} - Result of the ACL update
 */
async function updateFileAcl(s3Client, bucket, key) {
  try {
    const command = new PutObjectAclCommand({
      Bucket: bucket,
      Key: key,
      ACL: 'public-read',
    });

    const result = await s3Client.send(command);
    console.log(`✅ ACL updated to public-read for: ${key}`);
    return { success: true, result };
  } catch (error) {
    if (error.name === 'AccessControlListNotSupported' || 
        error.message?.includes('AccessControlListNotSupported')) {
      console.error(`❌ ACLs are disabled on bucket ${bucket}`);
      console.error('   Solution: Use a bucket policy for public access instead');
      throw new Error('ACLs are disabled on this bucket. Use bucket policy instead.');
    }
    console.error(`❌ Failed to update ACL for ${key}:`, error.message);
    throw error;
  }
}

/**
 * Check if a file exists and get its current ACL
 * @param {Object} s3Client - The S3 client instance
 * @param {string} bucket - The S3 bucket name
 * @param {string} key - The S3 object key (file path)
 * @returns {Promise<Object>} - File metadata and ACL information
 */
async function checkFilePermissions(s3Client, bucket, key) {
  try {
    // Check if file exists
    const headCommand = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const headResult = await s3Client.send(headCommand);

    // Try to get ACL (will fail if ACLs are disabled)
    let aclInfo = null;
    try {
      const aclCommand = new GetObjectAclCommand({
        Bucket: bucket,
        Key: key,
      });
      aclInfo = await s3Client.send(aclCommand);
    } catch (aclError) {
      if (aclError.name === 'AccessControlListNotSupported') {
        aclInfo = { message: 'ACLs disabled - using bucket policy' };
      } else {
        throw aclError;
      }
    }

    return {
      exists: true,
      key,
      contentType: headResult.ContentType,
      contentLength: headResult.ContentLength,
      lastModified: headResult.LastModified,
      acl: aclInfo,
      publicUrl: `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`,
    };
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return { exists: false, key };
    }
    console.error(`❌ Error checking file permissions for ${key}:`, error.message);
    throw error;
  }
}

/**
 * Batch update ACLs for multiple files
 * @param {Object} s3Client - The S3 client instance
 * @param {string} bucket - The S3 bucket name
 * @param {string[]} keys - Array of S3 object keys (file paths)
 * @returns {Promise<Object>} - Results of batch ACL updates
 */
async function batchUpdateAcls(s3Client, bucket, keys) {
  const results = {
    successful: [],
    failed: [],
    aclDisabled: false,
  };

  for (const key of keys) {
    try {
      await updateFileAcl(s3Client, bucket, key);
      results.successful.push(key);
    } catch (error) {
      if (error.message?.includes('ACLs are disabled')) {
        results.aclDisabled = true;
        results.failed.push({ key, error: 'ACLs disabled on bucket' });
        // Stop processing if ACLs are disabled
        break;
      } else {
        results.failed.push({ key, error: error.message });
      }
    }
  }

  return results;
}

/**
 * Update all files in a specific folder to public-read
 * @param {Object} s3Client - The S3 client instance
 * @param {string} bucket - The S3 bucket name
 * @param {string} folderPrefix - Folder prefix (e.g., 'images/' or 'pdfs/')
 * @returns {Promise<Object>} - Results of folder ACL updates
 */
async function updateFolderAcls(s3Client, bucket, folderPrefix) {
  const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
  
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: folderPrefix,
    });

    const listResult = await s3Client.send(listCommand);
    
    if (!listResult.Contents || listResult.Contents.length === 0) {
      return { message: `No files found in folder: ${folderPrefix}`, successful: [], failed: [] };
    }

    const keys = listResult.Contents.map(item => item.Key);
    console.log(`📁 Found ${keys.length} files in ${folderPrefix}`);
    
    return await batchUpdateAcls(s3Client, bucket, keys);
  } catch (error) {
    console.error(`❌ Error listing files in folder ${folderPrefix}:`, error.message);
    throw error;
  }
}

module.exports = {
  updateFileAcl,
  checkFilePermissions,
  batchUpdateAcls,
  updateFolderAcls,
};
