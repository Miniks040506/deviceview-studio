import { spawn, execSync, type ChildProcess } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import type {
  BrowserSessionConfig,
  ConsoleLogEntry,
  JsErrorEntry,
  NetworkRequestEntry,
  ServerToClientWsMessage,
} from '@deviceview/shared';
import type { ServerConfig } from './config';
import { verifyUrlAndResolveDns } from './ssrf-guard';
import { connectRawWebSocket, type RawWebSocketConnection } from './ws-raw';

export interface InteractiveBrowserSession {
  id: string;
  driver: 'playwright' | 'cdp';
  createdAt: number;
  lastActiveAt: number;
  currentUrl: string;
  title: string;
  width: number;
  height: number;
  dpr: number;
  userAgent: string;
  touchCapable: boolean;
  navigate: (url: string) => Promise<void>;
  resize: (width: number, height: number, dpr: number, userAgent?: string, touchCapable?: boolean) => Promise<void>;
  reload: () => Promise<void>;
  dispatchMouse: (action: 'click' | 'move' | 'down' | 'up', x: number, y: number, button?: 'left' | 'right' | 'middle') => Promise<void>;
  dispatchWheel: (x: number, y: number, deltaX: number, deltaY: number) => Promise<void>;
  dispatchKey: (action: 'press' | 'type' | 'down' | 'up', text?: string, key?: string) => Promise<void>;
  captureScreenshot: (fullPage?: boolean) => Promise<{ dataUrl: string; width: number; height: number }>;
  close: () => Promise<void>;
}

class CdpRpcClient {
  private ws: RawWebSocketConnection;
  private nextId = 1;
  private pending = new Map<number, { resolve: (val: any) => void; reject: (err: Error) => void }>();
  private eventHandlers = new Map<string, Set<(params: any) => void>>();

  constructor(ws: RawWebSocketConnection) {
    this.ws = ws;
    this.ws.on('message', (raw: string | Buffer) => {
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
        if (typeof msg.id === 'number') {
          const entry = this.pending.get(msg.id);
          if (entry) {
            this.pending.delete(msg.id);
            if (msg.error) {
              entry.reject(new Error(msg.error.message || 'CDP error'));
            } else {
              entry.resolve(msg.result);
            }
          }
        } else if (msg.method) {
          const handlers = this.eventHandlers.get(msg.method);
          if (handlers) {
            for (const h of handlers) {
              h(msg.params);
            }
          }
        }
      } catch {
        // ignore parse errors
      }
    });
  }

  public send(method: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<any> {
    if (this.ws.readyState !== 1) {
      return Promise.reject(new Error('CDP WebSocket is closed'));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  public on(method: string, handler: (params: any) => void): void {
    if (!this.eventHandlers.has(method)) {
      this.eventHandlers.set(method, new Set());
    }
    this.eventHandlers.get(method)!.add(handler);
  }

  public removeAllListeners(): void {
    this.eventHandlers.clear();
  }

  public close(): void {
    for (const [, p] of this.pending) {
      p.reject(new Error('CDP session closed'));
    }
    this.pending.clear();
    this.eventHandlers.clear();
    this.ws.close();
  }
}

function hasManagedUrlBlocklist(): boolean {
  try {
    const dir = '/etc/chromium/policies/managed';
    if (!fs.existsSync(dir)) return false;
    for (const f of fs.readdirSync(dir)) {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      if (content.includes('URLBlocklist')) return true;
    }
  } catch {}
  return false;
}

const IS_MANAGED_BLOCKLIST_ENV = hasManagedUrlBlocklist();

async function fetchHtmlWithInlinedLocalAssets(targetUrl: string): Promise<string> {
  const fetchText = (u: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const parsed = new URL(u);
      if (parsed.hostname === 'localhost') parsed.hostname = '127.0.0.1';
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.get(parsed.toString(), { timeout: 6000 }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('timeout')));
    });

  let html = await fetchText(targetUrl);
  const baseOrigin = new URL(targetUrl).origin;

  const cssMatches = Array.from(html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["'](\/[^"']+)["'][^>]*>/gi));
  for (const m of cssMatches) {
    try {
      const cssContent = await fetchText(`${baseOrigin}${m[1]}`);
      html = html.replace(m[0], `<style>${cssContent}</style>`);
    } catch {}
  }

  const jsMatches = Array.from(html.matchAll(/<script[^>]+src=["'](\/[^"']+)["'][^>]*><\/script>/gi));
  for (const m of jsMatches) {
    try {
      const jsContent = await fetchText(`${baseOrigin}${m[1]}`);
      html = html.replace(m[0], () => `<script>${jsContent.replace(/<\/script>/gi, '<\\/script>')}</script>`);
    } catch {}
  }

  return html;
}

