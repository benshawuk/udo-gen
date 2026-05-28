import { describe, expect, it } from 'vitest';
import type { UdoDocument } from '../../src/types.js';
import { buildModelBaseContext, renderModelBase } from '../../src/generate/model-base.js';

function doc(overrides: Partial<UdoDocument> = {}): UdoDocument {
  return {
    udoVersion: 1,
    resource: 'Product',
    fields: {
      title: { type: 'string', required: true },
      price: { type: 'decimal', precision: 8, scale: 2 },
      published_at: { type: 'timestamp', nullable: true },
      is_active: { type: 'boolean', default: true },
      meta: { type: 'json' },
    },
    ...overrides,
  };
}

describe('buildModelBaseContext', () => {
  it('produces $fillable for all fields', () => {
    const ctx = buildModelBaseContext(doc());
    expect(ctx.fillable).toEqual(['title', 'price', 'published_at', 'is_active', 'meta']);
  });

  it('emits correct casts for datetime, decimal, boolean, json', () => {
    const ctx = buildModelBaseContext(doc());
    const casts = Object.fromEntries(ctx.casts.map((c) => [c.field, c.cast]));
    expect(casts).toEqual({
      price: 'decimal:2',
      published_at: 'datetime',
      is_active: 'boolean',
      meta: 'array',
    });
  });

  it('defaults timestamps to true', () => {
    expect(buildModelBaseContext(doc()).timestamps).toBe(true);
  });

  it('respects explicit timestamps: false', () => {
    expect(buildModelBaseContext(doc({ timestamps: false })).timestamps).toBe(false);
  });

  it('respects softDeletes: true', () => {
    expect(buildModelBaseContext(doc({ softDeletes: true })).softDeletes).toBe(true);
  });

  it('uses default table name from PascalCase resource', () => {
    expect(buildModelBaseContext(doc()).table).toBe('products');
  });

  it('honours explicit table name', () => {
    expect(buildModelBaseContext(doc({ table: 'custom_products' })).table).toBe('custom_products');
  });
});

describe('renderModelBase', () => {
  it('produces a valid abstract class declaration', async () => {
    const output = await renderModelBase(doc());
    expect(output).toContain('namespace App\\Models\\Generated;');
    expect(output).toContain('abstract class ProductBase extends Model');
    expect(output).toContain("protected $table = 'products';");
    expect(output).toContain("'title',");
    expect(output).toContain("'price' => 'decimal:2',");
  });

  it('includes SoftDeletes trait when softDeletes is true', async () => {
    const output = await renderModelBase(doc({ softDeletes: true }));
    expect(output).toContain('use SoftDeletes;');
    expect(output).toContain('use Illuminate\\Database\\Eloquent\\SoftDeletes;');
  });

  it('omits SoftDeletes when not requested', async () => {
    const output = await renderModelBase(doc());
    expect(output).not.toContain('SoftDeletes');
  });

  // Bug-fix regression: factory access requires HasFactory trait in Laravel 11+.
  it('includes HasFactory trait by default', async () => {
    const output = await renderModelBase(doc());
    expect(output).toContain('use HasFactory;');
    expect(output).toContain('use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;');
    expect(output).toContain('/** @use HasFactory<\\Database\\Factories\\ProductFactory> */');
  });

  it('omits HasFactory when factory: false', async () => {
    const output = await renderModelBase(doc({ factory: false }));
    expect(output).not.toContain('HasFactory');
  });
});
