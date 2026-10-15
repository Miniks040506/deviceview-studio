import assert from 'assert';
import {
  isLocalhostHost,
  isMetadataHost,
  isPrivateOrInternalIp,
  normalizeInputUrl,
  validateTargetUrl,
} from '@deviceview/shared';

export function runUrlValidatorTests(): number {
  let passed = 0;

  // 1. URL Normalization
  assert.strictEqual(normalizeInputUrl('example.com'), 'https://example.com');
  assert.strictEqual(normalizeInputUrl('localhost:3000'), 'http://localhost:3000');
  assert.strictEqual(normalizeInputUrl('localhost:5173/app'), 'http://localhost:5173/app');
  assert.strictEqual(normalizeInputUrl('127.0.0.1:8080'), 'http://127.0.0.1:8080');
  assert.strictEqual(normalizeInputUrl('https://vercel.com/docs'), 'https://vercel.com/docs');
  passed++;

  // 2. Localhost & Metadata detection
  assert.strictEqual(isLocalhostHost('localhost'), true);
  assert.strictEqual(isLocalhostHost('127.0.0.1'), true);
  assert.strictEqual(isLocalhostHost('::1'), true);
  assert.strictEqual(isLocalhostHost('google.com'), false);
  assert.strictEqual(isMetadataHost('169.254.169.254'), true);
  assert.strictEqual(isMetadataHost('metadata.google.internal'), true);
  passed++;

  // 3. Private IP detection
  assert.strictEqual(isPrivateOrInternalIp('10.0.0.1'), true);
  assert.strictEqual(isPrivateOrInternalIp('172.16.5.4'), true);
  assert.strictEqual(isPrivateOrInternalIp('192.168.1.100'), true);
  assert.strictEqual(isPrivateOrInternalIp('8.8.8.8'), false);
  passed++;

  // 4. SSRF Metadata blocking in BOTH local and cloud modes
  const metaLocal = validateTargetUrl('http://169.254.169.254/latest/meta-data/', { deploymentMode: 'local' });
  assert.strictEqual(metaLocal.valid, false);
  assert.strictEqual(metaLocal.errorCode, 'SSRF_METADATA_BLOCKED');

  const metaCloud = validateTargetUrl('http://169.254.169.254/computeMetadata/v1/', { deploymentMode: 'cloud' });
  assert.strictEqual(metaCloud.valid, false);
  assert.strictEqual(metaCloud.errorCode, 'SSRF_METADATA_BLOCKED');
  passed++;

  // 5. Localhost allowed in local mode, requires Companion Tunnel in cloud mode
  const localDev = validateTargetUrl('localhost:3000', { deploymentMode: 'local' });
  assert.strictEqual(localDev.valid, true);
  assert.strictEqual(localDev.isLocalhost, true);

  const cloudNoTunnel = validateTargetUrl('localhost:5173', {
    deploymentMode: 'cloud',
    hasActiveCompanionTunnel: false,
  });
  assert.strictEqual(cloudNoTunnel.valid, false);
  assert.strictEqual(cloudNoTunnel.errorCode, 'LOCALHOST_REQUIRES_TUNNEL');

  const cloudWithTunnel = validateTargetUrl('localhost:5173', {
    deploymentMode: 'cloud',
    hasActiveCompanionTunnel: true,
  });
  assert.strictEqual(cloudWithTunnel.valid, true);
  assert.strictEqual(cloudWithTunnel.requiresCompanionTunnel, true);
  passed++;

  // 6. Private RFC1918 IP blocked in cloud mode unless explicitly allowed
  const privCloud = validateTargetUrl('http://192.168.1.50:8080', { deploymentMode: 'cloud' });
  assert.strictEqual(privCloud.valid, false);
  assert.strictEqual(privCloud.errorCode, 'SSRF_PRIVATE_IP_BLOCKED');

  const privAllowed = validateTargetUrl('http://192.168.1.50:8080', {
    deploymentMode: 'cloud',
    allowedHosts: ['192.168.1.50:8080'],
  });
  assert.strictEqual(privAllowed.valid, true);
  passed++;

  return passed;
}
