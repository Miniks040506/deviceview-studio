#!/usr/bin/env node
/**
 * DeviceView Studio — Production Monorepo Builder
 * Compiles packages/shared, packages/device-registry, apps/server, and bundles apps/web into apps/web/dist.
 */
import fs from 'fs';
import path from 'path';
import Module from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const extraPaths = ['/usr/share/nodejs', '/usr/lib/nodejs', '/opt/spark/lib/node_modules'];
for (const p of extraPaths) {
  if (fs.existsSync(p) && !Module.globalPaths.includes(p)) {
    Module.globalPaths.push(p);
  }
}

const require = Module.createRequire(import.meta.url);
const babel = require('@babel/core');

function resolvePreset(name) {
  for (const base of [path.join(ROOT, 'node_modules'), ...extraPaths]) {
    const p = path.join(base, name);
    if (fs.existsSync(p)) return p;
  }
  return name;
}

const presetTs = resolvePreset('@babel/preset-typescript');
const presetReact = resolvePreset('@babel/preset-react');
const pluginCommonJs = resolvePreset('@babel/plugin-transform-modules-commonjs');

function compileTsDirToCommonJs(srcDir, outDir, aliasReplacements = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const fullSrc = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      compileTsDirToCommonJs(fullSrc, path.join(outDir, entry.name), aliasReplacements);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      let source = fs.readFileSync(fullSrc, 'utf8');
      for (const [fromAlias, toRel] of Object.entries(aliasReplacements)) {
        source = source.replace(new RegExp(`from ['"]${fromAlias}['"]`, 'g'), `from '${toRel}'`);
      }
      const isTsx = entry.name.endsWith('.tsx');
      const result = babel.transformSync(source, {
        filename: fullSrc,
        presets: isTsx ? [presetTs, [presetReact, { runtime: 'classic' }]] : [presetTs],
        plugins: [pluginCommonJs],
        sourceMaps: false,
      });
      const outName = entry.name.replace(/\.tsx?$/, '.js');
      fs.writeFileSync(path.join(outDir, outName), result.code, 'utf8');
    }
  }
}

console.log('[1/4] Building @deviceview/shared...');
compileTsDirToCommonJs(
  path.join(ROOT, 'packages/shared/src'),
  path.join(ROOT, 'packages/shared/dist')
);

console.log('[2/4] Building @deviceview/device-registry...');
compileTsDirToCommonJs(
  path.join(ROOT, 'packages/device-registry/src'),
  path.join(ROOT, 'packages/device-registry/dist'),
  {
    '@deviceview/shared': '../../shared/dist/index',
  }
);

console.log('[3/4] Building @deviceview/server...');
compileTsDirToCommonJs(
  path.join(ROOT, 'apps/server/src'),
  path.join(ROOT, 'apps/server/dist'),
  {
    '@deviceview/shared': '../../../packages/shared/dist/index',
    '@deviceview/device-registry': '../../../packages/device-registry/dist/index',
  }
);

console.log('[4/4] Building @deviceview/web production bundle...');
const webDist = path.join(ROOT, 'apps/web/dist');
const webAssets = path.join(webDist, 'assets');
fs.mkdirSync(webAssets, { recursive: true });

// Copy static assets
fs.copyFileSync(path.join(ROOT, 'apps/web/src/styles.css'), path.join(webAssets, 'styles.css'));
fs.copyFileSync(path.join(ROOT, 'apps/web/public/favicon.svg'), path.join(webDist, 'favicon.svg'));
fs.copyFileSync(path.join(ROOT, 'apps/web/index.html'), path.join(webDist, 'index.html'));

// Bundle web modules into a self-contained CommonJS module registry for zero-dependency browser execution
const webModules = {};

function addModuleToBundle(moduleId, filePath, importMap = {}) {
  if (filePath.endsWith('.json')) {
    const jsonRaw = fs.readFileSync(filePath, 'utf8');
    webModules[moduleId] = `module.exports = ${jsonRaw};`;
    return;
  }
  let code = fs.readFileSync(filePath, 'utf8');
  for (const [k, v] of Object.entries(importMap)) {
    code = code.replace(new RegExp(`from ['"]${k}['"]`, 'g'), `from '${v}'`);
  }
  const isTsx = filePath.endsWith('.tsx');
  const transformed = babel.transformSync(code, {
    filename: filePath,
    presets: isTsx ? [presetTs, [presetReact, { runtime: 'classic' }]] : [presetTs],
    plugins: [pluginCommonJs],
    sourceMaps: false,
  });
  webModules[moduleId] = transformed.code;
}

