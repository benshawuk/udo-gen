import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUdoFile } from '../../src/parse.js';
import { renderModelBase } from '../../src/generate/model-base.js';
import { renderModelExtension } from '../../src/generate/model-extension.js';
import { renderMigration } from '../../src/generate/migration.js';
import { renderFormRequest } from '../../src/generate/form-request.js';
import { renderTransformer } from '../../src/generate/resource-transformer.js';
import { renderFactory } from '../../src/generate/factory.js';
import {
  renderControllerBase,
  renderControllerExtension,
} from '../../src/generate/controller-base.js';
import { renderLangStarter } from '../../src/generate/lang-starter.js';
import { renderTsModule } from '../../src/generate/ts-module.js';
import type { UdoDocument } from '../../src/types.js';

/**
 * Corpus validation: a broad set of realistic resources exercising the
 * relationship kinds, every field type/format, enums, composite indexes, and
 * irregular plurals. Every generated PHP artifact is checked with `php -l`
 * (syntax) and every generated TS module is type-checked with the TS compiler.
 *
 * This is the regression net for "valid migrations / valid output" across the
 * whole feature surface, not just the two hand-picked examples.
 */

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..', '..');
const corpusDir = resolve(here, '..', 'fixtures', 'corpus');

function phpAvailable(): boolean {
  try {
    execFileSync('php', ['-v'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
const HAS_PHP = phpAvailable();

function assertValidPhp(label: string, contents: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'udo-corpus-php-'));
  const path = join(dir, `${label}.php`);
  writeFileSync(path, contents, 'utf8');
  try {
    execFileSync('php', ['-l', path], { stdio: 'pipe' });
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `PHP syntax error in ${label}:\n${err.stdout?.toString() ?? ''}${err.stderr?.toString() ?? ''}\n--- contents ---\n${contents}`,
    );
  }
}

const tsCompilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  esModuleInterop: true,
  baseUrl: projectRoot,
};

function assertValidTs(label: string, source: string): void {
  const virtualPath = resolve(projectRoot, `__corpus_${label}.ts`);
  const sourceFile = ts.createSourceFile(virtualPath, source, ts.ScriptTarget.ES2022, true);
  const realHost = ts.createCompilerHost(tsCompilerOptions, true);
  const host: ts.CompilerHost = {
    ...realHost,
    getSourceFile(fileName, lang, onErr, shouldCreate) {
      if (fileName === virtualPath) return sourceFile;
      return realHost.getSourceFile(fileName, lang, onErr, shouldCreate);
    },
    fileExists(fileName) {
      if (fileName === virtualPath) return true;
      return realHost.fileExists(fileName);
    },
    readFile(fileName) {
      if (fileName === virtualPath) return source;
      return realHost.readFile(fileName);
    },
  };
  const program = ts.createProgram([virtualPath], tsCompilerOptions, host);
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => !!d.file && d.file.fileName === virtualPath);
  if (diagnostics.length > 0) {
    const formatted = diagnostics
      .map((d) => {
        const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
        if (d.file && d.start !== undefined) {
          const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
          return `  ${line + 1}:${character + 1} ${msg}`;
        }
        return `  ${msg}`;
      })
      .join('\n');
    throw new Error(`TS type errors in ${label}:\n${formatted}\n--- source ---\n${source}`);
  }
}

const corpusFiles = readdirSync(corpusDir).filter((f) => f.endsWith('.udo.json'));

describe('corpus: every fixture parses, validates, and generates valid output', () => {
  it('discovered the corpus fixtures', () => {
    expect(corpusFiles.length).toBeGreaterThanOrEqual(8);
  });

  for (const file of corpusFiles) {
    describe(file, () => {
      const parsed = parseUdoFile(join(corpusDir, file));

      it('parses + validates against the schema', () => {
        if (!parsed.ok) {
          throw new Error(`${file} failed to parse/validate: ${JSON.stringify(parsed.errors, null, 2)}`);
        }
        expect(parsed.ok).toBe(true);
      });

      if (!parsed.ok) return;
      const doc: UdoDocument = parsed.document;

      const phpIt = HAS_PHP ? it : it.skip;

      phpIt('model base is valid PHP', async () => {
        assertValidPhp(`${doc.resource}Base`, await renderModelBase(doc));
      });
      phpIt('model extension is valid PHP', async () => {
        assertValidPhp(`${doc.resource}`, await renderModelExtension(doc));
      });
      phpIt('migration is valid PHP', async () => {
        assertValidPhp(`mig_${doc.resource}`, await renderMigration(doc));
      });
      phpIt('FormRequest is valid PHP', async () => {
        assertValidPhp(`${doc.resource}Request`, await renderFormRequest(doc));
      });
      phpIt('Resource transformer is valid PHP', async () => {
        if (doc.transformer === 'custom') return;
        assertValidPhp(`${doc.resource}Resource`, await renderTransformer(doc));
      });
      phpIt('Factory is valid PHP', async () => {
        if (doc.factory === false) return;
        assertValidPhp(`${doc.resource}Factory`, await renderFactory(doc));
      });
      phpIt('Controller base is valid PHP', async () => {
        if (doc.controller === 'custom') return;
        assertValidPhp(`${doc.resource}ControllerBase`, await renderControllerBase(doc));
      });
      phpIt('Controller extension is valid PHP', async () => {
        if (doc.controller === 'custom') return;
        assertValidPhp(`${doc.resource}Controller`, await renderControllerExtension(doc));
      });
      phpIt('Lang starter is valid PHP', async () => {
        assertValidPhp(`lang_${doc.resource}`, await renderLangStarter(doc));
      });

      it('TS module type-checks under strict mode', async () => {
        // zod resolves via baseUrl=projectRoot against this repo's node_modules.
        assertValidTs(doc.resource, await renderTsModule(doc));
      });
    });
  }
});
