const app = require('../server.js');

// In-memory cache for duplicate requests
const requestCache = new Map();
const userRequestCounts = new Map();

// Rate limiting: 5 requests per minute per IP
const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5
};

function getClientIdentifier(req) {
  // Try to get user identifier (IP, session, etc.)
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0] : req.connection?.remoteAddress;
  return ip || 'unknown';
}

function isRateLimited(identifier) {
  const now = Date.now();
  const userRequests = userRequestCounts.get(identifier) || [];
  
  // Clean old requests (outside window)
  const validRequests = userRequests.filter(time => now - time < RATE_LIMIT.windowMs);
  
  if (validRequests.length >= RATE_LIMIT.maxRequests) {
    return true;
  }
  
  validRequests.push(now);
  userRequestCounts.set(identifier, validRequests);
  return false;
}

function getCachedResponse(input) {
  const hash = require('crypto').createHash('sha256').update(input).digest('hex');
  return requestCache.get(hash);
}

function setCachedResponse(input, response) {
  const hash = require('crypto').createHash('sha256').update(input).digest('hex');
  requestCache.set(hash, response);
  
  // Clean cache after 30 minutes
  setTimeout(() => {
    requestCache.delete(hash);
  }, 30 * 60 * 1000);
}

export default async function handler(req, res) {
  console.log('=== API REQUEST START ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('IP:', getClientIdentifier(req));
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-LexAI-Key');
    return res.status(200).end();
  }

  // Only allow POST for /api/analyze
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({ 
      error: 'Method not allowed. Use POST.',
      code: 'METHOD_NOT_ALLOWED'
    });
  }

  const clientId = getClientIdentifier(req);
  
  // Rate limiting check
  if (isRateLimited(clientId)) {
    console.log('❌ Rate limited for IP:', clientId);
    return res.status(429).json({ 
      error: 'Too many requests. Please wait before trying again.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(RATE_LIMIT.windowMs / 1000) // seconds
    });
  }

  try {
    // Parse request body
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    await new Promise((resolve, reject) => {
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          console.log('Request body parsed successfully');
          console.log('Input length:', data.text?.length || 0, 'characters');
          
          // Input validation
          if (!data.text || typeof data.text !== 'string') {
            console.log('❌ Validation failed: No text provided');
            return res.status(400).json({ 
              error: 'No document text provided.',
              code: 'MISSING_TEXT'
            });
          }
          
          const trimmed = data.text.trim();
          if (trimmed.length < 20) {
            console.log('❌ Validation failed: Text too short');
            return res.status(400).json({ 
              error: 'Document text too short to analyze (minimum 20 characters).',
              code: 'TEXT_TOO_SHORT'
            });
          }
          
          if (trimmed.length > 8000) {
            console.log('❌ Validation failed: Text too long');
            return res.status(400).json({ 
              error: 'Document text too long (maximum 8000 characters).',
              code: 'TEXT_TOO_LONG'
            });
          }

          // Check cache for duplicate requests
          const cachedResponse = getCachedResponse(trimmed);
          if (cachedResponse) {
            console.log('✅ Cache hit - returning cached response');
            return res.status(200).json({
              success: true,
              analysis: cachedResponse,
              cached: true
            });
          }

          // Cache the request to prevent duplicates
          setCachedResponse(trimmed, null); // Mark as processing
          
          console.log('✅ All validations passed - forwarding to Express app');
          
          // Forward to Express app with enhanced context
          req.enhancedContext = {
            clientId,
            validatedInput: trimmed,
            requestTime: new Date().toISOString()
          };
          
          return app(req, res);
          
        } catch (parseError) {
          console.log('❌ JSON parse error:', parseError.message);
          return res.status(400).json({ 
            error: 'Invalid JSON in request body.',
            code: 'INVALID_JSON'
          });
        }
      });
      
      req.on('error', reject);
    });
    
  } catch (error) {
    console.error('❌ API Handler Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error.message 
    });
  }
}
