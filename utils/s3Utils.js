const { HeadObjectCommand } = require('@aws-sdk/client-s3');
const { buildPublicFileUrl } = require('./publicFileUrl');

/**
 * S3 Utility Functions
 *
 * These utilities support a bucket-policy-based access model.
 * Public file access is determined by the bucket policy, not per-object ACLs.
 */

async function checkFilePermissions(s3Client, bucket, key) {
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const headResult = await s3Client.send(headCommand);

    return {
      exists: true,
      key,
      contentType: headResult.ContentType,
      contentLength: headResult.ContentLength,
      lastModified: headResult.LastModified,
      accessModel: 'bucket-policy',
      publicUrl: buildPublicFileUrl(key),
    };
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return {
        exists: false,
        key,
        accessModel: 'bucket-policy',
      };
    }

    console.error(`Error checking file metadata for ${key}:`, error.message);
    throw error;
  }
}

module.exports = {
  checkFilePermissions,
};
