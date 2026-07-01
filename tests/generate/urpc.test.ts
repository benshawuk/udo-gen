import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { renderTsModule } from '../../src/generate/ts-module.js';
import { renderUrpcRuntime, renderUrpcResource, buildUrpcManifest } from '../../src/generate/urpc.js';
import { buildManifest } from '../../src/generate/manifest.js';
import { parseUdoFile } from '../../src/parse.js';
import type { UdoDocument } from '../../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..', '..');
// Virtual root inside projectRoot so bare specifiers (`zod`) resolve up into the
// real node_modules, while `@/*` maps to our virtual tree.
const VROOT = resolve(projectRoot, '__vurpc__');

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  esModuleInterop: true,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  baseUrl: VROOT,
  paths: { '@/*': ['./*'] },
};

function typecheck(files: Record<string, string>): string[] {
  const virtual = new Map<string, string>();
  for (const [rel, contents] of Object.entries(files)) {
    virtual.set(resolve(VROOT, rel), contents);
  }
  const realHost = ts.createCompilerHost(compilerOptions, true);
  const host: ts.CompilerHost = {
    ...realHost,
    getSourceFile(fileName, languageVersion, onError, shouldCreate) {
      const v = virtual.get(resolve(fileName));
      if (v !== undefined) return ts.createSourceFile(fileName, v, languageVersion, true);
      return realHost.getSourceFile(fileName, languageVersion, onError, shouldCreate);
    },
    fileExists(fileName) {
      return virtual.has(resolve(fileName)) || realHost.fileExists(fileName);
    },
    readFile(fileName) {
      const v = virtual.get(resolve(fileName));
      return v !== undefined ? v : realHost.readFile(fileName);
    },
    directoryExists(dirName) {
      const d = resolve(dirName);
      for (const f of virtual.keys()) if (f === d || f.startsWith(d + '/')) return true;
      return realHost.directoryExists ? realHost.directoryExists(dirName) : false;
    },
  };
  const rootNames = Object.keys(files).map((rel) => resolve(VROOT, rel));
  const program = ts.createProgram(rootNames, compilerOptions, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => !!d.file && d.file.fileName.startsWith(VROOT) && !d.file.fileName.includes('node_modules'))
    .map((d) => {
      const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      if (d.file && d.start !== undefined) {
        const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
        return `${d.file.fileName.slice(VROOT.length + 1)}:${line + 1}:${character + 1} - ${msg}`;
      }
      return msg;
    });
}

function tempUdoDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'udo-urpc-'));
  const udo = join(dir, 'udo');
  mkdirSync(udo, { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(udo, name), contents, 'utf8');
  }
  return udo;
}

describe('URPC generator', () => {
  it('resource client wires defineResource from the TS module exports', async () => {
    const doc = parseUdoFile(join(projectRoot, 'examples/Product.udo.json')).document as UdoDocument;
    const out = await renderUrpcResource(doc);
    expect(out).toContain("import { defineResource } from '@/lib/urpc/client';");
    expect(out).toContain("from './Product';");
    expect(out).toContain('export const product = defineResource<Shape, Create, Update>({');
    expect(out).toContain('createSchema');
    expect(out).toContain('updateSchema');
  });

  it('runtime exposes defineResource, configureUrpc, and a transport interface', async () => {
    const out = await renderUrpcRuntime();
    expect(out).toContain('export function defineResource<Shape, Create, Update>');
    expect(out).toContain('export function configureUrpc');
    expect(out).toContain('export interface UrpcTransport');
    expect(out).toContain('createSchema ? createSchema.parse(input) : input');
  });

  it('buildUrpcManifest assembles the single urpc object from *.urpc.ts', () => {
    const udoDir = tempUdoDir({
      'Product.urpc.ts': '',
      'Review.urpc.ts': '',
      // Non-URPC files must be ignored.
      'Product.ts': '',
      'index.ts': '',
    });
    const manifest = buildUrpcManifest(udoDir);
    expect(manifest).toContain("import { product } from './Product.urpc';");
    expect(manifest).toContain("import { review } from './Review.urpc';");
    expect(manifest).toContain('export const urpc = {');
    expect(manifest).toContain('  product,');
    expect(manifest).toContain('  review,');
    expect(manifest).not.toContain("from './Product.ts'");
  });

  it('buildManifest (type modules) excludes urpc.ts and *.urpc.ts', () => {
    const udoDir = tempUdoDir({
      'Product.ts': '',
      'Product.urpc.ts': '',
      'urpc.ts': '',
      'index.ts': '',
    });
    const manifest = buildManifest(udoDir);
    expect(manifest).toContain("export * as Product from './Product';");
    expect(manifest).not.toContain('Product.urpc');
    expect(manifest).not.toContain("export * as urpc");
  });

  it('the generated URPC bundle typechecks together (types flow from the UDO)', async () => {
    const doc = parseUdoFile(join(projectRoot, 'examples/Product.udo.json')).document as UdoDocument;
    const diagnostics = typecheck({
      'udo/Product.ts': await renderTsModule(doc),
      'udo/Product.urpc.ts': await renderUrpcResource(doc),
      'lib/urpc/client.ts': await renderUrpcRuntime(),
      'udo/urpc.ts':
        "import { product } from './Product.urpc';\n\nexport const urpc = { product } as const;\n",
      // A consumer proving the inferred types are real (not `any`).
      'consumer.ts':
        "import { urpc } from './udo/urpc';\n" +
        "export async function demo() {\n" +
        "  const rows = await urpc.product.list();\n" +
        "  const first: string = rows[0]!.title;\n" +
        "  const made = await urpc.product.create({ title: 'x', slug: 'x', price: '1.00', status: 'draft', category_id: 1 });\n" +
        "  const madeId: number = made.id;\n" +
        "  return { first, madeId };\n" +
        "}\n",
    });
    expect(diagnostics).toEqual([]);
  });
});
