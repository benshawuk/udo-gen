import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { UdoDocument, UdoField, UdoIndex, PrimitiveType } from '../types.js';

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

function defaultTable(resource: string): string {
  const snake = resource.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return snake.endsWith('s') ? snake : `${snake}s`;
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

function blueprintCall(name: string, field: UdoField): string {
  const type = field.type;

  // foreignId is special — uses constrained() chain
  if (type === 'foreignId') {
    const refTable = field.references ? pivotTableFromReferences(field.references) : undefined;
    const parts = [`$table->foreignId('${name}')`];
    if (refTable) parts.push(`->constrained('${refTable}')`);
    if (field.onDelete) parts.push(`->onDelete('${field.onDelete}')`);
    return parts.join('');
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

function modifierChain(field: UdoField): string {
  const parts: string[] = [];
  if (field.nullable) parts.push('->nullable()');
  if (field.default !== undefined) parts.push(`->default(${phpLiteral(field.default)})`);
  // foreignId carries its own unique-via-DB-constraint story; skip these modifiers on FK columns.
  if (field.type !== 'foreignId') {
    if (field.unique) parts.push('->unique()');
    if (field.index) parts.push('->index()');
  } else {
    // FK columns can still be uniquely indexed (e.g. one-to-one)
    if (field.unique) parts.push('->unique()');
  }
  return parts.join('');
}

export function buildColumnLine(name: string, field: UdoField): string {
  return `${blueprintCall(name, field)}${modifierChain(field)};`;
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