export class BrowserEngineManager {
  private config: ServerConfig;
  private sessions = new Map<string, InteractiveBrowserSession>();
  private cleanupTimer: NodeJS.Timeout;
  private sharedProc: ChildProcess | null = null;
  private sharedProfileDir: string | null = null;
  private sharedPort: number = 19400 + Math.floor(Math.random() * 400);
  private sharedWsUrl: string | null = null;
  private launchPromise: Promise<string> | null = null;

  constructor(config: ServerConfig) {
    this.config = config;
    this.cleanupTimer = setInterval(() => this.reapExpiredSessions(), 15000);
    this.cleanupTimer.unref();
  }

  public getActiveSessionCount(): number {
    return this.sessions.size;
  }

  public getDriverCapability(): { preferredDriver: 'playwright' | 'cdp'; chromiumAvailable: boolean; chromiumPath: string } {
    let playwrightAvailable = false;
    if (this.config.browserDriver !== 'cdp') {
      try {
        require.resolve('playwright');
        playwrightAvailable = true;
      } catch {
        playwrightAvailable = false;
      }
    }
    const chromiumAvailable = fs.existsSync(this.config.chromiumPath);
    return {
      preferredDriver: playwrightAvailable && this.config.browserDriver !== 'cdp' ? 'playwright' : 'cdp',
      chromiumAvailable,
      chromiumPath: this.config.chromiumPath,
    };
  }

  private async ensureSharedBrowser(): Promise<string> {
    if (this.sharedWsUrl && this.sharedProc && !this.sharedProc.killed) {
      return this.sharedWsUrl;
    }
    if (this.launchPromise) {
      return this.launchPromise;
    }

    this.launchPromise = (async () => {
      const port = this.sharedPort;
      const profileDir = path.join('/tmp', `dv-chr-pool-${Date.now()}-${port}`);
      fs.mkdirSync(profileDir, { recursive: true });
      const blankHtml = path.join(profileDir, 'blank.html');
      fs.writeFileSync(blankHtml, '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body></body></html>');

      const args = [
        '--headless=new',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-crash-reporter',
        '--disable-background-networking',
        '--disable-sync',
        '--hide-scrollbars',
        `--remote-debugging-port=${port}`,
        '--remote-allow-origins=*',
        `--user-data-dir=${profileDir}`,
        `--crash-dumps-dir=${profileDir}`,
        `file://${blankHtml}`,
      ];

      const proc = spawn(this.config.chromiumPath, args, {
        stdio: 'ignore',
        detached: true,
      });
      proc.unref();
      this.sharedProc = proc;
      this.sharedProfileDir = profileDir;

      for (let attempt = 0; attempt < 35; attempt++) {
        await new Promise((r) => setTimeout(r, 150));
        try {
          const targets = await this.fetchJsonList(port);
          const pageTarget = targets.find((t: any) => t.type === 'page' && t.webSocketDebuggerUrl);
          if (pageTarget && pageTarget.webSocketDebuggerUrl) {
            this.sharedWsUrl = pageTarget.webSocketDebuggerUrl;
            this.launchPromise = null;
            return pageTarget.webSocketDebuggerUrl as string;
          }
        } catch {}
      }

      this.launchPromise = null;
      throw new Error(`Không thể khởi tạo Chromium Headless trên cổng ${port}.`);
    })();

    return this.launchPromise;
  }

