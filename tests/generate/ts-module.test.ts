import { describe, expect, it } from 'vitest';
import type { UdoDocument } from '../../src/types.js';
import { buildTsModuleContext, renderTsModule } from '../../src/generate/ts-module.js';

const sample: UdoDocument = {
  udoVersion: 1,
  resource: 'Product',
  table: 'products',
  fields: {
    title: { type: 'string', required: true, max: 255 },
    email: { type: 'string', format: 'email', required: true },
    price: { type: 'decimal', precision: 8, scale: 2, required: true },
    quantity: { type: 'unsignedInteger', required: true },
    status: { type: 'string', required: true, values: ['draft', 'published'] },
    published_at: { type: 'dateTime', nullable: true },
    bio: { type: 'text', nullable: true },
  },
};

describe('buildTsModuleContext', () => {
  it('derives endpoint and queryKey from the table', () => {
    const ctx = buildTsModuleContext({ ...sample, table: 'verification_codes', resource: 'V' });
    expect(ctx.endpoint).toBe('/api/verification-codes');
    expect(ctx.queryKey).toBe('verification-codes');
  });

  it('maps required string to z.string().min(1)', () => {
    const ctx = buildTsModuleContext(sample);
    const title = ctx.fields.find((f) => f.name === 'title');
    expect(title?.zod).toContain('z.string()');
    expect(title?.zod).toContain('.min(1)');
    expect(title?.zod).toContain('.max(255)');
  });

  it('maps format email to .email()', () => {
    const ctx = buildTsModuleContext(sample);
    const email = ctx.fields.find((f) => f.name === 'email');
    expect(email?.zod).toContain('.email()');
  });

  it('maps decimal to a regex string check', () => {
    const ctx = buildTsModuleContext(sample);
    const price = ctx.fields.find((f) => f.name === 'price');
    expect(price?.zod).toContain('z.string().regex');
  });

  it('maps unsignedInteger to z.number().int().nonnegative()', () => {
    const ctx = buildTsModuleContext(sample);
    const q = ctx.fields.find((f) => f.name === 'quantity');
    expect(q?.zod).toContain('z.number().int().nonnegative()');
  });

  it('maps enum values to z.enum([...])', () => {
    const ctx = buildTsModuleContext(sample);
    const status = ctx.fields.find((f) => f.name === 'status');
    expect(status?.zod).toContain("z.enum(['draft', 'published'])");
  });

  it('appends .nullable().optional() for nullable non-required', () => {
    const ctx = buildTsModuleContext(sample);
    const bio = ctx.fields.find((f) => f.name === 'bio');
    expect(bio?.zod).toContain('.nullable()');
    expect(bio?.zod).toContain('.optional()');
  });

  it('emits TS Shape types reflecting nullable', () => {
    const ctx = buildTsModuleContext(sample);
    const bio = ctx.fields.find((f) => f.name === 'bio');
    expect(bio?.shapeType).toBe('string | null');
  });

  it('decimal Shape type is string (preserve precision)', () => {
    const ctx = buildTsModuleContext(sample);
    const price = ctx.fields.find((f) => f.name === 'price');
    expect(price?.shapeType).toBe('string');
  });
});

describe('renderTsModule', () => {
  it('contains the expected top-level exports', async () => {
    const output = await renderTsModule(sample);
    expect(output).toContain("import { z } from 'zod';");
    expect(output).toContain('export const createSchema');
    expect(output).toContain('export const updateSchema = createSchema.partial();');
    expect(output).toContain('export type Create = z.infer<typeof createSchema>;');
    expect(output).toContain('export type Shape = {');
    expect(output).toContain("export const endpoint = '/api/products'");
    expect(output).toContain("export const queryKey = ['products']");
  });
});
