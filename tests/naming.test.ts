import { describe, expect, it } from 'vitest';
import {
  defaultTable,
  deriveBelongsTo,
  pascalToCamel,
  pascalToKebab,
  pascalToSnake,
  pluralize,
  singularize,
  snakeToCamel,
  snakeToPascal,
} from '../src/utils/naming.js';

describe('snakeToPascal', () => {
  it('converts snake_case to PascalCase', () => {
    expect(snakeToPascal('verification_code')).toBe('VerificationCode');
    expect(snakeToPascal('user')).toBe('User');
    expect(snakeToPascal('multi_word_name')).toBe('MultiWordName');
  });

  it('handles single-word input', () => {
    expect(snakeToPascal('product')).toBe('Product');
  });

  it('handles empty input', () => {
    expect(snakeToPascal('')).toBe('');
  });
});

describe('snakeToCamel', () => {
  it('converts snake_case to camelCase', () => {
    expect(snakeToCamel('verification_code')).toBe('verificationCode');
    expect(snakeToCamel('user_id')).toBe('userId');
  });
});

describe('pascalToSnake', () => {
  it('converts PascalCase to snake_case', () => {
    expect(pascalToSnake('VerificationCode')).toBe('verification_code');
    expect(pascalToSnake('User')).toBe('user');
    expect(pascalToSnake('Product')).toBe('product');
  });

  it('handles numbers correctly', () => {
    expect(pascalToSnake('S3Bucket')).toBe('s3_bucket');
  });
});

describe('pascalToKebab', () => {
  it('converts PascalCase to kebab-case', () => {
    expect(pascalToKebab('VerificationCode')).toBe('verification-code');
    expect(pascalToKebab('Product')).toBe('product');
  });
});

describe('pascalToCamel', () => {
  it('lowercases first letter', () => {
    expect(pascalToCamel('Product')).toBe('product');
    expect(pascalToCamel('VerificationCode')).toBe('verificationCode');
  });

  it('handles empty', () => {
    expect(pascalToCamel('')).toBe('');
  });
});

describe('pluralize', () => {
  it('handles regular s plural', () => {
    expect(pluralize('product')).toBe('products');
    expect(pluralize('user')).toBe('users');
  });

  it('handles consonant + y plural (-ies)', () => {
    expect(pluralize('category')).toBe('categories');
    expect(pluralize('city')).toBe('cities');
  });

  it('handles -s, -x, -sh, -ch words (-es)', () => {
    expect(pluralize('box')).toBe('boxes');
    expect(pluralize('class')).toBe('classes');
    expect(pluralize('brush')).toBe('brushes');
    expect(pluralize('batch')).toBe('batches');
  });

  it('does not double-pluralize vowel + y', () => {
    expect(pluralize('boy')).toBe('boys');
  });
});

describe('singularize', () => {
  it('reverses -ies', () => {
    expect(singularize('categories')).toBe('category');
    expect(singularize('cities')).toBe('city');
  });

  it('reverses -es for x/sh/ch', () => {
    expect(singularize('boxes')).toBe('box');
    expect(singularize('brushes')).toBe('brush');
    expect(singularize('batches')).toBe('batch');
  });

  it('reverses -sses', () => {
    expect(singularize('classes')).toBe('class');
  });

  it('reverses simple -s', () => {
    expect(singularize('products')).toBe('product');
    expect(singularize('users')).toBe('user');
  });
});

describe('defaultTable', () => {
  it('produces snake_case plural from PascalCase resource', () => {
    expect(defaultTable('Product')).toBe('products');
    expect(defaultTable('VerificationCode')).toBe('verification_codes');
  });

  // Irregular words like 'News' or 'Sheep' that are already plural in English
  // are intentionally not handled — the UDO can specify `table: "news"` explicitly.
});

describe('deriveBelongsTo', () => {
  it('infers relationship from foreign key name', () => {
    const result = deriveBelongsTo('category_id', 'categories.id');
    expect(result).toEqual({ relationName: 'category', model: 'Category' });
  });

  it('returns null for non-FK column names', () => {
    expect(deriveBelongsTo('title')).toBeNull();
    expect(deriveBelongsTo('email')).toBeNull();
  });

  it('falls back to relation name when references missing', () => {
    const result = deriveBelongsTo('user_id');
    expect(result?.model).toBe('User');
  });

  it('handles plural references correctly', () => {
    const result = deriveBelongsTo('product_id', 'products.id');
    expect(result?.relationName).toBe('product');
    expect(result?.model).toBe('Product');
  });
});
