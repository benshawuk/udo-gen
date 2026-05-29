import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTsModule } from '../src/generate/ts-module.js';
import { parseUdoFile } from '../src/parse.js';
import type { UdoDocument } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const examplesDir = resolve(projectRoot, 'examples');

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  esModuleInterop: true,
  resolveJsonModule: true,
  // Resolve packages from udo-gen's node_modules (where we have zod).
  baseUrl: projectRoot,
};

/**
 * Typecheck a single in-memory TS source file against the real node_modules
 * for module resolution (zod et al). Uses the TypeScript Compiler API.
 */
function typecheck(source: string, virtualFilename = 'generated.ts'): ts.Diagnostic[] {
  const virtualPath = resolve(projectRoot, virtualFilename);
  const sourceFile = ts.createSourceFile(virtualPath, source, ts.ScriptTarget.ES2022, true);
  const realHost = ts.createCompilerHost(compilerOptions, true);

  const host: ts.CompilerHost = {
    ...realHost,
    getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile) {
      if (fileName === virtualPath) return sourceFile;
      return realHost.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
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

  const program = ts.createProgram([virtualPath], compilerOptions, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => !!d.file && d.file.fileName === virtualPath);
}

function formatDiagnostic(d: ts.Diagnostic): string {
  const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
  if (d.file && d.start !== undefined) {
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    return `line ${line + 1}, col ${character + 1}: ${msg}`;
  }
  return msg;
}

function assertNoDiagnostics(source: string, label: string) {
  const diagnostics = typecheck(source, `${label}.ts`);
  if (diagnostics.length > 0) {
    const formatted = diagnostics.map(formatDiagnostic).join('\n');
    throw new Error(
      `Type errors in generated TS for ${label}:\n${formatted}\n\n--- source ---\n${source}`,
    );
  }
}

describe('Generated TS UDO modules typecheck under strict mode', () => {
  it('VerificationCode.udo.json → typechecks', async () => {
    const parsed = parseUdoFile(join(examplesDir, 'VerificationCode.udo.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const source = await renderTsModule(parsed.document);
    assertNoDiagnostics(source, 'VerificationCode');
  });

  it('Product.udo.json → typechecks', async () => {
    const parsed = parseUdoFile(join(examplesDir, 'Product.udo.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const source = await renderTsModule(parsed.document);
    assertNoDiagnostics(source, 'Product');
  });

  it('every primitive type produces typechecking-valid TS', async () => {
    const allTypes: UdoDocument['fields'][string]['type'][] = [
      'string', 'text', 'longText', 'mediumText',
      'integer', 'bigInteger', 'tinyInteger',
      'unsignedInteger', 'unsignedTinyInteger',
      'decimal', 'float', 'double', 'boolean',
      'date', 'dateTime', 'timestamp', 'time',
      'json', 'uuid', 'foreignId', 'binary',
    ];

    for (const t of allTypes) {
      const field =
        t === 'decimal'
          ? { type: t, precision: 10, scale: 2 }
          : t === 'foreignId'
            ? { type: t, references: 'users.id', onDelete: 'cascade' as const }
            : { type: t };
      const doc: UdoDocument = {
        udoVersion: 1,
        resource: 'Sample',
        fields: { sample: field },
      };
      const source = await renderTsModule(doc);
      assertNoDiagnostics(source, `Sample_${t}`);
    }
  });

  it('nullable + required matrix produces valid TS', async () => {
    const variants = [
      { required: true, nullable: false, label: 'required_only' },
      { required: true, nullable: true, label: 'required_nullable' },
      { required: false, nullable: true, label: 'nullable_only' },
      { required: false, nullable: false, label: 'optional_only' },
    ];
    for (const v of variants) {
      const doc: UdoDocument = {
        udoVersion: 1,
        resource: 'N',
        fields: {
          field: { type: 'string', required: v.required, nullable: v.nullable, max: 50 },
        },
      };
      const source = await renderTsModule(doc);
      assertNoDiagnostics(source, `Nullable_${v.label}`);
    }
  });

  it('enum (string + numeric) typechecks', async () => {
    const stringEnum: UdoDocument = {
      udoVersion: 1,
      resource: 'S',
      fields: { status: { type: 'string', required: true, values: ['draft', 'published'] } },
    };
    const numericEnum: UdoDocument = {
      udoVersion: 1,
      resource: 'P',
      fields: { priority: { type: 'integer', required: true, values: [1, 2, 3] } },
    };
    assertNoDiagnostics(await renderTsModule(stringEnum), 'EnumString');
    assertNoDiagnostics(await renderTsModule(numericEnum), 'EnumNumeric');
  });

  it('rejects invalid TS — sanity check that our typechecker actually fails on errors', () => {
    const bad = `import { z } from 'zod';
const schema = z.object({ x: z.string() });
type T = z.infer<typeof schema>;
const wrong: T = { x: 42 }; // number assigned to string
export { wrong };`;
    const diagnostics = typecheck(bad, 'bad.ts');
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});
