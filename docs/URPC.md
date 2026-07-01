# URPC — UDO RPC

**Status:** v0 (proposal + first implementation). Emitted by the `--target autoform` and `react` frontend adapters as an additive, opt-in layer.

## Problem

Today a UDO generates a typed TS module (`udo/<Resource>.ts`) with `endpoint`,
`queryKey`, Zod `createSchema`/`updateSchema`, and `Shape`/`Create`/`Update`
types. But the app still calls the API by hand:

```ts
import { api } from '@/lib/axios-config';
import { endpoint, type Shape } from '@/udo/Promotion';
const rows = (await api.get(endpoint)).data.data as Shape[];
```

Every call site re-derives the URL, the HTTP verb, the response-envelope
unwrap, and the input validation. That is exactly the boilerplate UDO exists to
delete.

## Idea

**URPC = "UDO RPC": one typed client function per CRUD operation, generated from
the UDO, so the API is called like local functions.**

```ts
import { urpc } from '@/udo/urpc';

const rows   = await urpc.promotion.list();          // Promise<Promotion.Shape[]>
const one    = await urpc.promotion.get(id);         // Promise<Promotion.Shape>
const made   = await urpc.promotion.create(input);   // input: Promotion.Create  (Zod-validated)
const edited = await urpc.promotion.update(id, patch);
await urpc.promotion.remove(id);
```

Fully typed from the UDO, runtime-validated by the UDO's Zod schemas, with the
transport + response-envelope handled in exactly one place.

## Shape of the generated code

Two generated artifacts + one project-owned runtime:

1. **`lib/urpc/client.ts` — runtime (scaffold-once, project owns it).**
   A transport-agnostic `defineResource<Shape, Create, Update>(config)` factory
   and a `configureUrpc(transport)` hook. Ships a `fetch` default; the app wires
   it to its real HTTP client (axios) + response envelope **once**. Generated
   `.urpc.ts` files never import the app's axios directly — they only import this
   runtime, keeping them portable ("generate, then own").

2. **`udo/<Resource>.urpc.ts` — per resource (regenerated).**
   ```ts
   import { defineResource } from '@/lib/urpc/client';
   import { endpoint, queryKey, createSchema, updateSchema,
            type Shape, type Create, type Update } from './Promotion';
   export const promotion = defineResource<Shape, Create, Update>({
     endpoint, queryKey, createSchema, updateSchema,
   });
   ```

3. **`udo/urpc.ts` — manifest (regenerated).**
   Re-exports each resource client and assembles the single `urpc` object, the
   sibling of the existing `udo/index.ts` type manifest.

### Contract

`defineResource` returns `{ endpoint, queryKey, list, get, create, update, remove }`:

| method | verb + path                 | input                    | returns        |
|--------|-----------------------------|--------------------------|----------------|
| list   | GET `endpoint`              | `params?`                | `Shape[]`      |
| get    | GET `endpoint/:id`          | `id`                     | `Shape`        |
| create | POST `endpoint`             | `Create` (Zod-parsed)    | `Shape`        |
| update | PATCH `endpoint/:id`        | `id`, `Update` (parsed)  | `Shape`        |
| remove | DELETE `endpoint/:id`       | `id`                     | `void`         |

`create`/`update` run `createSchema.parse` / `updateSchema.parse` before send
(fail fast on bad input). The **transport** owns auth, CSRF, and the Laravel
`{ data: ... }` envelope unwrap — so the generated files stay framework-neutral.
`queryKey` is re-exported so URPC drops straight into TanStack Query.

## Why a runtime instead of inlining axios

- Generated files stay portable across apps/adapters (no hard dependency on one
  HTTP client or one response shape).
- The envelope/auth/error policy lives in one editable place, not fanned out
  across N generated files.
- Matches the existing `--target react` pattern, which already installs a
  scaffold-once `lib/udo-ui/resource-page.tsx` runtime.

## Non-goals (v0)

- Pagination envelope typing (`list` returns `Shape[]`; `meta` is transport's
  concern for now).
- Nested/relation includes, batch ops, optimistic cache writes.
- Auto-generated TanStack Query hooks (`useList`/`useCreate`) — a natural v1 on
  top of `queryKey` + these functions.

## Relationship to the UDO gap-bridging work

URPC only reads the TS module's existing exports, so it is unaffected by the
schema-gap work. Those gaps (tracked separately) — `hidden`, `appends`/computed
accessors, `hashed`/`encrypted` casts, `$with` eager-load, non-FK `hasMany`,
scope bodies — are what let real app models (User, Business, Professional,
Appointment, Invoice, Subscription) be authored as UDOs at all. Simple resources
(Amenity, Review, Service, PaymentMethod, VerificationCode, …) already fit and
are the first ones to author + wire through URPC.
