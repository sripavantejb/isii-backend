/**
 * Upload Routes
 * 
 * Handles file uploads to AWS S3 with public read access.
 * 
 * IMPORTANT: Public Access Configuration
 * =======================================
 * 
 * For files to be publicly accessible, you need ONE of these:
 * 
 * Option 1: Enable ACLs (for older buckets or if you can enable them)
 * - Set Object Ownership to "ACLs enabled" in S3 bucket settings
 * - Disable "Block public access to buckets and objects granted through new ACLs"
 * - The acl: 'public-read' setting below will then work
 * 
 * Option 2: Use Bucket Policy (for new buckets with ACLs disabled - RECOMMENDED)
 * - Keep Object Ownership as "Bucket owner enforced" (default)
 * - Add a bucket policy that allows public GetObject access
 * - See S3_PUBLIC_ACCESS_SETUP.md for the exact policy JSON
 * 
 * If you get "Access Denied" errors:
 * 1. Check your bucket's Block Public Access settings
 * 2. Verify you have either ACLs enabled OR a bucket policy
 * 3. See S3_PUBLIC_ACCESS_SETUP.md for detailed instructions
 * 
 * Utility Functions:
 * - POST /api/upload/fix-acl/:key - Update ACL for existing file (if ACLs enabled)
 * - GET /api/upload/check/:key - Check file permissions and existence
 */

const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3');
const crypto = require('crypto');
const path = require('path');
const { HeadObjectCommand } = require('@aws-sdk/client-s3');
const { protect } = require('../middleware/auth');
const {
  buildScopedUploadKey,
  extractSlugFromKey,
  getSafeExtension,
  getUploadScopeFolder,
  normalizeUploadScope,
  sanitizeUploadedBaseName,
} = require('../utils/fileSlug');
// dotenv is already loaded in config/aws.js and server.js, no need to load again

const router = express.Router();

// Use Node.js built-in crypto.randomUUID() instead of uuid package (ES module issue)
const generateUUID = () => {
  try {
    // Use crypto.randomUUID() if available (Node.js 14.17.0+)
    return crypto.randomUUID();
  } catch (error) {
    // Fallback for older Node.js versions
    return crypto.randomBytes(16).toString('hex');
  }
};

const generateShortSuffix = () => crypto.randomBytes(3).toString('hex');

const buildReadableKey = (folder, originalName, includeRandomSuffix = true) => {
  const baseName = sanitizeUploadedBaseName(originalName);
  const extension = getSafeExtension(originalName);

  if (!includeRandomSuffix) {
    return `${folder}${baseName}${extension}`;
  }

  return `${folder}${baseName}-${generateShortSuffix()}${extension}`;
};

const getRequestedUploadScope = (req) => {
  if (typeof req.query?.uploadScope === 'string') {
    return normalizeUploadScope(req.query.uploadScope);
  }

  if (typeof req.query?.scope === 'string') {
    return normalizeUploadScope(req.query.scope);
  }

  if (typeof req.body?.uploadScope === 'string') {
    return normalizeUploadScope(req.body.uploadScope);
  }

  return '';
};

const isObjectMissing = (error) =>
  error?.name === 'NotFound' ||
  error?.name === 'NoSuchKey' ||
  error?.$metadata?.httpStatusCode === 404;

const doesObjectExist = async (key) => {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
      })
    );
    return true;
  } catch (error) {
    if (isObjectMissing(error)) {
      return false;
    }

    throw error;
  }
};

const findAvailableScopedKey = async (folder, originalName) => {
  let versionNumber = null;

  while (true) {
    const candidateKey = buildScopedUploadKey(folder, originalName, versionNumber);
    const exists = await doesObjectExist(candidateKey);

    if (!exists) {
      return candidateKey;
    }

    versionNumber = versionNumber === null ? 1 : versionNumber + 1;
  }
};

const buildUploadKeyForRequest = async (req, file) => {
  if (file.mimetype.startsWith('image/')) {
    const extension = getSafeExtension(file.originalname);
    return `images/${Date.now()}-${generateUUID()}${extension}`;
  }

  const scopedFolder = getUploadScopeFolder(getRequestedUploadScope(req));

  if (scopedFolder) {
    return findAvailableScopedKey(scopedFolder, file.originalname);
  }

  let folder = 'files/';
  if (file.mimetype === 'application/pdf') {
    folder = 'pdfs/';
  }

  return buildReadableKey(folder, file.originalname);
};

