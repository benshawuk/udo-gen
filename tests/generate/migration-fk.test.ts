import { describe, expect, it } from 'vitest';
import { buildColumnLine, renderMigration } from '../../src/generate/migration.js';
import type { UdoDocument, UdoField } from '../../src/types.js';

function field(overrides: Partial<UdoField> = {}): UdoField {
  return { type: 'string', ...overrides };
}

/**
 * Regression suite for the foreign-key column ordering bug (MySQL errno 150).
 *
 * Laravel's constrained() returns a ForeignKeyDefinition, so any column-level
 * modifier (especially nullable()) chained AFTER it never reaches the column.
 * A NOT NULL column with `ON DELETE SET NULL` is rejected by the database.
 * The invariant: nullable() < unique() < constrained() < onDelete() in the
 * emitted chain.
 */
describe('foreignId column ordering (errno 150 regression)', () => {
  it('nullable FK with onDelete set null: nullable before constrained before onDelete', () => {
    const line = buildColumnLine(
      'parent_id',
      field({ type: 'foreignId', references: 'categories.id', nullable: true, onDelete: 'set null' }),
    );
    expect(line).toBe(
      "$table->foreignId('parent_id')->nullable()->constrained('categories')->onDelete('set null');",
    );
  });

  it('required FK with cascade: no nullable, constrained then onDelete', () => {
    const line = buildColumnLine(
      'author_id',
      field({ type: 'foreignId', references: 'users.id', required: true, onDelete: 'cascade' }),
    );
    expect(line).toBe(
      "$table->foreignId('author_id')->constrained('users')->onDelete('cascade');",
    );
  });

  it('nullable FK without onDelete', () => {
    const line = buildColumnLine(
      'team_id',
      field({ type: 'foreignId', references: 'teams.id', nullable: true }),
    );
    expect(line).toBe("$table->foreignId('team_id')->nullable()->constrained('teams');");
  });

  it('self-referencing FK (references its own table)', () => {
    const line = buildColumnLine(
      'parent_id',
      field({ type: 'foreignId', references: 'categories.id', nullable: true, onDelete: 'set null' }),
    );
    // The referenced table is the same as the owning table — still valid order.
    expect(line).toContain("->nullable()->constrained('categories')");
  });

  it('FK without references: bare column, no constrained()', () => {
    const line = buildColumnLine('legacy_id', field({ type: 'foreignId', nullable: true }));
    expect(line).toBe("$table->foreignId('legacy_id')->nullable();");
    expect(line).not.toContain('constrained');
  });

  it('one-to-one: nullable + unique FK keeps both before constrained', () => {
    const line = buildColumnLine(
      'profile_id',
      field({ type: 'foreignId', references: 'profiles.id', nullable: true, unique: true }),
    );
    expect(line).toBe(
      "$table->foreignId('profile_id')->nullable()->unique()->constrained('profiles');",
    );
  });

  it('does not add a duplicate ->index() on a constrained FK column', () => {
    const line = buildColumnLine(
      'category_id',
      field({ type: 'foreignId', references: 'categories.id', index: true }),
    );
    expect(line).not.toContain('->index()');
    expect(line).toContain("->constrained('categories')");
  });

  // Property-style invariant: across EVERY onDelete value, when the column is
  // nullable, nullable() must appear before constrained(), and constrained()
  // before onDelete().
  const onDeletes: NonNullable<UdoField['onDelete']>[] = [
    'cascade',
    'restrict',
    'set null',
    'no action',
  ];
  for (const od of onDeletes) {
    it(`invariant holds for onDelete='${od}' (nullable)`, () => {
      const line = buildColumnLine(
        'x_id',
        field({ type: 'foreignId', references: 'xs.id', nullable: true, onDelete: od }),
      );
      const iNullable = line.indexOf('->nullable()');
      const iConstrained = line.indexOf('->constrained(');
      const iOnDelete = line.indexOf('->onDelete(');
      expect(iNullable).toBeGreaterThan(-1);
      expect(iConstrained).toBeGreaterThan(iNullable);
      expect(iOnDelete).toBeGreaterThan(iConstrained);
    });
  }

  it('constrained() never precedes nullable() for any nullable FK', () => {
    for (const od of onDeletes) {
      const line = buildColumnLine(
        'y_id',
        field({ type: 'foreignId', references: 'ys.id', nullable: true, onDelete: od }),
      );
      // The exact substring that caused errno 150 must never appear.
      expect(line).not.toMatch(/constrained\([^)]*\)->onDelete\([^)]*\)->nullable\(\)/);
    }
  });
});

describe('full migration render: self-referencing nullable FK', () => {
  const doc: UdoDocument = {
    udoVersion: 1,
    resource: 'Category',
    softDeletes: true,
    fields: {
      name: { type: 'string', required: true, unique: true },
      parent_id: {
        type: 'foreignId',
        references: 'categories.id',
        nullable: true,
        onDelete: 'set null',
      },
    },
  };

  it('emits a migration whose parent_id line is in DB-valid order', async () => {
    const out = await renderMigration(doc);
    expect(out).toContain(
      "$table->foreignId('parent_id')->nullable()->constrained('categories')->onDelete('set null');",
    );
    // The broken ordering must not appear anywhere.
    expect(out).not.toMatch(/onDelete\('set null'\)->nullable\(\)/);
  });
});
