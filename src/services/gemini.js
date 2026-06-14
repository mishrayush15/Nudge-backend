const { GoogleGenAI } = require('@google/genai');

const DEFAULT_MODEL = 'gemini-2.5-flash';

const PROMPTS = {
  product: `You are scanning the front of a consumer product package.
Extract the brand/company name and the specific product name, including its variant and size when visible.

Rules:
- Be specific. Include the variant and size when they are clearly visible.
- Return null for fields that cannot be read clearly.
- Never guess or infer text that is not visible.`,

  expiry: `You are scanning a consumer product package for an expiry date.
Find a date labeled as expiry, best before, use by, BB, or EXP.

Rules:
- Return the date as DD/MM/YYYY.
- If only a month and year are visible, use the first day of that month.
- If only a manufacturing date is visible, return null.
- Never calculate shelf life or guess an unreadable date.`,
};

const TEXT_PROMPTS = {
  product: `You are reading raw text that was extracted by OCR from a product package label.
The text may contain errors, extra symbols, random characters, or line breaks from the OCR process.

From this noisy text, extract:
1. brand: The brand/company name (e.g. "Amul", "Mother Dairy", "Maggi")
2. product: The specific product name with variant and size (e.g. "Toned Milk 500ml")

Rules:
- Ignore OCR noise like "|", "\\", random symbols, garbled words
- Be specific. Never return just "Milk" — always include brand + variant + size if present
- If you cannot confidently identify the brand, return null
- If you cannot confidently identify the product, return null
- Never guess. Only return what is clearly present in the text
- Return ONLY a raw JSON object. No explanation, no markdown, no backticks.

Return format:
{"brand": "...", "product": "..."}

OCR text to analyze:
`,

  expiry: `You are reading raw text that was extracted by OCR from a product package.
The text may contain errors, extra symbols, or garbled characters from the OCR process.

From this noisy text, find any expiry date, best before date, or use by date.
Look for patterns like: EXP, BB, BEST BEFORE, USE BY, BBD, followed by a date.

Rules:
- Return the date in DD/MM/YYYY format. Convert any other format to this.
- If only month and year are present, return as 01/MM/YYYY
- Ignore manufacturing dates (MFG) — only return expiry/best before dates
- If no clear date is found, return null
- Never guess. Only return what is clearly present
- Return ONLY a raw JSON object. No explanation, no markdown, no backticks.

Return format:
{"expiry": "DD/MM/YYYY"} or {"expiry": null}

OCR text to analyze:
`,
};


const RESPONSE_SCHEMAS = {
  product: {
    type: 'object',
    additionalProperties: false,
    properties: {
      brand: {
        type: ['string', 'null'],
        description: 'Brand or company name visible on the product.',
      },
      product: {
        type: ['string', 'null'],
        description: 'Specific product name, variant, and size when visible.',
      },
    },
    required: ['brand', 'product'],
  },
  expiry: {
    type: 'object',
    additionalProperties: false,
    properties: {
      expiry: {
        type: ['string', 'null'],
        description: 'Expiry date in DD/MM/YYYY format, or null.',
      },
    },
    required: ['expiry'],
  },
};

class GeminiServiceError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'GeminiServiceError';
  }
}

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new GeminiServiceError('Gemini API key is not configured.');
  }

  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

async function analyzeImage(imageBuffer, mimeType, scanState) {
  if (!PROMPTS[scanState]) {
    throw new TypeError(
      'Invalid scanState. Expected either "product" or "expiry".'
    );
  }

  try {
    const response = await getClient().models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: PROMPTS[scanState] },
            {
              inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMAS[scanState],
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    });

    if (!response.text) {
      throw new Error('Gemini returned an empty response.');
    }

    return JSON.parse(response.text);
  } catch (error) {
    if (error instanceof GeminiServiceError) {
      throw error;
    }

    throw new GeminiServiceError('Gemini image analysis failed.', error);
  }
}

async function analyzeText(ocrText, scanState) {
  if (!TEXT_PROMPTS[scanState]) {
    throw new TypeError(
      'Invalid scanState. Expected either "product" or "expiry".'
    );
  }

  try {
    const response = await getClient().models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: TEXT_PROMPTS[scanState] + ocrText }
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMAS[scanState],
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    });

    if (!response.text) {
      throw new Error('Gemini returned an empty response.');
    }

    return JSON.parse(response.text);
  } catch (error) {
    if (error instanceof GeminiServiceError) {
      throw error;
    }

    throw new GeminiServiceError('Gemini text analysis failed.', error);
  }
}

module.exports = {
  analyzeImage,
  analyzeText,
  GeminiServiceError,
};


