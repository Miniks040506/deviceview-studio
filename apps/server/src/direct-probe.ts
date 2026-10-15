import http from 'http';
import https from 'https';
import type { ProbeResult, RestrictionReasonCode } from '@deviceview/shared';
import type { ServerConfig } from './config';
import { verifyUrlAndResolveDns } from './ssrf-guard';
import type { TunnelHub } from './tunnel-hub';

export function analyzeEmbeddingHeaders(
  headers: Record<string, string | string[] | undefined>,
  statusCode: number,
  bodySnippet: string = ''
): {
  embeddableInIframe: boolean;
  restrictionCode: RestrictionReasonCode;
  restrictionMessage: string | null;
  xFrameOptions: string | null;
  contentSecurityPolicy: string | null;
  frameAncestorsDirective: string | null;
} {
  const xfoRaw = headers['x-frame-options'];
  const xfo = Array.isArray(xfoRaw) ? xfoRaw.join(', ') : xfoRaw || null;

  const cspRaw = headers['content-security-policy'];
  const csp = Array.isArray(cspRaw) ? cspRaw.join('; ') : cspRaw || null;

  let frameAncestorsDirective: string | null = null;
  if (csp) {
    const directives = csp.split(';').map((d) => d.trim());
    const fa = directives.find((d) => d.toLowerCase().startsWith('frame-ancestors'));
    if (fa) {
      frameAncestorsDirective = fa;
    }
  }

  // Check CAPTCHA or Bot Challenge indicators in HTML or Status
  const lowerBody = bodySnippet.toLowerCase();
  if (
    lowerBody.includes('cf-chl-bypass') ||
    lowerBody.includes('challenge-platform') ||
    lowerBody.includes('g-recaptcha') && lowerBody.includes('unusual traffic') ||
    lowerBody.includes('verify you are human')
  ) {
    return {
      embeddableInIframe: false,
      restrictionCode: 'CAPTCHA_CHALLENGE',
      restrictionMessage:
        'Website này đang yêu cầu xác thực CAPTCHA / chống bot (Cloudflare Turnstile / reCAPTCHA). Theo chính sách bảo mật, DeviceView Studio không tự động vượt CAPTCHA.',
      xFrameOptions: xfo,
      contentSecurityPolicy: csp,
      frameAncestorsDirective,
    };
  }

  if (
    lowerBody.includes('drm-protected') ||
    lowerBody.includes('widevine') && lowerBody.includes('encryptedmedia')
  ) {
    return {
      embeddableInIframe: false,
      restrictionCode: 'DRM_PROTECTED',
      restrictionMessage:
        'Nội dung website sử dụng bảo vệ bản quyền DRM (Widevine/EME) không hỗ trợ phát lại qua trình duyệt mô phỏng.',
      xFrameOptions: xfo,
      contentSecurityPolicy: csp,
      frameAncestorsDirective,
    };
  }

  if (statusCode === 401 || statusCode === 407) {
    return {
      embeddableInIframe: false,
      restrictionCode: 'AUTH_REQUIRED',
      restrictionMessage:
        'Website yêu cầu xác thực HTTP (401/407) hoặc đăng nhập phiên làm việc riêng tư. Khuyến nghị sử dụng Browser Mode để tương tác trực tiếp.',
      xFrameOptions: xfo,
      contentSecurityPolicy: csp,
      frameAncestorsDirective,
    };
  }

  // CSP frame-ancestors takes precedence in modern browsers
  if (frameAncestorsDirective) {
    const val = frameAncestorsDirective.replace(/^frame-ancestors\s+/i, '').trim().toLowerCase();
    if (val.includes("'none'")) {
      return {
        embeddableInIframe: false,
        restrictionCode: 'CSP_FRAME_ANCESTORS_BLOCKED',
        restrictionMessage: `Website chặn nhúng iframe qua header Content-Security-Policy (${frameAncestorsDirective}). Hãy chuyển sang Browser Mode (Playwright/Chromium) để xem và tương tác.`,
        xFrameOptions: xfo,
        contentSecurityPolicy: csp,
        frameAncestorsDirective,
      };
    }
    if (!val.includes('*') && !val.includes('http:') && !val.includes('https:')) {
      return {
        embeddableInIframe: false,
        restrictionCode: 'CSP_FRAME_ANCESTORS_BLOCKED',
        restrictionMessage: `Website giới hạn nguồn nhúng qua Content-Security-Policy (${frameAncestorsDirective}). Hãy sử dụng Browser Mode để mở trực tiếp.`,
        xFrameOptions: xfo,
        contentSecurityPolicy: csp,
        frameAncestorsDirective,
      };
    }
  }

  // X-Frame-Options check
  if (xfo) {
    const upper = xfo.toUpperCase();
    if (upper.includes('DENY')) {
      return {
        embeddableInIframe: false,
        restrictionCode: 'X_FRAME_OPTIONS_DENY',
        restrictionMessage: `Website trả về header X-Frame-Options: ${xfo} không cho phép hiển thị trong iframe. Đã tự động đề xuất Browser Mode.`,
        xFrameOptions: xfo,
        contentSecurityPolicy: csp,
        frameAncestorsDirective,
      };
    }
    if (upper.includes('SAMEORIGIN')) {
      return {
        embeddableInIframe: false,
        restrictionCode: 'X_FRAME_OPTIONS_SAMEORIGIN',
        restrictionMessage: `Website trả về header X-Frame-Options: ${xfo} (chỉ cho phép nhúng cùng tên miền). Đã tự động đề xuất Browser Mode.`,
        xFrameOptions: xfo,
        contentSecurityPolicy: csp,
        frameAncestorsDirective,
      };
    }
  }

  return {
    embeddableInIframe: true,
    restrictionCode: 'NONE',
    restrictionMessage: null,
    xFrameOptions: xfo,
    contentSecurityPolicy: csp,
    frameAncestorsDirective,
  };
}

