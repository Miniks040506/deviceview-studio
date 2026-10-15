import fs from 'fs';
import http from 'http';
import path from 'path';
import { defaultDeviceRegistry } from '@deviceview/device-registry';
import type { ClientToServerWsMessage, DeviceBrand, DeviceCategory } from '@deviceview/shared';
import { BrowserEngineManager, type InteractiveBrowserSession } from './browser-engine';
import { loadServerConfig, type ServerConfig } from './config';
import { probeWebsiteUrl } from './direct-probe';
import { TunnelHub } from './tunnel-hub';
import { upgradeHttpToWebSocket, type RawWebSocketConnection } from './ws-raw';

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

export interface StudioServerInstance {
  server: http.Server;
  config: ServerConfig;
  browserEngine: BrowserEngineManager;
  tunnelHub: TunnelHub;
  listen: (port?: number, host?: string) => Promise<{ port: number; host: string }>;
  close: () => Promise<void>;
}

export function createStudioServer(customConfig?: Partial<ServerConfig>): StudioServerInstance {
  const config: ServerConfig = {
    ...loadServerConfig(),
    ...customConfig,
  };

  const browserEngine = new BrowserEngineManager(config);
  const tunnelHub = new TunnelHub();
  const liveReloadSubscribers = new Set<RawWebSocketConnection>();

  tunnelHub.onLiveReload((payload) => {
    for (const sub of liveReloadSubscribers) {
      sub.send(JSON.stringify({ type: 'companion:livereload', ...payload }));
    }
  });

  const sendJson = (res: http.ServerResponse, statusCode: number, data: unknown) => {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': config.corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Companion-Secret',
    });
    res.end(body);
  };

  const readJsonBody = (req: http.IncomingMessage): Promise<any> => {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          req.destroy(new Error('Payload too large'));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve(raw ? JSON.parse(raw) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': config.corsOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Companion-Secret',
        });
        res.end();
        return;
      }

      const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const pathname = reqUrl.pathname;

      // 1. Health & capabilities endpoint
      if (pathname === '/api/health' && req.method === 'GET') {
        sendJson(res, 200, {
          status: 'ok',
          service: 'DeviceView Studio Server',
          deploymentMode: config.deploymentMode,
          activeSessions: browserEngine.getActiveSessionCount(),
          maxConcurrentSessions: config.maxConcurrentSessions,
          browserCapability: browserEngine.getDriverCapability(),
          activeTunnels: tunnelHub.getActiveTunnels(),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 2. Device Registry endpoints
      if (pathname === '/api/devices' && req.method === 'GET') {
        const query = reqUrl.searchParams.get('q') || undefined;
        const brand = (reqUrl.searchParams.get('brand') as DeviceBrand | 'All') || undefined;
        const category = (reqUrl.searchParams.get('category') as DeviceCategory | 'All') || undefined;
        const verifiedOnly = reqUrl.searchParams.get('verifiedOnly') === 'true';
        const list = defaultDeviceRegistry.filter({ query, brand, category, verifiedOnly });
        sendJson(res, 200, {
          count: list.length,
          devices: list,
        });
        return;
      }

      if (pathname === '/api/devices' && req.method === 'POST') {
        const body = await readJsonBody(req);
        defaultDeviceRegistry.registerCustomDevice(body);
        sendJson(res, 201, { status: 'registered', device: body });
        return;
      }

      // 3. URL Probe & Header / SSRF Inspection endpoint
      if (pathname === '/api/probe' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const targetUrl = String(body.url || '');
        const tunnelId = body.tunnelId ? String(body.tunnelId) : undefined;
        const probeResult = await probeWebsiteUrl(targetUrl, config, tunnelHub, tunnelId);
        const status = probeResult.restrictionCode === 'SSRF_BLOCKED' ? 403 : 200;
        sendJson(res, status, probeResult);
        return;
      }

      // 4. One-shot Browser Mode Screenshot endpoint (Viewport or Full-Page PNG)
      if (pathname === '/api/browser/screenshot' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const session = await browserEngine.createSession(
          {
            url: String(body.url || ''),
            width: Number(body.width || 440),
            height: Number(body.height || 956),
            dpr: Number(body.dpr || 3),
            userAgent: body.userAgent,
            touchCapable: body.touchCapable ?? true,
            tunnelId: body.tunnelId,
          },
          () => {}
        );
        try {
          const shot = await session.captureScreenshot(Boolean(body.fullPage));
          sendJson(res, 200, {
            url: session.currentUrl,
            title: session.title,
            fullPage: Boolean(body.fullPage),
            ...shot,
          });
        } finally {
          await browserEngine.removeSession(session.id);
        }
        return;
      }

      // 5. Companion Tunnel list & HTTP Proxy endpoints
      if (pathname === '/api/tunnels' && req.method === 'GET') {
        sendJson(res, 200, {
          tunnels: tunnelHub.getActiveTunnels(),
        });
        return;
      }

      if (pathname.startsWith('/api/tunnel/') && pathname.endsWith('/proxy')) {
        const parts = pathname.split('/');
        const tunnelId = parts[3];
        const targetUrl = reqUrl.searchParams.get('url') || 'http://127.0.0.1:3000/';
        const proxied = await tunnelHub.proxyHttpRequest(tunnelId, {
          method: req.method || 'GET',
          url: targetUrl,
        });
        res.writeHead(proxied.statusCode, {
          'Content-Type': (proxied.headers['content-type'] as string) || 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': config.corsOrigin,
        });
        res.end(proxied.body);
        return;
      }

      // 6. Built-in Interactive Responsive Demo Site (/api/demo-site and /api/demo-blocked)
      if (pathname === '/api/demo-site') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(renderBuiltinDemoSiteHtml(false));
        return;
      }

      if (pathname === '/api/demo-blocked') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Frame-Options': 'DENY',
          'Content-Security-Policy': "frame-ancestors 'none'",
        });
        res.end(renderBuiltinDemoSiteHtml(true));
        return;
      }

      if (pathname === '/api/demo-ping') {
        sendJson(res, 200, { ok: true, time: new Date().toISOString(), message: 'Network API response from DeviceView Demo endpoint' });
        return;
      }

      // 7. Serve static frontend from apps/web/dist
      const webDistDir = path.resolve(__dirname, '../../web/dist');
      if (fs.existsSync(webDistDir)) {
        const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const candidatePath = path.resolve(webDistDir, relativePath);
        if (candidatePath.startsWith(webDistDir) && fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
          const ext = path.extname(candidatePath).toLowerCase();
          res.writeHead(200, { 'Content-Type': MIME_MAP[ext] || 'application/octet-stream' });
          fs.createReadStream(candidatePath).pipe(res);
          return;
        }
        // SPA Fallback
        const indexHtml = path.join(webDistDir, 'index.html');
        if (fs.existsSync(indexHtml)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(indexHtml).pipe(res);
          return;
        }
      }

      sendJson(res, 404, { error: 'Not Found', path: pathname });
    } catch (err: unknown) {
      sendJson(res, 500, {
        error: 'Internal Server Error',
        message: (err as Error).message || String(err),
      });
    }
  });

  // WebSocket Upgrade Handling (/ws/browser and /ws/companion)
  server.on('upgrade', async (req, socket, head) => {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = reqUrl.pathname;

    if (pathname === '/ws/companion') {
      const token =
        reqUrl.searchParams.get('secret') ||
        (req.headers['x-companion-secret'] as string) ||
        '';
      if (token !== config.companionAuthSecret) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      const tunnelId = reqUrl.searchParams.get('tunnelId') || 'local-default';
      const targetPort = Number(reqUrl.searchParams.get('port') || 3000);
      const targetHost = reqUrl.searchParams.get('host') || '127.0.0.1';
      const ws = await upgradeHttpToWebSocket(req, socket, head);
      if (ws) {
        tunnelHub.registerCompanion(ws, tunnelId, targetHost, targetPort);
      }
      return;
    }

    if (pathname === '/ws/browser') {
      const ws = await upgradeHttpToWebSocket(req, socket, head);
      if (!ws) return;

      liveReloadSubscribers.add(ws);
      let activeSession: InteractiveBrowserSession | null = null;

      ws.on('message', async (raw: string | Buffer) => {
        try {
          const msg = JSON.parse(
            typeof raw === 'string' ? raw : raw.toString('utf8')
          ) as ClientToServerWsMessage;

          if (msg.type === 'session:init') {
            if (activeSession) {
              await browserEngine.removeSession(activeSession.id);
              activeSession = null;
            }
            activeSession = await browserEngine.createSession(
              {
                url: msg.url,
                width: msg.width,
                height: msg.height,
                dpr: msg.dpr,
                userAgent: msg.userAgent,
                touchCapable: msg.touchCapable,
                tunnelId: msg.tunnelId,
              },
              (serverMsg) => ws.send(JSON.stringify(serverMsg))
            );
          } else if (msg.type === 'session:navigate' && activeSession) {
            await activeSession.navigate(msg.url);
          } else if (msg.type === 'session:resize' && activeSession) {
            await activeSession.resize(msg.width, msg.height, msg.dpr, msg.userAgent, msg.touchCapable);
          } else if (msg.type === 'session:reload' && activeSession) {
            await activeSession.reload();
          } else if (msg.type === 'input:mouse' && activeSession) {
            await activeSession.dispatchMouse(msg.action, msg.x, msg.y, msg.button);
          } else if (msg.type === 'input:wheel' && activeSession) {
            await activeSession.dispatchWheel(msg.x, msg.y, msg.deltaX, msg.deltaY);
          } else if (msg.type === 'input:key' && activeSession) {
            await activeSession.dispatchKey(msg.action, msg.text, msg.key);
          } else if (msg.type === 'session:screenshot' && activeSession) {
            const shot = await activeSession.captureScreenshot(msg.fullPage);
            ws.send(
              JSON.stringify({
                type: 'session:screenshot:result',
                sessionId: activeSession.id,
                requestId: msg.requestId,
                fullPage: Boolean(msg.fullPage),
                ...shot,
              })
            );
          }
        } catch (err: unknown) {
          ws.send(
            JSON.stringify({
              type: 'session:error',
              message: (err as Error).message || 'Lỗi xử lý tương tác Browser Mode',
            })
          );
        }
      });

      ws.on('close', () => {
        liveReloadSubscribers.delete(ws);
        if (activeSession) {
          browserEngine.removeSession(activeSession.id).catch(() => {});
          activeSession = null;
        }
      });
      return;
    }

    socket.destroy();
  });

  return {
    server,
    config,
    browserEngine,
    tunnelHub,
    listen: (port = config.port, host = config.host) =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          const addr = server.address();
          const actualPort = typeof addr === 'object' && addr ? addr.port : port;
          resolve({ port: actualPort, host });
        });
      }),
    close: async () => {
      await browserEngine.shutdownAll();
      if (typeof (server as any).closeAllConnections === 'function') (server as any).closeAllConnections();
      await Promise.race([new Promise<void>((resolve) => server.close(() => resolve())), new Promise<void>((r) => setTimeout(r, 100))]);
    },
  };
}

