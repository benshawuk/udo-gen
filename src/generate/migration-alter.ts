import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { UdoDocument, UdoField } from '../types.js';
import { buildColumnLine } from './migration.js';
import { defaultTable } from '../utils/naming.js';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '..', '..', 'templates');
const eta = new Eta({ views: templateDir, autoEscape: false, autoTrim: false });

export interface FieldChange {
  /** Property that changed. */
  property: string;
  /** Old (snapshot) value. */
  before: unknown;
  /** New (current) value. */
  after: unknown;
}

export interface UdoDiff {
  added: { name: string; field: UdoField }[];
  removed: { name: string; field: UdoField }[];
  changed: { name: string; changes: FieldChange[]; before: UdoField; after: UdoField }[];
}

const COMPARABLE_PROPS: (keyof UdoField)[] = [
  'type',
  'format',
  'required',
  'nullable',
  'unique',
  'index',
  'default',
  'max',
  'min',
  'length',
  'precision',
  'scale',
  'references',
  'onDelete',
];

export function diffUdo(snapshot: UdoDocument, current: UdoDocument): UdoDiff {
  const snapFields = snapshot.fields ?? {};
  const curFields = current.fields ?? {};

  const added: UdoDiff['added'] = [];
  const removed: UdoDiff['removed'] = [];
  const changed: UdoDiff['changed'] = [];

  for (const name of Object.keys(curFields)) {
    if (!(name in snapFields)) {
      added.push({ name, field: curFields[name]! });
    } else {
      const changes = compareFields(snapFields[name]!, curFields[name]!);
      if (changes.length > 0) {
        changed.push({
          name,
          changes,
          before: snapFields[name]!,
          after: curFields[name]!,
        });
      }
    }
  }
  for (const name of Object.keys(snapFields)) {
    if (!(name in curFields)) {
      removed.push({ name, field: snapFields[name]! });
    }
  }

  return { added, removed, changed };
}

function compareFields(before: UdoField, after: UdoField): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const prop of COMPARABLE_PROPS) {
    const a = before[prop];
    const b = after[prop];
    if (a !== b) {
      changes.push({ property: prop, before: a, after: b });
    }
  }
  // Compare arrays (values, validation.backend etc.) shallowly
  const sValues = before.values ?? null;
  const cValues = after.values ?? null;
  if (JSON.stringify(sValues) !== JSON.stringify(cValues)) {
    changes.push({ property: 'values', before: sValues, after: cValues });
  }
  return changes;
}

export interface AlterMigrationContext {
  resource: string;
  table: string;
  addColumns: string[];
  dropColumns: string[];
  reverseAddDrops: string[]; // drops for added columns (down())
  reverseDropAdds: string[]; // adds for dropped columns (down())
  warnings: string[];
}

export function buildAlterContext(
  current: UdoDocument,
  diff: UdoDiff,
): AlterMigrationContext {
  const table = current.table ?? defaultTable(current.resource);

  const addColumns = diff.added.map(({ name, field }) => buildColumnLine(name, field));
  const dropColumns = diff.removed.map(({ name }) => `$table->dropColumn('${name}');`);

  const reverseAddDrops = diff.added.map(({ name }) => `$table->dropColumn('${name}');`);
  const reverseDropAdds = diff.removed.map(({ name, field }) => buildColumnLine(name, field));

  const warnings: string[] = [];
  for (const c of diff.changed) {
    const props = c.changes.map((cc) => cc.property).join(', ');
    warnings.push(
      `Field '${c.name}' changed (${props}). Type/constraint changes require a manual ALTER — review and edit the migration before running.`,
    );
  }

  return {
    resource: current.resource,
    table,
    addColumns,
    dropColumns,
    reverseAddDrops,
    reverseDropAdds,
    warnings,
  };
}

export async function renderAlterMigration(
  current: UdoDocument,
  diff: UdoDiff,
): Promise<string> {
  const ctx = buildAlterContext(current, diff);
  const rendered = await eta.renderAsync('migration-alter', ctx);
  if (typeof rendered !== 'string') {
    throw new Error('Eta returned non-string output for migration-alter template.');
  }
  return rendered.replace(/\n*$/, '\n');
}
