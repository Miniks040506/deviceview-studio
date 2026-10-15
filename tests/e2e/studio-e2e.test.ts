/**
 * DeviceView Studio — End-to-End Integration & Browser Automation Test Suite
 * Executed via `npm run test:e2e` (scripts/test-e2e.mjs).
 */
export interface E2ETestReport {
  directModeEmbeddable: boolean;
  directModeHeaderDetection: boolean;
  ssrfProtectionVerified: boolean;
  browserModeInteractive: boolean;
  localhostAndTunnelVerified: boolean;
  deviceSwitchingVerified: boolean;
  rotateZoomScreenshotVerified: boolean;
  studioFrontendRenderedInChromium: boolean;
}
