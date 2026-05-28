import { describe, expect, it } from 'vitest';
import type { UdoDocument } from '../../src/types.js';
import { buildTransformerContext, renderTransformer } from '../../src/generate/resource-transformer.js';

describe('buildTransformerContext', () => {
  // Bug-fix regression: emit raw whenLoaded, not {Model}Resource wraps.
  // Avoids breaking when related models aren't UDO-managed (no Resource class).
  it('emits raw whenLoaded for belongsTo inferred from foreignId', () => {
    const ctx = buildTransformerContext({
      udoVersion: 1,
      resource: 'Product',
      fields: {
        title: { type: 'string' },
        category_id: { type: 'foreignId', references: 'categories.id' },
      },
    });
    const cat = ctx.relations.find((r) => r.key === 'category');
    expect(cat?.expression).toBe("$this->whenLoaded('category')");
  });

  it('emits raw whenLoaded for hasMany (no Resource wrap)', () => {
    const ctx = buildTransformerContext({
      udoVersion: 1,
      resource: 'Product',
      fields: { title: { type: 'string' } },
      relationships: { reviews: { type: 'hasMany', model: 'Review' } },
    });
    const r = ctx.relations.find((x) => x.key === 'reviews');
    expect(r?.expression).toBe("$this->whenLoaded('reviews')");
  });

  it('emits raw whenLoaded for belongsToMany', () => {
    const ctx = buildTransformerContext({
      udoVersion: 1,
      resource: 'Product',
      fields: { title: { type: 'string' } },
      relationships: { tags: { type: 'belongsToMany', model: 'Tag' } },
    });
    const t = ctx.relations.find((x) => x.key === 'tags');
    expect(t?.expression).toBe("$this->whenLoaded('tags')");
  });

  it('does not reference any *Resource class in expressions', () => {
    const ctx = buildTransformerContext({
      udoVersion: 1,
      resource: 'Post',
      fields: {
        title: { type: 'string' },
        author_id: { type: 'foreignId', references: 'users.id' },
      },
      relationships: {
        tags: { type: 'belongsToMany', model: 'Tag', pivot: 'post_tag' },
        reviews: { type: 'hasMany', model: 'Review' },
      },
    });
    for (const r of ctx.relations) {
      expect(r.expression).not.toMatch(/Resource::/);
      expect(r.expression).not.toMatch(/new\s+\w+Resource/);
    }
  });
});

describe('renderTransformer', () => {
  it('emits all field keys plus timestamps', async () => {
    const output = await renderTransformer({
      udoVersion: 1,
      resource: 'Product',
      fields: { title: { type: 'string' }, price: { type: 'decimal' } },
    });
    expect(output).toContain("'title' => $this->title,");
    expect(output).toContain("'price' => $this->price,");
    expect(output).toContain("'created_at' => $this->created_at?->toISOString()");
    expect(output).toContain('class ProductResource extends JsonResource');
  });
});
