import { describe, expect, it } from 'vitest';
import type { UdoDocument } from '../../src/types.js';
import { buildFieldRules, buildFormRequestContext, renderFormRequest } from '../../src/generate/form-request.js';

describe('buildFieldRules', () => {
  it('emits string + max for a plain required string', () => {
    const fr = buildFieldRules('title', { type: 'string', required: true, max: 255 });
    expect(fr.rules).toEqual(['string', 'max:255']);
  });

  it('translates format: email to email rule', () => {
    const fr = buildFieldRules('email', { type: 'string', format: 'email', required: true });
    expect(fr.rules).toContain('email');
  });

  it('translates format: ipAddress to ip rule', () => {
    const fr = buildFieldRules('ip', { type: 'string', format: 'ipAddress', nullable: true });
    expect(fr.rules).toContain('ip');
  });

  it('translates enum values to in: rule', () => {
    const fr = buildFieldRules('status', {
      type: 'string',
      values: ['draft', 'published'],
    });
    expect(fr.rules).toContain('in:draft,published');
  });

  it('emits exists: rule for foreignId with references', () => {
    const fr = buildFieldRules('category_id', {
      type: 'foreignId',
      required: true,
      references: 'categories.id',
    });
    expect(fr.rules).toContain('exists:categories,id');
  });

  it('appends validation.backend rules', () => {
    const fr = buildFieldRules('slug', {
      type: 'string',
      required: true,
      validation: { backend: ['unique:products,slug'] },
    });
    expect(fr.rules).toContain('unique:products,slug');
  });

  it('honours validation.skip.backend for shared rules', () => {
    const fr = buildFieldRules('title', {
      type: 'string',
      required: true,
      max: 255,
      validation: { skip: { backend: ['max'] } },
    });
    expect(fr.rules).not.toContain('max:255');
  });

  it('emits size: for fixed-length strings', () => {
    const fr = buildFieldRules('code', { type: 'string', required: true, length: 4 });
    expect(fr.rules).toContain('size:4');
  });
});

describe('buildFormRequestContext', () => {
  const doc: UdoDocument = {
    udoVersion: 1,
    resource: 'Product',
    fields: {
      title: { type: 'string', required: true, max: 255 },
      slug: { type: 'string', required: true, validation: { backend: ['unique:products,slug'] } },
      note: { type: 'text', nullable: true },
    },
  };

  it('uses sometimes/required pattern for required fields', () => {
    const ctx = buildFormRequestContext(doc);
    const title = ctx.rows.find((r) => r.field === 'title');
    expect(title?.expression).toContain("$isUpdate ? 'sometimes' : 'required'");
  });

  it('uses nullable for nullable fields without required flag', () => {
    const ctx = buildFormRequestContext(doc);
    const note = ctx.rows.find((r) => r.field === 'note');
    expect(note?.expression).toContain("'nullable'");
  });
});

describe('renderFormRequest', () => {
  it('produces a valid FormRequest class', async () => {
    const output = await renderFormRequest({
      udoVersion: 1,
      resource: 'Product',
      fields: { title: { type: 'string', required: true, max: 255 } },
    });
    expect(output).toContain('namespace App\\Http\\Requests;');
    expect(output).toContain('class ProductRequest extends FormRequest');
    expect(output).toContain('public function rules(): array');
    expect(output).toContain('$isUpdate = in_array');
  });
});
