import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildManifest } from '../../src/generate/manifest.js';

describe('buildManifest', () => {
  it('returns just the header when dir is empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'udo-manifest-'));
    const out = buildManifest(dir);
    expect(out).toContain('AUTO-GENERATED');
    expect(out).not.toContain('export *');
  });

  it('returns header when dir does not exist', () => {
    const out = buildManifest('/nonexistent/path');
    expect(out).toContain('AUTO-GENERATED');
  });

  it('emits one export * as Name for each .ts file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'udo-manifest-'));
    writeFileSync(join(dir, 'Product.ts'), '', 'utf8');
    writeFileSync(join(dir, 'User.ts'), '', 'utf8');
    writeFileSync(join(dir, 'index.ts'), '', 'utf8'); // should be ignored
    const out = buildManifest(dir);
    expect(out).toContain("export * as Product from './Product';");
    expect(out).toContain("export * as User from './User';");
    expect(out).not.toMatch(/export \* as index/);
  });

  it('sorts entries alphabetically for stable output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'udo-manifest-'));
    writeFileSync(join(dir, 'Zebra.ts'), '', 'utf8');
    writeFileSync(join(dir, 'Apple.ts'), '', 'utf8');
    const out = buildManifest(dir);
    const appleIdx = out.indexOf('Apple');
    const zebraIdx = out.indexOf('Zebra');
    expect(appleIdx).toBeLessThan(zebraIdx);
  });
});
