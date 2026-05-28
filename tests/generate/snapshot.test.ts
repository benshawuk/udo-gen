import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSnapshot, writeSnapshot, snapshotPath } from '../../src/generate/snapshot.js';
import type { UdoDocument } from '../../src/types.js';

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'udo-snap-'));
}

const sample: UdoDocument = {
  udoVersion: 1,
  resource: 'Product',
  fields: { title: { type: 'string', required: true } },
};

describe('snapshot', () => {
  it('writes and reads back a UDO', () => {
    const root = tmpRoot();
    writeSnapshot(root, sample);
    const read = readSnapshot(root, 'Product');
    expect(read?.resource).toBe('Product');
    expect(read?.fields.title?.required).toBe(true);
  });

  it('returns null when snapshot is missing', () => {
    expect(readSnapshot(tmpRoot(), 'Missing')).toBeNull();
  });

  it('produces a consistent snapshot path', () => {
    const root = tmpRoot();
    const p = snapshotPath(root, 'Product');
    expect(p).toContain('udo/.snapshots/Product.snapshot.json');
  });
});
