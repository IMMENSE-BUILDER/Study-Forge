// Server-side Vercel AI Gateway proxy.
// The browser never sees the gateway key; every AI tool calls /api/ai/*.
// Model is pinned to meta/muse-ember for the whole app.
import https from 'node:https';

const GATEWAY_HOST = 'ai-gateway.vercel.sh';
export const AI_MODEL = 'meta/muse-ember';

// Server-only fallback so the app keeps working before the env var is added.
// Prefer VERCEL_AI_GATEWAY_KEY / AI_GATEWAY_API_KEY in Vercel Project Settings.
const FALLBACK_KEY = (() => {
  try {
    return Buffer.from(
      'dmNrXzdFMklZTUNWek94dHg5ZTdSZFRtanQwOGFjZmFwbUFPOUFvWUxBZEdVQXlXd2x1WUlqM2I0TzY2',
      'base64'
    ).toString('utf8');
  } catch (e) {
    return '';
  }
})();

function serverKey() {
  return process.env.VERCEL_AI_GATEWAY_KEY ||
    process.env.AI_GATEWAY_API_KEY ||
    process.env.VERCEL_AI_KEY ||
    FALLBACK_KEY;
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

function readRawBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
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

  const key = serverKey();
  if (!key) {
    return json(res, 503, 'AI gateway key is not configured on the server.');
  }

  const targetPath = String(req.url || '/api/ai/chat/completions').replace(/^\/api\/ai/, '/v1');
  if (!targetPath.startsWith('/v1/chat/completions')) {
    return json(res, 404, 'Unsupported AI route');
  }

  // Light abuse guard: only the app origins (or same-origin server-to-server proxy) may call.
  const origin = String(req.headers.origin || '');
  if (origin) {
    const allowed = /^https:\/\/(studyforged\.vercel\.app|studyforged\.netlify\.app)$/i.test(origin) ||
      /^http:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(origin);
    if (!allowed) return json(res, 403, 'Origin not allowed');
  }

  let body = '';
  try {
    if (Buffer.isBuffer(req.body)) body = req.body.toString('utf8');
    else if (typeof req.body === 'string') body = req.body;
    else if (req.body && typeof req.body === 'object') body = JSON.stringify(req.body);
    else body = await readRawBody(req);
  } catch (e) {
    body = '';
  }
  // Pin the model everywhere and cap output tokens, even if a stale client sends other values.
  if (body) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsed.model = AI_MODEL;
        if (typeof parsed.max_tokens === 'number' && parsed.max_tokens > 16000) parsed.max_tokens = 16000;
        body = JSON.stringify(parsed);
      }
    } catch (e) {}
  }

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Accept: req.headers.accept || 'text/event-stream',
    Authorization: `Bearer ${key}`,
    'Accept-Encoding': 'identity'
  };
  if (body) headers['Content-Length'] = Buffer.byteLength(body);

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

  proxyReq.on('error', (err) => {
    if (!res.headersSent) json(res, 502, `AI proxy error: ${err.message}`);
    else res.end();
  });

  if (body) proxyReq.write(body);
  proxyReq.end();
}
