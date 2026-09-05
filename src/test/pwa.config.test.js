/* ════════════════════════════════════════════════════════════════════════
   PWA configuration test — verifies service worker setup via vite-plugin-pwa
   in prompt mode so a new deploy shows "Nova versão disponível" toast instead
   of requiring a hard reload.

   Source assertions:
   - vite.config.js contains VitePWA( and registerType: 'prompt'
   - App.jsx contains virtual:pwa-register inside import.meta.env.PROD guard
   - package.json has vite-plugin-pwa in devDependencies
   ════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

function readProjectFile(relPath) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const fullPath = path.resolve(dir, '../../', relPath);
  return fs.readFileSync(fullPath, 'utf8');
}

describe('PWA configuration — service worker in prompt mode', () => {
  it('vite.config.js imports and uses VitePWA with registerType: "prompt"', () => {
    const content = readProjectFile('vite.config.js');
    expect(content).toMatch(/import\s+{\s*VitePWA\s*}\s+from\s+['"]vite-plugin-pwa['"]/);
    expect(content).toMatch(/VitePWA\(/);
    expect(content).toMatch(/registerType:\s*['"]prompt['"]/);
  });

  it('App.jsx imports virtual:pwa-register inside import.meta.env.PROD guard', () => {
    const content = readProjectFile('src/App.jsx');
    // Must contain the dynamic import pattern guarded by PROD check
    expect(content).toMatch(/import\.meta\.env\.PROD/);
    expect(content).toMatch(/virtual:pwa-register/);
  });

  it('package.json has vite-plugin-pwa in devDependencies', () => {
    const content = readProjectFile('package.json');
    const pkg = JSON.parse(content);
    expect(pkg.devDependencies).toBeDefined();
    expect(pkg.devDependencies['vite-plugin-pwa']).toBeDefined();
  });
});
