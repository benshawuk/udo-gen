import { describe, expect, it } from 'vitest';
import type { UdoDocument, UdoField, PrimitiveType } from '../../src/types.js';
import { buildColumnLine, renderMigration } from '../../src/generate/migration.js';
import { renderModelBase } from '../../src/generate/model-base.js';
import { renderFormRequest, buildFieldRules } from '../../src/generate/form-request.js';
import { renderTsModule, buildTsModuleContext } from '../../src/generate/ts-module.js';
import { renderFactory } from '../../src/generate/factory.js';

// Exhaustive type-vocabulary coverage. One field per primitive ensures every
// path through every generator stays valid.

const ALL_TYPES: PrimitiveType[] = [
  'string',
  'text',
  'longText',
  'mediumText',
  'integer',
  'bigInteger',
  'tinyInteger',
  'unsignedInteger',
  'unsignedTinyInteger',
  'decimal',
  'float',
  'double',
  'boolean',
  'date',
  'dateTime',
  'timestamp',
  'time',
  'json',
  'uuid',
  'foreignId',
  'binary',
];

function fieldOf(type: PrimitiveType): UdoField {
  switch (type) {
    case 'decimal':
      return { type, precision: 10, scale: 2 };
    case 'foreignId':
      return { type, references: 'users.id', onDelete: 'cascade' };
    default:
      return { type };
  }
}

describe('every primitive type produces a valid migration column', () => {
  for (const t of ALL_TYPES) {
    it(`type "${t}" emits a Blueprint call`, () => {
      const line = buildColumnLine(t, fieldOf(t));
      expect(line).toMatch(/\$table->/);
      expect(line).toMatch(/;$/);
    });
  }
});

describe('every primitive type renders a model base with correct casts', () => {
  for (const t of ALL_TYPES) {
    it(`type "${t}" renders without throwing`, async () => {
      const doc: UdoDocument = {
        udoVersion: 1,
        resource: 'Sample',
        fields: { sample: fieldOf(t) },
      };
      const output = await renderModelBase(doc);
      expect(output).toContain('abstract class SampleBase');
    });
  }
});

describe('every primitive type produces a valid TS shape', () => {
  // `json` is intentionally `unknown` / `z.unknown()` — JSON can hold anything.
  const EXPECT_NON_UNKNOWN = ALL_TYPES.filter((t) => t !== 'json');

  for (const t of EXPECT_NON_UNKNOWN) {
    it(`type "${t}" maps to a non-unknown TS type`, () => {
      const ctx = buildTsModuleContext({
        udoVersion: 1,
        resource: 'S',
        fields: { x: fieldOf(t) },
      });
      const field = ctx.fields[0];
      expect(field?.shapeType).not.toBe('unknown');
      expect(field?.zod).not.toBe('z.unknown()');
    });
  }

  it('type "json" intentionally maps to unknown', () => {
    const ctx = buildTsModuleContext({
      udoVersion: 1,
      resource: 'S',
      fields: { x: { type: 'json' } },
    });
    expect(ctx.fields[0]?.shapeType).toBe('unknown');
    expect(ctx.fields[0]?.zod).toContain('z.unknown()');
  });
});

describe('every primitive type produces a factory expression', () => {
  for (const t of ALL_TYPES) {
    it(`type "${t}" emits a non-empty factory expression`, async () => {
      const doc: UdoDocument = {
        udoVersion: 1,
        resource: 'S',
        fields: { x: fieldOf(t) },
      };
      const output = await renderFactory(doc);
      expect(output).toContain('public function definition()');
      expect(output).toMatch(/'x' => .+,/);
    });
  }
});

describe('format combinations', () => {
  const formatCombinations: { format: string; type: PrimitiveType; expectInZod: string }[] = [
    { format: 'email', type: 'string', expectInZod: '.email()' },
    { format: 'url', type: 'string', expectInZod: '.url()' },
    { format: 'uuid', type: 'string', expectInZod: '.uuid()' },
    { format: 'ipAddress', type: 'string', expectInZod: '.ip()' },
    { format: 'slug', type: 'string', expectInZod: '.regex(' },
  ];

  for (const { format, type, expectInZod } of formatCombinations) {
    it(`format "${format}" on type "${type}" produces correct Zod call`, () => {
      const ctx = buildTsModuleContext({
        udoVersion: 1,
        resource: 'S',
        fields: { x: { type, format, required: true } },
      });
      expect(ctx.fields[0]?.zod).toContain(expectInZod);
    });
  }
});

describe('required + nullable matrix', () => {
  it('required, not nullable → no .nullable, no .optional', () => {
    const ctx = buildTsModuleContext({
      udoVersion: 1,
      resource: 'S',
      fields: { x: { type: 'string', required: true } },
    });
    expect(ctx.fields[0]?.zod).not.toContain('.nullable()');
    expect(ctx.fields[0]?.zod).not.toContain('.optional()');
  });

  it('required + nullable → .nullable, no .optional', () => {
    const ctx = buildTsModuleContext({
      udoVersion: 1,
      resource: 'S',
      fields: { x: { type: 'string', required: true, nullable: true } },
    });
    expect(ctx.fields[0]?.zod).toContain('.nullable()');
    expect(ctx.fields[0]?.zod).not.toContain('.optional()');
  });

  it('not required + nullable → .nullable().optional()', () => {
    const ctx = buildTsModuleContext({
      udoVersion: 1,
      resource: 'S',
      fields: { x: { type: 'string', nullable: true } },
    });
    expect(ctx.fields[0]?.zod).toContain('.nullable()');
    expect(ctx.fields[0]?.zod).toContain('.optional()');
  });

  it('not required, not nullable → .optional()', () => {
    const ctx = buildTsModuleContext({
      udoVersion: 1,
      resource: 'S',
      fields: { x: { type: 'string' } },
    });
    expect(ctx.fields[0]?.zod).toContain('.optional()');
  });
});

