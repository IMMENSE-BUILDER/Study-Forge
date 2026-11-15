// Static server for the Study Forge PWA. No dependencies.
// Run: node serve-pwa.js   (serves this folder on http://0.0.0.0:3000)
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = 3000;
const AI_MODEL = "meta/muse-ember";
// Server-side only. The browser never receives this key.
const FALLBACK_VERCEL_KEY = Buffer.from("dmNrXzdFMklZTUNWek94dHg5ZTdSZFRtanQwOGFjZmFwbUFPOUFvWUxBZEdVQXlXd2x1WUlqM2I0TzY2", "base64").toString("utf8");
const SERVER_AI_KEY = process.env.VERCEL_AI_GATEWAY_KEY || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_KEY || FALLBACK_VERCEL_KEY;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".webmanifest": "application/manifest+json",
};

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 16, keepAliveMsecs: 60000 });

const server = http.createServer((req, res) => {
  // Handle Vercel AI Gateway API reverse proxy to bypass browser CORS with high speed
  if (req.url && req.url.startsWith("/api/ai/")) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
      "Access-Control-Allow-Headers": "*",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      return res.end();
    }
    const targetPath = req.url.replace(/^\/api\/ai/, "/v1");
    const proxyHeaders = { ...req.headers };
    proxyHeaders.host = "ai-gateway.vercel.sh";
    delete proxyHeaders.referer;
    delete proxyHeaders.origin;
    proxyHeaders["accept-encoding"] = "identity";
    if (targetPath.includes("chat/completions")) {
      if (req.headers["accept"]) {
        proxyHeaders["accept"] = req.headers["accept"];
      }
      proxyHeaders["cache-control"] = "no-cache";
    }
    // Server-side key only. Ignore any Authorization header from the browser.
    delete proxyHeaders["authorization"];
    if (SERVER_AI_KEY) {
      proxyHeaders["authorization"] = `Bearer ${SERVER_AI_KEY}`;
    }

    const reqStart = Date.now();
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      let body = Buffer.concat(chunks);
      // Pin the model server-side, even if a stale client sends another ID.
      try {
        const parsed = JSON.parse(body.toString("utf8"));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsed.model = AI_MODEL;
          body = Buffer.from(JSON.stringify(parsed));
        }
      } catch (e) {}
      proxyHeaders["content-length"] = body.length;
      console.log(`[Proxy] ${req.method} ${targetPath} (${body.length} bytes)`);

      let firstChunkMs = null;
      let totalChunks = 0;

      const proxyReq = https.request(
        {
          hostname: "ai-gateway.vercel.sh",
          port: 443,
          path: targetPath,
          method: req.method,
          headers: proxyHeaders,
          agent: httpsAgent,
        },
        (proxyRes) => {
          if (res.socket) res.socket.setNoDelay(true);
          const responseHeaders = { ...proxyRes.headers, ...corsHeaders };
          responseHeaders["x-accel-buffering"] = "no";
          res.writeHead(proxyRes.statusCode, responseHeaders);

          proxyRes.on("data", (chunk) => {
            totalChunks++;
            if (!firstChunkMs) {
              firstChunkMs = Date.now() - reqStart;
              console.log(`[Proxy] First chunk forwarded in ${firstChunkMs}ms (${chunk.length} bytes)`);
            }
            res.write(chunk);
          });

          proxyRes.on("end", () => {
            console.log(`[Proxy] Stream finished in ${Date.now() - reqStart}ms. Total chunks: ${totalChunks}`);
            res.end();
          });
        }
      );

      proxyReq.on("error", (err) => {
        console.error("Vercel AI Gateway proxy error:", err.message);
        res.writeHead(502, { ...corsHeaders, "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Proxy error: " + err.message } }));
      });

      proxyReq.write(body);
      proxyReq.end();
    });
    return;
  }

  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (urlPath === "/" || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(ROOT, "index.html");
  }
  const ext = path.extname(filePath).toLowerCase();
  // Dev server: never let the browser or SW-install fetch go stale.
  const headers = { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-store" };
  if (ext === ".pdf") {
    headers["Content-Disposition"] = 'attachment; filename="StudyForge_ADGIPS_BTech_IT_Guide_4p.pdf"';
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Study Forge PWA running at http://0.0.0.0:${PORT}`);
});
