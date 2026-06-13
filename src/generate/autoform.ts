/**
 * Autoform frontend adapter (prototype).
 *
 * Emits the two files autoform consumes per feature, straight from a UDO -
 * no Scramble / api.json round-trip required:
 *
 *   1. `generated.ts`        - the `{resource}Validation` object
 *                              ({ clientRules, serverRules }). MACHINE-OWNED,
 *                              regenerated on every `udo gen`.
 *   2. `autoform-config.ts`  - a `defineFeatureConfig({...})` default export
 *                              that wires the generated validation into a CRUD
 *                              feature (endpoint, query key, table + field
 *                              widgets, modal). SCAFFOLD-ONCE - written only if
 *                              absent, then owned by the developer.
 *
 * This mirrors udo-gen's existing "generate-then-own" split (Generated/Base +
 * scaffold-once extension) on the autoform side.
 *
 * i18n note: per UDO rule #2 ("no raw human strings"), every message below is a
 * translation KEY (e.g. `products.fields.title.required`), not English. autoform's
 * FieldErrorTemplate is expected to resolve these through the app's i18n layer.
 */

import type { UdoDocument, UdoField, PrimitiveType } from '../types.js';
import { defaultTable, snakeToCamel, snakeToPascal } from '../utils/naming.js';

/** autoform's ComponentType union (src/scripts/utils/field-type-mapper.ts). */
export type AutoformComponentType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'switch'
  | 'date'
  | 'email'
  | 'number'
  | 'password';

const STRING_TYPES: PrimitiveType[] = ['string', 'text', 'longText', 'mediumText'];
const TEXTAREA_TYPES: PrimitiveType[] = ['text', 'longText', 'mediumText'];
const NUMBER_TYPES: PrimitiveType[] = [
  'integer',
  'bigInteger',
  'tinyInteger',
  'unsignedInteger',
  'unsignedTinyInteger',
  'decimal',
  'float',
  'double',
];
const DATE_TYPES: PrimitiveType[] = ['date', 'dateTime', 'timestamp', 'time'];

function endpointFromTable(table: string): string {
  return `/api/${table.replace(/_/g, '-')}`;
}

function queryKeyFromTable(table: string): string {
  return table.replace(/_/g, '-');
}

/** `products` + `title` -> `products.fields.title`. */
function fieldLabelKey(table: string, name: string): string {
  return `${table}.fields.${name}`;
}

/**
 * UDO field -> autoform component type.
 * Priority: explicit ui.widget > enum values > semantic format > primitive type
 * > name hint > text. This is the inverse of autoform's field-type-mapper, which
 * has to guess from a DB column; the UDO already states intent.
 */
export function widgetFor(name: string, field: UdoField): AutoformComponentType {
  const KNOWN: AutoformComponentType[] = [
    'text', 'textarea', 'select', 'radio', 'checkbox', 'switch', 'date', 'email', 'number', 'password',
  ];
  const widget = field.ui?.widget;
  if (widget && (KNOWN as string[]).includes(widget)) {
    return widget as AutoformComponentType;
  }

  if (Array.isArray(field.values) && field.values.length > 0) return 'select';
  if (field.type === 'foreignId') return 'select'; // options sourced from the related resource

  switch (field.format) {
    case 'email':
      return 'email';
    case 'password':
      return 'password';
    case 'markdown':
    case 'richText':
      return 'textarea'; // closest stock widget; swap for a rich editor in autoform-config
  }

  if (field.type === 'boolean') return 'switch';
  if (DATE_TYPES.includes(field.type)) return 'date';
  if (TEXTAREA_TYPES.includes(field.type)) return 'textarea';
  if (NUMBER_TYPES.includes(field.type)) return 'number';
  if (STRING_TYPES.includes(field.type)) return 'text';

  // name hints (mirror autoform's fallbacks)
  const lower = name.toLowerCase();
  if (lower.includes('password') || lower.includes('secret')) return 'password';
  if (lower.includes('email')) return 'email';

  return 'text';
}

