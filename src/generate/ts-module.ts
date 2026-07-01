import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { UdoDocument, UdoField, PrimitiveType } from '../types.js';
import { defaultTable } from '../utils/naming.js';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '..', '..', 'templates');
const eta = new Eta({ views: templateDir, autoEscape: false, autoTrim: false });

const STRING_TYPES: PrimitiveType[] = ['string', 'text', 'longText', 'mediumText'];
const INT_TYPES: PrimitiveType[] = [
  'integer',
  'bigInteger',
  'tinyInteger',
  'unsignedInteger',
  'unsignedTinyInteger',
  'foreignId',
];
const UNSIGNED_TYPES: PrimitiveType[] = [
  'unsignedInteger',
  'unsignedTinyInteger',
  'foreignId',
];

function endpointFromTable(table: string): string {
  return `/api/${table.replace(/_/g, '-')}`;
}

function queryKeyFromTable(table: string): string {
  return table.replace(/_/g, '-');
}

/**
 * Returns the base Zod expression for a field, BEFORE applying nullable/optional modifiers.
 */
function baseZodExpression(field: UdoField): string {
  // Enum overrides everything (must be string/number literal list)
  if (Array.isArray(field.values) && field.values.length > 0) {
    const allStrings = field.values.every((v) => typeof v === 'string');
    if (allStrings) {
      const literals = field.values.map((v) => `'${String(v)}'`).join(', ');
      return `z.enum([${literals}])`;
    }
    const literals = field.values.map((v) => `z.literal(${JSON.stringify(v)})`).join(', ');
    return `z.union([${literals}])`;
  }

  if (STRING_TYPES.includes(field.type)) {
    let expr = 'z.string()';
    switch (field.format) {
      case 'email':
        expr += '.email()';
        break;
      case 'url':
        expr += '.url()';
        break;
      case 'uuid':
        expr += '.uuid()';
        break;
      case 'ipAddress':
        expr += '.ip()';
        break;
      case 'slug':
        expr += ".regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be kebab-case')";
        break;
    }
    if (typeof field.length === 'number') expr += `.length(${field.length})`;
    if (field.required && typeof field.min !== 'number' && typeof field.length !== 'number') {
      expr += '.min(1)';
    }
    if (typeof field.min === 'number') expr += `.min(${field.min})`;
    if (typeof field.max === 'number') expr += `.max(${field.max})`;
    return expr;
  }

  if (INT_TYPES.includes(field.type)) {
    let expr = 'z.number().int()';
    if (UNSIGNED_TYPES.includes(field.type)) expr += '.nonnegative()';
    if (typeof field.min === 'number') expr += `.min(${field.min})`;
    if (typeof field.max === 'number') expr += `.max(${field.max})`;
    return expr;
  }

  if (field.type === 'decimal' || field.type === 'float' || field.type === 'double') {
    // Decimals serialized as strings to preserve precision; numerics as numbers
    if (field.type === 'decimal') {
      return "z.string().regex(/^-?\\d+(\\.\\d+)?$/, 'Must be a decimal')";
    }
    let expr = 'z.number()';
    if (typeof field.min === 'number') expr += `.min(${field.min})`;
    if (typeof field.max === 'number') expr += `.max(${field.max})`;
    return expr;
  }

  if (field.type === 'boolean') return 'z.boolean()';

  if (field.type === 'date' || field.type === 'dateTime' || field.type === 'timestamp') {
    return "z.string().datetime({ offset: true }).or(z.string().date())";
  }

  if (field.type === 'time') return "z.string().regex(/^\\d{2}:\\d{2}(:\\d{2})?$/)";

  if (field.type === 'json') return 'z.unknown()';

  if (field.type === 'uuid') return 'z.string().uuid()';

  if (field.type === 'binary') return 'z.string()';

  return 'z.unknown()';
}

function withModifiers(expr: string, field: UdoField): string {
  let result = expr;
  if (field.nullable) result += '.nullable()';
  if (!field.required) result += '.optional()';
  return result;
}

