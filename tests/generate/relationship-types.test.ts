import { describe, expect, it } from 'vitest';
import { buildRelationMethods, renderModelBase } from '../../src/generate/model-base.js';
import type { UdoDocument, UdoRelationship } from '../../src/types.js';

/**
 * Each Eloquent relationship method must declare the return type that matches
 * the relation call, AND the model base must import the matching class. A
 * mismatch (e.g. hasMany declaring `: HasOne`) is valid PHP syntax — so
 * `php -l` passes — but throws a TypeError at runtime when Laravel returns the
 * real relation object. These tests pin the method body + return type together,
 * and the rendered import alongside it.
 *
 * RelationMethod is { name, returnType, body }; the import is derived from
 * returnType, so import assertions are made against the rendered model base.
 */

const EXPECTED: Record<string, { call: string; returnType: string }> = {
  hasOne: { call: 'hasOne', returnType: 'HasOne' },
  hasMany: { call: 'hasMany', returnType: 'HasMany' },
  belongsToMany: { call: 'belongsToMany', returnType: 'BelongsToMany' },
  morphTo: { call: 'morphTo', returnType: 'MorphTo' },
  morphMany: { call: 'morphMany', returnType: 'MorphMany' },
};

function docWith(rel: UdoRelationship, relName = 'related'): UdoDocument {
  return {
    udoVersion: 1,
    resource: 'Owner',
    fields: { name: { type: 'string', required: true } },
    relationships: { [relName]: rel },
  };
}

function relOf(type: string): UdoRelationship {
  return {
    type: type as UdoRelationship['type'],
    model: 'Thing',
    ...(type.startsWith('morph') ? { morphName: 'thingable' } : {}),
  };
}

describe('relationship return-type / call consistency', () => {
  for (const [type, exp] of Object.entries(EXPECTED)) {
    it(`${type}: body calls ${exp.call}(), returnType is ${exp.returnType}`, () => {
      const [method] = buildRelationMethods(docWith(relOf(type)));
      expect(method).toBeDefined();
      expect(method!.returnType).toBe(exp.returnType);
      expect(method!.body).toContain(`->${exp.call}(`);
    });

    it(`${type}: rendered base declares ': ${exp.returnType}' and imports it`, async () => {
      const out = await renderModelBase(docWith(relOf(type)));
      expect(out).toContain(`public function related(): ${exp.returnType}`);
      expect(out).toContain(
        `use Illuminate\\Database\\Eloquent\\Relations\\${exp.returnType};`,
      );
      // Guard specifically against the hasMany-returns-HasOne regression that
      // php -l cannot catch.
      if (type === 'hasMany') {
        expect(out).not.toMatch(/public function related\(\): HasOne/);
      }
    });
  }

  it('belongsTo inferred from a foreignId declares : BelongsTo and imports it', async () => {
    const out = await renderModelBase({
      udoVersion: 1,
      resource: 'Post',
      fields: { author_id: { type: 'foreignId', references: 'users.id', required: true } },
    });
    expect(out).toContain('public function author(): BelongsTo');
    expect(out).toContain('use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;');
  });

  it('a model with multiple relation kinds imports each relation class exactly once', async () => {
    const out = await renderModelBase({
      udoVersion: 1,
      resource: 'Company',
      fields: {
        name: { type: 'string', required: true },
        owner_id: { type: 'foreignId', references: 'users.id', required: true },
      },
      relationships: {
        people: { type: 'hasMany', model: 'Person' },
        managers: { type: 'hasMany', model: 'Person' },
        logo: { type: 'hasOne', model: 'Image' },
        comments: { type: 'morphMany', model: 'Comment', morphName: 'commentable' },
      },
    });
    // Two hasMany relations + a belongsTo must not produce duplicate `use` lines
    // (a duplicate `use` is a fatal "Cannot use X as Y because the name is
    // already in use" error when the class loads).
    for (const cls of ['HasMany', 'HasOne', 'MorphMany', 'BelongsTo']) {
      const re = new RegExp(`use Illuminate\\\\Database\\\\Eloquent\\\\Relations\\\\${cls};`, 'g');
      const count = (out.match(re) ?? []).length;
      expect(count, `${cls} import count`).toBe(1);
    }
  });
});