interface ClientRule {
  field: string;
  /** Lines like `required: '...'`, `maxLength: { value: 255, message: '...' }`. */
  lines: string[];
}

/** Does this backend rule require the server (DB-aware), so it can't run client-side? */
function isServerOnlyRule(rule: string): boolean {
  return /^(unique|exists)\b/.test(rule.trim());
}

/**
 * Build autoform clientRules for one field from UDO facets.
 * Honors validation.skip.frontend (drop a facet on the client only).
 */
function clientRuleFor(table: string, name: string, field: UdoField): ClientRule {
  const key = fieldLabelKey(table, name);
  const skip = new Set(field.validation?.skip?.frontend ?? []);
  const lines: string[] = [];

  if (field.required && !field.nullable && !skip.has('required')) {
    lines.push(`required: '${key}.required'`);
  }

  const isString = STRING_TYPES.includes(field.type);
  const isNumber = NUMBER_TYPES.includes(field.type) && field.type !== 'decimal';

  if (isString) {
    if (typeof field.max === 'number' && !skip.has('max')) {
      lines.push(`maxLength: { value: ${field.max}, message: '${key}.max' }`);
    }
    if (typeof field.min === 'number' && !skip.has('min')) {
      lines.push(`minLength: { value: ${field.min}, message: '${key}.min' }`);
    }
    if (typeof field.length === 'number' && !skip.has('length')) {
      lines.push(`minLength: { value: ${field.length}, message: '${key}.length' }`);
      lines.push(`maxLength: { value: ${field.length}, message: '${key}.length' }`);
    }
  }

  if (isNumber) {
    if (typeof field.min === 'number' && !skip.has('min')) {
      lines.push(`min: { value: ${field.min}, message: '${key}.min' }`);
    }
    if (typeof field.max === 'number' && !skip.has('max')) {
      lines.push(`max: { value: ${field.max}, message: '${key}.max' }`);
    }
  }

  // Semantic-format patterns (mirror autoform's json-schema converter).
  if (!skip.has('pattern')) {
    if (field.format === 'url') {
      lines.push(`pattern: { value: /^https?:\\/\\/.+/, message: '${key}.url' }`);
    } else if (field.format === 'slug') {
      lines.push(`pattern: { value: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: '${key}.slug' }`);
    } else if (field.type === 'decimal') {
      lines.push(`pattern: { value: /^-?\\d+(\\.\\d+)?$/, message: '${key}.decimal' }`);
    }
  }

  // Enum -> "must be one of" pattern, matching the converter's behaviour.
  if (Array.isArray(field.values) && field.values.length > 0 && !skip.has('values')) {
    const alt = field.values
      .map((v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    lines.push(`pattern: { value: /^(${alt})$/, message: '${key}.in' }`);
  }

  return { field: name, lines };
}

export interface AutoformContext {
  resource: string;       // Product
  resourceCamel: string;  // product   (export prefix: productValidation)
  table: string;          // products
  endpoint: string;       // /api/products
  queryKey: string;       // products
  clientRules: ClientRule[];
  serverRules: string[];  // fields needing server validation (DB-aware rules)
  fields: {
    name: string;
    widget: AutoformComponentType;
    options?: (string | number)[];
    nullable: boolean;
    isForeignId: boolean;
    references?: string;
    displayField?: string;
  }[];
}

export function buildAutoformContext(doc: UdoDocument): AutoformContext {
  const table = doc.table ?? defaultTable(doc.resource);
  const entries = Object.entries(doc.fields);

  const clientRules = entries.map(([name, field]) => clientRuleFor(table, name, field));

  const serverRules = entries
    .filter(([, field]) => (field.validation?.backend ?? []).some(isServerOnlyRule))
    .map(([name]) => name);

  const fields = entries.map(([name, field]) => ({
    name,
    widget: widgetFor(name, field),
    options: field.values,
    nullable: Boolean(field.nullable),
    isForeignId: field.type === 'foreignId',
    references: field.references,
    displayField: field.displayField,
  }));

  return {
    resource: doc.resource,
    resourceCamel: snakeToCamel(doc.resource.charAt(0).toLowerCase() + doc.resource.slice(1)),
    table,
    endpoint: endpointFromTable(table),
    queryKey: queryKeyFromTable(table),
    clientRules,
    serverRules,
    fields,
  };
}

/** Renders `generated.ts` (machine-owned, regenerated every run). */
export function renderAutoformGenerated(doc: UdoDocument): string {
  const ctx = buildAutoformContext(doc);
  const validationName = `${ctx.resourceCamel}Validation`;

  const rulesBody = ctx.clientRules
    .map((r) => {
      if (r.lines.length === 0) return `    ${r.field}: {},`;
      const inner = r.lines.map((l) => `      ${l},`).join('\n');
      return `    ${r.field}: {\n${inner}\n    },`;
    })
    .join('\n');

  const serverBody = ctx.serverRules.map((f) => `'${f}'`).join(', ');

  return `/**
 * AUTO-GENERATED by udo-gen (autoform target) - DO NOT EDIT.
 * Source: ${ctx.resource} UDO. Regenerate with \`udo gen ${ctx.resource} --target autoform\`.
 *
 * Validation comes straight from the UDO. No Scramble export, no api.json.
 * Messages are translation KEYS; resolve them in autoform's FieldErrorTemplate.
 */

export const ${validationName} = {
  clientRules: {
${rulesBody}
  },
  // DB-aware rules (unique/exists) can only run on the server.
  serverRules: [${serverBody}],
} as const;

export type ${ctx.resource}FormData = Record<string, unknown>;
`;
}

/** Renders `autoform-config.ts` (scaffold-once; write only if absent). */
export function renderAutoformConfig(doc: UdoDocument): string {
  const ctx = buildAutoformContext(doc);
  const validationName = `${ctx.resourceCamel}Validation`;
  const rulesName = `${ctx.resourceCamel}Rules`;

  const metaBody = ctx.fields
    .map((f) => {
      const parts = [`componentType: '${f.widget}'`];
      if (f.options && f.options.length > 0) {
        const opts = f.options.map((o) => `'${String(o)}'`).join(', ');
        parts.push(`options: [${opts}]`);
      }
      if (f.nullable) parts.push('nullable: true');
      if (f.isForeignId) {
        const ref = f.references ? ` from ${f.references}` : '';
        const disp = f.displayField ? `, labelled by '${f.displayField}'` : '';
        parts.push(`/* FK${ref}${disp}: populate options from the related resource */`);
      }
      return `        ${f.name}: { ${parts.join(', ')} },`;
    })
    .join('\n');

  const allFields = ctx.fields.map((f) => `'${f.name}'`).join(', ');

  return `// SCAFFOLD-ONCE: udo-gen wrote this once and will NOT overwrite it. Edit freely.
// The regenerated validation facts live in ./generated.ts.

import { defineFeatureConfig, defineRules } from '@/lib/autoform';
import { ${validationName} } from './generated';

// Merge generated rules with your overrides (messages, masks, client-only checks).
export const ${rulesName} = defineRules(${validationName}, {
  // e.g. slug: { mask: undefined }, price: { timing: 'blur' },
});

export default defineFeatureConfig({
  endpoint: '${ctx.endpoint}',
  method: 'POST',
  resourceName: '${ctx.resource}',
  rules: ${rulesName}.clientRules,

  crud: {
    listQuery: { queryKey: ['${ctx.queryKey}'] },
    table: {
      visibleFields: [${allFields}],
      editableFields: [${allFields}],
      fieldMetadata: {
${metaBody}
      },
    },
  },

  modal: {
    // titles/buttons inherit from the global autoform.config.ts
  },
});
`;
}
