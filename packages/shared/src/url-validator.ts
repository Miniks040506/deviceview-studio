export interface UrlValidationOptions {
  deploymentMode: 'local' | 'cloud';
  allowedHosts?: string[];
  hasActiveCompanionTunnel?: boolean;
}

export interface UrlValidationResult {
  valid: boolean;
  normalizedUrl: string | null;
  hostname: string | null;
  port: number | null;
  isLocalhost: boolean;
  isPrivateIp: boolean;
  isMetadataEndpoint: boolean;
  requiresCompanionTunnel: boolean;
  errorCode:
    | 'NONE'
    | 'EMPTY_URL'
    | 'INVALID_FORMAT'
    | 'UNSUPPORTED_PROTOCOL'
    | 'SSRF_METADATA_BLOCKED'
    | 'SSRF_PRIVATE_IP_BLOCKED'
    | 'LOCALHOST_REQUIRES_TUNNEL';
  errorMessage: string | null;
}

const COMMON_LOCAL_PORTS = new Set(['3000', '5173', '8080', '4200', '8000', '8888', '4000', '5000', '9000']);

const METADATA_IPS_AND_HOSTS = new Set([
  '169.254.169.254',
  '169.254.170.2',
  '100.100.100.200',
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
  'instance-data',
]);

export function isLocalhostHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === '0.0.0.0' ||
    lower.endsWith('.localhost')
  );
}

export function isMetadataHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (METADATA_IPS_AND_HOSTS.has(lower)) return true;
  if (lower.startsWith('169.254.')) return true;
  if (lower === 'fd00:ec2::254') return true;
  return false;
}

export function isPrivateOrInternalIp(hostname: string): boolean {
  const clean = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isLocalhostHost(clean) || isMetadataHost(clean)) return true;

  // IPv6 private/link-local
  if (clean.includes(':')) {
    if (clean.startsWith('fc') || clean.startsWith('fd') || clean.startsWith('fe80:')) {
      return true;
    }
    if (clean.startsWith('::ffff:')) {
      const mapped = clean.slice('::ffff:'.length);
      return isPrivateOrInternalIp(mapped);
    }
  }

  // IPv4 check
  const ipv4Match = clean.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) {
    // Check internal single-label hostnames (except localhost handled above)
    if (!clean.includes('.')) return true;
    if (clean.endsWith('.internal') || clean.endsWith('.local') || clean.endsWith('.corp') || clean.endsWith('.lan')) {
      return true;
    }
    return false;
  }

  const octets = [
    Number(ipv4Match[1]),
    Number(ipv4Match[2]),
    Number(ipv4Match[3]),
    Number(ipv4Match[4]),
  ];
  if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
    return true;
  }

  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / Tailscale
  return false;
}

export function normalizeInputUrl(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';

  // Already has protocol
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return trimmed;
  }

  // Check if starts with localhost, 127.0.0.1, or IP:port -> default to http://
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('localhost') ||
    lower.startsWith('127.0.0.1') ||
    lower.startsWith('[::1]') ||
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?/.test(lower)
  ) {
    return `http://${trimmed}`;
  }

  // Check if host:port with common local dev port
  const portMatch = trimmed.match(/^([a-zA-Z0-9.-]+):(\d+)(\/.*)?$/);
  if (portMatch && COMMON_LOCAL_PORTS.has(portMatch[2])) {
    return `http://${trimmed}`;
  }

  return `https://${trimmed}`;
}

