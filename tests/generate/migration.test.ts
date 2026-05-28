import { describe, expect, it } from 'vitest';
import type { UdoDocument } from '../../src/types.js';
import { buildColumnLine, buildMigrationContext, renderMigration } from '../../src/generate/migration.js';

describe('buildColumnLine', () => {
  it('emits a plain string column', () => {
    expect(buildColumnLine('title', { type: 'string' })).toBe(`$table->string('title');`);
  });

  it('honours string length', () => {
    expect(buildColumnLine('code', { type: 'string', length: 4 })).toBe(
      `$table->string('code', 4);`,
    );
  });

  it('chains nullable', () => {
    expect(buildColumnLine('subtitle', { type: 'string', nullable: true })).toBe(
      `$table->string('subtitle')->nullable();`,
    );
  });

  it('chains unique and index', () => {
    expect(buildColumnLine('slug', { type: 'string', unique: true })).toContain('->unique()');
    expect(buildColumnLine('email', { type: 'string', index: true })).toContain('->index()');
  });

  it('emits decimal with precision/scale', () => {
    expect(buildColumnLine('price', { type: 'decimal', precision: 10, scale: 2 })).toBe(
      `$table->decimal('price', 10, 2);`,
    );
  });

  it('emits foreignId with constrained + onDelete', () => {
    expect(
      buildColumnLine('category_id', {
        type: 'foreignId',
        references: 'categories.id',
        onDelete: 'cascade',
      }),
    ).toBe(`$table->foreignId('category_id')->constrained('categories')->onDelete('cascade');`);
  });

  it('emits default values correctly', () => {
    expect(buildColumnLine('status', { type: 'string', default: 'draft' })).toContain(
      "->default('draft')",
    );
    expect(buildColumnLine('count', { type: 'integer', default: 0 })).toContain('->default(0)');
    expect(buildColumnLine('flag', { type: 'boolean', default: true })).toContain(
      '->default(true)',
    );
  });
});

describe('buildMigrationContext / renderMigration', () => {
  const doc: UdoDocument = {
    udoVersion: 1,
    resource: 'VerificationCode',
    table: 'verification_codes',
    fields: {
      identifier: { type: 'string', required: true },
      code: { type: 'string', length: 4, required: true },
      expires_at: { type: 'timestamp', required: true, index: true },
      verified_at: { type: 'timestamp', nullable: true },
    },
    indexes: [{ columns: ['identifier', 'code', 'expires_at'] }],
  };

  it('emits $table->id() first', () => {
    const ctx = buildMigrationContext(doc);
    expect(ctx.columns[0]).toBe('$table->id();');
  });

  it('preserves field declaration order', () => {
    const ctx = buildMigrationContext(doc);
    expect(ctx.columns.slice(1)).toEqual([
      `$table->string('identifier');`,
      `$table->string('code', 4);`,
      `$table->timestamp('expires_at')->index();`,
      `$table->timestamp('verified_at')->nullable();`,
    ]);
  });

  it('includes composite indexes', () => {
    const ctx = buildMigrationContext(doc);
    expect(ctx.compositeIndexes).toEqual([
      { columns: ['identifier', 'code', 'expires_at'], unique: false, name: undefined },
    ]);
  });

  it('renders a Schema::create migration', async () => {
    const output = await renderMigration(doc);
    expect(output).toContain("Schema::create('verification_codes'");
    expect(output).toContain("Schema::dropIfExists('verification_codes')");
    expect(output).toContain('$table->index([');
  });

  it('emits softDeletes when configured', async () => {
    const output = await renderMigration({ ...doc, softDeletes: true });
    expect(output).toContain('$table->softDeletes();');
  });
});