function renderBuiltinDemoSiteHtml(isFrameBlocked: boolean): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${isFrameBlocked ? 'Protected Portal (X-Frame-Options: DENY)' : 'DeviceView Responsive Playground'}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --accent: #6366f1;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      background: linear-gradient(160deg, #090d16 0%, #111827 55%, #1e1b4b 100%);
      color: var(--text);
      min-height: 140vh;
      padding: 20px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(99, 102, 241, 0.2);
      color: #a5b4fc;
      border: 1px solid rgba(99, 102, 241, 0.35);
    }
    h1 { font-size: 22px; margin: 12px 0 6px; letter-spacing: -0.02em; }
    p { font-size: 13px; color: var(--muted); line-height: 1.5; margin: 0 0 16px; }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    @media (min-width: 700px) {
      .metrics-grid { grid-template-columns: repeat(4, 1fr); }
      h1 { font-size: 28px; }
    }
    .metric-card {
      background: rgba(30, 41, 59, 0.78);
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 12px;
      padding: 12px;
    }
    .metric-label { font-size: 11px; color: var(--muted); }
    .metric-val { font-size: 16px; font-weight: 700; color: #38bdf8; margin-top: 4px; font-family: monospace; }
    .interactive-box {
      background: rgba(30, 41, 59, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .btn-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    button {
      background: #4f46e5;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 9px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    button.secondary { background: #334155; }
    button.danger { background: #dc2626; }
    input {
      width: 100%;
      padding: 9px 12px;
      border-radius: 8px;
      border: 1px solid #475569;
      background: #0f172a;
      color: white;
      font-size: 13px;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <span class="badge">${isFrameBlocked ? '🔒 X-Frame-Options: DENY (Browser Mode Active)' : '⚡ Live Interactive Viewport'}</span>
  <h1>${isFrameBlocked ? 'Trang kiểm thử chặn Iframe' : 'DeviceView Studio — Live Playground'}</h1>
  <p>Tương tác trực tiếp: thử click nút đếm, nhập liệu văn bản, cuộn trang và kiểm tra Console / Network ở bảng công cụ bên phải.</p>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-label">CSS Viewport</div>
      <div class="metric-val" id="vp-size">--</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Device Pixel Ratio</div>
      <div class="metric-val" id="vp-dpr">--</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Breakpoint</div>
      <div class="metric-val" id="vp-bp">--</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Interactions</div>
      <div class="metric-val" id="click-count">0</div>
    </div>
  </div>

  <div class="interactive-box">
    <div style="font-size:13px;font-weight:600;">Kiểm thử Click, Input & DevTools Telemetry</div>
    <input id="demo-input" type="text" placeholder="Nhập thử nội dung tại đây..." value="" />
    <div id="input-mirror" style="font-size:12px;color:#a5b4fc;margin-top:6px;">Giá trị hiện tại: (trống)</div>
    <div class="btn-row">
      <button id="btn-increment" onclick="handleIncrement()">+1 Tăng bộ đếm</button>
      <button class="secondary" id="btn-log" onclick="handleConsoleLog()">Ghi Console Log</button>
      <button class="secondary" id="btn-fetch" onclick="handleNetworkFetch()">Gửi Fetch API</button>
      <button class="danger" id="btn-error" onclick="handleTriggerError()">Tạo JS Error mẫu</button>
    </div>
  </div>

  <div class="interactive-box">
    <div style="font-size:13px;font-weight:600;">Kiểm thử Cuộn trang (Scroll Area) & Full-page Screenshot</div>
    <p style="margin-top:6px;">Cuộn xuống dưới để kiểm tra đồng bộ vị trí cuộn và chụp ảnh toàn trang (Full-Page Screenshot).</p>
    <div style="height:240px;display:flex;align-items:flex-end;padding:12px;background:rgba(15,23,42,0.6);border-radius:10px;border:1px dashed #475569;">
      <span id="bottom-marker" style="font-size:12px;color:#34d399;">✓ Đã cuộn tới cuối vùng kiểm thử Responsive!</span>
    </div>
  </div>

  <script>
    let count = 0;
    function updateMetrics() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      document.getElementById('vp-size').textContent = w + ' × ' + h;
      document.getElementById('vp-dpr').textContent = dpr + 'x';
      document.getElementById('vp-bp').textContent = w < 640 ? 'Mobile (<640)' : w < 1024 ? 'Tablet (640-1023)' : 'Desktop (>=1024)';
    }
    window.addEventListener('resize', updateMetrics);
    updateMetrics();
    console.info('[Playground] Trang kiểm thử đã khởi tạo tại viewport ' + window.innerWidth + 'x' + window.innerHeight);

    document.getElementById('demo-input').addEventListener('input', function(e) {
      document.getElementById('input-mirror').textContent = 'Giá trị hiện tại: ' + (e.target.value || '(trống)');
      console.log('[Playground] Input thay đổi:', e.target.value);
    });

    function handleIncrement() {
      count += 1;
      document.getElementById('click-count').textContent = String(count);
      console.log('[Playground] Đã click nút bộ đếm, count =', count);
    }

    function handleConsoleLog() {
      console.warn('[Playground] Cảnh báo kiểm thử từ DeviceView Studio lúc ' + new Date().toLocaleTimeString());
    }

    function handleNetworkFetch() {
      fetch('/api/demo-ping?ts=' + Date.now())
        .then(r => r.json())
        .then(d => console.info('[Playground] Nhận phản hồi mạng:', JSON.stringify(d)))
        .catch(err => console.error('[Playground] Lỗi mạng:', err));
    }

    function handleTriggerError() {
      setTimeout(function() {
        throw new Error('Simulated Uncaught TypeError: Cannot read properties of undefined (reading "responsiveProfile")');
      }, 10);
    }
  </script>
</body>
</html>`;
}
