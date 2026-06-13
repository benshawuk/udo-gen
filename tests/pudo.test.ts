import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
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
