#!/usr/bin/env node
/**
 * DeviceView Studio — Local Companion Tunnel Agent
 * Connects a developer's local localhost port (e.g. 3000, 5173, 8080) to a DeviceView Studio server
 * over an authenticated WebSocket tunnel with optional directory file watching for Live Reload.
 */
import fs from 'fs';
import http from 'http';
import Module from 'module';

for (const p of ['/usr/share/nodejs', '/usr/lib/nodejs', '/opt/spark/lib/node_modules']) {
  if (fs.existsSync(p) && !Module.globalPaths.includes(p)) {
    Module.globalPaths.push(p);
  }
}

const require = Module.createRequire(import.meta.url);
const WebSocket = require('ws');

function parseArgs(argv) {
  const args = {
    server: process.env.DEVICEVIEW_SERVER_WS || 'ws://127.0.0.1:4000/ws/companion',
    port: Number(process.env.LOCAL_PORT || 3000),
    host: process.env.LOCAL_HOST || '127.0.0.1',
    tunnelId: process.env.TUNNEL_ID || 'local-dev',
    secret: process.env.COMPANION_AUTH_SECRET || 'dev-companion-secret',
    watchDir: process.env.WATCH_DIR || '',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' && argv[i + 1]) args.port = Number(argv[++i]);
    else if (a === '--host' && argv[i + 1]) args.host = argv[++i];
    else if (a === '--server' && argv[i + 1]) args.server = argv[++i];
    else if (a === '--tunnel-id' && argv[i + 1]) args.tunnelId = argv[++i];
    else if (a === '--secret' && argv[i + 1]) args.secret = argv[++i];
    else if (a === '--watch' && argv[i + 1]) args.watchDir = argv[++i];
  }
  return args;
}

export function startCompanionAgent(customOpts = {}) {
  const opts = { ...parseArgs(process.argv), ...customOpts };
  const wsUrl = new URL(opts.server);
  wsUrl.searchParams.set('tunnelId', opts.tunnelId);
  wsUrl.searchParams.set('port', String(opts.port));
  wsUrl.searchParams.set('host', opts.host);
  wsUrl.searchParams.set('secret', opts.secret);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl.toString(), {
      headers: { 'X-Companion-Secret': opts.secret },
      maxPayload: 50 * 1024 * 1024,
    });

    ws.once('open', () => {
      const hb = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'tunnel:heartbeat', tunnelId: opts.tunnelId }));
        }
      }, 10000);
      hb.unref();

      let watcher = null;
      if (opts.watchDir && fs.existsSync(opts.watchDir)) {
        watcher = fs.watch(opts.watchDir, { recursive: false }, () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'tunnel:livereload', tunnelId: opts.tunnelId }));
          }
        });
      }

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString('utf8'));
          if (msg.type === 'tunnel:request' && msg.requestId) {
            const target = new URL(msg.url || '/', `http://${opts.host}:${opts.port}`);
            target.hostname = opts.host;
            target.port = String(opts.port);

            const localReq = http.request(
              target.toString(),
              {
                method: msg.method || 'GET',
                headers: msg.headers || {},
                timeout: 8000,
              },
              (localRes) => {
                const chunks = [];
                localRes.on('data', (c) => chunks.push(c));
                localRes.on('end', () => {
                  const body = Buffer.concat(chunks);
                  ws.send(
                    JSON.stringify({
                      type: 'tunnel:response',
                      requestId: msg.requestId,
                      statusCode: localRes.statusCode || 200,
                      headers: localRes.headers,
                      bodyBase64: body.toString('base64'),
                    })
                  );
                });
              }
            );
            localReq.on('error', (err) => {
              ws.send(
                JSON.stringify({
                  type: 'tunnel:response',
                  requestId: msg.requestId,
                  error: err.message,
                })
              );
            });
            localReq.end();
          }
        } catch {
          // ignore
        }
      });

      resolve({
        tunnelId: opts.tunnelId,
        triggerLiveReload: () => {
          ws.send(JSON.stringify({ type: 'tunnel:livereload', tunnelId: opts.tunnelId }));
        },
        close: () => {
          clearInterval(hb);
          if (watcher) watcher.close();
          ws.close();
        },
      });
    });

    ws.once('error', reject);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startCompanionAgent()
    .then((agent) => {
      console.log(`[DeviceView Companion] Tunnel "${agent.tunnelId}" active and connected.`);
    })
    .catch((err) => {
      console.error('[DeviceView Companion] Failed to connect:', err.message);
      process.exit(1);
    });
}
