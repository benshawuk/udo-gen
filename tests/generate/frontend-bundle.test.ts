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

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..', '..');
// A virtual root *inside* projectRoot so bare specifiers like `zod` resolve by
// walking up into the real node_modules, while `@/*` maps to our virtual tree.
const VROOT = resolve(projectRoot, '__vfe__');

// Ambient stubs so we don't need react / @tanstack/react-query installed here.
// useQuery is generic over its queryFn result so `data` stays strongly typed
// (otherwise the runtime's row mapping would trip noImplicitAny).
const GLOBALS_DTS = `
declare module 'react' {
  export function createElement(...args: any[]): any;
  export const Fragment: any;
}
declare module '@tanstack/react-query' {
  export function useQuery<T>(opts: {
    queryKey: readonly unknown[];
    queryFn: () => Promise<T>;
  }): { data: T | undefined; isLoading: boolean; isError: boolean; error: unknown };
}
declare global {
  namespace JSX {
    interface Element {}
    interface ElementClass {}
    interface IntrinsicAttributes {
      key?: string | number;
    }
    interface IntrinsicElements {
      [name: string]: any;
    }
  }
}
export {};
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

function typecheckBundle(files: Record<string, string>): ts.Diagnostic[] {
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
      if (virtual.has(resolve(fileName))) return true;
      return realHost.fileExists(fileName);
    },
    readFile(fileName) {
      const v = virtual.get(resolve(fileName));
      if (v !== undefined) return v;
      return realHost.readFile(fileName);
    },
    // Module resolution skips directories the host says don't exist, so the
    // virtual tree must be reported as present.
    directoryExists(dirName) {
      const d = resolve(dirName);
      for (const f of virtual.keys()) {
        if (f === d || f.startsWith(d + '/')) return true;
      }
      return realHost.directoryExists ? realHost.directoryExists(dirName) : false;
    },
  };

  const rootNames = [...virtual.keys()];
  const program = ts.createProgram(rootNames, compilerOptions, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => !!d.file && d.file.fileName.startsWith(VROOT));
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

async function buildVirtualBundle(doc: UdoDocument): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  files[`udo/${doc.resource}.ts`] = await renderTsModule(doc);

  // Manifest: derive the export line the generator would emit for this module
  // (buildManifest reads a real dir; here we only have one module, so emit it
  // directly with the same shape).
  files['udo/index.ts'] = `export * as ${doc.resource} from './${doc.resource}';\n`;

  files['lib/udo-ui/resource-page.tsx'] = await renderResourcePageRuntime();

  const { featureDir, filename } = scaffoldPagePath(doc);
  files[`features/${featureDir}/${filename}`] = await renderScaffoldPage(doc);

  files['globals.d.ts'] = GLOBALS_DTS;
  return files;
}

describe('Generated frontend bundle typechecks as a whole', () => {
  it('Product.udo.json → module + manifest + page + runtime compile together', async () => {
    const doc = parseUdoFile(join(projectRoot, 'examples/Product.udo.json')).document as UdoDocument;
    const diagnostics = typecheckBundle(await buildVirtualBundle(doc));
    expect(diagnostics.map(formatDiagnostic)).toEqual([]);
  });

  it('VerificationCode.udo.json → full bundle compiles together', async () => {
    const doc = parseUdoFile(join(projectRoot, 'examples/VerificationCode.udo.json'))
      .document as UdoDocument;
    const diagnostics = typecheckBundle(await buildVirtualBundle(doc));
    expect(diagnostics.map(formatDiagnostic)).toEqual([]);
  });
});
