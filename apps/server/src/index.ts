import { createStudioServer } from './server';

export * from './config';
export * from './ssrf-guard';
export * from './direct-probe';
export * from './browser-engine';
export * from './tunnel-hub';
export * from './server';
export * from './ws-raw';

if (require.main === module) {
  const instance = createStudioServer();
  instance
    .listen()
    .then(({ port, host }) => {
      console.log(`[DeviceView Studio Server] Listening on http://${host}:${port} (mode: ${instance.config.deploymentMode})`);
    })
    .catch((err) => {
      console.error('[DeviceView Studio Server] Startup failed:', err);
      process.exit(1);
    });
}
