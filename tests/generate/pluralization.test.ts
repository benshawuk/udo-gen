import { describe, expect, it } from 'vitest';
import { renderMigration } from '../../src/generate/migration.js';
import { renderTsModule } from '../../src/generate/ts-module.js';
import { injectRoutes } from '../../src/generate/routes.js';
import type { UdoDocument } from '../../src/types.js';

/**
 * Regression suite for the pluralization bug. The naive "+s" pluralizer
 * produced "categorys" / "companys" etc. Worse, the logic was duplicated across
 * several generators, so artifacts disagreed (migration filename said
 * "categories" while the route said "categorys"). These tests pin the plural
 * form across EVERY artifact that embeds it, so the artifacts can never drift
 * apart again.
 */

function doc(resource: string, table?: string): UdoDocument {
  return {
    udoVersion: 1,
    resource,
    ...(table ? { table } : {}),
    fields: { name: { type: 'string', required: true } },
  };
}

const EMPTY_ROUTES = `<?php

use Illuminate\\Support\\Facades\\Route;
`;

async function artifactsFor(resource: string, table?: string) {
  const d = doc(resource, table);
  const migration = await renderMigration(d);
  const tsModule = await renderTsModule(d);
  const routes = injectRoutes(EMPTY_ROUTES, d);
  return { migration, tsModule, routes: routes.contents };
}

describe('pluralization is consistent across all artifacts', () => {
  // [resource, expectedTable, expectedRoutePath]
  const cases: [string, string, string][] = [
    ['Category', 'categories', 'categories'],
    ['Company', 'companies', 'companies'],
    ['Person', 'people', 'people'],
    ['Product', 'products', 'products'],
    ['VerificationCode', 'verification_codes', 'verification-codes'],
    ['BlogCategory', 'blog_categories', 'blog-categories'],
  ];

  for (const [resource, table, routePath] of cases) {
    it(`${resource} -> migration table '${table}'`, async () => {
      const { migration } = await artifactsFor(resource);
      expect(migration).toContain(`Schema::create('${table}'`);
    });

    it(`${resource} -> route path '${routePath}'`, async () => {
      const { routes } = await artifactsFor(resource);
      expect(routes).toContain(`Route::apiResource('${routePath}', ${resource}Controller::class);`);
    });

    it(`${resource} -> TS endpoint '/api/${routePath}' and queryKey '${routePath}'`, async () => {
      const { tsModule } = await artifactsFor(resource);
      expect(tsModule).toContain(`export const endpoint = '/api/${routePath}' as const;`);
      expect(tsModule).toContain(`export const queryKey = ['${routePath}'] as const;`);
    });
  }

  it('never emits the naive "categorys" plural in any artifact', async () => {
    const { migration, tsModule, routes } = await artifactsFor('Category');
    for (const out of [migration, tsModule, routes]) {
      expect(out).not.toMatch(/categorys/);
    }
  });

  it('migration, route, and TS endpoint all agree for an irregular plural', async () => {
    const { migration, tsModule, routes } = await artifactsFor('Company');
    expect(migration).toContain("Schema::create('companies'");
    expect(routes).toContain("Route::apiResource('companies'");
    expect(tsModule).toContain("'/api/companies'");
  });

  it('explicit table override wins everywhere (and is not re-pluralized)', async () => {
    const { migration, tsModule, routes } = await artifactsFor('Category', 'cat_taxonomy');
    expect(migration).toContain("Schema::create('cat_taxonomy'");
    expect(routes).toContain("Route::apiResource('cat-taxonomy', CategoryController::class);");
    expect(tsModule).toContain("'/api/cat-taxonomy'");
    expect(tsModule).toContain("queryKey = ['cat-taxonomy']");
  });
});
