const express = require('express');
const cors = require('cors');
const multer = require('multer');

const { createScanRouter } = require('./routes/scan');
const productRouter = require('./routes/products');
const geminiService = require('./services/gemini');

function createApp(options = {}) {
  const app = express();
  const frontendUrl =
    options.frontendUrl || process.env.FRONTEND_URL || 'http://localhost:5173';
  const analyzeImage = options.analyzeImage || geminiService.analyzeImage;
  const analyzeText = options.analyzeText || geminiService.analyzeText;

  app.disable('x-powered-by');
  app.use(
    cors({
      origin(origin, callback) {
        const cleanOrigin = origin ? origin.replace(/\/$/, '') : '';
        const cleanFrontend = frontendUrl.replace(/\/$/, '');
        if (!origin || cleanOrigin === cleanFrontend) {
          return callback(null, true);
        }

        // Allow local network IP addresses on port 5173 for mobile/external device testing
        const localOriginRegex = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}):5173$/;
        if (localOriginRegex.test(origin)) {
          return callback(null, true);
        }

        return callback(new Error('Origin is not allowed by CORS.'));
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    })
  );
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api', createScanRouter({ analyzeImage, analyzeText }));
  app.use('/api/products', productRouter);

  app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Route not found.' });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: 'Image is too large. Maximum file size is 5MB.',
        });
      }

      return res.status(400).json({
        success: false,
        error: 'Invalid multipart image upload.',
      });
    }

    if (error.status === 415) {
      return res.status(415).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message === 'Origin is not allowed by CORS.') {
      return res.status(403).json({
        success: false,
        error: 'Origin is not allowed by CORS.',
      });
    }

    console.error('Unhandled request error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error.',
    });
  });

  return app;
}

module.exports = { createApp };

