import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Exercises the in-app uninstall against throwaway dirs. KOMADO_APP_DIR /
// KOMADO_BIN_DIR / KOMADO_HOME are pointed at a temp tree BEFORE the module
// (and config.js, which reads KOMADO_HOME at import) is loaded, so nothing here
// can touch a real install or ~/.komado.
describe('uninstall', () => {
  let root, appDir, binDir, homeDir, mod;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'komado-uninstall-'));
    appDir = path.join(root, 'share', 'komado');
    binDir = path.join(root, 'bin');
    homeDir = path.join(root, 'data-home');
    process.env.KOMADO_APP_DIR = appDir;
    process.env.KOMADO_BIN_DIR = binDir;
    process.env.KOMADO_HOME = homeDir;
    vi.resetModules(); // re-eval config.js with this run's KOMADO_HOME
    mod = await import('../src/uninstall.js');
  });

  afterEach(() => {
    delete process.env.KOMADO_APP_DIR;
    delete process.env.KOMADO_BIN_DIR;
    delete process.env.KOMADO_HOME;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('targets the install app dir, the launcher file, and the data dir', () => {
    const targetPaths = mod.uninstallTargets().map((t) => t.path);
    expect(targetPaths).toContain(appDir);
    expect(targetPaths).toContain(path.join(binDir, 'komado'));
    expect(targetPaths).toContain(homeDir);
    // Must remove the launcher FILE, never the shared ~/.local/bin directory.
    expect(targetPaths).not.toContain(binDir);
  });

  it('removes existing targets and leaves the bin dir intact', () => {
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'marker'), 'x');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'komado'), '#!/bin/sh\n');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.writeFileSync(path.join(homeDir, 'config.json'), '{}');

    const results = mod.performUninstall();

    expect(fs.existsSync(appDir)).toBe(false);
    expect(fs.existsSync(path.join(binDir, 'komado'))).toBe(false);
    expect(fs.existsSync(homeDir)).toBe(false);
    expect(fs.existsSync(binDir)).toBe(true); // only the launcher file went
    expect(results.every((r) => r.status === 'removed')).toBe(true);
  });

  it('reports absent targets without throwing', () => {
    const results = mod.performUninstall();
    expect(results.every((r) => r.status === 'absent')).toBe(true);
    expect(mod.formatUninstallSummary(results)).toContain('komado has been uninstalled.');
  });
});
