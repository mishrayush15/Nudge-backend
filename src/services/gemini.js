const { GoogleGenAI } = require('@google/genai');

const DEFAULT_MODEL = 'gemini-2.5-flash';

const PROMPTS = {
  product: `You are scanning the front of a consumer product package.
Extract the brand/company name, the specific product name (including its variant and size when visible), and the product category (e.g., Dairy, Produce, Pharmacy, Cosmetics, Beverage, Pantry, etc.).

Rules:
- Be specific. Include the variant and size when they are clearly visible.
- Determine a suitable category based on the product type.
- Return null for brand or product if they cannot be read clearly.
- Never guess or infer text that is not visible, except for the category which you can determine from the product type.`,

  expiry: `You are scanning a consumer product package for an expiry date.
Identify the expiry date (often labeled as EXP, Expiry, Best Before, BB, Use By, or BBD).

CRITICAL RULES:
- Identify and EXCLUDE any manufacturing date (labeled as MFG, MFD, PKD, Packed, Mfg Date, or Pack Date). Under no circumstances return the manufacturing date.
- If there are multiple dates, compare them. The manufacturing date (earlier date) must be IGNORED. The expiry/best-before date (later date) must be SELECTED.
- Return the expiry date as DD/MM/YYYY.
- If only a month and year are visible (e.g. "EXP 12/26" or "Best Before Dec 2026"), use the first day of that month (01/12/2026).
- If ONLY a manufacturing date (MFG/MFD) is visible on the package, return null. Do not guess the expiry date or calculate shelf life.
- Never guess or return an unreadable date.`,
};

const TEXT_PROMPTS = {
  product: `You are reading raw text that was extracted by OCR from a product package label.
The text may contain errors, extra symbols, random characters, or line breaks from the OCR process.

From this noisy text, extract:
1. brand: The brand/company name (e.g. "Amul", "Mother Dairy", "Maggi")
2. product: The specific product name with variant and size (e.g. "Toned Milk 500ml")
3. category: The product category (e.g., Dairy, Produce, Pharmacy, Cosmetics, Beverage, Pantry, etc.)

Rules:
- Ignore OCR noise like "|", "\\", random symbols, garbled words
- Be specific. Never return just "Milk" — always include brand + variant + size if present
- Determine the category intelligently based on the product.
- If you cannot confidently identify the brand, return null
- If you cannot confidently identify the product, return null
- Never guess. Only return what is clearly present in the text
- Return ONLY a raw JSON object. No explanation, no markdown, no backticks.

Return format:
{"brand": "...", "product": "...", "category": "..."}

OCR text to analyze:
`,

  expiry: `You are reading raw text that was extracted by OCR from a product package.
The text may contain errors, extra symbols, or garbled characters from the OCR process.

From this noisy text, find the expiry date, best before date, or use by date.
Look for patterns like: EXP, BB, BEST BEFORE, USE BY, BBD, followed by a date.

CRITICAL RULES:
- Identify and EXCLUDE any manufacturing/packing date (labeled as MFG, MFD, PKD, Packed, Mfg Date, or Pack Date). Under no circumstances return the manufacturing date.
- If there are multiple dates in the text (e.g., one earlier manufacturing date and one later expiry date), you MUST select the later expiry/best-before date and IGNORE the earlier manufacturing date.
- Return the expiry date in DD/MM/YYYY format. Convert any other format to this.
- If only month and year are present (e.g. "EXP 08/25"), return as 01/MM/YYYY (e.g. "01/08/2025").
- If no clear expiry/best-before date is found, return null.
- Never guess. Only return what is clearly present in the text.
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
      category: {
        type: ['string', 'null'],
        description: 'Broad category of the product (e.g. Dairy, Produce, Pharmacy, Cosmetics, Beverage, Pantry). Choose the closest standard category or invent one if unique.',
      },
    },
    required: ['brand', 'product', 'category'],
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


