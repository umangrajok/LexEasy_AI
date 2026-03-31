const app = require('../server.js');

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-LexAI-Key');
    return res.status(200).end();
  }

  // Only allow POST for /api/analyze
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Log request for debugging
  console.log('Vercel Serverless: Request received');
  console.log('Method:', req.method);
  console.log('URL:', req.url);

  try {
    // Forward to Express app
    return app(req, res);
  } catch (error) {
    console.error('Vercel Serverless Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
