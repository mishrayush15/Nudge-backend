const express = require('express');

const upload = require('../middleware/upload');
const { requireAuth } = require('../middleware/auth');
const { GeminiServiceError } = require('../services/gemini');
const { parseExpiryDate } = require('../utils/parseExpiry');

const RETRY_MESSAGES = {
  product:
    'Could not extract product info from this frame. Frontend should retry with next stable frame.',
  expiry:
    'No expiry date found in this frame. Frontend should retry with next stable frame.',
  invalidExpiry:
    'Expiry date found but could not be parsed. Frontend should retry.',
};

function cleanText(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function createScanRouter({ analyzeImage, analyzeText }) {
  const router = express.Router();

  router.post('/scan/image', upload.single('image'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error:
          'No image received. Send image as multipart/form-data with field name "image".',
      });
    }

    const scanState = req.body.scanState;
    if (!['product', 'expiry'].includes(scanState)) {
      return res.status(400).json({
        success: false,
        error:
          'scanState field is required and must be either "product" or "expiry".',
      });
    }

    try {
      const rawResult = await analyzeImage(
        req.file.buffer,
        req.file.mimetype,
        scanState
      );

      if (scanState === 'product') {
        const brand = cleanText(rawResult && rawResult.brand);
        const product = cleanText(rawResult && rawResult.product);

        if (!brand && !product) {
          return res.json({
            success: true,
            scanState,
            data: null,
            message: RETRY_MESSAGES.product,
          });
        }

        const categoryRaw = cleanText(rawResult && rawResult.category) || 'Pantry';
        const category = categoryRaw.charAt(0).toUpperCase() + categoryRaw.slice(1).toLowerCase();

        return res.json({
          success: true,
          scanState,
          data: { brand, product, category },
        });
      }

      const expiry = cleanText(rawResult && rawResult.expiry);
      if (!expiry) {
        return res.json({
          success: true,
          scanState,
          data: null,
          message: RETRY_MESSAGES.expiry,
        });
      }

      const parsedExpiry = parseExpiryDate(expiry);
      if (!parsedExpiry) {
        return res.json({
          success: true,
          scanState,
          data: null,
          message: RETRY_MESSAGES.invalidExpiry,
        });
      }

      return res.json({
        success: true,
        scanState,
        data: { expiry: parsedExpiry },
      });
    } catch (error) {
      console.error('Scan error:', error.message);

      if (error instanceof GeminiServiceError) {
        return res.status(502).json({
          success: false,
          error: 'Image analysis service is temporarily unavailable.',
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Internal server error during scan.',
      });
    }
  });

  router.post('/scan/text', async (req, res) => {
    try {
      const { text, scanState } = req.body;

      // Validate
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'text field is required and must be a non-empty string.',
        });
      }

      if (!scanState || !['product', 'expiry'].includes(scanState)) {
        return res.status(400).json({
          success: false,
          error: 'scanState must be "product" or "expiry".',
        });
      }

      // Call Gemini with text instead of image
      const rawResult = await analyzeText(text.trim(), scanState);

      // Response handling is identical to the image route
      if (scanState === 'product') {
        const brand = cleanText(rawResult && rawResult.brand);
        const product = cleanText(rawResult && rawResult.product);

        if (!brand && !product) {
          return res.json({
            success: true,
            scanState,
            data: null,
            message: RETRY_MESSAGES.product,
          });
        }

        const categoryRaw = cleanText(rawResult && rawResult.category) || 'Pantry';
        const category = categoryRaw.charAt(0).toUpperCase() + categoryRaw.slice(1).toLowerCase();

        return res.json({
          success: true,
          scanState,
          data: { brand, product, category },
        });
      }

      if (scanState === 'expiry') {
        const expiry = cleanText(rawResult && rawResult.expiry);
        if (!expiry) {
          return res.json({
            success: true,
            scanState,
            data: null,
            message: RETRY_MESSAGES.expiry,
          });
        }

        const parsedExpiry = parseExpiryDate(expiry);
        if (!parsedExpiry) {
          return res.json({
            success: true,
            scanState,
            data: null,
            message: RETRY_MESSAGES.invalidExpiry,
          });
        }

        return res.json({
          success: true,
          scanState,
          data: { expiry: parsedExpiry },
        });
      }

    } catch (error) {
      console.error('Text scan error:', error.message);
      if (error instanceof GeminiServiceError) {
        return res.status(502).json({
          success: false,
          error: 'Text analysis service is temporarily unavailable.',
        });
      }
      if (error instanceof SyntaxError) {
        return res.status(500).json({
          success: false,
          error: 'AI returned unexpected format for the given text.',
        });
      }
      return res.status(500).json({
        success: false,
        error: 'Internal server error during text scan.',
      });
    }
  });

  return router;
}

module.exports = { createScanRouter };

