---
name: udo-author
description: Author Unified Data Object (UDO) files that drive code generation for Laravel + React via udo-gen. One UDO file produces the Eloquent model base, migration, FormRequest, API Resource, Factory, controller base, scaffolded controller/model extensions, TypeScript module with Zod schemas, lang starter, route entry, and React scaffold page. Use this skill when the user asks to add a new CRUD resource, scaffold a model, or describes a resource by its fields and behavior.
---

# UDO Author

## When to invoke this skill

**Invoke when** the user is creating a new CRUD-shaped resource (a thing with a table, fields, and an HTTP API), or asks to "scaffold X" / "add a Y resource" / "create the data layer for Z" in a project that uses udo-gen.

**Do NOT invoke when**:
- The change is to existing application logic (controllers' business logic, custom scopes, accessors) — those live in PHP files, not in the UDO.
- The user wants a one-off endpoint, dashboard, chart, or non-CRUD UI — those aren't UDOs.
- The user wants to refactor or rename an existing field — use `udo migrate` after editing the UDO; don't author a new one.

## The 5 rules that override everything else

1. **Facts only, never code.** The UDO declares *what exists* (fields, types, validation, relationships). It never expresses *behavior* (method bodies, scopes, business rules, accessors). If you'd need an `if`, loop, or function call to express it in JSON, it does not belong in the UDO. Use the `validation.backend` escape hatch for declarative rules; write actual logic in the `App\Models\{Resource}.php` extension class (which the generator never overwrites).

2. **No raw human strings.** The UDO contains no English labels, help text, placeholders, or error messages. Translation keys are *auto-derived by convention* — `products.fields.title`, `products.fields.status_values.draft`, etc. Override only via `label: "translation.key.path"` when convention isn't enough.

3. **Convention over configuration.** Most fields need only `type` plus maybe one of `required` / `nullable` / `max` / `format`. Don't add `ui:` blocks unless overriding a sensible default. Don't add `views:` blocks unless customizing layout. Most resources need no `relationships` block at all.

4. **Two-file extension pattern.** The generator emits `Generated/{Resource}Base.php` (regenerated) AND `{Resource}.php` (scaffold-once, yours forever). Same for controllers. UDO changes propagate cleanly to the base; the extension is never touched. To override a relationship method or add custom logic, edit the extension class.

5. **Idempotent + safe.** Running `udo gen` twice is a no-op (scaffolds preserved, migrations not duplicated). Running `udo migrate` after a UDO edit produces an additive ALTER migration. Renames and type changes are flagged for manual review, not silently mutated.

## Two authoring formats

The examples in this skill use JSONC (`Product.udo.json`), but every UDO can
equivalently be written as a PUDO (`Product.pudo.php`) - a Laravel-style PHP class
extending `Pudo\Resource` whose `fields(Blueprint $table)` method reads like a
migration. Both formats serialize to the identical UDO v1 document, validate against
the same schema, and are accepted by every `udo` command. All five rules above apply
unchanged - a PUDO is still facts-only, never logic. See the "PUDO" section of the
udo-gen README and `examples/Article.pudo.php` for the full PHP vocabulary. When
authoring for a user, match whichever format their project already uses.

## File layout

```
<laravel-root>/
  udo/
    Product.udo.json              ← source of truth (JSONC, or Product.pudo.php)
    .snapshots/
      Product.snapshot.json       ← managed by udo-gen, do not edit
  app/
    Models/
      Generated/ProductBase.php   ← regenerated, DO NOT EDIT
      Product.php                 ← scaffold-once, your code
    Http/
      Controllers/
        Generated/ProductControllerBase.php
        ProductController.php     ← scaffold-once
      Requests/ProductRequest.php
      Resources/ProductResource.php
  database/
    migrations/2026_..._create_products_table.php
    factories/ProductFactory.php
  routes/api.php                  ← apiResource line injected
  lang/en/products.php            ← scaffold-once
  resources/js/
    udo/
      Product.ts                  ← Zod schemas + types + endpoint
      index.ts                    ← auto-aggregated manifest
    features/products/product-page.tsx  ← scaffold-once
    lib/udo-ui/resource-page.tsx        ← installed once per project
```

UDO file naming: `{PascalCaseResource}.udo.json`. PascalCase. Always `.udo.json` suffix.

## Skeleton of a UDO file

```jsonc
{
  "$schema": "../../node_modules/udo-gen/schema/udo-v1.schema.json",
  "udoVersion": 1,

  "resource": "Product",            // PascalCase, required
  "table": "products",              // optional; defaults to snake_case_plural
  "softDeletes": false,             // optional, default false
  "timestamps": true,               // optional, default true

  "controller": "auto",             // "auto" | "custom" | { mode: "auto", ...knobs }
  "transformer": "auto",            // "auto" | "custom"
  "factory": "auto",                // "auto" | false

  "fields": {
    // field declarations — one entry per column
  },

  "relationships": {
    // optional: hasMany, belongsToMany, morphMany, etc.
    // belongsTo is INFERRED from foreignId fields — don't declare here
  },

  "indexes": [
    // optional: composite indexes only
    // { "columns": ["status", "published_at"] }
  ],

  "views": {
    // optional: form/table/card layout
  }
}
```

## Field declaration — the core of the UDO

Every field has a `type` (storage primitive). Most fields have at most 3-4 properties.

### Type vocabulary (storage primitives)

```
string  text  longText  mediumText
integer  bigInteger  tinyInteger  unsignedInteger  unsignedTinyInteger
decimal  float  double
boolean
date  dateTime  timestamp  time
json
uuid
foreignId
binary
```

### Format (semantic flavor, drives UI widget + validation defaults)

`format` is optional. Use it when the field has a recognizable semantic role.

| format | Applies to | Effects |
|---|---|---|
| `email` | string | Zod `.email()`, Laravel `email` rule, email input widget |
| `url` | string | Zod `.url()`, Laravel `url`, URL input widget |
| `slug` | string | Zod regex `[a-z0-9-]+`, Laravel regex, slug input |
| `uuid` | string, uuid | Zod `.uuid()`, Laravel `uuid` |
| `ipAddress` | string | Zod `.ip()`, Laravel `ip` |
| `password` | string | Excluded from API responses, bcrypt in factory |
| `phone` | string | Phone input widget; no auto-validation |
| `currency` | decimal | Currency input, decimal-as-string in TS |
| `percent` | decimal/integer | Percent input |
| `richText` | text/longText | Rich editor widget |
| `markdown` | text/longText | Markdown editor widget |
| `color` | string | Color picker |

### Common field properties

| Property | Type | When to use |
|---|---|---|
| `type` | (required) | The storage primitive (see vocabulary above) |
| `format` | string | Semantic role; drives UI + validation defaults |
| `required` | boolean | Required on create (POST). Update (PATCH/PUT) uses `sometimes`. |
| `nullable` | boolean | Column can store NULL. Combine with `required` for "must supply but can be null". |
| `unique` | boolean | DB-level unique constraint. Auto-emits a unique index. |
| `index` | boolean | Single-column non-unique index. |
| `default` | string/number/boolean | DB-level default value. |
| `max` | number | Strings: max length. Numerics: max value. |
| `min` | number | Strings: min length. Numerics: min value. |
| `length` | number | Strings: fixed length (e.g. char(4)). |
| `precision` | number | Decimal: total digits. |
| `scale` | number | Decimal: digits after the point. |
| `values` | array | Enum allowed values (string or number). |
| `references` | string | `foreignId` only: `'table.column'` — implies `belongsTo` + `exists:` rule. |
| `onDelete` | string | `foreignId` only: `cascade` / `restrict` / `set null` / `no action`. |
| `displayField` | string | `foreignId` only: which field of the related model to show in pickers. |
| `validation` | object | Backend/frontend rule escape hatches (see below). |
| `ui` | object | Widget override + help/placeholder translation keys (see below). |
| `label` | string | Translation key override; default is `{resource_table}.fields.{field}`. |

### Validation escape hatches

Semantic facets (`required`, `max`, `format`, etc.) are *shared* between frontend and backend by default. Use `validation` ONLY when they diverge — typically when backend has DB-aware rules the browser can't run.

```jsonc
"slug": {
  "type": "string",
  "required": true,
  "max": 255,
  "format": "slug",
  "validation": {
    "backend": ["unique:products,slug"]   // DB check — backend only
  }
}

"email": {
  "type": "string",
  "format": "email",
  "validation": {
    "backend": ["unique:users,email"],
    "frontend": []
    // Frontend skips the unique check — async-verify on blur in your UI instead.
  }
}

"title": {
  "type": "string",
  "max": 255,
  "validation": {
    "skip": { "frontend": ["max"] }
    // Drop the shared max-length check on the FE (e.g. allow as-you-type beyond 255).
  }
}
```

**Use `validation.backend` for:** `unique:`, `exists:`, `required_if:`, `prohibited_unless:`, custom rule classes, any DB- or app-state-dependent rule.

**Use `validation.frontend` for:** anything you want to enforce in the browser that doesn't fit a semantic facet (rare — most cases are about *excluding* a backend rule, not adding a frontend one).

**Do NOT** add a rule to *both* sides — that's what semantic facets are for.

### UI hints (optional, per field)

```jsonc
"bio": {
  "type": "text",
  "format": "richText",
  "ui": {
    "widget": "rich-editor",         // override default widget choice (rare)
    "help": "products.fields.bio.help",
    "placeholder": "products.fields.bio.placeholder"
  }
}
```

All ui values that are strings are *translation keys*, never raw text. Most fields don't need a `ui` block at all — widget defaults are inferred from `type` + `format`.

## Relationships block

Only declare relationships that *can't* be inferred from a `foreignId` field. `belongsTo` is implied automatically; don't repeat it.

```jsonc
"relationships": {
  "tags": {
    "type": "belongsToMany",
    "model": "Tag",
    "pivot": "product_tag"
  },
  "reviews": {
    "type": "hasMany",
    "model": "Review",
    "foreignKey": "product_id"        // optional, defaults to Laravel convention
  },
  "comments": {
    "type": "morphMany",
    "model": "Comment",
    "morphName": "commentable"
  },
  "image": {
    "type": "hasOne",
    "model": "Image"
  }
}
```

**Supported relationship types**: `hasOne`, `hasMany`, `belongsToMany`, `morphTo`, `morphMany`.

**Out of v1**: `hasOneThrough`, `hasManyThrough`, `morphedByMany`. For these, write the method by hand in the model extension class — generator will leave it alone.

**Customizing a relationship's method body** (eager loads, ordering, custom keys): override in `App\Models\{Resource}.php`:

```php
class Product extends ProductBase {
    public function tags() {
        return $this->belongsToMany(Tag::class)->orderBy('name');
    }
}
```

The base class's method is replaced at runtime via PHP method override. Clean and idiomatic.

## Controller knobs

```jsonc
// Default: stock RESTful CRUD with all defaults
"controller": "auto"

// Skip controller generation entirely — you write it by hand
"controller": "custom"

// Auto with knobs
"controller": {
  "mode": "auto",
  "eagerLoad": ["category", "tags"],     // ->with([...]) on index() and show()
  "defaultSort": "-created_at",           // - prefix = desc; auto applied to index()
  "pageSize": 50                          // paginate(N)
}
```

Setting `controller: "custom"` opts out of:
- Controller base + extension generation
- Route injection into `routes/api.php`

You'll need to write the controller and add routes manually. Use this for resources that aren't really CRUD (auth flows, webhooks, async-only operations).

## Views block (optional)

Only declare `views` when overriding the default "show all fields, declared order" behavior.

```jsonc
"views": {
  "form": {
    "fields": ["title", "slug", "category_id", "price", "status"],
    "layout": "two-column"
  },
  "table": {
    "columns": [
      { "field": "title", "sortable": true },
      "category.name",                          // dotted path = relation
      { "field": "price", "align": "right" },
      { "field": "status", "badge": true }
    ],
    "search": ["title", "slug"],
    "defaultSort": "-created_at",
    "pageSize": 25
  },
  "card": {
    "title": "title",
    "subtitle": "category.name",
    "body": ["price", "status"]
  }
}
```

## Composite indexes

```jsonc
"indexes": [
  { "columns": ["status", "published_at"] },
  { "columns": ["customer_id", "created_at"], "unique": true }
]
```

For single-column indexes, use field-level `index: true` (non-unique) or `unique: true` (unique) — don't put single-column indexes in the `indexes` block.

## Authoring checklist (decision rules for an agent)

1. **Field name conventions**
   - Use `snake_case` for column names (`stock_count`, `published_at`, `customer_id`).
   - Foreign keys end in `_id` (`category_id`, `user_id`). The relationship is inferred.
   - Booleans typically prefixed `is_` or `has_` (`is_active`, `has_avatar`).
   - Timestamps end in `_at` (`expires_at`, `verified_at`, `published_at`).

2. **Choose the right type**
   - Short text (<=255 chars): `string`
   - Long text (paragraphs, body): `text`
   - Money: `decimal` with `format: "currency"`, `precision: 8-10`, `scale: 2`
   - Boolean flags: `boolean`
   - Dates (just the day): `date`
   - Date + time: `dateTime` (use `timestamp` for things like `expires_at`, `verified_at`)
   - Integer counts: `integer` or `unsignedInteger`
   - Foreign keys: `foreignId` with `references: "table.column"`
   - Free-form structured data: `json`

3. **Required vs nullable matrix**
   - `required: true` only → must supply on create, can't be null
   - `nullable: true` only → can be null AND can be omitted on create (treated as nullable with default null)
   - Both → must supply on create but can be null (rare)
   - Neither → can be omitted on create (treated as optional, may have a default)

4. **Pick a format when one applies** — drives the right widget and validation default. Don't force a format if none fits.

5. **Add `validation.backend` for DB-aware rules** like `unique:` or `exists:`. These can't run in the browser.

6. **Skip `views` block** unless the user explicitly wants to customize layout. Default "all fields in order" is fine for 80% of cases.

7. **Skip `ui` blocks** unless overriding a widget or pointing at non-default translation keys.

8. **Declare relationships block** only for `hasMany`/`belongsToMany`/`morphMany`/`morphTo`/`hasOne`. `belongsTo` is implied by `foreignId`.

9. **Use `controller: "custom"`** for non-CRUD resources (auth tokens, webhook receivers, log records). Use the knobs object for CRUD with minor tweaks.

10. **Always check**: does the user's request fit a CRUD shape? If not (custom flow, multi-step wizard, dashboard, chart), the UDO is the wrong tool — write code instead.

## Anti-patterns to refuse

- **Raw English strings in the UDO.** No `label: "Title"`, no `help: "Enter the product title"`. Translation keys only.
- **Logic in JSON.** No conditional defaults like `"default": "if (status==='draft') ..."`. Use `validation.backend` or write code in the extension class.
- **Re-declaring `belongsTo`** in the relationships block when a `foreignId` field already implies it. Pick one.
- **Sprawling `ui` blocks** on every field. Defaults are deliberate; trust them.
- **Adding both `validation.backend` AND `validation.frontend`** with the same rule when a semantic facet covers it. Use the facet.
- **Putting business rules in the UDO.** "Discount can't exceed retail" is logic — it goes in the model or a custom rule class referenced via `validation.backend`.
- **Generating a UDO for something non-CRUD.** Dashboards, charts, multi-step flows, auth pages — write code, not a UDO.

## Worked example 1 — simple resource

```jsonc
{
  "$schema": "../../node_modules/udo-gen/schema/udo-v1.schema.json",
  "udoVersion": 1,
  "resource": "Tag",
  "fields": {
    "name": { "type": "string", "required": true, "max": 50, "unique": true },
    "slug": { "type": "string", "required": true, "max": 60, "format": "slug" }
  }
}
```

Generates: model base + extension, migration, FormRequest, transformer, factory, controller base + extension, TS module with Zod, route entry, lang starter, scaffold page. ~7 lines of UDO → 13 artifacts.

## Worked example 2 — moderately complex

```jsonc
{
  "$schema": "../../node_modules/udo-gen/schema/udo-v1.schema.json",
  "udoVersion": 1,
  "resource": "Product",
  "softDeletes": true,
  "controller": {
    "mode": "auto",
    "eagerLoad": ["category"],
    "defaultSort": "-created_at",
    "pageSize": 50
  },
  "fields": {
    "title":  { "type": "string", "required": true, "max": 255 },
    "slug":   {
      "type": "string", "required": true, "max": 255, "format": "slug",
      "validation": { "backend": ["unique:products,slug"] }
    },
    "description": { "type": "text", "format": "richText", "nullable": true },
    "price":  { "type": "decimal", "format": "currency", "required": true, "precision": 10, "scale": 2, "min": 0 },
    "status": {
      "type": "string", "required": true,
      "values": ["draft", "published", "archived"],
      "default": "draft"
    },
    "category_id": {
      "type": "foreignId", "required": true,
      "references": "categories.id", "onDelete": "cascade", "displayField": "name"
    },
    "stock_count":  { "type": "unsignedInteger", "default": 0 },
    "published_at": { "type": "dateTime", "nullable": true, "index": true }
  },
  "relationships": {
    "tags":    { "type": "belongsToMany", "model": "Tag", "pivot": "product_tag" },
    "reviews": { "type": "hasMany", "model": "Review" }
  },
  "indexes": [
    { "columns": ["status", "published_at"] }
  ]
}
```

Exercises every major feature: soft deletes, controller knobs, format (slug/currency/richText), `validation.backend` for unique, enum + default, foreign key with constraint + cascade + displayField, declared relationships (hasMany, belongsToMany with pivot), composite index, index on single column via field-level flag.

## When the UDO doesn't fit

Recognize when something is genuinely not a UDO problem:

| User asks for | Right answer |
|---|---|
| "Custom endpoint for X" | Hand-write controller method, add route by hand. Don't UDO this. |
| "Dashboard showing Y across resources" | Hand-write React page. Use UDOs underneath for data, not for the page. |
| "Multi-step wizard form" | Hand-write the wizard. UDO drives the underlying resource, wizard is custom UX. |
| "Webhook receiver" | Hand-write the receiver controller. `controller: "custom"` if there's a record stored, otherwise no UDO at all. |
| "Auth flow / login / 2FA" | Hand-write entirely. UDOs are for CRUD data, not flows. |
| "Computed field on existing model" | Write an accessor in the `App\Models\{Resource}.php` extension class. Don't add to UDO. |
| "New scope on existing model" | Write the scope in the extension class. Don't UDO this. |

## What gets generated (so you know what NOT to write by hand after)

When you author a valid UDO and the user runs `udo gen <path>`, these are produced. *Never write any of these by hand once a UDO exists* — they're regenerated:

- `app/Models/Generated/{Resource}Base.php`
- `app/Http/Controllers/Generated/{Resource}ControllerBase.php`
- `app/Http/Requests/{Resource}Request.php`
- `app/Http/Resources/{Resource}Resource.php` (unless `transformer: "custom"`)
- `database/factories/{Resource}Factory.php` (unless `factory: false`)
- `resources/js/udo/{Resource}.ts` (Zod schemas + Shape/Create/Update types + endpoint + queryKey)
- `resources/js/udo/index.ts` (manifest)
- `routes/api.php` (apiResource line injected, unless `controller: "custom"`)

These are scaffold-once — created on first gen, NEVER overwritten. Edit them freely:

- `app/Models/{Resource}.php` (add scopes, accessors, mutators, relationship overrides)
- `app/Http/Controllers/{Resource}Controller.php` (add custom endpoints, override CRUD methods)
- `lang/en/{table}.php` (translations)
- `resources/js/features/{plural-kebab}/{kebab}-page.tsx` (customize the UI)
- `resources/js/lib/udo-ui/resource-page.tsx` (one-time install; replace with your own design)

## After authoring a UDO

Tell the user to run:

```bash
udo gen udo/{Resource}.udo.json
php artisan migrate
```

If the UDO is being edited (not authored fresh), and the user wants to evolve the schema:

```bash
udo migrate udo/{Resource}.udo.json   # emits additive ALTER migration
php artisan migrate
```

Type/constraint changes are flagged for manual review with `// TODO` comments in the ALTER migration. Field renames are out of scope — drop the old, add the new, and migrate the data via a data migration written by hand.