// Shared modules
addModuleToBundle('@deviceview/shared/types', path.join(ROOT, 'packages/shared/src/types.ts'));
addModuleToBundle('@deviceview/shared/url-validator', path.join(ROOT, 'packages/shared/src/url-validator.ts'));
addModuleToBundle('@deviceview/shared/ws-protocol', path.join(ROOT, 'packages/shared/src/ws-protocol.ts'), {
  './types': '@deviceview/shared/types',
});
addModuleToBundle('@deviceview/shared', path.join(ROOT, 'packages/shared/src/index.ts'), {
  './types': '@deviceview/shared/types',
  './url-validator': '@deviceview/shared/url-validator',
  './ws-protocol': '@deviceview/shared/ws-protocol',
});

// Device registry modules
addModuleToBundle('@deviceview/device-registry/data', path.join(ROOT, 'packages/device-registry/data/devices.json'));
addModuleToBundle('@deviceview/device-registry/registry', path.join(ROOT, 'packages/device-registry/src/registry.ts'), {
  '../data/devices.json': '@deviceview/device-registry/data',
});
addModuleToBundle('@deviceview/device-registry', path.join(ROOT, 'packages/device-registry/src/index.ts'), {
  './registry': '@deviceview/device-registry/registry',
});

// Web runtime & app modules
addModuleToBundle('web/runtime/react-shim', path.join(ROOT, 'apps/web/src/runtime/react-shim.ts'));
addModuleToBundle('web/store/useStudioStore', path.join(ROOT, 'apps/web/src/store/useStudioStore.ts'));
addModuleToBundle('web/utils/screenshot', path.join(ROOT, 'apps/web/src/utils/screenshot.ts'), {
  '../store/useStudioStore': 'web/store/useStudioStore',
});
addModuleToBundle('web/components/Header', path.join(ROOT, 'apps/web/src/components/Header.tsx'), {
  '../runtime/react-shim': 'web/runtime/react-shim',
  '../store/useStudioStore': 'web/store/useStudioStore',
  '../utils/screenshot': 'web/utils/screenshot',
});
addModuleToBundle('web/components/DeviceSidebar', path.join(ROOT, 'apps/web/src/components/DeviceSidebar.tsx'), {
  '../runtime/react-shim': 'web/runtime/react-shim',
  '../store/useStudioStore': 'web/store/useStudioStore',
});
addModuleToBundle('web/components/PreviewViewport', path.join(ROOT, 'apps/web/src/components/PreviewViewport.tsx'), {
  '../runtime/react-shim': 'web/runtime/react-shim',
  '../store/useStudioStore': 'web/store/useStudioStore',
});
addModuleToBundle('web/components/DeviceFrame', path.join(ROOT, 'apps/web/src/components/DeviceFrame.tsx'), {
  '../runtime/react-shim': 'web/runtime/react-shim',
  '../store/useStudioStore': 'web/store/useStudioStore',
  './PreviewViewport': 'web/components/PreviewViewport',
});
addModuleToBundle('web/components/FloatingToolbar', path.join(ROOT, 'apps/web/src/components/FloatingToolbar.tsx'), {
  '../runtime/react-shim': 'web/runtime/react-shim',
  '../store/useStudioStore': 'web/store/useStudioStore',
  '../utils/screenshot': 'web/utils/screenshot',
});
addModuleToBundle('web/components/RightInspector', path.join(ROOT, 'apps/web/src/components/RightInspector.tsx'), {
  '../runtime/react-shim': 'web/runtime/react-shim',
  '../store/useStudioStore': 'web/store/useStudioStore',
  '../utils/screenshot': 'web/utils/screenshot',
});
addModuleToBundle('web/App', path.join(ROOT, 'apps/web/src/App.tsx'), {
  './runtime/react-shim': 'web/runtime/react-shim',
  './store/useStudioStore': 'web/store/useStudioStore',
  './components/Header': 'web/components/Header',
  './components/DeviceSidebar': 'web/components/DeviceSidebar',
  './components/DeviceFrame': 'web/components/DeviceFrame',
  './components/FloatingToolbar': 'web/components/FloatingToolbar',
  './components/RightInspector': 'web/components/RightInspector',
});
addModuleToBundle('web/main', path.join(ROOT, 'apps/web/src/main.tsx'), {
  './runtime/react-shim': 'web/runtime/react-shim',
  './App': 'web/App',
});

let bundleJs = `(function() {
  const modules = {};
  const cache = {};
  function require(id) {
    if (cache[id]) return cache[id].exports;
    if (!modules[id]) throw new Error('Module not found: ' + id);
    const module = { exports: {} };
    cache[id] = module;
    modules[id](module, module.exports, require);
    return module.exports;
  }
`;

for (const [id, fnBody] of Object.entries(webModules)) {
  bundleJs += `  modules[${JSON.stringify(id)}] = function(module, exports, require) {
${fnBody}
  };
`;
}

bundleJs += `  require('web/main');
})();
`;

fs.writeFileSync(path.join(webAssets, 'app.js'), bundleJs, 'utf8');
console.log('✓ Production build completed successfully (packages/shared, packages/device-registry, apps/server, apps/web/dist).');
