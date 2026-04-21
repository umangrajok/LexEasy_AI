const fetch = (...args) => import('node-fetch').then(({default:fetch})=>fetch(...args));

const BACKEND = 'https://lexeasy-ai.vercel.app';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://www.lexeasy.in',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true'
};

export default async function handler(req, res) {
  // Vercel serverless signature: (req, res)
  if (req.method === 'OPTIONS') {
    Object.entries(CORS_HEADERS).forEach(([k,v])=>res.setHeader(k,v));
    return res.status(204).end();
  }

  try {
    // Forward request to backend
    const url = BACKEND + '/api/analyze';
    const fetchRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json'
      },
      body: req.rawBody || JSON.stringify(req.body)
    });

    const text = await fetchRes.text();
    Object.entries(CORS_HEADERS).forEach(([k,v])=>res.setHeader(k,v));
    res.status(fetchRes.status).send(text);
  } catch (err) {
    Object.entries(CORS_HEADERS).forEach(([k,v])=>res.setHeader(k,v));
    res.status(502).json({ error: 'proxy_error', details: String(err) });
  }
}
