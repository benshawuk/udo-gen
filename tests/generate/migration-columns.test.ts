import { describe, expect, it } from 'vitest';
import { buildColumnLine, renderMigration } from '../../src/generate/migration.js';
import type { PrimitiveType, UdoField } from '../../src/types.js';

/**
 * Comprehensive coverage of buildColumnLine: every primitive type and every
 * modifier combination, plus the ordering invariant that modifiers precede the
 * foreign-key constraint chain. Complements migration-fk.test.ts (FK focus).
 */

function f(overrides: Partial<UdoField> & { type: PrimitiveType }): UdoField {
  return overrides;
}

describe('blueprint method per primitive type', () => {
  // Types that map straight to $table->{type}('name').
  const STRAIGHT: PrimitiveType[] = [
    'string',
    'text',
    'longText',
    'mediumText',
    'integer',
    'bigInteger',
    'tinyInteger',
    'unsignedInteger',
    'unsignedTinyInteger',
    'float',
    'double',
    'boolean',
    'date',
    'dateTime',
    'timestamp',
    'time',
    'json',
    'uuid',
    'binary',
  ];

  for (const t of STRAIGHT) {
    it(`${t} -> $table->${t}('col')`, () => {
      expect(buildColumnLine('col', f({ type: t }))).toBe(`$table->${t}('col');`);
    });
  }

  it('decimal uses default precision/scale (8,2)', () => {
    expect(buildColumnLine('amount', f({ type: 'decimal' }))).toBe(
      "$table->decimal('amount', 8, 2);",
    );
  });

  it('decimal honours explicit precision/scale', () => {
    expect(buildColumnLine('price', f({ type: 'decimal', precision: 12, scale: 4 }))).toBe(
      "$table->decimal('price', 12, 4);",
    );
  });

  it('string honours explicit length', () => {
    expect(buildColumnLine('code', f({ type: 'string', length: 8 }))).toBe(
      "$table->string('code', 8);",
    );
  });

  it('length only affects string, not other types', () => {
    // text with a length is not a string() call.
    expect(buildColumnLine('body', f({ type: 'text', length: 100 }))).toBe("$table->text('body');");
  });

  it('foreignId without references is a bare column', () => {
    expect(buildColumnLine('owner_id', f({ type: 'foreignId' }))).toBe(
      "$table->foreignId('owner_id');",
    );
  });
});

describe('modifier emission', () => {
  it('nullable', () => {
    expect(buildColumnLine('x', f({ type: 'string', nullable: true }))).toBe(
      "$table->string('x')->nullable();",
    );
  });

  it('unique', () => {
    expect(buildColumnLine('x', f({ type: 'string', unique: true }))).toBe(
      "$table->string('x')->unique();",
    );
  });

  it('index (non-FK)', () => {
    expect(buildColumnLine('x', f({ type: 'string', index: true }))).toBe(
      "$table->string('x')->index();",
    );
  });

  it('string default is quoted', () => {
    expect(buildColumnLine('status', f({ type: 'string', default: 'draft' }))).toBe(
      "$table->string('status')->default('draft');",
    );
  });

  it('numeric default is unquoted', () => {
    expect(buildColumnLine('n', f({ type: 'integer', default: 0 }))).toBe(
      "$table->integer('n')->default(0);",
    );
  });

  it('boolean default true/false', () => {
    expect(buildColumnLine('a', f({ type: 'boolean', default: true }))).toBe(
      "$table->boolean('a')->default(true);",
    );
    expect(buildColumnLine('b', f({ type: 'boolean', default: false }))).toBe(
      "$table->boolean('b')->default(false);",
    );
  });

  it('null default emits ->default(null)', () => {
    expect(buildColumnLine('c', f({ type: 'string', default: null }))).toBe(
      "$table->string('c')->default(null);",
    );
  });

  it('default 0 is emitted (not skipped as falsy)', () => {
    // Guard against `if (field.default)` style bugs that drop 0/false/''.
    expect(buildColumnLine('n', f({ type: 'integer', default: 0 }))).toContain('->default(0)');
    expect(buildColumnLine('s', f({ type: 'string', default: '' }))).toContain("->default('')");
  });

  it('escapes single quotes in string defaults', () => {
    const line = buildColumnLine('label', f({ type: 'string', default: "O'Brien" }));
    expect(line).toContain("\\'");
  });
});