export async function probeWebsiteUrl(
  rawUrl: string,
  config: ServerConfig,
  tunnelHub?: TunnelHub,
  tunnelId?: string
): Promise<ProbeResult> {
  const hasTunnel = Boolean(tunnelHub && tunnelHub.hasActiveTunnel(tunnelId));
  const check = await verifyUrlAndResolveDns(rawUrl, config, hasTunnel);

  if (!check.valid || !check.normalizedUrl) {
    const restrictionCode: RestrictionReasonCode =
      check.errorCode === 'LOCALHOST_REQUIRES_TUNNEL'
        ? 'LOCALHOST_CLOUD_TUNNEL_REQUIRED'
        : 'SSRF_BLOCKED';
    return {
      requestedUrl: rawUrl,
      normalizedUrl: check.normalizedUrl || rawUrl,
      finalUrl: check.normalizedUrl || rawUrl,
      reachable: false,
      statusCode: null,
      embeddableInIframe: false,
      recommendedEngine: 'browser',
      restrictionCode,
      restrictionMessage: check.errorMessage,
      headers: {
        xFrameOptions: null,
        contentSecurityPolicy: null,
        frameAncestorsDirective: null,
        contentType: null,
        server: null,
      },
      isLocalhost: check.isLocalhost,
      viaCompanionTunnel: false,
      checkedAt: new Date().toISOString(),
    };
  }

  // If localhost in cloud mode with an active companion tunnel, probe through the tunnel
  if (check.isLocalhost && config.deploymentMode === 'cloud' && tunnelHub && hasTunnel) {
    try {
      const tunResp = await tunnelHub.proxyHttpRequest(tunnelId, {
        method: 'GET',
        url: check.normalizedUrl,
        headers: { 'User-Agent': 'DeviceViewStudio-Probe/1.0' },
      });
      const analysis = analyzeEmbeddingHeaders(
        tunResp.headers,
        tunResp.statusCode,
        tunResp.body.toString('utf8').slice(0, 4096)
      );
      return {
        requestedUrl: rawUrl,
        normalizedUrl: check.normalizedUrl,
        finalUrl: `/api/tunnel/${tunResp.tunnelId}/proxy?url=${encodeURIComponent(check.normalizedUrl)}`,
        reachable: true,
        statusCode: tunResp.statusCode,
        embeddableInIframe: analysis.embeddableInIframe,
        recommendedEngine: analysis.embeddableInIframe ? 'direct' : 'browser',
        restrictionCode: analysis.restrictionCode,
        restrictionMessage: analysis.restrictionMessage,
        headers: {
          xFrameOptions: analysis.xFrameOptions,
          contentSecurityPolicy: analysis.contentSecurityPolicy,
          frameAncestorsDirective: analysis.frameAncestorsDirective,
          contentType: (tunResp.headers['content-type'] as string) || null,
          server: (tunResp.headers['server'] as string) || null,
        },
        isLocalhost: true,
        viaCompanionTunnel: true,
        checkedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      return {
        requestedUrl: rawUrl,
        normalizedUrl: check.normalizedUrl,
        finalUrl: check.normalizedUrl,
        reachable: false,
        statusCode: null,
        embeddableInIframe: false,
        recommendedEngine: 'browser',
        restrictionCode: 'NETWORK_UNREACHABLE',
        restrictionMessage: `Không thể kết nối tới localhost qua Companion Tunnel: ${(err as Error).message}`,
        headers: {
          xFrameOptions: null,
          contentSecurityPolicy: null,
          frameAncestorsDirective: null,
          contentType: null,
          server: null,
        },
        isLocalhost: true,
        viaCompanionTunnel: true,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  // Standard HTTP/HTTPS probe with up to 4 redirects
  let currentUrl = check.normalizedUrl;
  for (let hop = 0; hop < 5; hop++) {
    const hopCheck = await verifyUrlAndResolveDns(currentUrl, config, hasTunnel);
    if (!hopCheck.valid || !hopCheck.normalizedUrl) {
      return {
        requestedUrl: rawUrl,
        normalizedUrl: check.normalizedUrl,
        finalUrl: currentUrl,
        reachable: false,
        statusCode: null,
        embeddableInIframe: false,
        recommendedEngine: 'browser',
        restrictionCode: 'SSRF_BLOCKED',
        restrictionMessage: hopCheck.errorMessage,
        headers: {
          xFrameOptions: null,
          contentSecurityPolicy: null,
          frameAncestorsDirective: null,
          contentType: null,
          server: null,
        },
        isLocalhost: hopCheck.isLocalhost,
        viaCompanionTunnel: false,
        checkedAt: new Date().toISOString(),
      };
    }

    try {
      const response = await performSingleHttpGet(currentUrl, 6000);
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        const loc = Array.isArray(response.headers.location)
          ? response.headers.location[0]
          : response.headers.location;
        currentUrl = new URL(loc, currentUrl).toString();
        continue;
      }

      const analysis = analyzeEmbeddingHeaders(
        response.headers,
        response.statusCode,
        response.bodySnippet
      );

      return {
        requestedUrl: rawUrl,
        normalizedUrl: check.normalizedUrl,
        finalUrl: currentUrl,
        reachable: true,
        statusCode: response.statusCode,
        embeddableInIframe: analysis.embeddableInIframe,
        recommendedEngine: analysis.embeddableInIframe ? 'direct' : 'browser',
        restrictionCode: analysis.restrictionCode,
        restrictionMessage: analysis.restrictionMessage,
        headers: {
          xFrameOptions: analysis.xFrameOptions,
          contentSecurityPolicy: analysis.contentSecurityPolicy,
          frameAncestorsDirective: analysis.frameAncestorsDirective,
          contentType: (response.headers['content-type'] as string) || null,
          server: (response.headers['server'] as string) || null,
        },
        isLocalhost: check.isLocalhost,
        viaCompanionTunnel: false,
        checkedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Network error';
      const isTimeout = msg.toLowerCase().includes('timeout');
      return {
        requestedUrl: rawUrl,
        normalizedUrl: check.normalizedUrl,
        finalUrl: currentUrl,
        reachable: false,
        statusCode: null,
        embeddableInIframe: false,
        recommendedEngine: 'browser',
        restrictionCode: isTimeout ? 'TIMEOUT' : 'NETWORK_UNREACHABLE',
        restrictionMessage: `Không thể kết nối tới "${currentUrl}": ${msg}. Nếu bạn đang chạy môi trường không có Internet ra ngoài, hãy thử URL localhost hoặc trang Demo tích hợp sẵn.`,
        headers: {
          xFrameOptions: null,
          contentSecurityPolicy: null,
          frameAncestorsDirective: null,
          contentType: null,
          server: null,
        },
        isLocalhost: check.isLocalhost,
        viaCompanionTunnel: false,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  return {
    requestedUrl: rawUrl,
    normalizedUrl: check.normalizedUrl,
    finalUrl: currentUrl,
    reachable: false,
    statusCode: null,
    embeddableInIframe: false,
    recommendedEngine: 'browser',
    restrictionCode: 'NETWORK_UNREACHABLE',
    restrictionMessage: 'Quá nhiều lần chuyển hướng HTTP (Redirect loop).',
    headers: {
      xFrameOptions: null,
      contentSecurityPolicy: null,
      frameAncestorsDirective: null,
      contentType: null,
      server: null,
    },
    isLocalhost: check.isLocalhost,
    viaCompanionTunnel: false,
    checkedAt: new Date().toISOString(),
  };
}

async function performSingleHttpGet(
  targetUrl: string,
  timeoutMs: number
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  bodySnippet: string;
}> {
  try {
    return await performRawHttpGet(targetUrl, timeoutMs);
  } catch (err: unknown) {
    const parsed = new URL(targetUrl);
    if (parsed.hostname.toLowerCase() === 'localhost') {
      parsed.hostname = '127.0.0.1';
      return await performRawHttpGet(parsed.toString(), timeoutMs);
    }
    throw err;
  }
}

function performRawHttpGet(
  targetUrl: string,
  timeoutMs: number
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  bodySnippet: string;
}> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      targetUrl,
      {
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) DeviceViewStudio/1.0',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          if (bytes < 8192) {
            chunks.push(chunk);
            bytes += chunk.length;
          } else {
            req.destroy();
          }
        });
        const finish = () => {
          resolve({
            statusCode: res.statusCode || 200,
            headers: res.headers,
            bodySnippet: Buffer.concat(chunks).toString('utf8', 0, 4096),
          });
        };
        res.on('end', finish);
        res.on('close', finish);
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Timeout after ${timeoutMs}ms`));
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}