function tsType(field: UdoField): string {
  let base: string;

  if (Array.isArray(field.values) && field.values.length > 0) {
    base = field.values
      .map((v) => (typeof v === 'string' ? `'${v}'` : String(v)))
      .join(' | ');
  } else if (STRING_TYPES.includes(field.type)) {
    base = 'string';
  } else if (INT_TYPES.includes(field.type)) {
    base = 'number';
  } else if (field.type === 'decimal') {
    base = 'string'; // decimals as strings
  } else if (field.type === 'float' || field.type === 'double') {
    base = 'number';
  } else if (field.type === 'boolean') {
    base = 'boolean';
  } else if (
    field.type === 'date' ||
    field.type === 'dateTime' ||
    field.type === 'timestamp' ||
    field.type === 'time'
  ) {
    base = 'string';
  } else if (field.type === 'json') {
    base = 'unknown';
  } else if (field.type === 'uuid') {
    base = 'string';
  } else if (field.type === 'binary') {
    base = 'string';
  } else {
    base = 'unknown';
  }

  return field.nullable ? `${base} | null` : base;
}

export interface TsField {
  name: string;
  zod: string;
  shapeType: string;
  isRequired: boolean;
}

export interface TsModuleContext {
  resource: string;
  table: string;
  endpoint: string;
  queryKey: string;
  labelKey: string;
  fields: TsField[];
  /** Fields that appear in the read Shape (all fields minus hidden ones). */
  shapeFields: { name: string; shapeType: string }[];
  /** Computed accessors ($appends) — read-only, serialized, not writable. */
  appends: { name: string; shapeType: string }[];
  fieldsMetadata: { name: string; meta: string }[];
  timestamps: boolean;
}

function fieldMetadataExpr(field: UdoField): string {
  const props: string[] = [];
  props.push(`type: '${field.type}'`);
  if (field.format) props.push(`format: '${field.format}'`);
  if (field.required) props.push('required: true');
  if (field.nullable) props.push('nullable: true');
  if (field.unique) props.push('unique: true');
  if (typeof field.max === 'number') props.push(`max: ${field.max}`);
  if (typeof field.min === 'number') props.push(`min: ${field.min}`);
  if (typeof field.length === 'number') props.push(`length: ${field.length}`);
  if (Array.isArray(field.values)) {
    const vs = field.values
      .map((v) => (typeof v === 'string' ? `'${v}'` : String(v)))
      .join(', ');
    props.push(`values: [${vs}] as const`);
  }
  return `{ ${props.join(', ')} }`;
}

export function buildTsModuleContext(doc: UdoDocument): TsModuleContext {
  const table = doc.table ?? defaultTable(doc.resource);
  const fields: TsField[] = Object.entries(doc.fields).map(([name, field]) => ({
    name,
    zod: withModifiers(baseZodExpression(field), field),
    shapeType: tsType(field),
    isRequired: field.required ?? false,
  }));
  const fieldsMetadata = Object.entries(doc.fields).map(([name, field]) => ({
    name,
    meta: fieldMetadataExpr(field),
  }));
  // Read Shape = serialized fields (drop hidden) + computed appends.
  const shapeFields = Object.entries(doc.fields)
    .filter(([, field]) => !field.hidden)
    .map(([name, field]) => ({ name, shapeType: tsType(field) }));
  const appends = Object.entries(doc.appends ?? {}).map(([name, spec]) => ({
    name,
    shapeType: tsType({ type: spec.type, nullable: spec.nullable } as UdoField),
  }));
  return {
    resource: doc.resource,
    table,
    endpoint: endpointFromTable(table),
    queryKey: queryKeyFromTable(table),
    labelKey: table,
    fields,
    shapeFields,
    appends,
    fieldsMetadata,
    timestamps: doc.timestamps ?? true,
  };
}

export async function renderTsModule(doc: UdoDocument): Promise<string> {
  const ctx = buildTsModuleContext(doc);
  const rendered = await eta.renderAsync('ts-module', ctx);
  if (typeof rendered !== 'string') {
    throw new Error('Eta returned non-string output for ts-module template.');
  }
  return rendered.replace(/\n*$/, '\n');
}
