import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseUdoFile } from '../src/parse.js';
import { renderModelBase } from '../src/generate/model-base.js';
import { renderModelExtension } from '../src/generate/model-extension.js';
import { renderMigration } from '../src/generate/migration.js';
import { renderFormRequest } from '../src/generate/form-request.js';
import { renderTransformer } from '../src/generate/resource-transformer.js';
import { renderFactory } from '../src/generate/factory.js';
import { renderControllerBase, renderControllerExtension } from '../src/generate/controller-base.js';
import { renderLangStarter } from '../src/generate/lang-starter.js';
import {
  diffUdo,
  renderAlterMigration,
} from '../src/generate/migration-alter.js';
import type { UdoDocument } from '../src/types.js';

function phpAvailable(): boolean {
  try {
    execFileSync('php', ['-v'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const HAS_PHP = phpAvailable();
const conditional = HAS_PHP ? it : it.skip;

function assertValidPhp(label: string, contents: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'udo-php-'));
  const path = join(dir, `${label}.php`);
  writeFileSync(path, contents, 'utf8');
  try {
    execFileSync('php', ['-l', path], { stdio: 'pipe' });
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const out = err.stdout?.toString() ?? '';
    const errOut = err.stderr?.toString() ?? '';
    throw new Error(
      `PHP syntax error in ${label}:\n${out}\n${errOut}\n${err.message ?? ''}\n--- contents ---\n${contents}`,
    );
  }
}

const examplesDir = join(import.meta.dirname, '..', 'examples');

describe('PHP syntax validity of generated artifacts', () => {
  if (!HAS_PHP) {
    it.skip('skipped — `php` not on PATH', () => {});
    return;
  }

  for (const file of ['VerificationCode.udo.json', 'Product.udo.json']) {
    describe(`example: ${file}`, () => {
      const parsed = parseUdoFile(join(examplesDir, file));
      if (!parsed.ok) throw new Error(`Failed to parse ${file}: ${JSON.stringify(parsed.errors)}`);
      const doc = parsed.document;

      conditional('model base is valid PHP', async () => {
        assertValidPhp(`${doc.resource}Base`, await renderModelBase(doc));
      });

      conditional('model extension is valid PHP', async () => {
        assertValidPhp(`${doc.resource}`, await renderModelExtension(doc));
      });

      conditional('migration is valid PHP', async () => {
        assertValidPhp(`migration_${doc.resource}`, await renderMigration(doc));
      });

      conditional('FormRequest is valid PHP', async () => {
        assertValidPhp(`${doc.resource}Request`, await renderFormRequest(doc));
      });

      conditional('Resource transformer is valid PHP', async () => {
        if (doc.transformer === 'custom') return;
        assertValidPhp(`${doc.resource}Resource`, await renderTransformer(doc));
      });

      conditional('Factory is valid PHP', async () => {
        if (doc.factory === false) return;
        assertValidPhp(`${doc.resource}Factory`, await renderFactory(doc));
      });

      conditional('Controller base is valid PHP', async () => {
        if (doc.controller === 'custom') return;
        assertValidPhp(`${doc.resource}ControllerBase`, await renderControllerBase(doc));
      });

      conditional('Controller extension is valid PHP', async () => {
        if (doc.controller === 'custom') return;
        assertValidPhp(`${doc.resource}Controller`, await renderControllerExtension(doc));
      });

      conditional('Lang starter is valid PHP', async () => {
        assertValidPhp(`lang_${doc.resource}`, await renderLangStarter(doc));
      });
    });
  }

  conditional('ALTER migration is valid PHP', async () => {
    const snap: UdoDocument = {
      udoVersion: 1,
      resource: 'Product',
      fields: {
        title: { type: 'string', required: true, max: 255 },
        old_field: { type: 'string' },
      },
    };
    const current: UdoDocument = {
      udoVersion: 1,
      resource: 'Product',
      fields: {
        title: { type: 'string', required: true, max: 255 },
        new_field: { type: 'unsignedInteger', nullable: true },
      },
    };
    const diff = diffUdo(snap, current);
    const output = await renderAlterMigration(current, diff);
    assertValidPhp('alter_products', output);
  });
});
