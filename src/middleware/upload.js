const multer = require('multer');

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter(req, file, callback) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return callback(null, true);
    }

    const error = new Error('Only JPEG and PNG images are allowed.');
    error.status = 415;
    return callback(error);
  },
});

module.exports = upload;

