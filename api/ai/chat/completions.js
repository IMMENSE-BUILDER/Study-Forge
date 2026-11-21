// Server-side Vercel AI Gateway proxy for POST /api/ai/chat/completions.
// The browser never sees the gateway key; every AI tool calls /api/ai/chat/completions.
// Model is pinned to meta/muse-ember for the whole app.
import https from 'node:https';

const GATEWAY_HOST = 'ai-gateway.vercel.sh';
export const AI_MODEL = 'meta/muse-ember';

const ALLOWED_ORIGIN_RE = /^https:\/\/(study-forged\.vercel\.app|studyforged\.vercel\.app|studyforged\.netlify\.app)$/i;
const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/i;

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const RATE_LIMIT_MAX_BUCKETS = 500;
const UPSTREAM_TIMEOUT_MS = 55_000;

const rateLimitBuckets = new Map();

function getGatewayKey() {
  return String(
    process.env.VERCEL_AI_GATEWAY_KEY ||
    process.env.AI_GATEWAY_API_KEY ||
    process.env.VERCEL_AI_KEY ||
    ''
  ).trim();
}

function isAllowedOrigin(originValue) {
  const val = String(originValue || '').trim();
  if (!val || val.toLowerCase() === 'null') return false;
  if (ALLOWED_ORIGIN_RE.test(val) || LOCAL_ORIGIN_RE.test(val)) return true;
  const vercelUrl = String(process.env.VERCEL_URL || '').trim().toLowerCase();
  if (vercelUrl && val.toLowerCase() === `https://${vercelUrl}`) return true;
  return false;
}

function getClientIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  if (Array.isArray(xff) && xff.length) {
    return String(xff[0]).split(',')[0].trim();
  }
  const xRealIp = String(req.headers?.['x-real-ip'] || '').trim();
  if (xRealIp) return xRealIp;
  return String(req.socket?.remoteAddress || 'unknown');
}

function checkRateLimit(ip, now = Date.now()) {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  if (rateLimitBuckets.size > RATE_LIMIT_MAX_BUCKETS) {
    for (const [k, list] of rateLimitBuckets.entries()) {
      const fresh = list.filter((ts) => ts > cutoff);
      if (fresh.length) rateLimitBuckets.set(k, fresh);
      else rateLimitBuckets.delete(k);
    }
  }
  if (rateLimitBuckets.size >= RATE_LIMIT_MAX_BUCKETS && !rateLimitBuckets.has(ip)) {
    const oldestKey = rateLimitBuckets.keys().next().value;
    if (oldestKey !== undefined) rateLimitBuckets.delete(oldestKey);
  }
  const existing = rateLimitBuckets.get(ip) || [];
  const active = existing.filter((ts) => ts > cutoff);
  if (active.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitBuckets.set(ip, active);
    const retryAfterSec = Math.max(1, Math.ceil((active[0] + RATE_LIMIT_WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSec };
  }
  active.push(now);
  rateLimitBuckets.set(ip, active);
  return { allowed: true, retryAfterSec: 0 };
}

function json(res, status, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error: { message } }));
}

