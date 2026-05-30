import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { UdoDocument, UdoField } from '../types.js';
import { deriveBelongsTo } from '../utils/naming.js';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '..', '..', 'templates');
const eta = new Eta({ views: templateDir, autoEscape: false, autoTrim: false });

function fakeForField(name: string, field: UdoField): string {
  // Enum: random element from list
  if (Array.isArray(field.values) && field.values.length > 0) {
    const items = field.values
      .map((v) => (typeof v === 'string' ? `'${v}'` : String(v)))
      .join(', ');
    return `fake()->randomElement([${items}])`;
  }

  // foreignId → related factory.
  if (field.type === 'foreignId') {
    // A nullable FK defaults to null. This is essential for self-referencing
    // FKs (e.g. category.parent_id -> categories.id): emitting the model's own
    // factory there recurses infinitely, creating a parent for every row
    // forever. Callers opt in to a real parent via ->state([...]) when needed.
    if (field.nullable) return 'null';
    const inferred = deriveBelongsTo(name, field.references);
    if (inferred) return `\\App\\Models\\${inferred.model}::factory()`;
    return 'fake()->numberBetween(1, 1000)';
  }

  // Format-driven
  switch (field.format) {
    case 'email':
      return 'fake()->safeEmail()';
    case 'url':
      return 'fake()->url()';
    case 'uuid':
      return 'fake()->uuid()';
    case 'slug':
      return 'fake()->slug()';
    case 'ipAddress':
      return 'fake()->ipv4()';
    case 'password':
      return "bcrypt('password')";
    case 'phone':
      return 'fake()->phoneNumber()';
    case 'currency':
    case 'percent':
      // Falls through to numeric handling below.
      break;
  }

  // Type-driven defaults
  switch (field.type) {
    case 'string': {
      if (typeof field.length === 'number') {
        return `fake()->regexify('[A-Za-z0-9]{${field.length}}')`;
      }
      const max = field.max ?? 255;
      return `fake()->text(${Math.min(max, 50)})`;
    }
    case 'text':
      return 'fake()->paragraph()';
    case 'longText':
      return 'fake()->paragraphs(3, true)';
    case 'mediumText':
      return 'fake()->paragraphs(2, true)';
    case 'integer':
    case 'bigInteger':
    case 'tinyInteger': {
      const min = field.min ?? -1000;
      const max = field.max ?? 1000;
      return `fake()->numberBetween(${min}, ${max})`;
    }
    case 'unsignedInteger':
    case 'unsignedTinyInteger': {
      const min = field.min ?? 0;
      const max = field.max ?? 1000;
      return `fake()->numberBetween(${min}, ${max})`;
    }
    case 'decimal': {
      const scale = field.scale ?? 2;
      const min = field.min ?? 0;
      const max = field.max ?? 9999;
      return `(string) fake()->randomFloat(${scale}, ${min}, ${max})`;
    }
    case 'float':
    case 'double': {
      const min = field.min ?? 0;
      const max = field.max ?? 9999;
      return `fake()->randomFloat(2, ${min}, ${max})`;
    }
    case 'boolean':
      return 'fake()->boolean()';
    case 'date':
      return "fake()->date()";
    case 'dateTime':
    case 'timestamp':
      return 'fake()->dateTime()';
    case 'time':
      return "fake()->time()";
    case 'json':
      return "['example' => fake()->word()]";
    case 'uuid':
      return 'fake()->uuid()';
    case 'binary':
      return "fake()->text(64)";
    default:
      return 'null';
  }
}

export interface FactoryRow {
  name: string;
  expression: string;
}

export interface FactoryContext {
  resource: string;
  rows: FactoryRow[];
}

export function buildFactoryContext(doc: UdoDocument): FactoryContext {
  const rows: FactoryRow[] = Object.entries(doc.fields).map(([name, field]) => ({
    name,
    expression: fakeForField(name, field),
  }));
  return { resource: doc.resource, rows };
}

export async function renderFactory(doc: UdoDocument): Promise<string> {
  const ctx = buildFactoryContext(doc);
  const rendered = await eta.renderAsync('factory', ctx);
  if (typeof rendered !== 'string') {
    throw new Error('Eta returned non-string output for factory template.');
  }
  return rendered.replace(/\n*$/, '\n');
}
