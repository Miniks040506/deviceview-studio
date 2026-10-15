import fs from 'fs';

export interface ServerConfig {
  port: number;
  host: string;
  corsOrigin: string;
  deploymentMode: 'local' | 'cloud';
  allowedHosts: string[];
  browserDriver: 'auto' | 'playwright' | 'cdp';
  chromiumPath: string;
  maxConcurrentSessions: number;
  sessionIdleTimeoutMs: number;
  sessionMaxLifetimeMs: number;
  navigationTimeoutMs: number;
  screenshotFps: number;
  companionAuthSecret: string;
}

function detectChromiumExecutable(): string {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/usr/lib/chromium/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  return '/usr/bin/chromium';
}

export function loadServerConfig(): ServerConfig {
  const modeRaw = (process.env.DEPLOYMENT_MODE || 'local').toLowerCase();
  const deploymentMode: 'local' | 'cloud' = modeRaw === 'cloud' ? 'cloud' : 'local';

  const driverRaw = (process.env.BROWSER_DRIVER || 'auto').toLowerCase();
  const browserDriver: 'auto' | 'playwright' | 'cdp' =
    driverRaw === 'playwright' ? 'playwright' : driverRaw === 'cdp' ? 'cdp' : 'auto';

  const allowedHosts = (process.env.ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    port: Number(process.env.PORT || 4000),
    host: process.env.HOST || '0.0.0.0',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    deploymentMode,
    allowedHosts,
    browserDriver,
    chromiumPath: detectChromiumExecutable(),
    maxConcurrentSessions: Math.max(1, Number(process.env.MAX_CONCURRENT_SESSIONS || 6)),
    sessionIdleTimeoutMs: Math.max(15000, Number(process.env.SESSION_IDLE_TIMEOUT_MS || 300000)),
    sessionMaxLifetimeMs: Math.max(60000, Number(process.env.SESSION_MAX_LIFETIME_MS || 1800000)),
    navigationTimeoutMs: Math.max(3000, Number(process.env.NAVIGATION_TIMEOUT_MS || 20000)),
    screenshotFps: Math.min(10, Math.max(1, Number(process.env.SCREENSHOT_FPS || 3))),
    companionAuthSecret: process.env.COMPANION_AUTH_SECRET || 'dev-companion-secret',
  };
}
