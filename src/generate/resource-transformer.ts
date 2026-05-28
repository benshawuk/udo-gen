import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { UdoDocument, UdoRelationship } from '../types.js';
import { deriveBelongsTo, snakeToCamel } from '../utils/naming.js';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '..', '..', 'templates');
const eta = new Eta({ views: templateDir, autoEscape: false, autoTrim: false });

interface RelationRow {
  /** PHP array key, e.g. 'tags' or 'category'. */
  key: string;
  /** PHP value expression, e.g. "TagResource::collection($this->whenLoaded('tags'))". */
  expression: string;
}

export interface TransformerContext {
  resource: string;
  fieldKeys: string[];
  timestamps: boolean;
  relations: RelationRow[];
}

// Emit raw whenLoaded for any related model. Laravel auto-serializes the model
// or collection into the API response; the related model's own `$hidden` config
// handles attribute redaction. If you want a typed Resource wrap, set
// `transformer: "custom"` in the UDO and write the transformer by hand.
function collectionExpr(relName: string, _model: string): string {
  return `$this->whenLoaded('${relName}')`;
}

function singleExpr(relName: string, _model: string): string {
  return `$this->whenLoaded('${relName}')`;
}

function relationsFor(doc: UdoDocument): RelationRow[] {
  const rows: RelationRow[] = [];

  // Implied belongsTo from foreignId fields
  for (const [name, field] of Object.entries(doc.fields)) {
    if (field.type !== 'foreignId') continue;
    const inferred = deriveBelongsTo(name, field.references);
    if (!inferred) continue;
    rows.push({
      key: inferred.relationName,
      expression: singleExpr(inferred.relationName, inferred.model),
    });
  }

  // Declared relationships
  const declared: [string, UdoRelationship][] = Object.entries(doc.relationships ?? {});
  for (const [name, rel] of declared) {
    const key = snakeToCamel(name);
    switch (rel.type) {
      case 'hasOne':
      case 'morphTo':
        rows.push({ key, expression: singleExpr(name, rel.model) });
        break;
      case 'hasMany':
      case 'belongsToMany':
      case 'morphMany':
        rows.push({ key, expression: collectionExpr(name, rel.model) });
        break;
    }
  }

  return rows;
}

export function buildTransformerContext(doc: UdoDocument): TransformerContext {
  return {
    resource: doc.resource,
    fieldKeys: Object.keys(doc.fields),
    timestamps: doc.timestamps ?? true,
    relations: relationsFor(doc),
  };
}

export async function renderTransformer(doc: UdoDocument): Promise<string> {
  const ctx = buildTransformerContext(doc);
  const rendered = await eta.renderAsync('resource-transformer', ctx);
  if (typeof rendered !== 'string') {
    throw new Error('Eta returned non-string output for resource-transformer template.');
  }
  return rendered.replace(/\n*$/, '\n');
}