describe('enum with numeric values', () => {
  it('emits z.union of z.literal for numeric enums', () => {
    const ctx = buildTsModuleContext({
      udoVersion: 1,
      resource: 'S',
      fields: { priority: { type: 'integer', values: [1, 2, 3] } },
    });
    expect(ctx.fields[0]?.zod).toContain('z.union(');
    expect(ctx.fields[0]?.zod).toContain('z.literal(1)');
  });

  it('emits z.enum for string enums', () => {
    const ctx = buildTsModuleContext({
      udoVersion: 1,
      resource: 'S',
      fields: { status: { type: 'string', values: ['a', 'b'] } },
    });
    expect(ctx.fields[0]?.zod).toContain("z.enum(['a', 'b'])");
  });
});

describe('multi-FK resource (full migration round-trip)', () => {
  const doc: UdoDocument = {
    udoVersion: 1,
    resource: 'OrderItem',
    table: 'order_items',
    fields: {
      order_id: { type: 'foreignId', required: true, references: 'orders.id', onDelete: 'cascade' },
      product_id: { type: 'foreignId', required: true, references: 'products.id', onDelete: 'restrict' },
      quantity: { type: 'unsignedInteger', required: true, default: 1 },
      unit_price: { type: 'decimal', required: true, precision: 10, scale: 2 },
    },
    indexes: [{ columns: ['order_id', 'product_id'], unique: true }],
  };

  it('emits both FKs with correct onDelete in migration', async () => {
    const output = await renderMigration(doc);
    expect(output).toContain("$table->foreignId('order_id')->constrained('orders')->onDelete('cascade');");
    expect(output).toContain("$table->foreignId('product_id')->constrained('products')->onDelete('restrict');");
  });

  it('emits unique composite index', async () => {
    const output = await renderMigration(doc);
    expect(output).toContain("$table->unique(['order_id', 'product_id']);");
  });

  it('emits both belongsTo methods in model base', async () => {
    const output = await renderModelBase(doc);
    expect(output).toContain('public function order(): BelongsTo');
    expect(output).toContain('public function product(): BelongsTo');
  });

  it('emits exists: rules for both FKs in FormRequest', async () => {
    const output = await renderFormRequest(doc);
    expect(output).toContain("'exists:orders,id'");
    expect(output).toContain("'exists:products,id'");
  });
});

describe('validation overrides', () => {
  it('appends backend rules to the base rules', () => {
    const fr = buildFieldRules('email', {
      type: 'string',
      format: 'email',
      required: true,
      validation: { backend: ['unique:users,email', 'lowercase'] },
    });
    expect(fr.rules).toContain('unique:users,email');
    expect(fr.rules).toContain('lowercase');
  });

  it('removes shared rules listed in validation.skip.backend', () => {
    const fr = buildFieldRules('title', {
      type: 'string',
      required: true,
      max: 255,
      validation: { skip: { backend: ['max'] } },
    });
    expect(fr.rules).not.toContain('max:255');
    expect(fr.rules).toContain('string');
  });
});

describe('controller knobs', () => {
  it('respects custom pageSize', async () => {
    const doc: UdoDocument = {
      udoVersion: 1,
      resource: 'Big',
      fields: { name: { type: 'string', required: true } },
      controller: { mode: 'auto', pageSize: 100 },
    };
    const { renderControllerBase } = await import('../../src/generate/controller-base.js');
    const output = await renderControllerBase(doc);
    expect(output).toContain('paginate(100)');
  });

  it('respects defaultSort descending', async () => {
    const doc: UdoDocument = {
      udoVersion: 1,
      resource: 'X',
      fields: { name: { type: 'string', required: true } },
      controller: { mode: 'auto', defaultSort: '-created_at' },
    };
    const { renderControllerBase } = await import('../../src/generate/controller-base.js');
    const output = await renderControllerBase(doc);
    expect(output).toContain("orderBy('created_at', 'desc')");
  });

  it('respects defaultSort ascending without dash prefix', async () => {
    const doc: UdoDocument = {
      udoVersion: 1,
      resource: 'X',
      fields: { name: { type: 'string', required: true } },
      controller: { mode: 'auto', defaultSort: 'name' },
    };
    const { renderControllerBase } = await import('../../src/generate/controller-base.js');
    const output = await renderControllerBase(doc);
    expect(output).toContain("orderBy('name', 'asc')");
  });

  it('emits with([]) for eagerLoad knob', async () => {
    const doc: UdoDocument = {
      udoVersion: 1,
      resource: 'X',
      fields: { name: { type: 'string', required: true } },
      controller: { mode: 'auto', eagerLoad: ['author', 'tags'] },
    };
    const { renderControllerBase } = await import('../../src/generate/controller-base.js');
    const output = await renderControllerBase(doc);
    expect(output).toContain("with(['author', 'tags'])");
  });
});

describe('reserved-ish field names', () => {
  // Defensively check we don't break on common short or PHP-keyword-adjacent names.
  const names = ['name', 'class_name', 'type', 'default_value', 'order'];
  for (const fname of names) {
    it(`handles field name "${fname}"`, () => {
      const ctx = buildTsModuleContext({
        udoVersion: 1,
        resource: 'X',
        fields: { [fname]: { type: 'string', required: true } },
      });
      expect(ctx.fields[0]?.name).toBe(fname);
    });
  }
});
