import { describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseUdoFile } from '../src/parse.js';
import { planAndGenerate } from '../src/generate/index.js';

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'udo-integ-'));
}

const examplesDir = join(import.meta.dirname, '..', 'examples');

describe('integration: planAndGenerate', () => {
  it('generates 13+ artifacts for the Product example', async () => {
    const parsed = parseUdoFile(join(examplesDir, 'Product.udo.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const out = tmpRoot();
    const plan = await planAndGenerate(parsed.document, { out, now: () => new Date('2026-01-01T12:00:00Z') });

    const wrote = plan.filter((p) => p.kind === 'WRITE' || p.kind === 'PATCH');
    expect(wrote.length).toBeGreaterThanOrEqual(13);

    // Spot check key files exist on disk
    expect(existsSync(join(out, 'app/Models/Generated/ProductBase.php'))).toBe(true);
    expect(existsSync(join(out, 'app/Models/Product.php'))).toBe(true);
    expect(existsSync(join(out, 'app/Http/Requests/ProductRequest.php'))).toBe(true);
    expect(existsSync(join(out, 'app/Http/Resources/ProductResource.php'))).toBe(true);
    expect(existsSync(join(out, 'database/factories/ProductFactory.php'))).toBe(true);
    expect(existsSync(join(out, 'app/Http/Controllers/Generated/ProductControllerBase.php'))).toBe(true);
    expect(existsSync(join(out, 'app/Http/Controllers/ProductController.php'))).toBe(true);
    expect(existsSync(join(out, 'resources/js/udo/Product.ts'))).toBe(true);
    expect(existsSync(join(out, 'resources/js/udo/index.ts'))).toBe(true);
    expect(existsSync(join(out, 'resources/js/lib/udo-ui/resource-page.tsx'))).toBe(true);
    expect(existsSync(join(out, 'resources/js/features/products/product-page.tsx'))).toBe(true);
    expect(existsSync(join(out, 'lang/en/products.php'))).toBe(true);
    expect(existsSync(join(out, 'routes/api.php'))).toBe(true);
    expect(existsSync(join(out, 'udo/.snapshots/Product.snapshot.json'))).toBe(true);
  });

  it('honours custom controller/transformer opt-outs on VerificationCode', async () => {
    const parsed = parseUdoFile(join(examplesDir, 'VerificationCode.udo.json'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const out = tmpRoot();
    const plan = await planAndGenerate(parsed.document, { out, now: () => new Date('2026-01-01T12:00:00Z') });

    const skips = plan.filter((p) => p.kind === 'SKIP-OPTED-OUT').map((p) => p.artifact);
    expect(skips).toContain('controller-base');
    expect(skips).toContain('controller-extension');
    expect(skips).toContain('transformer');
  });

  it('is idempotent — second run preserves scaffolds and skips migration', async () => {
    const parsed = parseUdoFile(join(examplesDir, 'Product.udo.json'));
    if (!parsed.ok) return;

    const out = tmpRoot();
    await planAndGenerate(parsed.document, { out, now: () => new Date('2026-01-01T12:00:00Z') });

    // Mutate the scaffold to prove it survives.
    const userOwned = join(out, 'app/Models/Product.php');
    const marker = '/* user-edit marker */';
    const originalScaffold = readFileSync(userOwned, 'utf8');
    require('node:fs').writeFileSync(userOwned, originalScaffold + '\n' + marker, 'utf8');

    const plan2 = await planAndGenerate(parsed.document, {
      out,
      now: () => new Date('2026-02-01T12:00:00Z'),
    });

    const scaffoldAction = plan2.find((p) => p.artifact === 'model-extension');
    expect(scaffoldAction?.kind).toBe('SKIP-EXISTS');

    const migrationAction = plan2.find((p) => p.artifact === 'migration');
    expect(migrationAction?.kind).toBe('SKIP-MIGRATION-PRESENT');

    // User marker should still be in the file.
    expect(readFileSync(userOwned, 'utf8')).toContain(marker);
  });

  it('dry-run does not write any files', async () => {
    const parsed = parseUdoFile(join(examplesDir, 'Product.udo.json'));
    if (!parsed.ok) return;

    const out = tmpRoot();
    await planAndGenerate(parsed.document, { out, dryRun: true, now: () => new Date('2026-01-01T12:00:00Z') });

    expect(existsSync(join(out, 'app/Models/Product.php'))).toBe(false);
    expect(existsSync(join(out, 'database/migrations'))).toBe(false);
  });

  it('target=autoform emits validation files and no react-page/runtime', async () => {
    const parsed = parseUdoFile(join(examplesDir, 'Product.udo.json'));
    if (!parsed.ok) return;

    const out = tmpRoot();
    await planAndGenerate(parsed.document, {
      out,
      target: 'autoform',
      now: () => new Date('2026-01-01T12:00:00Z'),
    });

    // autoform validation files written
    expect(existsSync(join(out, 'resources/js/features/products/validation/generated.ts'))).toBe(true);
    expect(existsSync(join(out, 'resources/js/features/products/validation/autoform-config.ts'))).toBe(true);
    // react-target frontend files NOT written
    expect(existsSync(join(out, 'resources/js/features/products/product-page.tsx'))).toBe(false);
    expect(existsSync(join(out, 'resources/js/lib/udo-ui/resource-page.tsx'))).toBe(false);
    // backend artifacts still present (shared across targets)
    expect(existsSync(join(out, 'app/Models/Product.php'))).toBe(true);
  });

  it('frontendRoot relocates all frontend files (and leaves backend untouched)', async () => {
    const parsed = parseUdoFile(join(examplesDir, 'Product.udo.json'));
    if (!parsed.ok) return;

    const out = tmpRoot();
    await planAndGenerate(parsed.document, {
      out,
      target: 'autoform',
      frontendRoot: 'frontend',
      now: () => new Date('2026-01-01T12:00:00Z'),
    });

    expect(existsSync(join(out, 'frontend/udo/Product.ts'))).toBe(true);
    expect(existsSync(join(out, 'frontend/features/products/validation/autoform-config.ts'))).toBe(true);
    // nothing written under the default resources/js root
    expect(existsSync(join(out, 'resources/js'))).toBe(false);
    // backend path unaffected by frontendRoot
    expect(existsSync(join(out, 'app/Models/Product.php'))).toBe(true);
  });
});