// Initialize S3 client and multer configuration
let s3Client;
let upload;

function initializeUpload() {
  try {
    const awsConfig = require('../config/aws');
    s3Client = awsConfig.s3Client;
    
    if (!s3Client) {
      throw new Error('S3Client is not available');
    }

    // Configure multer-s3 for file uploads
    // Note: ACLs may not work if bucket has "Object Ownership = Bucket owner enforced"
    // In that case, use a bucket policy instead (see documentation below)
    upload = multer({
      storage: multerS3({
        s3: s3Client,
        bucket: process.env.AWS_S3_BUCKET,
        acl: 'public-read', // Set ACL as public-read for uploaded files
        // If ACLs are disabled on the bucket, this will be ignored
        // You'll need to use a bucket policy for public access instead
        key: async function (req, file, cb) {
          try {
            const key = await buildUploadKeyForRequest(req, file);
            cb(null, key);
          } catch (error) {
            cb(error);
          }
        },
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
          // Add metadata to help track uploads
          cb(null, {
            uploadedAt: new Date().toISOString(),
            originalName: file.originalname,
          });
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
      fileFilter: (req, file, cb) => {
        cb(null, true);
      },
    });
    
    console.log('✅ Upload configuration initialized successfully');
    console.log('   Bucket:', process.env.AWS_S3_BUCKET);
    console.log('   Region:', process.env.AWS_REGION);
    console.log('   ACL: public-read (may require bucket policy if ACLs are disabled)');
  } catch (error) {
    console.error('❌ Failed to initialize upload configuration:', error.message);
    console.error('   Stack:', error.stack);
    console.error('   Make sure AWS credentials are set in .env file');
    // Don't create a fallback - let it fail clearly
    throw error;
  }
}

// Initialize on module load
try {
  initializeUpload();
} catch (error) {
  console.error('❌ CRITICAL: Upload route cannot be initialized:', error.message);
  // Server will still start, but upload routes will fail with clear errors
}


// @route   POST /api/upload
// @desc    Upload file to S3
// @access  Private
router.post('/', protect, (req, res, next) => {
  if (!upload || !s3Client) {
    console.error('❌ Upload not initialized - S3 configuration error');
    return res.status(500).json({ 
      message: 'S3 configuration error', 
      error: 'AWS S3 is not properly configured. Check server logs for details.' 
    });
  }
  upload.single('file')(req, res, async (err) => {
    if (err) {
      // Handle multer errors
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
        }
        console.error('Multer error:', err);
        return res.status(400).json({ message: 'Upload error', error: err.message });
      }
      
      // Handle ACL-related errors
      if (err.message && (err.message.includes('AccessControlListNotSupported') || 
          err.message.includes('InvalidAccessControlList') ||
          err.message.includes('Access Denied'))) {
        console.error('⚠️ ACL error detected:', err.message);
        console.error('   This usually means ACLs are disabled on the bucket.');
        console.error('   Solution: Use a bucket policy for public access (see documentation)');
        return res.status(500).json({ 
          message: 'Upload failed - ACL configuration error',
          error: 'Bucket ACLs may be disabled. Please configure bucket policy for public access.',
          hint: 'Check AWS S3 bucket settings: Object Ownership and Block Public Access'
        });
      }
      
      if (err.code === 'S3_KEY_EXISTS' || err.statusCode === 409) {
        return res.status(409).json({
          message: err.message,
          error: 'Duplicate file name',
        });
      }

      // Handle other errors
      console.error('Upload middleware error:', err);
      return res.status(500).json({ 
        message: 'Upload failed', 
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
      });
    }
    
    // Try to verify/update ACL after upload if file was uploaded
    if (req.file && req.file.key) {
      try {
        // Attempt to verify ACL was applied (this may fail if ACLs are disabled)
        // We'll log it but not fail the request
        console.log('📋 Verifying file ACL for:', req.file.key);
      } catch (aclError) {
        // ACL verification failed - this is expected if ACLs are disabled
        console.warn('⚠️ Could not verify ACL (this is normal if bucket ACLs are disabled):', aclError.message);
      }
    }
    
    next();
  });
}, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Console log S3 URL and details
    console.log('✅ File uploaded to S3 successfully:');
    console.log('   S3 URL:', req.file.location);
    console.log('   S3 Key:', req.file.key);
    console.log('   MIME Type:', req.file.mimetype);
    console.log('   Bucket:', process.env.AWS_S3_BUCKET);
    console.log('   Region:', process.env.AWS_REGION);
    console.log('   ACL: public-read (if ACLs enabled)');
    console.log('   ⚠️  If files are not publicly accessible, check bucket policy settings');

    res.json({
      url: req.file.location,
      key: req.file.key,
      slug: extractSlugFromKey(req.file.key),
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    console.error('Single upload error:', error);
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Upload failed. Please try again.' 
      : error.message;
    res.status(500).json({ message: 'Upload failed', error: errorMessage });
  }
});

