import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { UdoDocument, UdoField, UdoRelationship } from '../types.js';
import { deriveBelongsTo, snakeToCamel, defaultTable } from '../utils/naming.js';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '..', '..', 'templates');
const eta = new Eta({ views: templateDir, autoEscape: false, autoTrim: false });

interface CastRow {
  field: string;
  cast: string;
}

interface RelationMethod {
  /** PHP method name (camelCase). */
  name: string;
  /** Eloquent return type docblock (e.g. BelongsTo, HasMany). */
  returnType: string;
  /** Method body expression. */
  body: string;
}

function castFor(name: string, field: UdoField): CastRow | null {
  // Explicit override wins (e.g. 'hashed', 'encrypted', 'encrypted:array').
  if (field.cast) return { field: name, cast: field.cast };
  switch (field.type) {
    case 'date':
      return { field: name, cast: 'date' };
    case 'dateTime':
    case 'timestamp':
      return { field: name, cast: 'datetime' };
    case 'boolean':
      return { field: name, cast: 'boolean' };
    case 'json':
      return { field: name, cast: 'array' };
    case 'decimal': {
      const scale = field.scale ?? 2;
      return { field: name, cast: `decimal:${scale}` };
    }
    case 'integer':
    case 'bigInteger':
    case 'tinyInteger':
    case 'unsignedInteger':
    case 'unsignedTinyInteger':
    case 'foreignId':
      return { field: name, cast: 'integer' };
    case 'float':
    case 'double':
      return { field: name, cast: 'float' };
    default:
      return null;
  }
}


/**
 * Build relationship methods for the abstract base.
 *
 * - belongsTo: implied by each foreignId field (relation name = field minus `_id`).
 * - everything else: from doc.relationships.
 *
 * Users override these in App\Models\{Resource}.php by redeclaring the same method.
 */
export function buildRelationMethods(doc: UdoDocument): RelationMethod[] {
  const methods: RelationMethod[] = [];

  for (const [name, field] of Object.entries(doc.fields)) {
    if (field.type !== 'foreignId') continue;
    const inferred = deriveBelongsTo(name, field.references);
    if (!inferred) continue;
    methods.push({
      name: inferred.relationName,
      returnType: 'BelongsTo',
      body: `return $this->belongsTo(\\App\\Models\\${inferred.model}::class);`,
    });
  }

  for (const [name, rel] of Object.entries(doc.relationships ?? {})) {
    const methodName = snakeToCamel(name);
    methods.push(relationMethodFromDeclared(methodName, rel));
  }

  return methods;
}

function relationMethodFromDeclared(name: string, rel: UdoRelationship): RelationMethod {
  const model = `\\App\\Models\\${rel.model}::class`;
  switch (rel.type) {
    case 'hasOne':
      return {
        name,
        returnType: 'HasOne',
        body: `return $this->hasOne(${model}${rel.foreignKey ? `, '${rel.foreignKey}'` : ''});`,
      };
    case 'hasMany':
      return {
        name,
        returnType: 'HasMany',
        body: `return $this->hasMany(${model}${rel.foreignKey ? `, '${rel.foreignKey}'` : ''});`,
      };
    case 'belongsToMany':
      return {
        name,
        returnType: 'BelongsToMany',
        body: `return $this->belongsToMany(${model}${rel.pivot ? `, '${rel.pivot}'` : ''});`,
      };
    case 'morphTo':
      return {
        name,
        returnType: 'MorphTo',
        body: `return $this->morphTo();`,
      };
    case 'morphMany':
      return {
        name,
        returnType: 'MorphMany',
        body: `return $this->morphMany(${model}, '${rel.morphName ?? name}');`,
      };
  }
}

export interface ModelBaseContext {
  resource: string;
  table: string;
  timestamps: boolean;
  softDeletes: boolean;
  hasFactory: boolean;
  fillable: string[];
  hidden: string[];
  appends: string[];
  casts: CastRow[];
  relations: RelationMethod[];
  uniqueRelationImports: string[];
}

export function buildModelBaseContext(doc: UdoDocument): ModelBaseContext {
  const fillable: string[] = [];
  const hidden: string[] = [];
  const casts: CastRow[] = [];

  for (const [name, field] of Object.entries(doc.fields)) {
    fillable.push(name);
    if (field.hidden) hidden.push(name);
    const cast = castFor(name, field);
    if (cast) casts.push(cast);
  }

  const appends = Object.keys(doc.appends ?? {});

  const relations = buildRelationMethods(doc);
  const uniqueRelationImports = Array.from(new Set(relations.map((r) => r.returnType))).sort();

  return {
    resource: doc.resource,
    table: doc.table ?? defaultTable(doc.resource),
    timestamps: doc.timestamps ?? true,
    softDeletes: doc.softDeletes ?? false,
    hasFactory: (doc.factory ?? 'auto') !== false,
    fillable,
    hidden,
    appends,
    casts,
    relations,
    uniqueRelationImports,
  };
}

export async function renderModelBase(doc: UdoDocument): Promise<string> {
  const ctx = buildModelBaseContext(doc);
  const rendered = await eta.renderAsync('model-base', ctx);
  if (typeof rendered !== 'string') {
    throw new Error('Eta returned non-string output for model-base template.');
  }
  return rendered.replace(/\n*$/, '\n');
}

export const MODEL_BASE_TEMPLATE = resolve(templateDir, 'model-base.eta');
