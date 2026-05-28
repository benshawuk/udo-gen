import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { UdoDocument } from '../types.js';

export function snapshotPath(laravelRoot: string, resource: string): string {
  return join(laravelRoot, 'udo', '.snapshots', `${resource}.snapshot.json`);
}

export function writeSnapshot(laravelRoot: string, doc: UdoDocument): string {
  const path = snapshotPath(laravelRoot, doc.resource);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  return path;
}

export function readSnapshot(laravelRoot: string, resource: string): UdoDocument | null {
  const path = snapshotPath(laravelRoot, resource);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as UdoDocument;
  } catch {
    return null;
  }
}
