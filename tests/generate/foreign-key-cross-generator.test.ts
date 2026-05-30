import { describe, expect, it } from 'vitest';
import { buildColumnLine } from '../../src/generate/migration.js';
import { buildFieldRules, renderFormRequest } from '../../src/generate/form-request.js';
import { renderFactory } from '../../src/generate/factory.js';
import { renderModelBase } from '../../src/generate/model-base.js';
import { renderTsModule } from '../../src/generate/ts-module.js';
import type { UdoDocument, UdoField } from '../../src/types.js';

/**
 * Cross-generator coverage for foreign keys. A single FK field touches the
 * migration (column + constraint), FormRequest (exists: rule + required lead),
 * factory (related factory or null), model base (belongsTo) and TS module. These
 * pin the tricky cases that broke in practice:
 *   - nullable self-referencing FK (errno 150 + infinite-recursion factory)
 *   - required FK with cascade
 *   - FK without references
 *
 * API note: buildFieldRules(name, field) returns { field, rules } where `rules`
 * are the rules AFTER the required/sometimes/nullable lead. The lead is added by
 * the FormRequest renderer, so required/sometimes is asserted on the rendered
 * output, not the rules array.
 */

function catDoc(parentId: UdoField): UdoDocument {
  return {
    udoVersion: 1,
    resource: 'Category',
    fields: { name: { type: 'string', required: true }, parent_id: parentId },
  };
}

describe('nullable self-referencing FK (category.parent_id -> categories.id)', () => {
  const field: UdoField = {
    type: 'foreignId',
    references: 'categories.id',
    nullable: true,
    onDelete: 'set null',
    displayField: 'name',
  };

  it('migration: nullable before constrained before onDelete (errno 150 safe)', () => {
    expect(buildColumnLine('parent_id', field)).toBe(
      "$table->foreignId('parent_id')->nullable()->constrained('categories')->onDelete('set null');",
    );
  });

  it('FormRequest: integer + exists rules, nullable lead in rendered output', async () => {
    const { rules } = buildFieldRules('parent_id', field);
    expect(rules).toContain('integer');
    expect(rules).toContain('exists:categories,id');

    const out = await renderFormRequest(catDoc(field));
    expect(out).toContain("'parent_id' => ['nullable', 'integer', 'exists:categories,id'],");
  });

  it('factory: nullable FK is null, NOT a self-referencing factory (no infinite recursion)', async () => {
    const out = await renderFactory(catDoc(field));
    expect(out).toContain("'parent_id' => null,");
    expect(out).not.toContain('Category::factory()');
  });

  it('model base: emits a belongsTo(parent) to the same model', async () => {
    const out = await renderModelBase(catDoc(field));
    expect(out).toContain('public function parent(): BelongsTo');
    expect(out).toContain('return $this->belongsTo(\\App\\Models\\Category::class);');
  });

  it('TS module: FK maps to a nullable number', async () => {
    const out = await renderTsModule(catDoc(field));
    expect(out).toMatch(/parent_id: number \| null/);
  });
});

describe('required FK with cascade (post.author_id -> users.id)', () => {
  const field: UdoField = {
    type: 'foreignId',
    references: 'users.id',
    required: true,
    onDelete: 'cascade',
  };
  const postDoc: UdoDocument = {
    udoVersion: 1,
    resource: 'Post',
    fields: { title: { type: 'string', required: true }, author_id: field },
  };

  it('migration: constrained + cascade, no nullable', () => {
    expect(buildColumnLine('author_id', field)).toBe(
      "$table->foreignId('author_id')->constrained('users')->onDelete('cascade');",
    );
  });

  it('FormRequest: integer + exists on users', () => {
    const { rules } = buildFieldRules('author_id', field);
    expect(rules).toContain('integer');
    expect(rules).toContain('exists:users,id');
  });

  it('FormRequest rendered: required-on-create / sometimes-on-update ternary lead', async () => {
    const out = await renderFormRequest(postDoc);
    expect(out).toContain(
      "'author_id' => [$isUpdate ? 'sometimes' : 'required', 'integer', 'exists:users,id'],",
    );
  });

  it('factory: required FK emits the related factory()', async () => {
    const out = await renderFactory(postDoc);
    expect(out).toContain('\\App\\Models\\User::factory()');
  });

  it('model base: belongsTo(author) to User', async () => {
    const out = await renderModelBase(postDoc);
    expect(out).toContain('public function author(): BelongsTo');
    expect(out).toContain('return $this->belongsTo(\\App\\Models\\User::class);');
  });
});

describe('FK without references (bare foreignId)', () => {
  const field: UdoField = { type: 'foreignId' };

  it('migration: bare column, no constrained()', () => {
    expect(buildColumnLine('legacy_id', field)).toBe("$table->foreignId('legacy_id');");
  });

  it('FormRequest: integer rule but NO exists rule (no references to check)', () => {
    const { rules } = buildFieldRules('legacy_id', field);
    expect(rules).toContain('integer');
    expect(rules.join(' ')).not.toContain('exists:');
  });
});

describe('FK referencing a table whose singular needs inflection', () => {
  it('people.id -> belongsTo Person (irregular singular)', async () => {
    const d: UdoDocument = {
      udoVersion: 1,
      resource: 'Membership',
      fields: { person_id: { type: 'foreignId', references: 'people.id', required: true } },
    };
    const out = await renderModelBase(d);
    expect(out).toContain('$this->belongsTo(\\App\\Models\\Person::class);');
  });

  it('companies.id -> Company::factory() (irregular singular)', async () => {
    const d: UdoDocument = {
      udoVersion: 1,
      resource: 'Branch',
      fields: { company_id: { type: 'foreignId', references: 'companies.id', required: true } },
    };
    const out = await renderFactory(d);
    expect(out).toContain('\\App\\Models\\Company::factory()');
  });
});
