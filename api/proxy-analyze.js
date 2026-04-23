// Handle analysis directly in this serverless function so it does not
// depend on another deployment's runtime env configuration.

const ALLOWED_ORIGINS = new Set([
  'https://www.lexeasy.in',
  'https://lexeasy.in',
]);

function resolveOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null;

  if (ALLOWED_ORIGINS.has(origin)) {
    return origin;
  }

  try {
    const { hostname, protocol } = new URL(origin);
    if (
      protocol === 'https:' &&
      (hostname.endsWith('.vercel.app') || hostname === 'localhost')
    ) {
      return origin;
    }
  } catch (_) {
    return null;
  }

  return null;
}

function applyHeaders(req, res) {
  const origin = resolveOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

function parseBody(req) {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }
  return req.body || {};
}

module.exports = async function handler(req, res) {
  try {
    applyHeaders(req, res);

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    if (req.method === 'GET') {
      return res.status(200).json({ ok: true });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    let body;
    try {
      body = parseBody(req);
    } catch (_) {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const responseLang = ['en', 'hi', 'hinglish'].includes(body.responseLang)
      ? body.responseLang
      : 'en';
    const recaptchaToken = typeof body.recaptchaToken === 'string' ? body.recaptchaToken : '';

    if (!text || text.length < 20) {
      return res.status(400).json({ error: 'Document text too short or missing.' });
    }

    if (process.env.RECAPTCHA_SECRET) {
      if (!recaptchaToken) {
        return res.status(400).json({ error: 'reCAPTCHA verification required.' });
      }
      const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(process.env.RECAPTCHA_SECRET)}&response=${encodeURIComponent(recaptchaToken)}`,
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        return res.status(400).json({ error: 'reCAPTCHA verification failed.' });
      }
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res.status(500).json({ error: 'GEMINI_API_KEY missing in deployment env.' });
    }

    const languageInstruction =
      responseLang === 'hi'
        ? 'Return content in simple Hindi.'
        : responseLang === 'hinglish'
          ? 'Return content in simple Hinglish (Roman script).'
          : 'Return content in simple English.';

    const prompt = `Analyze this legal document and return only valid JSON.
${languageInstruction}
{
  "safety_score": <0-100 number>,
  "document_type": "<short type>",
  "summary": "<2 short sentences>",
  "red_flags": [{"title":"<title>","detail":"<detail>","severity":"high|medium|low","snippet":"<exact quote or empty>"}],
  "safe_points": "<short plain explanation>",
  "advice": "<specific next steps>"
}
Document:
${text.slice(0, 4000)}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
        }),
      }
    );
    const geminiText = await geminiRes.text();
    if (!geminiRes.ok) {
      console.error("Gemini API error:", geminiRes.status, geminiText);
      return res.status(400).json({ error: 'Gemini API error.', details: geminiText });
    }

    let analysis;
    try {
      // First try parsing as root-level object if using pure JSON mode
      const rawObj = JSON.parse(geminiText);
      if (rawObj.candidates && rawObj.candidates[0]) {
        const rawContent = rawObj.candidates[0].content.parts[0].text;
        analysis = JSON.parse(rawContent);
      } else {
        analysis = rawObj;
      }
    } catch (e) {
      // Fallback
      console.error("Parse error:", e, "Text:", geminiText);
      return res.status(400).json({ error: 'Could not parse Gemini response.', details: geminiText });
    }

    return res.status(200).json({ success: true, analysis });
  } catch (err) {
    res.status(500).json({ error: 'proxy_error', details: String(err && err.message ? err.message : err) });
  }
};
