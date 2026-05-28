import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { UdoDocument } from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '..', '..', 'templates');
const eta = new Eta({ views: templateDir, autoEscape: false, autoTrim: false });

function titleCase(input: string): string {
  return input
    .split(/[_\-\s]+/)
    .map((s) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join(' ');
}

/** Derive the human label for a field, stripping `_id` suffix on FK columns. */
function fieldLabel(name: string): string {
  if (name.endsWith('_id')) return titleCase(name.slice(0, -3));
  return titleCase(name);
}

function defaultTable(resource: string): string {
  const snake = resource.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return snake.endsWith('s') ? snake : `${snake}s`;
}

export interface LangStarterContext {
  resource: string;
  resourceLabel: string;
  resourcePluralLabel: string;
  fields: { key: string; label: string }[];
  enums: { field: string; values: { key: string; label: string }[] }[];
}

export function buildLangStarterContext(doc: UdoDocument): LangStarterContext {
  const fields: LangStarterContext['fields'] = Object.keys(doc.fields).map((name) => ({
    key: name,
    label: fieldLabel(name),
  }));

  const enums: LangStarterContext['enums'] = [];
  for (const [name, field] of Object.entries(doc.fields)) {
    if (Array.isArray(field.values) && field.values.length > 0) {
      enums.push({
        field: name,
        values: field.values.map((v) => ({
          key: String(v),
          label: titleCase(String(v)),
        })),
      });
    }
  }

  const table = doc.table ?? defaultTable(doc.resource);

  return {
    resource: doc.resource,
    resourceLabel: titleCase(doc.resource.replace(/([a-z0-9])([A-Z])/g, '$1 $2')),
    resourcePluralLabel: titleCase(table.replace(/_/g, ' ')),
    fields,
    enums,
  };
}

export async function renderLangStarter(doc: UdoDocument): Promise<string> {
  const ctx = buildLangStarterContext(doc);
  const rendered = await eta.renderAsync('lang-starter', ctx);
  if (typeof rendered !== 'string') {
    throw new Error('Eta returned non-string output for lang-starter template.');
  }
  return rendered.replace(/\n*$/, '\n');
}
