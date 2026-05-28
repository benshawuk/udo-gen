import { describe, expect, it } from 'vitest';
import { buildFactoryContext, renderFactory } from '../../src/generate/factory.js';

describe('buildFactoryContext', () => {
  it('uses fake()->safeEmail() for email format', () => {
    const ctx = buildFactoryContext({
      udoVersion: 1,
      resource: 'User',
      fields: { email: { type: 'string', format: 'email' } },
    });
    expect(ctx.rows[0]?.expression).toBe('fake()->safeEmail()');
  });

  it('uses fake()->slug() for slug format', () => {
    const ctx = buildFactoryContext({
      udoVersion: 1,
      resource: 'Post',
      fields: { slug: { type: 'string', format: 'slug' } },
    });
    expect(ctx.rows[0]?.expression).toBe('fake()->slug()');
  });

  it('emits regexify for fixed-length strings', () => {
    const ctx = buildFactoryContext({
      udoVersion: 1,
      resource: 'V',
      fields: { code: { type: 'string', length: 4 } },
    });
    expect(ctx.rows[0]?.expression).toContain('regexify');
    expect(ctx.rows[0]?.expression).toContain('{4}');
  });

  it('emits related factory call for foreignId', () => {
    const ctx = buildFactoryContext({
      udoVersion: 1,
      resource: 'Product',
      fields: { category_id: { type: 'foreignId', references: 'categories.id' } },
    });
    expect(ctx.rows[0]?.expression).toBe('\\App\\Models\\Category::factory()');
  });

  it('emits randomElement for enum values', () => {
    const ctx = buildFactoryContext({
      udoVersion: 1,
      resource: 'P',
      fields: { status: { type: 'string', values: ['draft', 'published'] } },
    });
    expect(ctx.rows[0]?.expression).toBe("fake()->randomElement(['draft', 'published'])");
  });

  it('emits decimal as a stringified randomFloat', () => {
    const ctx = buildFactoryContext({
      udoVersion: 1,
      resource: 'P',
      fields: { price: { type: 'decimal', precision: 8, scale: 2 } },
    });
    expect(ctx.rows[0]?.expression).toContain('(string) fake()->randomFloat(2');
  });
});

describe('renderFactory', () => {
  it('produces a Factory class extending Factory<Resource>', async () => {
    const output = await renderFactory({
      udoVersion: 1,
      resource: 'Product',
      fields: { title: { type: 'string' } },
    });
    expect(output).toContain('namespace Database\\Factories;');
    expect(output).toContain('class ProductFactory extends Factory');
    expect(output).toContain('@extends Factory<Product>');
    expect(output).toContain('protected $model = Product::class;');
  });
});
