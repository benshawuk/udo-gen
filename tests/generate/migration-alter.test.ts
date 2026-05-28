import { describe, expect, it } from 'vitest';
import type { UdoDocument } from '../../src/types.js';
import {
  buildAlterContext,
  diffUdo,
  renderAlterMigration,
} from '../../src/generate/migration-alter.js';

const snapshot: UdoDocument = {
  udoVersion: 1,
  resource: 'Product',
  fields: {
    title: { type: 'string', required: true, max: 255 },
    price: { type: 'decimal', precision: 8, scale: 2 },
    legacy_field: { type: 'string' },
  },
};

describe('diffUdo', () => {
  it('detects added fields', () => {
    const current: UdoDocument = {
      ...snapshot,
      fields: { ...snapshot.fields, discount: { type: 'unsignedTinyInteger', nullable: true } },
    };
    const diff = diffUdo(snapshot, current);
    expect(diff.added.map((a) => a.name)).toEqual(['discount']);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });

  it('detects removed fields', () => {
    const current: UdoDocument = {
      ...snapshot,
      fields: { title: snapshot.fields.title!, price: snapshot.fields.price! },
    };
    const diff = diffUdo(snapshot, current);
    expect(diff.removed.map((r) => r.name)).toEqual(['legacy_field']);
    expect(diff.added).toHaveLength(0);
  });

  it('detects changed fields with property list', () => {
    const current: UdoDocument = {
      ...snapshot,
      fields: {
        ...snapshot.fields,
        title: { type: 'text', required: true, max: 255 },
      },
    };
    const diff = diffUdo(snapshot, current);
    expect(diff.changed[0]?.name).toBe('title');
    expect(diff.changed[0]?.changes.map((c) => c.property)).toContain('type');
  });

  it('returns empty diff when nothing changed', () => {
    const diff = diffUdo(snapshot, snapshot);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });
});

describe('buildAlterContext', () => {
  it('produces add and drop column lines', () => {
    const current: UdoDocument = {
      ...snapshot,
      fields: {
        title: snapshot.fields.title!,
        price: snapshot.fields.price!,
        discount: { type: 'unsignedTinyInteger', nullable: true },
      },
    };
    const diff = diffUdo(snapshot, current);
    const ctx = buildAlterContext(current, diff);
    expect(ctx.addColumns[0]).toContain("$table->unsignedTinyInteger('discount')->nullable();");
    expect(ctx.dropColumns[0]).toBe("$table->dropColumn('legacy_field');");
  });

  it('reverses the diff in down()', () => {
    const current: UdoDocument = {
      ...snapshot,
      fields: {
        title: snapshot.fields.title!,
        price: snapshot.fields.price!,
        discount: { type: 'unsignedTinyInteger', nullable: true },
      },
    };
    const diff = diffUdo(snapshot, current);
    const ctx = buildAlterContext(current, diff);
    expect(ctx.reverseAddDrops).toEqual(["$table->dropColumn('discount');"]);
    expect(ctx.reverseDropAdds[0]).toContain("$table->string('legacy_field')");
  });

  it('emits warnings for changed fields rather than altering automatically', () => {
    const current: UdoDocument = {
      ...snapshot,
      fields: {
        title: { type: 'text', required: true, max: 255 },
        price: snapshot.fields.price!,
        legacy_field: snapshot.fields.legacy_field!,
      },
    };
    const diff = diffUdo(snapshot, current);
    const ctx = buildAlterContext(current, diff);
    expect(ctx.warnings.length).toBe(1);
    expect(ctx.warnings[0]).toContain('title');
    expect(ctx.addColumns).toHaveLength(0);
  });
});

describe('renderAlterMigration', () => {
  it('produces a Schema::table ALTER block', async () => {
    const current: UdoDocument = {
      ...snapshot,
      fields: {
        title: snapshot.fields.title!,
        price: snapshot.fields.price!,
        discount: { type: 'unsignedTinyInteger', nullable: true },
      },
    };
    const diff = diffUdo(snapshot, current);
    const output = await renderAlterMigration(current, diff);
    expect(output).toContain('Schema::table');
    expect(output).toContain("$table->unsignedTinyInteger('discount')->nullable();");
    expect(output).toContain("$table->dropColumn('legacy_field');");
  });

  it('includes TODO warnings for changed fields', async () => {
    const current: UdoDocument = {
      ...snapshot,
      fields: {
        title: { type: 'text', required: true, max: 255 },
        price: snapshot.fields.price!,
        legacy_field: snapshot.fields.legacy_field!,
      },
    };
    const diff = diffUdo(snapshot, current);
    const output = await renderAlterMigration(current, diff);
    expect(output).toContain('// TODO');
    expect(output).toContain('title');
  });
});
