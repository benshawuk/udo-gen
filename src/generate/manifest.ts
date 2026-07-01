import { existsSync, readdirSync } from 'node:fs';

/**
 * Scan a target udo TS module directory and build the manifest's contents.
 * Output: `export * as {Resource} from './{Resource}';` per UDO module found.
 */
export function buildManifest(udoDir: string): string {
  const header =
    '// AUTO-GENERATED manifest of all UDO modules in this directory.\n' +
    '// DO NOT EDIT. Refreshed on every `udo gen` run.\n\n';

  if (!existsSync(udoDir)) return header;

  const entries = readdirSync(udoDir)
    // Type modules only: exclude this manifest, the URPC client manifest, and
    // the per-resource `*.urpc.ts` clients (those go in the separate urpc.ts).
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts' && f !== 'urpc.ts' && !f.endsWith('.urpc.ts'))
    .map((f) => f.replace(/\.ts$/, ''))
    .sort();

  if (entries.length === 0) return header;

  const exports = entries
    .map((name) => `export * as ${name} from './${name}';`)
    .join('\n');

  return `${header}${exports}\n`;
}
