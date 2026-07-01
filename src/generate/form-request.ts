import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { UdoDocument, UdoField, PrimitiveType } from '../types.js';
import { ownedByColumn } from '../utils/doc.js';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '..', '..', 'templates');
const eta = new Eta({ views: templateDir, autoEscape: false, autoTrim: false });

const NUMERIC_TYPES: PrimitiveType[] = [
  'integer',
  'bigInteger',
  'tinyInteger',
  'unsignedInteger',
  'unsignedTinyInteger',
  'foreignId',
];

const DATE_TYPES: PrimitiveType[] = ['date', 'dateTime', 'timestamp'];

const STRING_LIKE_TYPES: PrimitiveType[] = [
  'string',
  'text',
  'longText',
  'mediumText',
];

function typeRule(field: UdoField): string | null {
  if (STRING_LIKE_TYPES.includes(field.type)) return 'string';
  if (NUMERIC_TYPES.includes(field.type)) return 'integer';
  if (field.type === 'decimal' || field.type === 'float' || field.type === 'double')
    return 'numeric';
  if (field.type === 'boolean') return 'boolean';
  if (DATE_TYPES.includes(field.type)) return 'date';
  if (field.type === 'time') return 'date_format:H:i:s';
  if (field.type === 'json') return 'array';
  if (field.type === 'uuid') return 'uuid';
  if (field.type === 'binary') return 'string';
  return null;
}

function formatRule(field: UdoField): string | null {
  switch (field.format) {
    case 'email':
      return 'email';
    case 'url':
      return 'url';
    case 'uuid':
      return 'uuid';
    case 'ipAddress':
      return 'ip';
    case 'slug':
      // Slug is shape, not a Laravel rule; we use a regex.
      return 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/';
    default:
      return null;
  }
}

export interface FieldRule {
  field: string;
  rules: string[]; // The portion AFTER the required/sometimes prefix
}

export function buildFieldRules(name: string, field: UdoField): FieldRule {
  const rules: string[] = [];

  if (field.nullable) rules.push('nullable');

  const t = typeRule(field);
  if (t) rules.push(t);

  const fmt = formatRule(field);
  if (fmt) rules.push(fmt);

  // Length/size for strings
  if (STRING_LIKE_TYPES.includes(field.type)) {
    if (typeof field.length === 'number') rules.push(`size:${field.length}`);
    if (typeof field.max === 'number') rules.push(`max:${field.max}`);
    if (typeof field.min === 'number') rules.push(`min:${field.min}`);
  }

  // min/max for numeric
  if (
    NUMERIC_TYPES.includes(field.type) ||
    field.type === 'decimal' ||
    field.type === 'float' ||
    field.type === 'double'
  ) {
    if (typeof field.min === 'number') rules.push(`min:${field.min}`);
    if (typeof field.max === 'number') rules.push(`max:${field.max}`);
  }

  // Enum
  if (Array.isArray(field.values) && field.values.length > 0) {
    rules.push(`in:${field.values.join(',')}`);
  }

  // Foreign key existence (implied from references)
  if (field.type === 'foreignId' && typeof field.references === 'string') {
    const [table, col] = field.references.split('.');
    if (table && col) rules.push(`exists:${table},${col}`);
  }

  // User-supplied backend extras (overrides/additions)
  if (field.validation?.backend) {
    rules.push(...field.validation.backend);
  }

  // Skip rules listed in validation.skip.backend
  const skip = new Set(field.validation?.skip?.backend ?? []);
  const filtered = rules.filter((r) => !skip.has(r.split(':')[0] ?? r));

  return { field: name, rules: filtered };
}

function phpArrayLiteral(rules: string[], leadOption: string): string {
  // Renders the inline ternary for required/sometimes, then the rest as PHP strings.
  const tail = rules.map((r) => `'${r}'`).join(', ');
  if (tail.length === 0) return `[${leadOption}]`;
  return `[${leadOption}, ${tail}]`;
}

export interface FormRequestContext {
  resource: string;
  rows: { field: string; expression: string }[];
}

export function buildFormRequestContext(doc: UdoDocument): FormRequestContext {
  // The ownedBy column is server-managed (forced from auth()->id() on store),
  // so the client is never allowed to supply it.
  const owned = ownedByColumn(doc);
  const rows = Object.entries(doc.fields)
    .filter(([name]) => name !== owned)
    .map(([name, field]) => {
      const fr = buildFieldRules(name, field);
      const lead = field.required
        ? `$isUpdate ? 'sometimes' : 'required'`
        : field.nullable
          ? `'nullable'`
          : `$isUpdate ? 'sometimes' : 'nullable'`;
      // Remove duplicates if lead already covers nullable
      const dedup = fr.rules.filter((r) => r !== 'nullable' || !field.nullable);
      return { field: name, expression: phpArrayLiteral(dedup, lead) };
    });
  return { resource: doc.resource, rows };
}

export async function renderFormRequest(doc: UdoDocument): Promise<string> {
  const ctx = buildFormRequestContext(doc);
  const rendered = await eta.renderAsync('form-request', ctx);
  if (typeof rendered !== 'string') {
    throw new Error('Eta returned non-string output for form-request template.');
  }
  return rendered.replace(/\n*$/, '\n');
}
