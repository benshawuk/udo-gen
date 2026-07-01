import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseUdoFile } from '../src/parse.js';
import type { UdoDocument } from '../src/types.js';

function phpAvailable(): boolean {
  try {
    execFileSync('php', ['-v'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const HAS_PHP = phpAvailable();
const conditional = HAS_PHP ? it : it.skip;

const examplesDir = join(import.meta.dirname, '..', 'examples');
const phpSrcDir = join(import.meta.dirname, '..', 'php');

function tmpPudo(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pudo-parse-'));
  const path = join(dir, 'Test.pudo.php');
  writeFileSync(path, contents, 'utf8');
  return path;
}

/**
 * Fill schema defaults and drop $schema so a hand-written JSON document
 * (which states defaults explicitly) compares equal to a PUDO document
 * (which omits them).
 */
function normalize(doc: UdoDocument): Record<string, unknown> {
  const { $schema: _schema, ...rest } = doc;
  return {
    timestamps: true,
    softDeletes: false,
    controller: 'auto',
    transformer: 'auto',
    factory: 'auto',
    ...rest,
  };
}

describe('PUDO runtime source', () => {
  conditional('every php/ source file passes php -l', () => {
    const files = [
      join(phpSrcDir, 'eval-pudo.php'),
      ...readdirSync(join(phpSrcDir, 'src')).map((f) => join(phpSrcDir, 'src', f)),
    ];
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      execFileSync('php', ['-l', file], { stdio: 'pipe' });
    }
  });
});

describe('parseUdoFile with .pudo.php', () => {
  conditional('Product.pudo.php round-trips to the same document as Product.udo.json', () => {
    const fromJson = parseUdoFile(join(examplesDir, 'Product.udo.json'));
    const fromPhp = parseUdoFile(join(examplesDir, 'Product.pudo.php'));

    expect(fromJson.ok).toBe(true);
    expect(fromPhp.ok).toBe(true);
    if (!fromJson.ok || !fromPhp.ok) return;

    expect(normalize(fromPhp.document)).toEqual(normalize(fromJson.document));
    // Field declaration order drives form layout, so it must survive too.
    expect(Object.keys(fromPhp.document.fields)).toEqual(Object.keys(fromJson.document.fields));
  });

  conditional('Article.pudo.php covers the full v1 surface and validates', () => {
    const result = parseUdoFile(join(examplesDir, 'Article.pudo.php'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const doc = result.document;
    expect(doc.resource).toBe('Article');
    expect(doc.softDeletes).toBe(true);
    expect(doc.nav).toEqual({ section: 'Content', icon: 'newspaper', order: 20 });
    expect(doc.controller).toEqual({
      mode: 'auto',
      eagerLoad: ['author', 'tags'],
      scopes: ['published'],
      search: ['title', 'body'],
      defaultSort: '-published_at',
      pageSize: 25,
    });
    expect(doc.fields.body.validation).toEqual({ skip: { frontend: ['max'] } });
    expect(doc.fields.body.ui).toEqual({
      widget: 'markdown-editor',
      help: 'articles.fields.body.help',
      placeholder: 'articles.fields.body.placeholder',
    });
    expect(doc.fields.excerpt.label).toBe('articles.fields.summary');
    expect(doc.fields.author_id.onDelete).toBe('cascade');
    expect(doc.relationships?.owner).toEqual({
      type: 'morphTo',
      model: 'Article',
      morphName: 'ownable',
    });
    expect(doc.indexes).toEqual([
      { columns: ['status', 'published_at'] },
      { columns: ['author_id', 'created_at'], unique: true, name: 'articles_author_recent' },
    ]);
    expect(doc.views?.form).toEqual({
      fields: ['title', 'slug', 'status', 'body', 'excerpt', 'published_at'],
      layout: 'two-column',
    });
    expect(doc.views?.table?.columns?.[0]).toEqual({ field: 'title', sortable: true });
    expect(doc.views?.table?.columns?.[1]).toBe('author.name');
    expect(doc.views?.card).toEqual({
      title: 'title',
      subtitle: 'author.name',
      body: ['excerpt', 'status'],
    });
  });

  conditional('serializes transformer / request / factory opt-outs', () => {
    const path = tmpPudo(`<?php
use Pudo\\Blueprint;
use Pudo\\Resource;

class Widget extends Resource
{
    protected string $transformer = 'custom';
    protected string $request = 'custom';
    protected string|false $factory = false;

    public function fields(Blueprint $table): void
    {
        $table->string('name');
    }
}
`);
    const result = parseUdoFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.transformer).toBe('custom');
    expect(result.document.request).toBe('custom');
    expect(result.document.factory).toBe(false);
  });

  conditional('accepts a minimal class with resource name from the class name', () => {
    const path = tmpPudo(`<?php
use Pudo\\Blueprint;
use Pudo\\Resource;

class Widget extends Resource
{
    public function fields(Blueprint $table): void
    {
        $table->string('name')->required();
    }
}
`);
    const result = parseUdoFile(path);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.resource).toBe('Widget');
      expect(result.document.fields.name).toEqual({ type: 'string', required: true });
    }
  });

  conditional('reports PHP syntax errors with stage php', () => {
    const path = tmpPudo(`<?php this is not valid php`);
    const result = parseUdoFile(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('php');
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  conditional('reports files with no Resource subclass', () => {
    const path = tmpPudo(`<?php $x = 1;`);
    const result = parseUdoFile(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('php');
      expect(result.errors.join('\n')).toMatch(/No class extending Pudo\\Resource/);
    }
  });

  conditional('reports duplicate field declarations', () => {
    const path = tmpPudo(`<?php
use Pudo\\Blueprint;
use Pudo\\Resource;

class Widget extends Resource
{
    public function fields(Blueprint $table): void
    {
        $table->string('name');
        $table->text('name');
    }
}
`);
    const result = parseUdoFile(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('php');
      expect(result.errors.join('\n')).toMatch(/declared twice/);
    }
  });

  conditional('schema violations authored in PHP surface as stage schema', () => {
    const path = tmpPudo(`<?php
use Pudo\\Blueprint;
use Pudo\\Resource;

class Widget extends Resource
{
    protected ?string $resource = 'lowercase_thing';

    public function fields(Blueprint $table): void
    {
        $table->string('name');
    }
}
`);
    const result = parseUdoFile(path);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe('schema');
  });
});

/**
 * Parity lock: PUDO must be able to express EVERY property in the UDO v1
 * schema. The expectations below are derived from the schema file itself, so
 * adding a property to udo-v1.schema.json without teaching the PUDO runtime to
 * emit it fails here — the two authoring formats cannot silently drift apart.
 */
describe('PUDO ↔ schema parity', () => {
  const schema = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'schema', 'udo-v1.schema.json'), 'utf8'),
  );

  const MAXIMAL_PUDO = `<?php
use Pudo\\Blueprint;
use Pudo\\Controller;
use Pudo\\Relations;
use Pudo\\Resource;
use Pudo\\Views;

class Everything extends Resource
{
    protected ?string $table = 'everythings';
    protected bool $timestamps = false;
    protected bool $softDeletes = true;
    protected string $transformer = 'custom';
    protected string $request = 'custom';
    protected string|false $factory = false;
    protected ?array $nav = ['section' => 'Admin', 'icon' => 'boxes', 'order' => 5];
    protected array $appends = [
        'is_ready' => 'boolean',
        'display_name' => ['type' => 'string', 'nullable' => true],
    ];

    public function fields(Blueprint $table): void
    {
        $table->string('title')->required()->min(2)->max(120)->label('x.fields.title')
            ->widget('textarea')->help('x.help')->placeholder('x.ph')->displayFormat('currency:USD')
            ->rules(backend: ['unique:everythings,title'], frontend: ['startsWith:a'])
            ->skipRules(frontend: ['max']);
        $table->string('code', 8)->unique()->index()->default('none');
        $table->string('slug_thing')->format('slug')->nullable();
        $table->string('secret')->hidden()->cast('encrypted');
        $table->enum('status', ['draft', 'live']);
        $table->decimal('price', 10, 2);
        $table->foreignId('owner_id')->references('users.id')->cascadeOnDelete()->displayField('name');

        $table->unique(['title', 'code'], 'everything_title_code');
    }

    public function relationships(Relations $relations): void
    {
        $relations->hasMany('items', 'Item')->foreignKey('everything_id')->localKey('id');
        $relations->belongsToMany('tags', 'Tag')->pivot('everything_tag');
        $relations->morphMany('comments', 'Comment', 'commentable');
    }

    public function views(Views $views): void
    {
        $views->form(fields: ['title', 'code'], layout: 'two-column');
        $views->table(
            columns: ['title', ['field' => 'status', 'label' => 'x.status', 'sortable' => true, 'align' => 'right', 'badge' => true, 'format' => 'badge']],
            search: ['title'],
            defaultSort: '-title',
            pageSize: 10,
        );
        $views->card(title: 'title', subtitle: 'owner.name', body: ['code']);
    }

    public function controller(): string|Controller
    {
        return Controller::auto()->eagerLoad('owner')->scopes('live')->search('title')
            ->defaultSort('-title')->pageSize(10)->ownedBy('owner_id');
    }
}
`;

  conditional('a maximal PUDO covers every schema property and validates', () => {
    const result = parseUdoFile(tmpPudo(MAXIMAL_PUDO));
    expect(result.ok, result.ok ? '' : result.errors.join('\n')).toBe(true);
    if (!result.ok) return;
    const doc = result.document as Record<string, any>;

    // Document level — every schema property must be expressible ($schema is
    // JSON-editor-only, so it is exempt).
    const docProps = Object.keys(schema.properties).filter((p) => p !== '$schema');
    for (const prop of docProps) {
      expect(doc, `document property '${prop}' missing from PUDO output`).toHaveProperty(prop);
    }

    // Field level — the union of emitted field keys must cover the schema's
    // field properties.
    const fieldProps = Object.keys(schema.$defs.field.properties);
    const seenField = new Set(
      Object.values(doc.fields as Record<string, object>).flatMap((f) => Object.keys(f)),
    );
    for (const prop of fieldProps) {
      expect(seenField.has(prop), `field property '${prop}' not expressible from PUDO`).toBe(true);
    }

    // Relationship level.
    const relProps = Object.keys(schema.$defs.relationship.properties);
    const seenRel = new Set(
      Object.values(doc.relationships as Record<string, object>).flatMap((r) => Object.keys(r)),
    );
    for (const prop of relProps) {
      expect(seenRel.has(prop), `relationship property '${prop}' not expressible from PUDO`).toBe(true);
    }

    // Controller object knobs.
    const ctrlSchema = schema.properties.controller.oneOf.find((o: any) => o.type === 'object');
    for (const prop of Object.keys(ctrlSchema.properties)) {
      expect(doc.controller, `controller knob '${prop}' not expressible from PUDO`).toHaveProperty(prop);
    }

    // Views: form/table/card sub-properties.
    for (const [view, def] of [
      ['form', schema.$defs.formView],
      ['table', schema.$defs.tableView],
      ['card', schema.$defs.cardView],
    ] as const) {
      for (const prop of Object.keys(def.properties)) {
        expect(doc.views[view], `views.${view}.${prop} not expressible from PUDO`).toHaveProperty(prop);
      }
    }

    // Nav sub-properties.
    for (const prop of Object.keys(schema.properties.nav.properties)) {
      expect(doc.nav, `nav.${prop} not expressible from PUDO`).toHaveProperty(prop);
    }

    // Spot-check the two serialization-control additions round-trip correctly.
    expect(doc.fields.secret).toMatchObject({ hidden: true, cast: 'encrypted' });
    expect(doc.appends).toEqual({
      is_ready: { type: 'boolean' },
      display_name: { type: 'string', nullable: true },
    });
  });

  conditional('every Blueprint type method matches a schema primitive', () => {
    const primitives: string[] = schema.$defs.primitiveType.enum;
    const body = primitives.map((p, i) => `        $table->${p}('f${i}');`).join('\n');
    const path = tmpPudo(`<?php
use Pudo\\Blueprint;
use Pudo\\Resource;

class Primitives extends Resource
{
    public function fields(Blueprint $table): void
    {
${body}
    }
}
`);
    const result = parseUdoFile(path);
    expect(result.ok, result.ok ? '' : result.errors.join('\n')).toBe(true);
    if (!result.ok) return;
    const emitted = Object.values(result.document.fields).map((f) => f.type);
    expect(emitted).toEqual(primitives);
  });

  conditional('a malformed appends entry fails with a clear PHP-stage error', () => {
    const path = tmpPudo(`<?php
use Pudo\\Blueprint;
use Pudo\\Resource;

class Widget extends Resource
{
    protected array $appends = ['broken' => 42];

    public function fields(Blueprint $table): void
    {
        $table->string('name');
    }
}
`);
    const result = parseUdoFile(path);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe('php');
      expect(result.errors.join('\n')).toMatch(/Append 'broken'/);
    }
  });
});
