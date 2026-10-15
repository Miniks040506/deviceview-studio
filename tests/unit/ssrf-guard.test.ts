import assert from 'assert';
import { analyzeEmbeddingHeaders } from '../../apps/server/src/direct-probe';

export function runHeaderAndSecurityAnalysisTests(): number {
  let passed = 0;

  // 1. Standard embeddable page
  const resAllow = analyzeEmbeddingHeaders({ 'content-type': 'text/html' }, 200, '<html><body>Hello</body></html>');
  assert.strictEqual(resAllow.embeddableInIframe, true);
  assert.strictEqual(resAllow.restrictionCode, 'NONE');
  passed++;

  // 2. X-Frame-Options: DENY
  const resDeny = analyzeEmbeddingHeaders({ 'x-frame-options': 'DENY' }, 200, '<html></html>');
  assert.strictEqual(resDeny.embeddableInIframe, false);
  assert.strictEqual(resDeny.restrictionCode, 'X_FRAME_OPTIONS_DENY');
  passed++;

  // 3. X-Frame-Options: SAMEORIGIN
  const resSameOrigin = analyzeEmbeddingHeaders({ 'x-frame-options': 'SAMEORIGIN' }, 200, '<html></html>');
  assert.strictEqual(resSameOrigin.embeddableInIframe, false);
  assert.strictEqual(resSameOrigin.restrictionCode, 'X_FRAME_OPTIONS_SAMEORIGIN');
  passed++;

  // 4. CSP frame-ancestors 'none'
  const resCsp = analyzeEmbeddingHeaders(
    { 'content-security-policy': "default-src 'self'; frame-ancestors 'none';" },
    200,
    '<html></html>'
  );
  assert.strictEqual(resCsp.embeddableInIframe, false);
  assert.strictEqual(resCsp.restrictionCode, 'CSP_FRAME_ANCESTORS_BLOCKED');
  passed++;

  // 5. CAPTCHA challenge detection (no bypass attempted, clear diagnostic returned)
  const resCaptcha = analyzeEmbeddingHeaders(
    { 'content-type': 'text/html' },
    403,
    '<html><body>Please verify you are human - cf-chl-bypass</body></html>'
  );
  assert.strictEqual(resCaptcha.embeddableInIframe, false);
  assert.strictEqual(resCaptcha.restrictionCode, 'CAPTCHA_CHALLENGE');
  passed++;

  return passed;
}
