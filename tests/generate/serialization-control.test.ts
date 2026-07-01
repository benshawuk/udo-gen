import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseUdoFile } from '../../src/parse.js';
import type { UdoDocument } from '../../src/types.js';
import { renderModelBase } from '../../src/generate/model-base.js';
import { renderTransformer } from '../../src/generate/resource-transformer.js';
import { renderTsModule } from '../../src/generate/ts-module.js';

// A UDO exercising the serialization-control gap batch: per-field `hidden` +
// `cast` overrides, and document-level `appends` (computed accessors). This is
// what lets auth-heavy models (password hidden+hashed, 2FA secret encrypted,
// computed has_password/display_name) be authored as UDOs.
const UDO_JSONC = `{
  "udoVersion": 1,
  "resource": "Account",
  "table": "accounts",
  "fields": {
    "email": { "type": "string", "format": "email", "required": true, "unique": true },
    "password": { "type": "string", "required": true, "hidden": true, "cast": "hashed" },
    "two_factor_secret": { "type": "text", "nullable": true, "hidden": true, "cast": "encrypted" }
  },
  "appends": {
    "has_password": { "type": "boolean" },
    "display_name": { "type": "string", "nullable": true }
  }
}`;

function parse(): UdoDocument {
  const dir = mkdtempSync(join(tmpdir(), 'udo-serctl-'));
  const path = join(dir, 'Account.udo.json');
  writeFileSync(path, UDO_JSONC, 'utf8');
  const result = parseUdoFile(path);
  if (!result.ok) throw new Error('fixture failed to parse/validate:\n' + result.errors.join('\n'));
  return result.document as UdoDocument;
}

function shapeBlock(tsModule: string): string {
  const start = tsModule.indexOf('export type Shape = {');
  const end = tsModule.indexOf('};', start);
  return tsModule.slice(start, end);
}

describe('serialization control (hidden / cast / appends)', () => {
  it('the schema accepts hidden, cast, and appends', () => {
    // parse() throws if validation fails.
    expect(parse().resource).toBe('Account');
  });

  it('model base emits $hidden, $appends, and cast overrides', async () => {
    const php = await renderModelBase(parse());
    expect(php).toContain('protected $hidden = [');
    expect(php).toContain("'password',");
    expect(php).toContain("'two_factor_secret',");
    expect(php).toContain('protected $appends = [');
    expect(php).toContain("'has_password',");
    expect(php).toContain("'display_name',");
    // cast overrides win over the type-inferred cast.
    expect(php).toContain("'password' => 'hashed',");
    expect(php).toContain("'two_factor_secret' => 'encrypted',");
  });

  it('resource transformer omits hidden fields and includes appends', async () => {
    const php = await renderTransformer(parse());
    expect(php).toContain("'email' => $this->email,");
    expect(php).not.toContain("'password' => $this->password,");
    expect(php).not.toContain('two_factor_secret');
    expect(php).toContain("'has_password' => $this->has_password,");
    expect(php).toContain("'display_name' => $this->display_name,");
  });

  it('TS Shape drops hidden fields but adds appends; create keeps hidden (writable)', async () => {
    const ts = await renderTsModule(parse());
    const shape = shapeBlock(ts);
    // Read Shape: no secrets, but the computed appends are present + typed.
    // (\b so has_password does NOT count as the hidden `password` field.)
    expect(shape).toContain('email: string;');
    expect(shape).not.toMatch(/\bpassword:/);
    expect(shape).not.toContain('two_factor_secret');
    expect(shape).toContain('has_password: boolean;');
    expect(shape).toContain('display_name: string | null;');
    // createSchema still accepts password (you set it on write).
    expect(ts).toContain('password: z.string()');
  });
});
