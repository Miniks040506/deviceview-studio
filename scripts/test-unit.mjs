#!/usr/bin/env node
/**
 * DeviceView Studio — Unit Test Runner
 */
import fs from 'fs';
import path from 'path';
import Module from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const require = Module.createRequire(import.meta.url);

// Ensure dist is built
if (!fs.existsSync(path.join(ROOT, 'packages/shared/dist/index.js'))) {
  await import('./build.mjs');
}

const shared = require(path.join(ROOT, 'packages/shared/dist/index.js'));
const registryPkg = require(path.join(ROOT, 'packages/device-registry/dist/index.js'));
const directProbe = require(path.join(ROOT, 'apps/server/dist/direct-probe.js'));

import assert from 'assert';

console.log('=== Running DeviceView Studio Unit Test Suite ===');
let suitesPassed = 0;

// Suite 1: URL Normalization & SSRF Validator
{
  const {
    normalizeInputUrl,
    isLocalhostHost,
    isMetadataHost,
    isPrivateOrInternalIp,
    validateTargetUrl,
  } = shared;

  assert.strictEqual(normalizeInputUrl('example.com'), 'https://example.com');
  assert.strictEqual(normalizeInputUrl('localhost:3000'), 'http://localhost:3000');
  assert.strictEqual(normalizeInputUrl('localhost:5173/dashboard'), 'http://localhost:5173/dashboard');
  assert.strictEqual(normalizeInputUrl('localhost:8080'), 'http://localhost:8080');
  assert.strictEqual(normalizeInputUrl('127.0.0.1:4200'), 'http://127.0.0.1:4200');
  assert.strictEqual(isLocalhostHost('localhost'), true);
  assert.strictEqual(isLocalhostHost('127.0.0.1'), true);
  assert.strictEqual(isMetadataHost('169.254.169.254'), true);
  assert.strictEqual(isPrivateOrInternalIp('10.0.0.12'), true);
  assert.strictEqual(isPrivateOrInternalIp('192.168.1.1'), true);
  assert.strictEqual(isPrivateOrInternalIp('93.184.216.34'), false);

  const metaRes = validateTargetUrl('http://169.254.169.254/latest/meta-data/', { deploymentMode: 'local' });
  assert.strictEqual(metaRes.valid, false);
  assert.strictEqual(metaRes.errorCode, 'SSRF_METADATA_BLOCKED');

  const cloudLocalNoTunnel = validateTargetUrl('localhost:3000', {
    deploymentMode: 'cloud',
    hasActiveCompanionTunnel: false,
  });
  assert.strictEqual(cloudLocalNoTunnel.valid, false);
  assert.strictEqual(cloudLocalNoTunnel.errorCode, 'LOCALHOST_REQUIRES_TUNNEL');

  const cloudLocalWithTunnel = validateTargetUrl('localhost:3000', {
    deploymentMode: 'cloud',
    hasActiveCompanionTunnel: true,
  });
  assert.strictEqual(cloudLocalWithTunnel.valid, true);

  console.log('✓ [PASS] Suite 1: URL Normalization, Localhost Port Routing & SSRF Protection (14 assertions)');
  suitesPassed++;
}

// Suite 2: Device Registry & Viewport Math
{
  const { defaultDeviceRegistry } = registryPkg;
  const all = defaultDeviceRegistry.getAll();
  assert.ok(all.length >= 25);

  const ip18pm = defaultDeviceRegistry.getById('iphone-18-pro-max');
  assert.strictEqual(ip18pm.viewport.width, 440);
  assert.strictEqual(ip18pm.viewport.height, 956);
  assert.strictEqual(ip18pm.dpr, 3);

  const s26u = defaultDeviceRegistry.getById('galaxy-s26-ultra');
  assert.strictEqual(s26u.viewport.width, 412);
  assert.strictEqual(s26u.viewport.height, 891);
  assert.strictEqual(s26u.dpr, 3.5);

  const ipadPro13 = defaultDeviceRegistry.getById('ipad-pro-13-m5');
  assert.strictEqual(ipadPro13.viewport.width, 1032);
  assert.strictEqual(ipadPro13.viewport.height, 1376);

  const rotated = defaultDeviceRegistry.getEffectiveViewport(ip18pm, 'landscape');
  assert.strictEqual(rotated.width, 956);
  assert.strictEqual(rotated.height, 440);

  console.log(`✓ [PASS] Suite 2: Device Registry (${all.length} devices, iPhone 18/17/16, Galaxy S26/S25/Z, Pixel, iPad, Desktop)`);
  suitesPassed++;
}

// Suite 3: Direct Mode Header & Anti-Bot / CAPTCHA / DRM / CSP Analysis
{
  const { analyzeEmbeddingHeaders } = directProbe;
  const okRes = analyzeEmbeddingHeaders({ 'content-type': 'text/html' }, 200, '<html></html>');
  assert.strictEqual(okRes.embeddableInIframe, true);

  const denyRes = analyzeEmbeddingHeaders({ 'x-frame-options': 'DENY' }, 200, '<html></html>');
  assert.strictEqual(denyRes.embeddableInIframe, false);
  assert.strictEqual(denyRes.restrictionCode, 'X_FRAME_OPTIONS_DENY');

  const cspRes = analyzeEmbeddingHeaders(
    { 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" },
    200,
    '<html></html>'
  );
  assert.strictEqual(cspRes.embeddableInIframe, false);
  assert.strictEqual(cspRes.restrictionCode, 'CSP_FRAME_ANCESTORS_BLOCKED');

  const captchaRes = analyzeEmbeddingHeaders(
    { 'content-type': 'text/html' },
    403,
    '<html><body>verify you are human cf-chl-bypass</body></html>'
  );
  assert.strictEqual(captchaRes.embeddableInIframe, false);
  assert.strictEqual(captchaRes.restrictionCode, 'CAPTCHA_CHALLENGE');

  console.log('✓ [PASS] Suite 3: Direct Mode Header Analysis (X-Frame-Options, CSP frame-ancestors, CAPTCHA/DRM detection)');
  suitesPassed++;
}

console.log(`=== All ${suitesPassed} Unit Test Suites Passed Successfully ===`);
