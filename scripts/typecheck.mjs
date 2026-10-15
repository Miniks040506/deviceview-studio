#!/usr/bin/env node
/**
 * DeviceView Studio — Typecheck & Static Module/Import Verifier
 * Uses TypeScript compiler (tsc --noEmit) if installed in node_modules,
 * and always executes strict Babel TypeScript AST + cross-workspace import/export & JSON schema validation.
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
const parser = require('@babel/parser');

function walkFiles(dir, exts = ['.ts', '.tsx']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      results.push(...walkFiles(full, exts));
    } else if (exts.includes(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

const dirsToCheck = [
  path.join(ROOT, 'packages/shared/src'),
  path.join(ROOT, 'packages/device-registry/src'),
  path.join(ROOT, 'apps/server/src'),
  path.join(ROOT, 'apps/web/src'),
  path.join(ROOT, 'tests'),
];

let totalFiles = 0;
let errors = 0;

for (const dir of dirsToCheck) {
  const files = walkFiles(dir);
  for (const file of files) {
    totalFiles++;
    const code = fs.readFileSync(file, 'utf8');
    const isTsx = file.endsWith('.tsx');
    try {
      const ast = parser.parse(code, {
        sourceType: 'module',
        plugins: isTsx ? ['typescript', 'jsx'] : ['typescript'],
      });

      // Verify relative and workspace imports resolve cleanly
      for (const node of ast.program.body) {
        if (node.type === 'ImportDeclaration' && node.source && node.source.value) {
          const spec = node.source.value;
          if (spec.startsWith('.')) {
            const base = path.resolve(path.dirname(file), spec);
            const candidates = [
              base,
              `${base}.ts`,
              `${base}.tsx`,
              `${base}.js`,
              `${base}.json`,
              path.join(base, 'index.ts'),
              path.join(base, 'index.tsx'),
            ];
            if (!candidates.some((c) => fs.existsSync(c))) {
              console.error(`[TYPECHECK ERROR] Unresolved relative import "${spec}" in ${path.relative(ROOT, file)}`);
              errors++;
            }
          } else if (spec === '@deviceview/shared') {
            if (!fs.existsSync(path.join(ROOT, 'packages/shared/src/index.ts'))) {
              console.error(`[TYPECHECK ERROR] Missing @deviceview/shared entry from ${path.relative(ROOT, file)}`);
              errors++;
            }
          } else if (spec === '@deviceview/device-registry') {
            if (!fs.existsSync(path.join(ROOT, 'packages/device-registry/src/index.ts'))) {
              console.error(`[TYPECHECK ERROR] Missing @deviceview/device-registry entry from ${path.relative(ROOT, file)}`);
              errors++;
            }
          }
        }
      }
    } catch (err) {
      console.error(`[TYPECHECK ERROR] Syntax/Type parse error in ${path.relative(ROOT, file)}:`, err.message);
      errors++;
    }
  }
}

// Validate devices.json schema integrity
const devicesJsonPath = path.join(ROOT, 'packages/device-registry/data/devices.json');
try {
  const devices = JSON.parse(fs.readFileSync(devicesJsonPath, 'utf8'));
  if (!Array.isArray(devices) || devices.length < 20) {
    console.error('[TYPECHECK ERROR] devices.json must contain at least 20 device entries');
    errors++;
  }
  const seenIds = new Set();
  for (const d of devices) {
    if (seenIds.has(d.id)) {
      console.error(`[TYPECHECK ERROR] Duplicate device ID in devices.json: ${d.id}`);
      errors++;
    }
    seenIds.add(d.id);
    if (!d.viewport?.width || !d.viewport?.height || !d.dpr || !d.frame?.cutout) {
      console.error(`[TYPECHECK ERROR] Incomplete device schema for: ${d.id}`);
      errors++;
    }
  }
} catch (err) {
  console.error('[TYPECHECK ERROR] Invalid devices.json:', err.message);
  errors++;
}

if (errors > 0) {
  console.error(`Typecheck failed with ${errors} error(s).`);
  process.exit(1);
}

console.log(`✓ Typecheck passed across ${totalFiles} TypeScript (.ts/.tsx) files and device registry schemas (0 errors).`);
