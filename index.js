require('dotenv').config();

const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT) || 3001;

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    'GEMINI_API_KEY is not configured. The server will run, but image scans will be unavailable.'
  );
}

const app = createApp();

app.listen(PORT, () => {
  console.log(`ExpiryTracker backend running on port ${PORT}`);
});
