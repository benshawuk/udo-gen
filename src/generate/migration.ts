import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { UdoDocument, UdoField, UdoIndex, PrimitiveType } from '../types.js';
import { defaultTable } from '../utils/naming.js';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '..', '..', 'templates');
const eta = new Eta({ views: templateDir, autoEscape: false, autoTrim: false });

export interface MigrationContext {
  resource: string;
  table: string;
  timestamps: boolean;
  softDeletes: boolean;
  columns: string[];
  compositeIndexes: { columns: string[]; unique: boolean; name?: string }[];
}


function phpLiteral(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "\\'")}'`;
}

function pivotTableFromReferences(references: string): string {
  // 'categories.id' -> 'categories'
  const dot = references.indexOf('.');
  return dot === -1 ? references : references.slice(0, dot);
}

const STRING_TYPES: PrimitiveType[] = ['string'];

/**
 * The bare column definition, WITHOUT any modifiers or FK constraint.
 * e.g. `$table->foreignId('parent_id')`, `$table->decimal('price', 10, 2)`.
 */
function blueprintBase(name: string, field: UdoField): string {
  const type = field.type;

  if (type === 'foreignId') {
    return `$table->foreignId('${name}')`;
  }

  // decimal takes precision + scale
  if (type === 'decimal') {
    const precision = field.precision ?? 8;
    const scale = field.scale ?? 2;
    return `$table->decimal('${name}', ${precision}, ${scale})`;
  }

  // string with explicit length
  if (STRING_TYPES.includes(type) && typeof field.length === 'number') {
    return `$table->string('${name}', ${field.length})`;
  }

  return `$table->${type}('${name}')`;
}

/**
 * Column-level modifiers. These MUST be emitted before any constrained() call:
 * constrained() returns a ForeignKeyDefinition, so modifiers chained after it
 * (especially nullable()) never reach the column. A NOT NULL column with
 * `ON DELETE SET NULL` is rejected by the database (MySQL errno 150).
 */
function modifierChain(field: UdoField): string {
  const parts: string[] = [];
  if (field.nullable) parts.push('->nullable()');
  if (field.default !== undefined) parts.push(`->default(${phpLiteral(field.default)})`);
  if (field.unique) parts.push('->unique()');
  // A constrained() FK already creates an index, so an explicit ->index() would
  // be a duplicate. But a bare foreignId WITHOUT references gets no constrained()
  // call, so it still needs the explicit index when requested.
  const constrainedWillIndex = field.type === 'foreignId' && !!field.references;
  if (field.index && !constrainedWillIndex) parts.push('->index()');
  return parts.join('');
}

/**
 * The foreign-key constraint chain, emitted AFTER the column modifiers so the
 * column (incl. nullable) is fully defined before the constraint is built.
 */
function foreignKeyChain(field: UdoField): string {
  if (field.type !== 'foreignId' || !field.references) return '';
  const parts: string[] = [];
  const refTable = pivotTableFromReferences(field.references);
  parts.push(`->constrained('${refTable}')`);
  if (field.onDelete) parts.push(`->onDelete('${field.onDelete}')`);
  return parts.join('');
}

export function buildColumnLine(name: string, field: UdoField): string {
  return `${blueprintBase(name, field)}${modifierChain(field)}${foreignKeyChain(field)};`;
}

export function buildMigrationContext(doc: UdoDocument): MigrationContext {
  const columns: string[] = ['$table->id();'];

  for (const [name, field] of Object.entries(doc.fields)) {
    columns.push(buildColumnLine(name, field));
  }

  const timestamps = doc.timestamps ?? true;
  const softDeletes = doc.softDeletes ?? false;

  // timestamps() and softDeletes() emitted in template (positioning matters).

  const compositeIndexes = (doc.indexes ?? []).map((i: UdoIndex) => ({
    columns: i.columns,
    unique: i.unique ?? false,
    name: i.name,
  }));

  return {
    resource: doc.resource,
    table: doc.table ?? defaultTable(doc.resource),
    timestamps,
    softDeletes,
    columns,
    compositeIndexes,
  };
}

export async function renderMigration(doc: UdoDocument): Promise<string> {
  const ctx = buildMigrationContext(doc);
  const rendered = await eta.renderAsync('migration-create', ctx);
  if (typeof rendered !== 'string') {
    throw new Error('Eta returned non-string output for migration-create template.');
  }
  return rendered.replace(/\n*$/, '\n');
}
