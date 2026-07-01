import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { UdoDocument } from '../types.js';
import { pascalToCamel } from '../utils/naming.js';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '..', '..', 'templates');
const eta = new Eta({ views: templateDir, autoEscape: false, autoTrim: false });

/**
 * The URPC runtime (scaffold-once). Transport-agnostic; the project wires it to
 * its HTTP client via configureUrpc(). Generated per-resource clients depend
 * only on this file, never the app's axios directly.
 */
export async function renderUrpcRuntime(): Promise<string> {
  const rendered = await eta.renderAsync('urpc-runtime', {});
  if (typeof rendered !== 'string') {
    throw new Error('Eta returned non-string output for urpc-runtime template.');
  }
  return rendered.replace(/\n*$/, '\n');
}

/**
 * A per-resource URPC client: `export const <camel> = defineResource<...>(...)`,
 * built purely from the resource's already-generated TS UDO module exports.
 */
export async function renderUrpcResource(doc: UdoDocument): Promise<string> {
  const rendered = await eta.renderAsync('urpc-resource', {
    resource: doc.resource,
    camel: pascalToCamel(doc.resource),
  });
  if (typeof rendered !== 'string') {
    throw new Error('Eta returned non-string output for urpc-resource template.');
  }
  return rendered.replace(/\n*$/, '\n');
}

/**
 * Scan the udo TS module directory for `*.urpc.ts` clients and assemble the
 * single `urpc` object, e.g. `export const urpc = { promotion, review } as const;`.
 * Sibling of buildManifest(), which handles the type modules.
 */
export function buildUrpcManifest(udoDir: string): string {
  const header =
    '// AUTO-GENERATED URPC client manifest. DO NOT EDIT.\n' +
    '// Refreshed on every `udo gen` run.\n\n';

  if (!existsSync(udoDir)) return header;

  const resources = readdirSync(udoDir)
    .filter((f) => f.endsWith('.urpc.ts'))
    .map((f) => f.slice(0, -'.urpc.ts'.length))
    .sort();

  if (resources.length === 0) return header;

  const imports = resources
    .map((r) => `import { ${pascalToCamel(r)} } from './${r}.urpc';`)
    .join('\n');
  const members = resources.map((r) => `  ${pascalToCamel(r)},`).join('\n');

  return `${header}${imports}\n\nexport const urpc = {\n${members}\n} as const;\n`;
}
