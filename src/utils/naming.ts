/**
 * Naming convention helpers shared across generators.
 * Pluralization/singularization use the `pluralize` inflection dictionary
 * (handles irregulars: category->categories, person->people, series->series),
 * mirroring Laravel's Str::plural()/Str::singular() which Eloquent relies on.
 */

import pluralizeWord from 'pluralize';

export function snakeToPascal(input: string): string {
  return input
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

export function snakeToCamel(input: string): string {
  const pascal = snakeToPascal(input);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function pascalToSnake(input: string): string {
  return input.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

export function pascalToKebab(input: string): string {
  return pascalToSnake(input).replace(/_/g, '-');
}

export function pascalToCamel(input: string): string {
  if (input.length === 0) return input;
  return input.charAt(0).toLowerCase() + input.slice(1);
}

/**
 * Singularize a word via the inflection dictionary.
 * e.g. categories -> category, people -> person, series -> series.
 */
export function singularize(input: string): string {
  return pluralizeWord.singular(input);
}

/**
 * Pluralize a word via the inflection dictionary.
 * e.g. category -> categories, person -> people, series -> series.
 */
export function pluralize(input: string): string {
  return pluralizeWord(input);
}

/**
 * Default snake_case plural table name from a PascalCase resource. Only the
 * final word is pluralized, matching Laravel's table-naming convention.
 * e.g. "Product" -> "products", "Category" -> "categories",
 *      "VerificationCode" -> "verification_codes".
 */
export function defaultTable(resource: string): string {
  const parts = pascalToSnake(resource).split('_');
  const lastIndex = parts.length - 1;
  const last = parts[lastIndex];
  if (last !== undefined) parts[lastIndex] = pluralize(last);
  return parts.join('_');
}

/**
 * Given a field name like 'category_id' and references like 'categories.id',
 * derive the relationship name ('category') and related model PascalCase name ('Category').
 */
export function deriveBelongsTo(fieldName: string, references?: string): {
  relationName: string;
  model: string;
} | null {
  if (!fieldName.endsWith('_id')) return null;
  // 'category_id' -> 'category', 'storage_connection_id' -> 'storageConnection'
  // (camelCase, consistent with declared hasMany/belongsToMany relation names)
  const base = fieldName.slice(0, -3);
  const relationName = snakeToCamel(base);

  let model: string;
  if (references) {
    const table = references.split('.')[0] ?? '';
    model = snakeToPascal(singularize(table));
  } else {
    model = snakeToPascal(base);
  }

  return { relationName, model };
}
