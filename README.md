# udo-gen

> Schema-first, platform-agnostic code generator. One **Unified Data Object** (UDO)
> file describes a resource; adapters emit every artifact you would otherwise
> hand-maintain. The first adapter set targets Laravel + React (~13 files), but the
> UDO schema is the master resource - any backend or frontend can be added behind a
> new adapter.

## What is a UDO?

A **Unified Data Object** is a single declarative file that states the *facts* about
a resource: its fields, their types and validation, its relationships, and a few UI
hints. It never contains logic. It comes in two interchangeable authoring formats:
`{Resource}.udo.json` (JSONC) and `{Resource}.pudo.php` (**PUDO** - the same facts
written as a Laravel-style PHP class; see [PUDO](#pudo-authoring-the-udo-in-php)).

From that one file, `udo gen` produces the Eloquent model, migration, FormRequest,
API Resource, factory, controller, route entry, TypeScript module (with Zod schemas),
translation starter, and a React scaffold page - all kept consistent with each other.

The UDO itself knows nothing about Laravel or React. It is a neutral description of a
resource; the framework-specific output comes entirely from **adapters**. Laravel and
React are simply the first adapters that ship in this repo.

Two rules capture the whole philosophy:

- **Facts, not code.** If you would need an `if`, a loop, or a function call to express
  it, it does not belong in the UDO. Logic lives in PHP/TS.
- **Generate, then own.** Base classes and machine artifacts are regenerated on every
  run. Extension files (`Product.php`, `ProductController.php`, the React page) are
  scaffolded once and never touched again - they are yours.

```
Product.udo.json ──▶ udo gen ──▶ Model + Migration + FormRequest + Resource
   (one file)                     + Factory + Controller + routes + TS + Zod
                                  + lang + React page   (≈13 artifacts)
```

## Platform-agnostic by design

The UDO schema is the **master resource**. Everything downstream is an adapter, and
an adapter is just a function from a parsed UDO to one output artifact. Today's
adapters emit Laravel (PHP) and React (TypeScript), but nothing in the schema is
tied to either.

```
                          ┌─ Laravel adapters ─▶ Model, Migration, FormRequest, ...
                          │
  Product.udo.json ──────▶┼─ React adapters ───▶ TS module, Zod, scaffold page, ...
   (single source         │
    of truth)             ├─ (Django / Rails / Spring) ─▶ models, serializers, ...   ← future
                          │
                          └─ (Vue / Svelte / Angular) ──▶ components, forms, ...      ← future
```

Adding support for another stack means writing new adapters against the same UDO -
the schema, your `.udo.json` files, and the `udo` CLI stay exactly as they are. A new
backend or frontend never requires changing the source of truth. Concretely, each
adapter is a small `render*(doc)` module (see `src/generate/`) plus an Eta template
(see `templates/`); a Django or Vue target would be a sibling set of those, selected
per output.

## Install

```bash
git clone https://github.com/benshawuk/udo-gen.git
cd udo-gen
pnpm install
pnpm build

# Use it inside a Laravel project:
cd /path/to/laravel-project
pnpm link /path/to/udo-gen
```

## Quick start

```bash
udo validate udo/Product.udo.json     # parse + validate against the v1 schema
udo gen-preview udo/Product.udo.json  # render one artifact to stdout
udo gen      udo/Product.udo.json     # write all artifacts into the project
udo migrate  udo/Product.udo.json     # diff vs snapshot, emit an additive ALTER migration
```

`udo gen` is idempotent: scaffold-once files are preserved and migrations are never
duplicated.

---

## A complete, annotated example

The UDO below intentionally exercises **every part of the v1 syntax** - all the
document-level knobs, the full field vocabulary, formats, validation escape hatches,
UI hints, every relationship kind, composite indexes, and all three view types.
Most real UDOs are a fraction of this size; this one is a tour.

```jsonc
{
  // Points editors at the schema for autocomplete + inline validation.
  "$schema": "../node_modules/udo-gen/schema/udo-v1.schema.json",
  "udoVersion": 1,

  // --- Document-level facts -------------------------------------------------
  "resource": "Article",          // PascalCase. Required.
  "table": "articles",            // Optional; defaults to snake_case plural.
  "timestamps": true,             // created_at / updated_at. Default true.
  "softDeletes": true,            // deleted_at + SoftDeletes trait. Default false.

  // Controller as an object unlocks the "auto" knobs. Can also be the string
  // "auto" (stock CRUD) or "custom" (you write the controller; routes skipped).
  "controller": {
    "mode": "auto",
    "eagerLoad": ["author", "tags"], // ->with([...]) on index() and show()
    "scopes": ["published"],          // named scopes applied to the index query
    "search": ["title", "body"],      // ?q= searches these columns
    "defaultSort": "-published_at",   // leading - = descending
    "pageSize": 25                    // paginate(N)
  },
  "transformer": "auto",          // "auto" | "custom" (skip the API Resource)
  "factory": "auto",              // "auto" | false (skip the factory)

  // Sidebar/navigation hint consumed by the React scaffold.
  "nav": { "section": "Content", "icon": "newspaper", "order": 20 },

  // --- Fields: the core of the UDO -----------------------------------------
  "fields": {
    "title": {
      "type": "string",
      "required": true,
      "max": 255
    },

    "slug": {
      "type": "string",
      "required": true,
      "format": "slug",            // semantic flavour -> widget + validation default
      "max": 255,
      "unique": true,              // DB unique constraint + unique index
      "validation": {
        "backend": ["unique:articles,slug"]  // DB-aware rule: backend only
      }
    },

    "body": {
      "type": "longText",
      "format": "markdown",
      "nullable": true,
      "ui": {                      // all ui strings are TRANSLATION KEYS, never English
        "widget": "markdown-editor",
        "help": "articles.fields.body.help",
        "placeholder": "articles.fields.body.placeholder"
      },
      "validation": {
        "skip": { "frontend": ["max"] }  // drop a shared facet on one side only
      }
    },

    "excerpt": {
      "type": "text",
      "nullable": true,
      "max": 500,
      "label": "articles.fields.summary"  // override the convention-derived label key
    },

    "status": {
      "type": "string",
      "required": true,
      "values": ["draft", "review", "published", "archived"], // enum
      "default": "draft"
    },

    "reading_minutes": {
      "type": "unsignedTinyInteger",
      "default": 1,
      "min": 1,
      "max": 240
    },

    "rating": {
      "type": "decimal",
      "format": "percent",
      "precision": 5,              // total digits
      "scale": 2,                  // digits after the point
      "nullable": true
    },

    "is_featured": {
      "type": "boolean",
      "default": false,
      "index": true                // single-column non-unique index
    },

    "metadata": {
      "type": "json",
      "nullable": true             // free-form structured data
    },

    "external_id": {
      "type": "uuid",
      "format": "uuid",
      "nullable": true,
      "unique": true
    },

    "author_id": {
      "type": "foreignId",
      "required": true,
      "references": "users.id",    // implies belongsTo(User) + exists: rule
      "onDelete": "cascade",       // cascade | restrict | set null | no action
      "displayField": "name"       // which related field to show in pickers
    },

    "published_at": {
      "type": "dateTime",
      "nullable": true,
      "index": true
    }
  },

  // --- Relationships (only the ones NOT implied by a foreignId) -------------
  // belongsTo(User) is already inferred from author_id, so it is NOT repeated here.
  "relationships": {
    "featuredImage": { "type": "hasOne",  "model": "Image",  "foreignKey": "article_id" },
    "revisions":     { "type": "hasMany", "model": "Revision" },
    "tags":          { "type": "belongsToMany", "model": "Tag", "pivot": "article_tag" },
    "comments":      { "type": "morphMany", "model": "Comment", "morphName": "commentable" },
    "owner":         { "type": "morphTo",  "model": "Article", "morphName": "ownable" }
  },

  // --- Composite indexes (single-column indexes use field-level flags) ------
  "indexes": [
    { "columns": ["status", "published_at"] },
    { "columns": ["author_id", "created_at"], "unique": true, "name": "articles_author_recent" }
  ],

  // --- Views: only when overriding the default "all fields, declared order" -
  "views": {
    "form": {
      "fields": ["title", "slug", "status", "body", "excerpt", "published_at"],
      "layout": "two-column"
    },
    "table": {
      "columns": [
        { "field": "title", "sortable": true },
        "author.name",                              // dotted path = relation
        { "field": "status", "badge": true },
        { "field": "rating", "align": "right", "format": "percent" }
      ],
      "search": ["title", "body"],
      "defaultSort": "-published_at",
      "pageSize": 25
    },
    "card": {
      "title": "title",
      "subtitle": "author.name",
      "body": ["excerpt", "status"]
    }
  }
}
```

### What this generates (the Laravel + React adapter set)

Each adapter turns the single UDO into one artifact. `udo gen` runs the whole set
below; a different target stack would supply its own equivalent set:

| Generator              | Output                                                      | Write mode      |
| ---------------------- | ---------------------------------------------------------- | --------------- |
| model-base             | `app/Models/Generated/ArticleBase.php`                     | regenerated     |
| model-extension        | `app/Models/Article.php`                                   | scaffold-once   |
| migration              | `database/migrations/..._create_articles_table.php`        | create-once     |
| form-request           | `app/Http/Requests/ArticleRequest.php`                     | regenerated     |
| resource-transformer   | `app/Http/Resources/ArticleResource.php`                  | regen (unless `custom`) |
| factory                | `database/factories/ArticleFactory.php`                    | regen (unless `false`)  |
| controller-base        | `app/Http/Controllers/Generated/ArticleControllerBase.php` | regen (unless `custom`) |
| controller-extension   | `app/Http/Controllers/ArticleController.php`               | scaffold-once   |
| routes                 | `routes/api.php` (apiResource line injected)              | patched         |
| lang-starter           | `lang/en/articles.php`                                     | scaffold-once   |
| ts-module              | `resources/js/udo/Article.ts` (types + Zod + endpoint)    | regenerated     |
| manifest               | `resources/js/udo/index.ts`                               | regenerated     |
| react-page             | `resources/js/features/articles/article-page.tsx`         | scaffold-once   |
| resource-page-runtime  | `resources/js/lib/udo-ui/resource-page.tsx`               | install-once    |

- **Regenerated** files are overwritten every run - never edit them by hand.
- **Scaffold-once** files are created once and never touched again - they are yours.

---

## PUDO: authoring the UDO in PHP

If your team lives in Laravel, the same UDO can be written as a PHP class instead of
JSONC - a **PUDO** (`{Resource}.pudo.php`). It is not a different schema: a PUDO
serializes to the identical UDO v1 document, validates against the same JSON Schema,
and feeds the same adapters. Field declarations read like a Laravel migration:

```php
<?php

use Pudo\Blueprint;
use Pudo\Controller;
use Pudo\Relations;
use Pudo\Resource;

class Product extends Resource
{
    protected ?string $table = 'products';   // optional; defaults to snake_case plural
    protected bool $softDeletes = true;

    public function fields(Blueprint $table): void
    {
        $table->string('title')->required()->max(255);

        $table->string('slug')->required()->format('slug')->max(255)->unique()
            ->rules(backend: ['unique:products,slug']);

        $table->decimal('price', precision: 10, scale: 2)
            ->format('currency')->required()->min(0);

        $table->enum('status', ['draft', 'published', 'archived'])
            ->required()->default('draft');

        $table->foreignId('category_id')->required()
            ->references('categories.id')->cascadeOnDelete()
            ->displayField('name');

        $table->dateTime('published_at')->nullable()->index();

        $table->index(['status', 'published_at']);   // composite index
    }

    public function relationships(Relations $relations): void
    {
        $relations->belongsToMany('tags', 'Tag')->pivot('product_tag');
        $relations->hasMany('reviews', 'Review');
    }

    public function controller(): string|Controller
    {
        return Controller::auto()
            ->eagerLoad('category')
            ->defaultSort('-created_at')
            ->pageSize(50);
    }
}
```

Every CLI command accepts either format:

```bash
udo validate udo/Product.pudo.php
udo gen      udo/Product.pudo.php
udo migrate  udo/Product.pudo.php
```

How it works: the CLI evaluates the file with your `php` binary (PHP 8.1+ required on
PATH), the class serializes itself to the canonical JSON document, and everything
downstream is shared with the JSONC path. The "facts, not code" rule still applies -
the class body is a declaration, not a place for logic.

The full vocabulary maps 1:1 onto the JSONC syntax:

- Document knobs are properties: `$resource` (defaults to the class name), `$table`,
  `$timestamps`, `$softDeletes`, `$transformer`, `$request`, `$factory`, `$nav`, and
  `$appends` (computed accessors: `['has_password' => 'boolean', 'display_name' =>
  ['type' => 'string', 'nullable' => true]]` — the accessor bodies live in your model
  extension; the declared type flows to the API Resource and the frontend Shape).
- One `Blueprint` method per primitive type (`string`, `text`, `decimal`,
  `foreignId`, ...) plus the `enum($name, [...])` convenience. Field modifiers mirror
  the JSON properties: `required()`, `nullable()`, `unique()`, `index()`,
  `default()`, `max()`, `min()`, `length()`, `precision()`, `scale()`, `values()`,
  `references()`, `onDelete()` (or `cascadeOnDelete()` etc.), `displayField()`,
  `label()`, `hidden()` (kept out of API output and the read Shape, still writable —
  for secrets), `cast()` (override the inferred Eloquent cast, e.g. `'hashed'`,
  `'encrypted'`), `rules()`, `skipRules()`, `widget()`, `help()`, `placeholder()`,
  `displayFormat()`.
- Composite indexes: `$table->index([...])` / `$table->unique([...], name: ...)`.
- Relationships: `$relations->hasOne(...)`, `hasMany`, `belongsToMany`, `morphMany`,
  `morphTo`, with `foreignKey()`, `localKey()`, `pivot()`, `morphName()` modifiers.
- Views: override `views(Views $views)` and call `$views->form(...)`,
  `$views->table(...)`, `$views->card(...)` with named arguments.

See [`examples/Article.pudo.php`](examples/Article.pudo.php) for a full-surface tour
(the PHP twin of the annotated JSONC example above) and
[`examples/Product.pudo.php`](examples/Product.pudo.php) for the PHP twin of
[`examples/Product.udo.json`](examples/Product.udo.json).

For IDE autocomplete inside a Laravel project, point composer's dev autoload at the
runtime that ships with udo-gen (the classes are only needed while authoring; nothing
PUDO-related runs in your app):

```jsonc
// composer.json
"autoload-dev": {
  "psr-4": { "Pudo\\": "node_modules/udo-gen/php/src/" }
}
```

---

## Syntax reference

### Field types

```
string  text  longText  mediumText
integer  bigInteger  tinyInteger  unsignedInteger  unsignedTinyInteger
decimal  float  double
boolean
date  dateTime  timestamp  time
json  uuid  foreignId  binary
```

### Formats (semantic flavour -> UI widget + validation defaults)

`email`, `url`, `slug`, `uuid`, `ipAddress`, `password`, `phone`, `currency`,
`percent`, `richText`, `markdown`, `color`.

### Field properties

`type` (required), `format`, `required`, `nullable`, `unique`, `index`, `default`,
`max`, `min`, `length`, `precision`, `scale`, `values` (enum), `references`,
`onDelete`, `displayField`, `label`, `validation` (`backend` / `frontend` / `skip`),
`ui` (`widget` / `help` / `placeholder` / `format`).

### Relationship types

`hasOne`, `hasMany`, `belongsToMany`, `morphTo`, `morphMany`. `belongsTo` is
inferred from any `foreignId` field - never declare it.

For the full authoring guide (conventions, validation escape hatches, anti-patterns),
see [`skills/udo-author/SKILL.md`](skills/udo-author/SKILL.md).

## Repo layout

```
src/         TypeScript source for the CLI and generators
schema/      JSON Schema for the UDO format (udo-v1.schema.json)
php/         PUDO runtime (Pudo\* classes) + evaluator for .pudo.php files
templates/   Eta templates, one per artifact
examples/    Worked example UDOs (both .udo.json and .pudo.php)
skills/      The udo-author skill (full authoring guide)
tests/       Vitest suite
bin/         Shell entry point (udo -> dist/cli.js)
```

## Development

```bash
pnpm install
pnpm build       # tsc -> dist/
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
```

## Status

**Pre-alpha.** The v1 schema and generators exist and are tested; ergonomics and docs
are still settling. See the [roadmap](TODO.md).

## License

[MIT](LICENSE)
