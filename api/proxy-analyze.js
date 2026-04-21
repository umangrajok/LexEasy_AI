// Use Node's global fetch (available on Vercel). Read raw request body correctly
// and forward to the real backend. Return CORS headers to the browser.
const BACKEND = 'https://lexeasy-ai.vercel.app';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://www.lexeasy.in',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true'
};

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(204).end();
    }

    // Read raw body from the incoming request
    const rawBody = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });

    const url = BACKEND + '/api/analyze';
    // Forward request to backend using global fetch
    const fetchRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json'
      },
      body: rawBody
    });

    const text = await fetchRes.text();
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.status(fetchRes.status).send(text);
  } catch (err) {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.status(502).json({ error: 'proxy_error', details: String(err) });
  }
};