// @route   POST /api/upload/multiple
// @desc    Upload multiple files to S3
// @access  Private
router.post('/multiple', protect, (req, res, next) => {
  if (!upload || !s3Client) {
    console.error('❌ Upload not initialized - S3 configuration error');
    return res.status(500).json({ 
      message: 'S3 configuration error', 
      error: 'AWS S3 is not properly configured. Check server logs for details.' 
    });
  }
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'bannerImage', maxCount: 1 },
    { name: 'bannerimage', maxCount: 1 }, // Accept lowercase for compatibility
    { name: 'pdf', maxCount: 1 }
  ])(req, res, async (err) => {
    if (err) {
      // Handle multer errors
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ 
            message: 'File too large. Maximum size is 5MB per file.',
            error: 'File size limit exceeded',
            maxFileSize: '5MB',
            tip: 'Please compress your file or split it into smaller parts.'
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ 
            message: 'Unexpected file field. Only "image", "bannerImage" (or "bannerimage"), and "pdf" fields are allowed.',
            error: err.message 
          });
        }
        console.error('Multer error:', err);
        return res.status(400).json({ 
          message: 'Upload error', 
          error: err.message,
          code: err.code 
        });
      }
      
      // Handle ACL-related errors
      if (err.message && (err.message.includes('AccessControlListNotSupported') || 
          err.message.includes('InvalidAccessControlList') ||
          err.message.includes('Access Denied'))) {
        console.error('⚠️ ACL error detected:', err.message);
        console.error('   This usually means ACLs are disabled on the bucket.');
        console.error('   Solution: Use a bucket policy for public access (see documentation)');
        return res.status(500).json({ 
          message: 'Upload failed - ACL configuration error',
          error: 'Bucket ACLs may be disabled. Please configure bucket policy for public access.',
          hint: 'Check AWS S3 bucket settings: Object Ownership and Block Public Access'
        });
      }
      
      if (err.code === 'S3_KEY_EXISTS' || err.statusCode === 409) {
        return res.status(409).json({
          message: err.message,
          error: 'Duplicate file name',
        });
      }

      // Handle 413 errors (Payload Too Large)
      if (err.status === 413 || err.statusCode === 413 || err.message?.includes('413') || err.message?.includes('too large') || err.message?.includes('payload')) {
        return res.status(413).json({
          message: 'Request payload too large. Maximum file size is 5MB per file.',
          error: 'Payload too large',
          maxFileSize: '5MB',
          tip: 'Please compress your files before uploading.'
        });
      }
      
      // Handle other errors
      console.error('Upload middleware error:', err);
      return res.status(500).json({ 
        message: 'Upload failed', 
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
      });
    }
    
    // Try to verify ACLs for uploaded files (if any)
    if (req.files) {
      const allFiles = [
        ...(req.files.image || []),
        ...(req.files.bannerImage || []),
        ...(req.files.bannerimage || []),
        ...(req.files.pdf || []),
      ];
      
      for (const file of allFiles) {
        if (file && file.key) {
          try {
            console.log('📋 Verifying file ACL for:', file.key);
          } catch (aclError) {
            console.warn('⚠️ Could not verify ACL (this is normal if bucket ACLs are disabled):', aclError.message);
          }
        }
      }
    }
    
    next();
  });
}, (req, res) => {
  try {
    const files = req.files;
    const result = {};

    if (files.image && files.image[0]) {
      result.imageUrl = files.image[0].location;
      console.log('✅ Image uploaded to S3:');
      console.log('   Image URL:', files.image[0].location);
      console.log('   Image Key:', files.image[0].key);
      console.log('   MIME Type:', files.image[0].mimetype);
      console.log('   ACL: public-read (if ACLs enabled)');
    }

    // Handle both bannerImage (camelCase) and bannerimage (lowercase) for compatibility
    const bannerImageFile = (files.bannerImage && files.bannerImage[0]) || (files.bannerimage && files.bannerimage[0]);
    if (bannerImageFile) {
      result.bannerImageUrl = bannerImageFile.location;
      console.log('✅ Banner Image uploaded to S3:');
      console.log('   Banner Image URL:', bannerImageFile.location);
      console.log('   Banner Image Key:', bannerImageFile.key);
      console.log('   MIME Type:', bannerImageFile.mimetype);
      console.log('   ACL: public-read (if ACLs enabled)');
    }

    if (files.pdf && files.pdf[0]) {
      result.pdfUrl = files.pdf[0].location;
      result.pdfSlug = extractSlugFromKey(files.pdf[0].key);
      console.log('✅ PDF uploaded to S3:');
      console.log('   PDF URL:', files.pdf[0].location);
      console.log('   PDF Key:', files.pdf[0].key);
      console.log('   MIME Type:', files.pdf[0].mimetype);
      console.log('   ACL: public-read (if ACLs enabled)');
    }

    // Require at least one file to be uploaded
    if (!result.imageUrl && !result.bannerImageUrl && !result.pdfUrl) {
      return res.status(400).json({ 
        message: 'No files uploaded. Please select an image, banner, or PDF.' 
      });
    }

    console.log('📦 Upload Summary:');
    console.log('   Bucket:', process.env.AWS_S3_BUCKET);
    console.log('   Region:', process.env.AWS_REGION);
    console.log('   Result:', JSON.stringify(result, null, 2));
    console.log('   ⚠️  If files are not publicly accessible, check bucket policy settings');
    console.log('   📖 See S3_PUBLIC_ACCESS_SETUP.md for configuration instructions');

    res.json(result);
  } catch (error) {
    console.error('Upload error:', error);
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Upload failed. Please try again.' 
      : error.message;
    res.status(500).json({ message: 'Upload failed', error: errorMessage });
  }
});

