import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTsModule } from '../../src/generate/ts-module.js';
import {
  renderScaffoldPage,
  renderResourcePageRuntime,
  scaffoldPagePath,
} from '../../src/generate/react-scaffold.js';
import { parseUdoFile } from '../../src/parse.js';
import type { UdoDocument } from '../../src/types.js';

// Whole-frontend contract test. The ts-typecheck suite only compiles a single
// generated module in isolation. This compiles the FULL generated frontend
// surface together - the TS module, the barrel manifest, the per-resource
// scaffold page, and the ResourcePage runtime - so the contract between them
// (the namespace shape ResourcePage consumes, the `@/udo` + `@/lib` aliases,
// JSX) is guarded against drift.
//
// react / @tanstack/react-query aren't deps of this package, so we stand up
// minimal stub packages in a virtual node_modules rather than installing them.

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..', '..');
// A virtual root *inside* projectRoot so bare specifiers like `zod` resolve by
// walking up into the real node_modules, while `@/*` maps to our virtual tree.
const VROOT = resolve(projectRoot, '__vfe__');

const REACT_DTS = `
export function createElement(...args: any[]): any;
export const Fragment: any;
`;

const REACT_QUERY_DTS = `
export function useQuery<T>(opts: {
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
}): { data: T | undefined; isLoading: boolean; isError: boolean; error: unknown };
`;

// Global (non-module) ambient file: provides the JSX namespace.
const JSX_DTS = `
declare namespace JSX {
  interface Element {}
  interface ElementClass {}
  interface IntrinsicAttributes {
    key?: string | number;
  }
  interface IntrinsicElements {
    [name: string]: any;
  }
}
`;

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  esModuleInterop: true,
  jsx: ts.JsxEmit.React,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  baseUrl: VROOT,
  paths: { '@/*': ['./*'] },
};

interface Bundle {
  /** App files compiled as program roots. */
  roots: Record<string, string>;
  /** Stub dependency files, resolved on demand (not program roots). */
  deps: Record<string, string>;
}

function typecheckBundle(bundle: Bundle): ts.Diagnostic[] {
  const virtual = new Map<string, string>();
  for (const [rel, contents] of Object.entries({ ...bundle.roots, ...bundle.deps })) {
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
      if (virtual.has(resolve(fileName))) return true;
      return realHost.fileExists(fileName);
    },
    readFile(fileName) {
      const v = virtual.get(resolve(fileName));
      if (v !== undefined) return v;
      return realHost.readFile(fileName);
    },
    // Module resolution skips directories the host says don't exist, so the
    // virtual tree (incl. node_modules stubs) must be reported as present.
    directoryExists(dirName) {
      const d = resolve(dirName);
      for (const f of virtual.keys()) {
        if (f === d || f.startsWith(d + '/')) return true;
      }
      return realHost.directoryExists ? realHost.directoryExists(dirName) : false;
    },
  };

  const rootNames = Object.keys(bundle.roots).map((rel) => resolve(VROOT, rel));
  const program = ts.createProgram(rootNames, compilerOptions, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => !!d.file && d.file.fileName.startsWith(VROOT) && !d.file.fileName.includes('node_modules'));
}

function formatDiagnostic(d: ts.Diagnostic): string {
  const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
  if (d.file && d.start !== undefined) {
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    const rel = d.file.fileName.slice(VROOT.length + 1);
    return `${rel}:${line + 1}:${character + 1} - ${msg}`;
  }
  return msg;
}

async function buildBundle(doc: UdoDocument): Promise<Bundle> {
  const { featureDir, filename } = scaffoldPagePath(doc);
  const roots: Record<string, string> = {
    [`udo/${doc.resource}.ts`]: await renderTsModule(doc),
    // Manifest shape the generator emits for this single module.
    ['udo/index.ts']: `export * as ${doc.resource} from './${doc.resource}';\n`,
    ['lib/udo-ui/resource-page.tsx']: await renderResourcePageRuntime(),
    [`features/${featureDir}/${filename}`]: await renderScaffoldPage(doc),
    ['jsx.d.ts']: JSX_DTS,
  };
  const deps: Record<string, string> = {
    ['node_modules/react/package.json']: JSON.stringify({ name: 'react', types: 'index.d.ts' }),
    ['node_modules/react/index.d.ts']: REACT_DTS,
    ['node_modules/@tanstack/react-query/package.json']: JSON.stringify({
      name: '@tanstack/react-query',
      types: 'index.d.ts',
    }),
    ['node_modules/@tanstack/react-query/index.d.ts']: REACT_QUERY_DTS,
  };
  return { roots, deps };
}

describe('Generated frontend bundle typechecks as a whole', () => {
  it('Product.udo.json → module + manifest + page + runtime compile together', async () => {
    const doc = parseUdoFile(join(projectRoot, 'examples/Product.udo.json')).document as UdoDocument;
    const diagnostics = typecheckBundle(await buildBundle(doc));
    expect(diagnostics.map(formatDiagnostic)).toEqual([]);
  });

  it('VerificationCode.udo.json → full bundle compiles together', async () => {
    const doc = parseUdoFile(join(projectRoot, 'examples/VerificationCode.udo.json'))
      .document as UdoDocument;
    const diagnostics = typecheckBundle(await buildBundle(doc));
    expect(diagnostics.map(formatDiagnostic)).toEqual([]);
  });
});
