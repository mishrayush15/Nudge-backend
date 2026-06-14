const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');
const { GeminiServiceError } = require('../src/services/gemini');
const { supabase } = require('../src/services/supabase');

// Mock Supabase Auth globally for testing
supabase.auth.getUser = async (token) => {
  if (token === 'invalid-token') {
    return { data: { user: null }, error: new Error('Invalid token') };
  }
  return { data: { user: { id: 'mock-user-id' } }, error: null };
};

const IMAGE = Buffer.from('fake-image');

function appWithResult(result, textResult) {
  return createApp({
    frontendUrl: 'http://localhost:5173',
    analyzeImage: async () => result,
    analyzeText: async () => textResult !== undefined ? textResult : result,
  });
}

function scan(app, scanState = 'product') {
  return request(app)
    .post('/api/scan/image')
    .set('Authorization', 'Bearer mock-token')
    .field('scanState', scanState)
    .attach('image', IMAGE, {
      filename: 'frame.jpg',
      contentType: 'image/jpeg',
    });
}

function scanText(app, text = 'some raw ocr text', scanState = 'product') {
  return request(app)
    .post('/api/scan/text')
    .set('Authorization', 'Bearer mock-token')
    .send({ text, scanState });
}

test('GET /health returns status and an ISO timestamp', async () => {
  const response = await request(appWithResult({})).get('/health').expect(200);

  assert.equal(response.body.status, 'ok');
  assert.equal(new Date(response.body.timestamp).toISOString(), response.body.timestamp);
});

test('allows configured CORS origin and requests without Origin', async () => {
  const app = appWithResult({});
  const allowed = await request(app)
    .get('/health')
    .set('Origin', 'http://localhost:5173')
    .expect(200);

  assert.equal(
    allowed.headers['access-control-allow-origin'],
    'http://localhost:5173'
  );
  await request(app).get('/health').expect(200);
});

test('rejects an unconfigured CORS origin', async () => {
  const response = await request(appWithResult({}))
    .get('/health')
    .set('Origin', 'https://example.com')
    .expect(403);

  assert.equal(response.body.success, false);
});

test('rejects a missing image and invalid scan state', async () => {
  await request(appWithResult({}))
    .post('/api/scan/image')
    .set('Authorization', 'Bearer mock-token')
    .field('scanState', 'product')
    .expect(400);

  const response = await scan(appWithResult({}), 'other').expect(400);
  assert.match(response.body.error, /scanState/);
});

test('rejects unsupported and oversized image uploads', async () => {
  await request(appWithResult({}))
    .post('/api/scan/image')
    .set('Authorization', 'Bearer mock-token')
    .field('scanState', 'product')
    .attach('image', Buffer.from('text'), {
      filename: 'frame.gif',
      contentType: 'image/gif',
    })
    .expect(415);

  await request(appWithResult({}))
    .post('/api/scan/image')
    .set('Authorization', 'Bearer mock-token')
    .field('scanState', 'product')
    .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), {
      filename: 'frame.jpg',
      contentType: 'image/jpeg',
    })
    .expect(413);
});

test('returns complete and partial product scan results', async () => {
  const complete = await scan(
    appWithResult({ brand: 'Amul', product: 'Toned Milk 500ml' })
  ).expect(200);
  assert.deepEqual(complete.body.data, {
    brand: 'Amul',
    product: 'Toned Milk 500ml',
  });

  const partial = await scan(
    appWithResult({ brand: 'Amul', product: null })
  ).expect(200);
  assert.deepEqual(partial.body.data, { brand: 'Amul', product: null });
});

test('returns data null for unreadable product and expiry frames', async () => {
  const product = await scan(
    appWithResult({ brand: null, product: null })
  ).expect(200);
  assert.equal(product.body.data, null);

  const expiry = await scan(
    appWithResult({ expiry: null }),
    'expiry'
  ).expect(200);
  assert.equal(expiry.body.data, null);
});