export const config = {
  maxDuration: 60,
  api: { bodyParser: false }
};

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    req.on('data', (chunk) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
        settled = true;
        if (typeof req.resume === 'function') req.resume();
        const err = new Error('Request payload too large.');
        err.code = 'PAYLOAD_TOO_LARGE';
        reject(err);
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', () => {
      if (settled) return;
      settled = true;
      resolve('');
    });
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.end();
  }
  if (req.method !== 'POST') {
    return json(res, 405, 'Method not allowed');
  }

  const targetPath = String(req.url || '/api/ai/chat/completions').replace(/^\/api\/ai/, '/v1');
  const pathOnly = targetPath.split('?')[0];
  if (pathOnly !== '/v1/chat/completions') {
    return json(res, 404, 'Unsupported AI route');
  }

  // Enforce strict Origin/Referer validation (no headerless bypass).
  const origin = String(req.headers?.origin || '').trim();
  const referer = String(req.headers?.referer || '').trim();
  if (origin) {
    if (!isAllowedOrigin(origin)) return json(res, 403, 'Origin not allowed');
  } else if (referer) {
    let refOrigin = '';
    try {
      refOrigin = new URL(referer).origin;
    } catch (e) {
      refOrigin = '';
    }
    if (!isAllowedOrigin(refOrigin)) return json(res, 403, 'Origin not allowed');
  } else {
    return json(res, 403, 'Origin required');
  }

  const rl = checkRateLimit(getClientIp(req));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    return json(res, 429, 'Too many requests — please wait a moment and try again.');
  }

  const apiKey = getGatewayKey();
  if (!apiKey) {
    return json(res, 503, 'AI gateway key is not configured on the server.');
  }

  const contentLengthHeader = req.headers?.['content-length'];
  if (contentLengthHeader !== undefined) {
    const parsedLen = Number(contentLengthHeader);
    if (Number.isFinite(parsedLen) && parsedLen > MAX_BODY_BYTES) {
      return json(res, 413, 'Request payload too large.');
    }
  }

  let body = '';
  try {
    if (Buffer.isBuffer(req.body)) {
      if (req.body.length > MAX_BODY_BYTES) {
        return json(res, 413, 'Request payload too large.');
      }
      body = req.body.toString('utf8');
    } else if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
        return json(res, 413, 'Request payload too large.');
      }
      body = req.body;
    } else if (req.body && typeof req.body === 'object') {
      body = JSON.stringify(req.body);
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        return json(res, 413, 'Request payload too large.');
      }
    } else {
      body = await readRawBody(req, MAX_BODY_BYTES);
    }
  } catch (e) {
    if (e && e.code === 'PAYLOAD_TOO_LARGE') {
      return json(res, 413, 'Request payload too large.');
    }
    body = '';
  }

  if (!body) {
    return json(res, 400, 'Invalid JSON request body.');
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    return json(res, 400, 'Invalid JSON request body.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return json(res, 400, 'Invalid JSON request body.');
  }

  if (!Array.isArray(parsed.messages) || parsed.messages.length < 1 || parsed.messages.length > 50) {
    return json(res, 400, 'Request must include 1 to 50 messages.');
  }

  // Pin the model everywhere and clamp output parameters.
  parsed.model = AI_MODEL;
  if (typeof parsed.max_tokens === 'number' && Number.isFinite(parsed.max_tokens)) {
    parsed.max_tokens = Math.max(1, Math.min(16000, Math.floor(parsed.max_tokens)));
  } else {
    parsed.max_tokens = 8000;
  }
  if (parsed.n != null) {
    parsed.n = 1;
  }
  if (typeof parsed.temperature === 'number' && Number.isFinite(parsed.temperature)) {
    parsed.temperature = Math.max(0, Math.min(2, parsed.temperature));
  }
  body = JSON.stringify(parsed);

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    Accept: req.headers?.accept || 'text/event-stream',
    Authorization: `Bearer ${apiKey}`,
    'Accept-Encoding': 'identity',
    'Content-Length': Buffer.byteLength(body)
  };

  const proxyReq = https.request(
    {
      hostname: GATEWAY_HOST,
      port: 443,
      path: targetPath,
      method: 'POST',
      headers
    },
    (upstream) => {
      const outHeaders = {
        'Content-Type': upstream.headers['content-type'] || 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Accel-Buffering': 'no'
      };
      res.writeHead(upstream.statusCode || 502, outHeaders);
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      upstream.pipe(res);
    }
  );

  if (typeof proxyReq.setTimeout === 'function') {
    proxyReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
      if (typeof proxyReq.destroy === 'function') proxyReq.destroy();
      if (!res.headersSent) {
        json(res, 504, 'AI gateway upstream request timed out.');
      } else {
        res.end();
      }
    });
  }

  if (typeof res.on === 'function') {
    res.on('close', () => {
      if (!res.writableEnded && typeof proxyReq.destroy === 'function') {
        proxyReq.destroy();
      }
    });
  }

  proxyReq.on('error', (err) => {
    if (!res.headersSent) json(res, 502, `AI proxy error: ${err.message}`);
    else res.end();
  });

  proxyReq.write(body);
  proxyReq.end();
}