export function validateTargetUrl(
  rawInput: string,
  options: UrlValidationOptions = { deploymentMode: 'local' }
): UrlValidationResult {
  const normalized = normalizeInputUrl(rawInput);
  if (!normalized) {
    return {
      valid: false,
      normalizedUrl: null,
      hostname: null,
      port: null,
      isLocalhost: false,
      isPrivateIp: false,
      isMetadataEndpoint: false,
      requiresCompanionTunnel: false,
      errorCode: 'EMPTY_URL',
      errorMessage: 'Vui lòng nhập địa chỉ URL website hoặc localhost (ví dụ: https://example.com hoặc localhost:3000).',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return {
      valid: false,
      normalizedUrl: null,
      hostname: null,
      port: null,
      isLocalhost: false,
      isPrivateIp: false,
      isMetadataEndpoint: false,
      requiresCompanionTunnel: false,
      errorCode: 'INVALID_FORMAT',
      errorMessage: `Địa chỉ URL không hợp lệ: "${rawInput}".`,
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      normalizedUrl: null,
      hostname: null,
      port: null,
      isLocalhost: false,
      isPrivateIp: false,
      isMetadataEndpoint: false,
      requiresCompanionTunnel: false,
      errorCode: 'UNSUPPORTED_PROTOCOL',
      errorMessage: `Chỉ hỗ trợ giao thức HTTP và HTTPS (nhận được "${parsed.protocol}").`,
    };
  }

  const hostname = parsed.hostname;
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
  const isMeta = isMetadataHost(hostname);
  const isLocal = isLocalhostHost(hostname);
  const isPriv = isPrivateOrInternalIp(hostname);

  // Always block cloud metadata endpoints in ALL modes
  if (isMeta) {
    return {
      valid: false,
      normalizedUrl: parsed.toString(),
      hostname,
      port,
      isLocalhost: false,
      isPrivateIp: true,
      isMetadataEndpoint: true,
      requiresCompanionTunnel: false,
      errorCode: 'SSRF_METADATA_BLOCKED',
      errorMessage: 'Truy cập tới Cloud Metadata / Link-Local endpoint (169.254.169.254) bị chặn tuyệt đối để bảo vệ chống SSRF.',
    };
  }

  const allowedSet = new Set((options.allowedHosts || []).map((h) => h.toLowerCase().trim()).filter(Boolean));
  const explicitlyAllowed = allowedSet.has(hostname.toLowerCase()) || allowedSet.has(`${hostname.toLowerCase()}:${port}`);

  if (options.deploymentMode === 'cloud') {
    if (isLocal) {
      if (options.hasActiveCompanionTunnel) {
        return {
          valid: true,
          normalizedUrl: parsed.toString(),
          hostname,
          port,
          isLocalhost: true,
          isPrivateIp: true,
          isMetadataEndpoint: false,
          requiresCompanionTunnel: true,
          errorCode: 'NONE',
          errorMessage: null,
        };
      }
      return {
        valid: false,
        normalizedUrl: parsed.toString(),
        hostname,
        port,
        isLocalhost: true,
        isPrivateIp: true,
        isMetadataEndpoint: false,
        requiresCompanionTunnel: true,
        errorCode: 'LOCALHOST_REQUIRES_TUNNEL',
        errorMessage:
          'Khi chạy trên Cloud, vui lòng khởi chạy Local Companion Agent (`npm run companion -- --port ' +
          port +
          '`) để kết nối an toàn tới localhost trên máy của bạn.',
      };
    }

    if (isPriv && !explicitlyAllowed) {
      return {
        valid: false,
        normalizedUrl: parsed.toString(),
        hostname,
        port,
        isLocalhost: false,
        isPrivateIp: true,
        isMetadataEndpoint: false,
        requiresCompanionTunnel: false,
        errorCode: 'SSRF_PRIVATE_IP_BLOCKED',
        errorMessage: `Truy cập tới địa chỉ mạng nội bộ (${hostname}) bị từ chối trong chế độ Cloud để ngăn chặn tấn công SSRF.`,
      };
    }
  }

  return {
    valid: true,
    normalizedUrl: parsed.toString(),
    hostname,
    port,
    isLocalhost: isLocal,
    isPrivateIp: isPriv,
    isMetadataEndpoint: false,
    requiresCompanionTunnel: false,
    errorCode: 'NONE',
    errorMessage: null,
  };
}
