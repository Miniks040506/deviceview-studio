import assert from 'assert';
import { defaultDeviceRegistry } from '@deviceview/device-registry';

export function runDeviceRegistryTests(): number {
  let passed = 0;

  const all = defaultDeviceRegistry.getAll();
  assert.ok(all.length >= 25, 'Registry should contain at least 25 modern devices');
  passed++;

  // Verify confirmed iPhone 18 series specs
  const ip18pm = defaultDeviceRegistry.getById('iphone-18-pro-max');
  assert.ok(ip18pm, 'iPhone 18 Pro Max must exist');
  assert.strictEqual(ip18pm!.viewport.width, 440);
  assert.strictEqual(ip18pm!.viewport.height, 956);
  assert.strictEqual(ip18pm!.dpr, 3);
  assert.strictEqual(ip18pm!.physicalResolution?.width, 1320);
  assert.strictEqual(ip18pm!.physicalResolution?.height, 2868);
  assert.strictEqual(ip18pm!.frame.cutout, 'dynamic-island');
  passed++;

  const ip18pro = defaultDeviceRegistry.getById('iphone-18-pro');
  assert.ok(ip18pro, 'iPhone 18 Pro must exist');
  assert.strictEqual(ip18pro!.viewport.width, 402);
  assert.strictEqual(ip18pro!.viewport.height, 874);
  passed++;

  // Verify Samsung Galaxy S26 Ultra & S25 Ultra
  const s26u = defaultDeviceRegistry.getById('galaxy-s26-ultra');
  assert.ok(s26u, 'Galaxy S26 Ultra must exist');
  assert.strictEqual(s26u!.viewport.width, 412);
  assert.strictEqual(s26u!.viewport.height, 891);
  assert.strictEqual(s26u!.physicalResolution?.width, 1440);
  assert.strictEqual(s26u!.physicalResolution?.height, 3120);
  passed++;

  // Verify orientation rotation math
  const portraitVp = defaultDeviceRegistry.getEffectiveViewport(ip18pm!, 'portrait');
  assert.strictEqual(portraitVp.width, 440);
  assert.strictEqual(portraitVp.height, 956);

  const landscapeVp = defaultDeviceRegistry.getEffectiveViewport(ip18pm!, 'landscape');
  assert.strictEqual(landscapeVp.width, 956);
  assert.strictEqual(landscapeVp.height, 440);
  passed++;

  // Verify brand & search filtering
  const samsungDevices = defaultDeviceRegistry.filter({ brand: 'Samsung' });
  assert.ok(samsungDevices.length >= 8, 'Should have at least 8 Samsung devices (S26, S25, Z Fold/Flip)');
  assert.ok(samsungDevices.every((d) => d.brand === 'Samsung'));
  passed++;

  return passed;
}
