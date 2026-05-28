import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseUdoFile } from '../src/parse.js';

function tmpUdo(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'udo-parse-'));
  const path = join(dir, 'Test.udo.json');
  writeFileSync(path, contents, 'utf8');
  return path;
}

describe('parseUdoFile', () => {
  it('returns ok for a minimal valid UDO', () => {
    const path = tmpUdo(
      JSON.stringify({
        udoVersion: 1,
        resource: 'Widget',
        fields: { name: { type: 'string', required: true } },
      }),
    );
    const result = parseUdoFile(path);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.resource).toBe('Widget');
    }
  });

  it('accepts JSONC comments and trailing commas', () => {
    const path = tmpUdo(`{
      // a comment
      "udoVersion": 1,
      "resource": "Widget",
      "fields": {
        "name": { "type": "string", }, // trailing
      },
    }`);
    const result = parseUdoFile(path);
    expect(result.ok).toBe(true);
  });

  it('reports JSONC errors with line:column', () => {
    const path = tmpUdo(`{ udoVersion: 1, // unquoted key — invalid }`);
    const result = parseUdoFile(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('jsonc');
      expect(result.errors[0]).toMatch(/line \d+/);
    }
  });

  it('reports schema errors for unknown properties', () => {
    const path = tmpUdo(
      JSON.stringify({
        udoVersion: 1,
        resource: 'Widget',
        fields: { name: { type: 'string' } },
        randomProp: 'oops',
      }),
    );
    const result = parseUdoFile(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('schema');
      expect(result.errors.join('\n')).toMatch(/randomProp/);
    }
  });

  it('reports schema errors for invalid resource name', () => {
    const path = tmpUdo(
      JSON.stringify({
        udoVersion: 1,
        resource: 'lowercase_thing', // must be PascalCase
        fields: { name: { type: 'string' } },
      }),
    );
    const result = parseUdoFile(path);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe('schema');
  });

  it('rejects unknown primitive type', () => {
    const path = tmpUdo(
      JSON.stringify({
        udoVersion: 1,
        resource: 'Widget',
        fields: { name: { type: 'banana' } },
      }),
    );
    const result = parseUdoFile(path);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe('schema');
  });

  it('reports read errors when file does not exist', () => {
    const result = parseUdoFile('/nonexistent/path.udo.json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe('read');
  });
});
