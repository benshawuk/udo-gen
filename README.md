# udo-gen

> Schema-first code generator for Laravel + React. One **Unified Data Object** (UDO)
> file describes a resource; the generator emits every artifact you would otherwise
> hand-maintain across ~13 files.

## What is a UDO?

A **Unified Data Object** is a single declarative file (`{Resource}.udo.json`, written
in JSONC) that states the *facts* about a resource: its fields, their types and
validation, its relationships, and a few UI hints. It never contains logic.

From that one file, `udo gen` produces the Eloquent model, migration, FormRequest,
API Resource, factory, controller, route entry, TypeScript module (with Zod schemas),
translation starter, and a React scaffold page - all kept consistent with each other.

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

### What this generates (the "adapters")

Each generator turns the single UDO into one artifact. `udo gen` runs them all:

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
templates/   Eta templates, one per artifact
examples/    Worked example UDOs
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