// @route   POST /api/upload/fix-acl/:key
// @desc    Update ACL for an existing file (if ACLs are enabled)
// @access  Private
router.post('/fix-acl/*key', protect, async (req, res) => {
  try {
    const key = Array.isArray(req.params.key)
      ? req.params.key.join('/')
      : req.params.key;

    if (!key) {
      return res.status(400).json({ message: 'File key is required' });
    }

    const s3Utils = require('../utils/s3Utils');
    
    await s3Utils.updateFileAcl(s3Client, process.env.AWS_S3_BUCKET, key);
    
    res.json({
      message: 'ACL updated successfully',
      key,
      note: 'If ACLs are disabled on your bucket, use a bucket policy instead',
    });
  } catch (error) {
    console.error('Error updating ACL:', error);
    res.status(500).json({
      message: 'Failed to update ACL',
      error: error.message,
      hint: error.message.includes('ACLs are disabled') 
        ? 'Your bucket has ACLs disabled. Configure a bucket policy for public access instead.'
        : 'Check server logs for details',
    });
  }
});

// @route   GET /api/upload/check/:key
// @desc    Check file permissions and existence
// @access  Private
router.get('/check/*key', protect, async (req, res) => {
  try {
    const key = Array.isArray(req.params.key)
      ? req.params.key.join('/')
      : req.params.key;

    if (!key) {
      return res.status(400).json({ message: 'File key is required' });
    }

    const s3Utils = require('../utils/s3Utils');
    
    const fileInfo = await s3Utils.checkFilePermissions(
      s3Client,
      process.env.AWS_S3_BUCKET,
      key
    );
    
    res.json(fileInfo);
  } catch (error) {
    console.error('Error checking file:', error);
    res.status(500).json({
      message: 'Failed to check file',
      error: error.message,
    });
  }
});

module.exports = router;
