/**
 * Naming convention helpers shared across generators.
 * Intentionally simple; covers the 95% case. Edge cases get explicit overrides in the UDO.
 */

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
 * Crude singularize. Handles common English plurals (~95% coverage).
 * For irregulars (people, men, children) the UDO can declare overrides on the field.
 */
export function singularize(input: string): string {
  if (/ies$/.test(input)) return input.replace(/ies$/, 'y');
  if (/sses$/.test(input)) return input.replace(/es$/, '');
  if (/xes$/.test(input) || /shes$/.test(input) || /ches$/.test(input)) {
    return input.replace(/es$/, '');
  }
  if (/s$/.test(input) && !/ss$/.test(input)) return input.replace(/s$/, '');
  return input;
}

/**
 * Crude pluralize. Handles common English plurals (~95% coverage).
 */
export function pluralize(input: string): string {
  if (/[^aeiou]y$/.test(input)) return input.replace(/y$/, 'ies');
  if (/(s|x|sh|ch)$/.test(input)) return `${input}es`;
  return `${input}s`;
}

/**
 * Default table name from a PascalCase resource name.
 */
export function defaultTable(resource: string): string {
  return pluralize(pascalToSnake(resource));
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
  const relationName = fieldName.slice(0, -3); // 'category_id' -> 'category'

  let model: string;
  if (references) {
    const table = references.split('.')[0] ?? '';
    model = snakeToPascal(singularize(table));
  } else {
    model = snakeToPascal(relationName);
  }

  return { relationName, model };
}