  private reapExpiredSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      const idle = now - session.lastActiveAt > this.config.sessionIdleTimeoutMs;
      const expired = now - session.createdAt > this.config.sessionMaxLifetimeMs;
      if (idle || expired) {
        this.sessions.delete(id);
        session.close().catch(() => {});
      }
    }
  }

  public async shutdownAll(): Promise<void> {
    clearInterval(this.cleanupTimer);
    const closing = Array.from(this.sessions.values()).map((s) => s.close().catch(() => {}));
    this.sessions.clear();
    await Promise.all(closing);

    if (this.sharedProc && this.sharedProc.pid) {
      try { execSync(`pkill -9 -P ${this.sharedProc.pid} 2>/dev/null || true`); } catch {}
      try { process.kill(-this.sharedProc.pid, 'SIGKILL'); } catch {}
      try { this.sharedProc.kill('SIGKILL'); } catch {}
    }
    if (this.sharedProfileDir) {
      try { execSync(`pkill -9 -f "${this.sharedProfileDir}" 2>/dev/null || true`); } catch {}
      try { fs.rmSync(this.sharedProfileDir, { recursive: true, force: true }); } catch {}
    }
    try { execSync('pkill -9 chrome_crashpad 2>/dev/null || true'); } catch {}
    this.sharedProc = null;
    this.sharedWsUrl = null;
  }

  public async createSession(
    init: BrowserSessionConfig,
    emitToClient: (msg: ServerToClientWsMessage) => void
  ): Promise<InteractiveBrowserSession> {
    this.reapExpiredSessions();
    if (this.sessions.size >= this.config.maxConcurrentSessions) {
      const oldest = Array.from(this.sessions.values()).sort((a, b) => a.lastActiveAt - b.lastActiveAt)[0];
      if (oldest) {
        this.sessions.delete(oldest.id);
        await oldest.close().catch(() => {});
      }
    }

    const sessionId = init.sessionId || crypto.randomUUID();
    const ssrf = await verifyUrlAndResolveDns(init.url, this.config, Boolean(init.tunnelId));
    if (!ssrf.valid || !ssrf.normalizedUrl) {
      throw new Error(ssrf.errorMessage || 'URL validation failed');
    }

    const session = await this.createCdpSession(sessionId, { ...init, url: ssrf.normalizedUrl }, emitToClient);
    this.sessions.set(sessionId, session);
    return session;
  }

  public async removeSession(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) {
      this.sessions.delete(sessionId);
      await s.close().catch(() => {});
    }
  }

  private async createCdpSession(
    sessionId: string,
    init: BrowserSessionConfig,
    emit: (msg: ServerToClientWsMessage) => void
  ): Promise<InteractiveBrowserSession> {
    const wsEndpoint = await this.ensureSharedBrowser();
    const rawWs = await connectRawWebSocket(wsEndpoint);
    const cdp = new CdpRpcClient(rawWs);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    let currentWidth = Math.max(200, Math.min(3840, Math.round(init.width)));
    let currentHeight = Math.max(200, Math.min(3840, Math.round(init.height)));
    let currentDpr = Math.max(1, Math.min(4, Number(init.dpr) || 2));
    let currentUa =
      init.userAgent ||
      'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1';
    let currentTouch = init.touchCapable ?? true;
    let currentUrl = init.url;
    let currentTitle = init.url;

    const applyEmulation = async () => {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: currentWidth,
        height: currentHeight,
        deviceScaleFactor: currentDpr,
        mobile: currentTouch,
      });
      await cdp.send('Emulation.setUserAgentOverride', {
        userAgent: currentUa,
      });
      await cdp.send('Emulation.setTouchEmulationEnabled', {
        enabled: currentTouch,
      });
    };

    await applyEmulation();

    cdp.on('Runtime.consoleAPICalled', (params: any) => {
      const text = (params.args || [])
        .map((a: any) => (a.value !== undefined ? String(a.value) : a.description || a.type))
        .join(' ');
      const levelRaw = String(params.type || 'log');
      const level: ConsoleLogEntry['level'] =
        levelRaw === 'warning'
          ? 'warn'
          : levelRaw === 'error' || levelRaw === 'info' || levelRaw === 'debug'
          ? levelRaw
          : 'log';
      const frame = params.stackTrace?.callFrames?.[0];
      const entry: ConsoleLogEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level,
        text,
        location: frame ? `${frame.url}:${frame.lineNumber + 1}` : undefined,
      };
      emit({ type: 'session:console', sessionId, entry });
    });

    cdp.on('Runtime.exceptionThrown', (params: any) => {
      const details = params.exceptionDetails || {};
      const message =
        details.exception?.description ||
        details.text ||
        'Uncaught JavaScript Error';
      const entry: JsErrorEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        message,
        source: details.url ? `${details.url}:${(details.lineNumber || 0) + 1}` : undefined,
      };
      emit({ type: 'session:jserror', sessionId, entry });
    });

    const networkTrack = new Map<string, { method: string; url: string; resourceType: string; startTime: number }>();
    cdp.on('Network.requestWillBeSent', (params: any) => {
      const reqUrl = String(params.request?.url || '');
      if (reqUrl.startsWith('data:') || reqUrl.startsWith('file:')) return;
      networkTrack.set(params.requestId, {
        method: params.request?.method || 'GET',
        url: reqUrl,
        resourceType: params.type || 'Other',
        startTime: Date.now(),
      });
    });

    cdp.on('Network.responseReceived', (params: any) => {
      const tracked = networkTrack.get(params.requestId);
      const reqUrl = tracked?.url || String(params.response?.url || '');
      if (!reqUrl || reqUrl.startsWith('data:') || reqUrl.startsWith('file:')) return;
      const entry: NetworkRequestEntry = {
        id: crypto.randomUUID(),
        requestId: params.requestId,
        timestamp: new Date().toISOString(),
        method: tracked?.method || 'GET',
        url: reqUrl,
        resourceType: params.type || tracked?.resourceType || 'Other',
        status: params.response?.status || 200,
        statusText: params.response?.statusText || '',
        mimeType: params.response?.mimeType || '',
        durationMs: tracked ? Date.now() - tracked.startTime : 0,
      };
      emit({ type: 'session:network', sessionId, entry });
    });

    let isCapturingFrame = false;
    let closed = false;

    const pushFrame = async () => {
      if (closed || isCapturingFrame) return;
      isCapturingFrame = true;
      try {
        const evalRes = await cdp.send('Runtime.evaluate', {
          expression: 'JSON.stringify({ title: document.title || "" })',
          returnByValue: true,
        });
        if (evalRes?.result?.value) {
          const meta = JSON.parse(evalRes.result.value);
          if (meta.title) currentTitle = meta.title;
        }
        const shot = await cdp.send('Page.captureScreenshot', {
          format: 'png',
        });
        if (shot?.data) {
          emit({
            type: 'session:frame',
            sessionId,
            dataUrl: `data:image/png;base64,${shot.data}`,
            url: currentUrl,
            title: currentTitle,
            timestamp: Date.now(),
            viewport: { width: currentWidth, height: currentHeight, dpr: currentDpr },
          });
        }
      } catch {
        // ignore transient frame error
      } finally {
        isCapturingFrame = false;
      }
    };

    const loadViaDocumentContent = async (urlToLoad: string) => {
      const tStart = Date.now();
      const html = await fetchHtmlWithInlinedLocalAssets(urlToLoad);
      const tree = await cdp.send('Page.getFrameTree');
      const frameId = tree?.frameTree?.frame?.id;
      if (frameId) {
        await cdp.send('Page.setDocumentContent', { frameId, html });
        emit({
          type: 'session:network',
          sessionId,
          entry: {
            id: crypto.randomUUID(),
            requestId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            method: 'GET',
            url: urlToLoad,
            resourceType: 'Document',
            status: 200,
            statusText: 'OK',
            mimeType: 'text/html',
            durationMs: Date.now() - tStart,
          },
        });
      }
    };

    const navigateTo = async (targetUrl: string) => {
      const check = await verifyUrlAndResolveDns(targetUrl, this.config, Boolean(init.tunnelId));
      if (!check.valid || !check.normalizedUrl) {
        emit({
          type: 'session:error',
          sessionId,
          code: check.errorCode,
          message: check.errorMessage || 'Blocked by SSRF Guard',
        });
        return;
      }
      currentUrl = check.normalizedUrl;

      if (IS_MANAGED_BLOCKLIST_ENV) {
        await loadViaDocumentContent(currentUrl);
      } else {
        const navRes = await cdp.send('Page.navigate', { url: currentUrl }, this.config.navigationTimeoutMs);
        if (navRes && navRes.errorText === 'net::ERR_BLOCKED_BY_ADMINISTRATOR') {
          await loadViaDocumentContent(currentUrl);
        }
      }

      await pushFrame();
    };

    await navigateTo(init.url);

    const frameInterval = setInterval(() => {
      pushFrame().catch(() => {});
    }, 1500);
    frameInterval.unref();

    const sessionObj: InteractiveBrowserSession = {
      id: sessionId,
      driver: 'cdp',
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      currentUrl,
      title: currentTitle,
      width: currentWidth,
      height: currentHeight,
      dpr: currentDpr,
      userAgent: currentUa,
      touchCapable: currentTouch,

      navigate: async (url: string) => {
        sessionObj.lastActiveAt = Date.now();
        await navigateTo(url);
        sessionObj.currentUrl = currentUrl;
        sessionObj.title = currentTitle;
      },

      resize: async (width: number, height: number, dpr: number, userAgent?: string, touchCapable?: boolean) => {
        sessionObj.lastActiveAt = Date.now();
        currentWidth = Math.max(200, Math.min(3840, Math.round(width)));
        currentHeight = Math.max(200, Math.min(3840, Math.round(height)));
        currentDpr = Math.max(1, Math.min(4, Number(dpr) || 2));
        if (userAgent) currentUa = userAgent;
        if (typeof touchCapable === 'boolean') currentTouch = touchCapable;
        sessionObj.width = currentWidth;
        sessionObj.height = currentHeight;
        sessionObj.dpr = currentDpr;
        await applyEmulation();
        await pushFrame();
      },

      reload: async () => {
        sessionObj.lastActiveAt = Date.now();
        await navigateTo(currentUrl);
      },

      dispatchMouse: async (action, x, y, button = 'left') => {
        sessionObj.lastActiveAt = Date.now();
        const clampedX = Math.max(0, Math.min(currentWidth, Math.round(x)));
        const clampedY = Math.max(0, Math.min(currentHeight, Math.round(y)));
        if (action === 'click') {
          await cdp.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: clampedX,
            y: clampedY,
            button,
            clickCount: 1,
          });
          await cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: clampedX,
            y: clampedY,
            button,
            clickCount: 1,
          });
          await pushFrame();
        } else if (action === 'move') {
          await cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: clampedX,
            y: clampedY,
          });
        } else if (action === 'down') {
          await cdp.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: clampedX,
            y: clampedY,
            button,
            clickCount: 1,
          });
        } else if (action === 'up') {
          await cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: clampedX,
            y: clampedY,
            button,
            clickCount: 1,
          });
          await pushFrame();
        }
      },

      dispatchWheel: async (x, y, deltaX, deltaY) => {
        sessionObj.lastActiveAt = Date.now();
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: Math.round(x),
          y: Math.round(y),
          deltaX: Math.round(deltaX),
          deltaY: Math.round(deltaY),
        });
        await pushFrame();
      },

      dispatchKey: async (action, text, key) => {
        sessionObj.lastActiveAt = Date.now();
        if (action === 'type' && text) {
          await cdp.send('Input.insertText', { text });
        } else if (key) {
          await cdp.send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key,
            text: key.length === 1 ? key : undefined,
          });
          await cdp.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key,
          });
        }
        await pushFrame();
      },

      captureScreenshot: async (fullPage = false) => {
        sessionObj.lastActiveAt = Date.now();
        let clipWidth = currentWidth;
        let clipHeight = currentHeight;
        if (fullPage) {
          try {
            const metrics = await cdp.send('Page.getLayoutMetrics');
            const contentSize = metrics?.cssContentSize || metrics?.contentSize;
            if (contentSize && contentSize.height > currentHeight) {
              clipHeight = Math.min(8000, Math.ceil(contentSize.height));
            }
          } catch {}
        }
        const shot = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: fullPage,
          clip: fullPage
            ? { x: 0, y: 0, width: clipWidth, height: clipHeight, scale: 1 }
            : undefined,
        });
        return {
          dataUrl: `data:image/png;base64,${shot.data}`,
          width: clipWidth * currentDpr,
          height: clipHeight * currentDpr,
        };
      },

      close: async () => {
        if (closed) return;
        closed = true;
        clearInterval(frameInterval);
        cdp.close();
      },
    };

    emit({
      type: 'session:ready',
      sessionId,
      driver: 'cdp',
      url: currentUrl,
      title: currentTitle,
      width: currentWidth,
      height: currentHeight,
      dpr: currentDpr,
    });

    return sessionObj;
  }

  private fetchJsonList(port: number): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/json/list`, { timeout: 1000 }, (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('timeout')));
    });
  }
}
