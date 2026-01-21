const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3');
const crypto = require('crypto');
const { protect } = require('../middleware/auth');
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
    upload = multer({
      storage: multerS3({
        s3: s3Client,
        bucket: process.env.AWS_S3_BUCKET,
        // ACL removed - use bucket policy for public access instead
        // AWS has deprecated ACLs in favor of bucket policies
        key: function (req, file, cb) {
          const folder = file.mimetype.startsWith('image/') ? 'images/' : 'pdfs/';
          const extension = file.originalname.split('.').pop();
          const filename = `${folder}${Date.now()}-${generateUUID()}.${extension}`;
          cb(null, filename);
        },
        contentType: multerS3.AUTO_CONTENT_TYPE,
      }),
      limits: {
        // Keep in sync with frontend maxSize (5MB)
        fileSize: 5 * 1024 * 1024,
      },
      fileFilter: (req, file, cb) => {
        // Allow images and PDFs
        if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(new Error('Only images and PDF files are allowed'), false);
        }
      },
    });
    
    console.log('✅ Upload configuration initialized successfully');
    console.log('   Bucket:', process.env.AWS_S3_BUCKET);
    console.log('   Region:', process.env.AWS_REGION);
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
  upload.single('file')(req, res, (err) => {
    if (err) {
      // Handle multer errors
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File too large. Maximum size is 5MB.' });
        }
        console.error('Multer error:', err);
        return res.status(400).json({ message: 'Upload error', error: err.message });
      }
      // Handle other errors
      console.error('Upload middleware error:', err);
      return res.status(500).json({ 
        message: 'Upload failed', 
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
      });
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

    res.json({
      url: req.file.location,
      key: req.file.key,
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
    { name: 'pdf', maxCount: 1 }
  ])(req, res, (err) => {
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
            message: 'Unexpected file field. Only "image", "bannerImage", and "pdf" fields are allowed.',
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
    }

    if (files.bannerImage && files.bannerImage[0]) {
      result.bannerImageUrl = files.bannerImage[0].location;
      console.log('✅ Banner Image uploaded to S3:');
      console.log('   Banner Image URL:', files.bannerImage[0].location);
      console.log('   Banner Image Key:', files.bannerImage[0].key);
      console.log('   MIME Type:', files.bannerImage[0].mimetype);
    }

    if (files.pdf && files.pdf[0]) {
      result.pdfUrl = files.pdf[0].location;
      console.log('✅ PDF uploaded to S3:');
      console.log('   PDF URL:', files.pdf[0].location);
      console.log('   PDF Key:', files.pdf[0].key);
      console.log('   MIME Type:', files.pdf[0].mimetype);
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

    res.json(result);
  } catch (error) {
    console.error('Upload error:', error);
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Upload failed. Please try again.' 
      : error.message;
    res.status(500).json({ message: 'Upload failed', error: errorMessage });
  }
});

module.exports = router;