test('returns an enriched expiry result', async () => {
  const response = await scan(
    appWithResult({ expiry: '15/08/2027' }),
    'expiry'
  ).expect(200);

  assert.equal(response.body.data.expiry.raw, '15/08/2027');
  assert.equal(response.body.data.expiry.iso, '2027-08-15T00:00:00.000Z');
  assert.equal(response.body.data.expiry.display, '15 August 2027');
});

test('normalizes month-only expiry results from Gemini', async () => {
  const response = await scan(
    appWithResult({ expiry: '08/2027' }),
    'expiry'
  ).expect(200);

  assert.equal(response.body.data.expiry.raw, '01/08/2027');
  assert.equal(response.body.data.expiry.iso, '2027-08-01T00:00:00.000Z');
});

test('returns data null when Gemini supplies an invalid expiry', async () => {
  const response = await scan(
    appWithResult({ expiry: '31/02/2027' }),
    'expiry'
  ).expect(200);

  assert.equal(response.body.data, null);
  assert.match(response.body.message, /could not be parsed/i);
});

test('maps Gemini failures to a sanitized 502 response', async () => {
  const app = createApp({
    analyzeImage: async () => {
      throw new GeminiServiceError('secret provider detail');
    },
  });

  const response = await scan(app).expect(502);
  assert.equal(response.body.success, false);
  assert.doesNotMatch(response.body.error, /secret/);
});

// --- Text Route Tests ---

test('rejects missing or invalid text / scanState on text endpoint', async () => {
  await scanText(appWithResult({}), '').expect(400);
  await scanText(appWithResult({}), null).expect(400);
  await scanText(appWithResult({}), 'some text', 'invalid_state').expect(400);
});

test('returns product data from text scan', async () => {
  const complete = await scanText(
    appWithResult({ brand: 'Amul', product: 'Toned Milk 500ml' })
  ).expect(200);
  assert.deepEqual(complete.body.data, {
    brand: 'Amul',
    product: 'Toned Milk 500ml',
  });
});

test('returns data null for unreadable product info in text scan', async () => {
  const product = await scanText(
    appWithResult({ brand: null, product: null })
  ).expect(200);
  assert.equal(product.body.data, null);
  assert.match(product.body.message, /extract product info/i);
});

test('returns enriched expiry result from text scan', async () => {
  const response = await scanText(
    appWithResult({ expiry: '15/08/2027' }),
    'Amul Milk Exp 15/08/2027',
    'expiry'
  ).expect(200);

  assert.equal(response.body.data.expiry.raw, '15/08/2027');
  assert.equal(response.body.data.expiry.iso, '2027-08-15T00:00:00.000Z');
  assert.equal(response.body.data.expiry.display, '15 August 2027');
});

test('returns data null when text scan does not find expiry or fails parsing', async () => {
  const missing = await scanText(
    appWithResult({ expiry: null }),
    'No date here',
    'expiry'
  ).expect(200);
  assert.equal(missing.body.data, null);

  const invalid = await scanText(
    appWithResult({ expiry: '31/02/2027' }),
    'Exp 31/02/2027',
    'expiry'
  ).expect(200);
  assert.equal(invalid.body.data, null);
});

test('maps text scan Gemini failures to a sanitized 502 response', async () => {
  const app = createApp({
    analyzeText: async () => {
      throw new GeminiServiceError('secret text provider detail');
    },
  });

  const response = await scanText(app).expect(502);
  assert.equal(response.body.success, false);
  assert.doesNotMatch(response.body.error, /secret/);
});

test('rejects requests with missing or invalid authorization header', async () => {
  const app = appWithResult({});
  await request(app).post('/api/scan/image').expect(401);
  await request(app).post('/api/scan/text').expect(401);
  await request(app)
    .post('/api/scan/text')
    .set('Authorization', 'Bearer invalid-token')
    .expect(401);
});
