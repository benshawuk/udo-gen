import { describe, expect, it } from 'vitest';
import type { UdoDocument } from '../../src/types.js';
import {
  buildAutoformContext,
  widgetFor,
  renderAutoformGenerated,
  renderAutoformConfig,
} from '../../src/generate/autoform.js';

const sample: UdoDocument = {
  udoVersion: 1,
  resource: 'Product',
  table: 'products',
  fields: {
    title: { type: 'string', required: true, max: 255 },
    slug: {
      type: 'string',
      required: true,
      format: 'slug',
      max: 255,
      unique: true,
      validation: { backend: ['unique:products,slug'] },
    },
    description: { type: 'text', format: 'richText', nullable: true },
    price: { type: 'decimal', required: true, min: 0 },
    status: { type: 'string', required: true, values: ['draft', 'published', 'archived'] },
    category_id: { type: 'foreignId', required: true, references: 'categories.id', displayField: 'name' },
    stock_count: { type: 'unsignedInteger' },
    published_at: { type: 'dateTime', nullable: true },
    contact_email: { type: 'string', format: 'email', required: true },
    is_active: { type: 'boolean' },
  },
};

describe('widgetFor', () => {
  it('maps semantic format and primitive type to autoform component types', () => {
    expect(widgetFor('contact_email', sample.fields.contact_email)).toBe('email');
    expect(widgetFor('description', sample.fields.description)).toBe('textarea');
    expect(widgetFor('status', sample.fields.status)).toBe('select');
    expect(widgetFor('category_id', sample.fields.category_id)).toBe('select');
    expect(widgetFor('is_active', sample.fields.is_active)).toBe('switch');
    expect(widgetFor('published_at', sample.fields.published_at)).toBe('date');
    expect(widgetFor('stock_count', sample.fields.stock_count)).toBe('number');
    expect(widgetFor('title', sample.fields.title)).toBe('text');
  });

  it('lets an explicit ui.widget override the inferred widget', () => {
    expect(widgetFor('title', { type: 'string', ui: { widget: 'textarea' } })).toBe('textarea');
  });
});

describe('buildAutoformContext', () => {
  it('derives endpoint and query key from the table', () => {
    const ctx = buildAutoformContext({ ...sample, table: 'verification_codes' });
    expect(ctx.endpoint).toBe('/api/verification-codes');
    expect(ctx.queryKey).toBe('verification-codes');
  });

  it('routes DB-aware backend rules (unique/exists) into serverRules', () => {
    const ctx = buildAutoformContext(sample);
    expect(ctx.serverRules).toContain('slug');
    expect(ctx.serverRules).not.toContain('title');
  });

  it('maps the UDO frontend/backend split onto client/server rules', () => {
    const ctx = buildAutoformContext(sample);
    const title = ctx.clientRules.find((r) => r.field === 'title');
    expect(title?.lines.join('\n')).toContain("required: 'products.fields.title.required'");
    expect(title?.lines.join('\n')).toContain('maxLength: { value: 255');
  });
});

describe('renderAutoformGenerated', () => {
  it('emits a typed validation object with clientRules and serverRules', () => {
    const out = renderAutoformGenerated(sample);
    expect(out).toContain('export const productValidation = {');
    expect(out).toContain('clientRules: {');
    expect(out).toContain("serverRules: ['slug']");
    expect(out).toContain('} as const;');
    // enum -> "one of" pattern
    expect(out).toContain('/^(draft|published|archived)$/');
    // messages are translation keys, never English
    expect(out).not.toMatch(/message: '[A-Z][a-z]+ /);
  });
});

describe('renderAutoformConfig', () => {
  it('wires generated validation into a defineFeatureConfig export', () => {
    const out = renderAutoformConfig(sample);
    expect(out).toContain('SCAFFOLD-ONCE');
    expect(out).toContain("import { defineFeatureConfig, defineRules } from '@/lib/autoform'");
    expect(out).toContain("import { productValidation } from './generated'");
    expect(out).toContain('export const productRules = defineRules(productValidation');
    expect(out).toContain('export default defineFeatureConfig({');
    expect(out).toContain("endpoint: '/api/products'");
    expect(out).toContain("status: { componentType: 'select', options: ['draft', 'published', 'archived'] }");
    // FK gets a hint to source options from the related resource
    expect(out).toContain('category_id');
    expect(out).toContain('FK from categories.id');
  });
});
