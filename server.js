require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST_DIR = path.join(__dirname, 'host');

// ─── MIDDLEWARE ─────────────────────────────────────────
app.set('trust proxy', 1);

const DEFAULT_ORIGINS = [
  'https://lexeasy.in',
  'https://www.lexeasy.in',
  'https://umangrajok.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function buildAllowedOrigins() {
  const set = new Set(DEFAULT_ORIGINS);
  const extra = process.env.ALLOWED_ORIGINS;
  if (extra) {
    extra
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((o) => set.add(o));
  }
  return set;
}

const ALLOWED_ORIGINS = buildAllowedOrigins();

const corsOptions = {
  origin(origin, cb) {
    // Allow server-to-server, curl, Render health checks, and local `file://` testing (origin will be `undefined` or `null`)
    if (!origin || origin === 'null') return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-LexAI-Key'],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

app.use(
  helmet({
    // API responses should be readable cross-origin when CORS allows it
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
// Cap JSON body (large OCR text still allowed within limit)
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '512kb' }));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ─── SECURITY: per-IP rate limit (short window) ─────────
const RATE_WINDOW_MS = parseInt(process.env.RATE_WINDOW_MS || '900000', 10); // 15 min default
const RATE_MAX_ANALYZE = parseInt(process.env.RATE_MAX_ANALYZE || '6', 10);

const analyzeLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: RATE_MAX_ANALYZE,
  message: {
    error:
      'Too many analyses from this network. Please wait before trying again.',
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// ─── SECURITY: optional shared secret (set CLIENT_API_KEY on server + same in site meta) ───
function requireClientKey(req, res, next) {
  const secret = process.env.CLIENT_API_KEY;
  if (!secret) return next();
  const header =
    req.get('X-LexAI-Key') ||
    (req.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (header !== secret) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  return next();
}

// ─── SECURITY: daily cap per IP (UTC day) — protects Gemini quota ───
const DAILY_MAX_PER_IP = parseInt(process.env.DAILY_MAX_PER_IP || '0', 10);
let dailyUtcDate = '';
const dailyIpCounts = new Map();

function consumeDailySlot(ip) {
  if (!DAILY_MAX_PER_IP || DAILY_MAX_PER_IP <= 0) return true;
  const day = new Date().toISOString().slice(0, 10);
  if (day !== dailyUtcDate) {
    dailyUtcDate = day;
    dailyIpCounts.clear();
  }
  const key = String(ip || 'unknown');
  const n = dailyIpCounts.get(key) || 0;
  if (n >= DAILY_MAX_PER_IP) return false;
  dailyIpCounts.set(key, n + 1);
  return true;
}

const MAX_DOCUMENT_CHARS = parseInt(process.env.MAX_DOCUMENT_CHARS || '8000', 10);
const PROMPT_CHARS = Math.min(
  parseInt(process.env.PROMPT_CHARS || '4000', 10),
  MAX_DOCUMENT_CHARS
);
const ALLOWED_LANGS = new Set(['en', 'hi', 'hinglish']);

// ─── ANALYZE ENDPOINT ──────────────────────────────────
app.post(
  '/api/analyze',
  requireClientKey,
  analyzeLimiter,
  async (req, res) => {
  const { text, responseLang = 'en' } = req.body;

  // Validation
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'No document text provided.' });
  }
  const trimmed = text.trim();
  if (trimmed.length < 20) {
    return res.status(400).json({ error: 'Document text too short to analyze.' });
  }
  if (trimmed.length > MAX_DOCUMENT_CHARS) {
    return res.status(400).json({
      error: `Document is too long. Maximum ${MAX_DOCUMENT_CHARS} characters allowed.`,
    });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server.' });
  }

  if (!consumeDailySlot(req.ip)) {
    return res.status(429).json({
      error:
        'Daily analysis limit reached for this network. Please try again tomorrow.',
    });
  }

  const rl = typeof responseLang === 'string' ? responseLang : 'en';
  const langKey = ALLOWED_LANGS.has(rl) ? rl : 'en';

  // Language instructions
  const langMap = {
    en: 'Respond in clear, simple English. Easy to understand for a non-lawyer.',
    hi: 'सभी text fields में शुद्ध हिंदी में जवाब दें। सरल भाषा का प्रयोग करें।',
    hinglish: 'Saare text fields mein simple Hinglish mein jawab do — Roman script mein, easy language.'
  };

  const langInstruction = langMap[langKey] || langMap['en'];

  const prompt = `You are an expert Indian legal document analyzer. Analyze the document below and return ONLY valid JSON — no extra text, no markdown, no preamble.

LANGUAGE INSTRUCTION: ${langInstruction}

DOCUMENT:
${trimmed.substring(0, PROMPT_CHARS)}

Return ONLY this JSON format:
{
  "safety_score": <number 0-100>,
  "document_type": "<type of document>",
  "summary": "<2-3 line simple explanation of what this document is>",
  "red_flags": [
    {
      "title": "<flag name>",
      "detail": "<what is the problem and why is it risky>",
      "severity": "high" | "medium" | "low",
      "snippet": "<exact short quote from the DOCUMENT above — copy verbatim so it can be highlighted; empty string if none>"
    }
  ],
  "safe_points": "<what is fair and safe in this document>",
  "advice": "<should they sign or not, what to negotiate, practical next steps>"
}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1500,
          }
        })
      }
    );

    if (!geminiRes.ok) {
      // Gemini may return JSON or plain text depending on error type.
      let errMessage = 'Gemini API error';
      try {
        const contentType = geminiRes.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const errData = await geminiRes.json();
          errMessage =
            errData?.error?.message ||
            errData?.message ||
            (typeof errData === 'string' ? errData : JSON.stringify(errData));
        } else {
          const txt = await geminiRes.text();
          errMessage = txt || errMessage;
        }
      } catch (e) {
        // Fallback: still surface the HTTP status
        errMessage = `Gemini API request failed (HTTP ${geminiRes.status}).`;
      }

      const error = new Error(errMessage);
      error.httpStatus = geminiRes.status; // let the API propagate useful status to frontend
      throw error;
    }

    const geminiData = await geminiRes.json();
    const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw) throw new Error('Empty response from Gemini');

    // Extract JSON safely
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse AI response as JSON');

    const analysis = JSON.parse(match[0]);

    return res.json({ success: true, analysis });

  } catch (err) {
    console.error('Analysis error:', err.message);
    return res
      .status(err?.httpStatus || 500)
      .json({ error: err.message || 'Analysis failed. Please try again.' });
  }
  }
);

// ─── HEALTH CHECK ───────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'LexAI Backend',
    version: '2.0.0',
    ai: 'Google Gemini 1.5 Flash',
    timestamp: new Date().toISOString()
  });
});

// ─── STATIC SITE (LexEasy UI) ───────────────────────────
app.use(express.static(HOST_DIR, { index: ['index.html'] }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(HOST_DIR, 'index.html'), (err) => {
    if (err) next(err);
  });
});

// ─── 404 ────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Route not found.' });
  }
  res.status(404).send('Not found');
});

// ─── GLOBAL ERROR HANDLER (always return JSON) ─────────────
app.use((err, req, res, next) => {
  // Body too large
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      error: 'Document text too large for this request. Please shorten the text or try a smaller file.',
    });
  }

  // Invalid JSON in request body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload.' });
  }

  console.error('Unhandled server error:', err);
  return res.status(500).json({ error: err?.message || 'Server error. Please try again.' });
});

// ─── START ──────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`✅ LexAI Backend running on port ${PORT}`);
  console.log(`🌐 UI: http://localhost:${PORT}/ (folder: /host)`);
  console.log(`🤖 AI: Google Gemini 1.5 Flash`);
});

// Render cold starts can be slow; keep request timeouts generous.
server.requestTimeout = 120_000; // 120s
server.headersTimeout = 125_000; // must be > requestTimeout
server.keepAliveTimeout = 65_000;
