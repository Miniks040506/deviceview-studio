#!/usr/bin/env node
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

spawnSync('node', [path.join(ROOT, 'scripts/build.mjs')], { stdio: 'inherit' });
await import(path.join(ROOT, 'apps/server/dist/index.js'));
