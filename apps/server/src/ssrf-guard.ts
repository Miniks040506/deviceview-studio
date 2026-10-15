import dns from 'dns';
import {
  isLocalhostHost,
  isMetadataHost,
  isPrivateOrInternalIp,
  validateTargetUrl,
  type UrlValidationResult,
} from '@deviceview/shared';
import type { ServerConfig } from './config';

export interface SsrfCheckResult extends UrlValidationResult {
  resolvedAddresses: string[];
}

export async function verifyUrlAndResolveDns(
  rawUrl: string,
  config: ServerConfig,
  hasActiveCompanionTunnel: boolean = false
): Promise<SsrfCheckResult> {
  const staticCheck = validateTargetUrl(rawUrl, {
    deploymentMode: config.deploymentMode,
    allowedHosts: config.allowedHosts,
    hasActiveCompanionTunnel,
  });

  if (!staticCheck.valid || !staticCheck.hostname) {
    return {
      ...staticCheck,
      resolvedAddresses: [],
    };
  }

  // If localhost with active companion tunnel or local deployment mode, allow localhost
  if (isLocalhostHost(staticCheck.hostname)) {
    return {
      ...staticCheck,
      resolvedAddresses: ['127.0.0.1'],
    };
  }

  const allowedSet = new Set(config.allowedHosts.map((h) => h.toLowerCase()));
  const explicitlyAllowed =
    allowedSet.has(staticCheck.hostname.toLowerCase()) ||
    allowedSet.has(`${staticCheck.hostname.toLowerCase()}:${staticCheck.port}`);

  try {
    const records = await dns.promises.lookup(staticCheck.hostname, { all: true });
    const addresses = records.map((r) => r.address);

    for (const addr of addresses) {
      if (isMetadataHost(addr)) {
        return {
          ...staticCheck,
          valid: false,
          isMetadataEndpoint: true,
          errorCode: 'SSRF_METADATA_BLOCKED',
          errorMessage: `Tên miền "${staticCheck.hostname}" phân giải về địa chỉ Cloud Metadata (${addr}) — bị chặn để chống DNS Rebinding / SSRF.`,
          resolvedAddresses: addresses,
        };
      }
      if (config.deploymentMode === 'cloud' && isPrivateOrInternalIp(addr) && !explicitlyAllowed) {
        return {
          ...staticCheck,
          valid: false,
          isPrivateIp: true,
          errorCode: 'SSRF_PRIVATE_IP_BLOCKED',
          errorMessage: `Tên miền "${staticCheck.hostname}" phân giải về địa chỉ mạng nội bộ (${addr}) — bị từ chối trong chế độ Cloud.`,
          resolvedAddresses: addresses,
        };
      }
    }

    return {
      ...staticCheck,
      resolvedAddresses: addresses,
    };
  } catch {
    // DNS lookup may fail if offline or unreachable; return static validation so probe/browser can report network error cleanly
    return {
      ...staticCheck,
      resolvedAddresses: [],
    };
  }
}
