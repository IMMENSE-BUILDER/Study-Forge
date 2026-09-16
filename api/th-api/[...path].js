export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const url = new URL(req.url);
  let subPath = url.pathname;
  if (subPath.startsWith('/api/th-api')) {
    subPath = subPath.replace(/^\/api\/th-api/, '');
  } else if (subPath.startsWith('/th-api')) {
    subPath = subPath.replace(/^\/th-api/, '');
  }
  
  const targetUrl = 'https://tokenharbor.ai' + subPath + url.search;

  const reqHeaders = new Headers();
  for (const [key, value] of req.headers.entries()) {
    const k = key.toLowerCase();
    if (k !== 'host' && k !== 'connection') {
      reqHeaders.set(key, value);
    }
  }

  const upstreamRes = await fetch(targetUrl, {
    method: req.method,
    headers: reqHeaders,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
  });

  const resHeaders = new Headers();
  for (const [key, value] of upstreamRes.headers.entries()) {
    resHeaders.set(key, value);
  }
  resHeaders.set('Access-Control-Allow-Origin', '*');
  resHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  resHeaders.set('Access-Control-Allow-Headers', '*');
  resHeaders.set('Cache-Control', 'no-cache, no-transform');
  resHeaders.set('X-Accel-Buffering', 'no');

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: resHeaders,
  });
}