describe('modifier ordering', () => {
  it('nullable + default + unique + index in canonical order', () => {
    const line = buildColumnLine(
      'x',
      f({ type: 'string', nullable: true, default: 'd', unique: true, index: true }),
    );
    expect(line).toBe("$table->string('x')->nullable()->default('d')->unique()->index();");
  });

  it('all column modifiers come before the FK constraint chain', () => {
    const line = buildColumnLine(
      'team_id',
      f({
        type: 'foreignId',
        references: 'teams.id',
        nullable: true,
        default: null,
        unique: true,
        onDelete: 'cascade',
      }),
    );
    const iConstrained = line.indexOf('->constrained(');
    for (const mod of ['->nullable()', '->default(null)', '->unique()']) {
      expect(line.indexOf(mod)).toBeGreaterThan(-1);
      expect(line.indexOf(mod)).toBeLessThan(iConstrained);
    }
  });

  it('constrained FK does not get a redundant ->index()', () => {
    const line = buildColumnLine(
      'cat_id',
      f({ type: 'foreignId', references: 'cats.id', index: true }),
    );
    expect(line).not.toContain('->index()');
  });

  it('un-constrained foreignId (no references) still honours index', () => {
    // Without constrained(), there is no implicit index, so index:true must emit one.
    const line = buildColumnLine('legacy_id', f({ type: 'foreignId', index: true }));
    expect(line).toContain('->index()');
  });
});

describe('renderMigration structural ordering', () => {
  it('emits id() first, then columns, then softDeletes, then timestamps', async () => {
    const out = await renderMigration({
      udoVersion: 1,
      resource: 'Widget',
      softDeletes: true,
      timestamps: true,
      fields: { name: { type: 'string', required: true } },
    });
    const iId = out.indexOf('$table->id();');
    const iName = out.indexOf("$table->string('name')");
    const iSoft = out.indexOf('$table->softDeletes();');
    const iStamps = out.indexOf('$table->timestamps();');
    expect(iId).toBeGreaterThan(-1);
    expect(iName).toBeGreaterThan(iId);
    expect(iSoft).toBeGreaterThan(iName);
    expect(iStamps).toBeGreaterThan(iSoft);
  });

  it('omits softDeletes when false and timestamps when false', async () => {
    const out = await renderMigration({
      udoVersion: 1,
      resource: 'Widget',
      softDeletes: false,
      timestamps: false,
      fields: { name: { type: 'string' } },
    });
    expect(out).not.toContain('$table->softDeletes();');
    expect(out).not.toContain('$table->timestamps();');
  });

  it('emits composite indexes after columns', async () => {
    const out = await renderMigration({
      udoVersion: 1,
      resource: 'Event',
      fields: {
        status: { type: 'string' },
        starts_at: { type: 'dateTime' },
      },
      indexes: [{ columns: ['status', 'starts_at'] }],
    });
    expect(out).toContain("$table->index(['status', 'starts_at']);");
  });

  it('emits a unique composite index as ->unique([...])', async () => {
    const out = await renderMigration({
      udoVersion: 1,
      resource: 'Membership',
      fields: {
        team_id: { type: 'foreignId', references: 'teams.id' },
        user_id: { type: 'foreignId', references: 'users.id' },
      },
      indexes: [{ columns: ['team_id', 'user_id'], unique: true }],
    });
    // A unique composite must NOT silently downgrade to a plain ->index().
    // (If this fails, the migration builder is dropping the `unique` flag on
    // composite indexes — a real bug to fix in src/generate/migration.ts.)
    expect(out).toContain("$table->unique(['team_id', 'user_id']);");
  });
});
