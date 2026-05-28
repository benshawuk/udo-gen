import { describe, expect, it } from 'vitest';
import { buildLangStarterContext, renderLangStarter } from '../../src/generate/lang-starter.js';

describe('buildLangStarterContext', () => {
  it('strips _id suffix when deriving label', () => {
    const ctx = buildLangStarterContext({
      udoVersion: 1,
      resource: 'Product',
      fields: { category_id: { type: 'foreignId' } },
    });
    const cat = ctx.fields.find((f) => f.key === 'category_id');
    expect(cat?.label).toBe('Category');
  });

  it('title-cases multi-word snake_case field names', () => {
    const ctx = buildLangStarterContext({
      udoVersion: 1,
      resource: 'P',
      fields: { stock_count: { type: 'integer' } },
    });
    expect(ctx.fields[0]?.label).toBe('Stock Count');
  });

  it('produces enum value labels', () => {
    const ctx = buildLangStarterContext({
      udoVersion: 1,
      resource: 'P',
      fields: { status: { type: 'string', values: ['draft', 'in_review', 'published'] } },
    });
    expect(ctx.enums[0]?.values).toEqual([
      { key: 'draft', label: 'Draft' },
      { key: 'in_review', label: 'In Review' },
      { key: 'published', label: 'Published' },
    ]);
  });
});

describe('renderLangStarter', () => {
  it('produces a return [] PHP file with fields/enum sections', async () => {
    const output = await renderLangStarter({
      udoVersion: 1,
      resource: 'Product',
      fields: {
        title: { type: 'string' },
        status: { type: 'string', values: ['draft', 'published'] },
      },
    });
    expect(output).toContain('return [');
    expect(output).toContain("'fields' => [");
    expect(output).toContain("'title' => 'Title',");
    expect(output).toContain("'status_values' => [");
  });
});
