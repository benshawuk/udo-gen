import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { UdoDocument } from '../types.js';
import { renderModelBase } from './model-base.js';
import { renderModelExtension } from './model-extension.js';
import { renderMigration } from './migration.js';
import { renderFormRequest } from './form-request.js';
import { renderTransformer } from './resource-transformer.js';
import { renderFactory } from './factory.js';
import { renderControllerBase, renderControllerExtension } from './controller-base.js';
import { renderTsModule } from './ts-module.js';
import { renderAutoformGenerated, renderAutoformConfig } from './autoform.js';
import { injectRoutes, loadRoutesFile } from './routes.js';
import { renderLangStarter } from './lang-starter.js';
import { buildManifest } from './manifest.js';
import {
  renderScaffoldPage,
  renderResourcePageRuntime,
  scaffoldPagePath,
} from './react-scaffold.js';
import { writeSnapshot } from './snapshot.js';
import { defaultTable } from '../utils/naming.js';

export type WriteMode = 'regenerate' | 'scaffold-once' | 'create-once-by-pattern';

/**
 * Frontend target adapter. The backend artifacts are identical across targets;
 * only the React-side output differs.
 *  - 'react'    (default): Zod TS module + a ResourcePage scaffold (udo-gen's own runtime).
 *  - 'autoform': Zod TS module + autoform `generated.ts` (regen) + `autoform-config.ts` (scaffold-once).
 */
export type FrontendTarget = 'react' | 'autoform';
export type ActionKind =
  | 'WRITE'
  | 'SKIP-EXISTS'
  | 'SKIP-OPTED-OUT'
  | 'SKIP-MIGRATION-PRESENT'
  | 'PATCH'
  | 'SKIP-PATCH-PRESENT';

export interface PlannedAction {
  artifact: string;
  kind: ActionKind;
  path: string;
  contents?: string;
  reason?: string;
}

export interface GenOptions {
  /** Laravel project root. Defaults to process.cwd(). */
  out: string;
  /** When true, overwrite scaffold-once files. */
  force?: boolean;
  /** When true, do not write — just return the plan. */
  dryRun?: boolean;
  /** Used to make migration filenames deterministic in tests. */
  now?: () => Date;
  /** Frontend target adapter. Defaults to 'react'. */
  target?: FrontendTarget;
  /**
   * Root dir (relative to the project root) where frontend files are written.
   * Defaults to 'resources/js'. Set this to match your stack's layout, e.g.
   * 'frontend' or 'src'.
   */
  frontendRoot?: string;
}

function migrationTimestamp(now: Date): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}_${mm}_${dd}_${hh}${mi}${ss}`;
}

function existingMigrationForTable(migrationsDir: string, table: string): string | null {
  if (!existsSync(migrationsDir)) return null;
  const suffix = `_create_${table}_table.php`;
  const match = readdirSync(migrationsDir).find((f) => f.endsWith(suffix));
  return match ? join(migrationsDir, match) : null;
}

function writeIfNeeded(path: string, contents: string, dryRun: boolean) {
  if (dryRun) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
}

export async function planAndGenerate(
  doc: UdoDocument,
  options: GenOptions,
): Promise<PlannedAction[]> {
  const root = resolve(options.out);
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;
  const now = (options.now ?? (() => new Date()))();
  const plan: PlannedAction[] = [];

  const resource = doc.resource;
  const table = doc.table ?? defaultTable(resource);

  const controllerSetting = doc.controller ?? 'auto';
  const transformerSetting = doc.transformer ?? 'auto';
  const factorySetting = doc.factory ?? 'auto';

  // --- Model base (always regenerated) ---
  await emitRegen(
    plan,
    'model-base',
    join(root, 'app/Models/Generated', `${resource}Base.php`),
    await renderModelBase(doc),
    dryRun,
  );

  // --- Model extension (scaffold-once) ---
  await emitScaffold(
    plan,
    'model-extension',
    join(root, 'app/Models', `${resource}.php`),
    await renderModelExtension(doc),
    force,
    dryRun,
  );

  // --- Migration (only if none exists for this table) ---
  {
    const migrationsDir = join(root, 'database/migrations');
    const existing = existingMigrationForTable(migrationsDir, table);
    if (existing) {
      plan.push({
        artifact: 'migration',
        kind: 'SKIP-MIGRATION-PRESENT',
        path: existing,
        reason: 'Existing create migration found; use `udo migrate` for changes.',
      });
    } else {
      const filename = `${migrationTimestamp(now)}_create_${table}_table.php`;
      const path = join(migrationsDir, filename);
      const contents = await renderMigration(doc);
      writeIfNeeded(path, contents, dryRun);
      plan.push({ artifact: 'migration', kind: 'WRITE', path, contents });

      // Snapshot the UDO so future `udo migrate` calls can diff against it.
      if (!dryRun) {
        const snapPath = writeSnapshot(root, doc);
        plan.push({ artifact: 'snapshot', kind: 'WRITE', path: snapPath });
      }
    }
  }

  // --- Form Request (always regenerated) ---
  await emitRegen(
    plan,
    'form-request',
    join(root, 'app/Http/Requests', `${resource}Request.php`),
    await renderFormRequest(doc),
    dryRun,
  );

  // --- Resource transformer ---
  if (transformerSetting === 'custom') {
    plan.push({
      artifact: 'transformer',
      kind: 'SKIP-OPTED-OUT',
      path: join(root, 'app/Http/Resources', `${resource}Resource.php`),
      reason: 'transformer: "custom" in UDO',
    });
  } else {
    await emitRegen(
      plan,
      'transformer',
      join(root, 'app/Http/Resources', `${resource}Resource.php`),
      await renderTransformer(doc),
      dryRun,
    );
  }

  // --- Factory ---
  if (factorySetting === false) {
    plan.push({
      artifact: 'factory',
      kind: 'SKIP-OPTED-OUT',
      path: join(root, 'database/factories', `${resource}Factory.php`),
      reason: 'factory: false in UDO',
    });
  } else {
    await emitRegen(
      plan,
      'factory',
      join(root, 'database/factories', `${resource}Factory.php`),
      await renderFactory(doc),
      dryRun,
    );
  }

  // --- Controller base + extension ---
  if (controllerSetting === 'custom') {
    plan.push({
      artifact: 'controller-base',
      kind: 'SKIP-OPTED-OUT',
      path: join(root, 'app/Http/Controllers/Generated', `${resource}ControllerBase.php`),
      reason: 'controller: "custom" in UDO',
    });
    plan.push({
      artifact: 'controller-extension',
      kind: 'SKIP-OPTED-OUT',
      path: join(root, 'app/Http/Controllers', `${resource}Controller.php`),
      reason: 'controller: "custom" in UDO',
    });
  } else {
    await emitRegen(
      plan,
      'controller-base',
      join(root, 'app/Http/Controllers/Generated', `${resource}ControllerBase.php`),
      await renderControllerBase(doc),
      dryRun,
    );
    await emitScaffold(
      plan,
      'controller-extension',
      join(root, 'app/Http/Controllers', `${resource}Controller.php`),
      await renderControllerExtension(doc),
      force,
      dryRun,
    );
  }

  // --- Lang starter (scaffold-once per locale) ---
  {
    const table = doc.table ?? defaultTable(resource);
    await emitScaffold(
      plan,
      'lang-starter',
      join(root, 'lang/en', `${table}.php`),
      await renderLangStarter(doc),
      force,
      dryRun,
    );
  }

  const target: FrontendTarget = options.target ?? 'react';
  const frontendRoot = options.frontendRoot ?? 'resources/js';

  // --- TS UDO module (always regenerated; shared by both frontend targets) ---
  await emitRegen(
    plan,
    'ts-module',
    join(root, frontendRoot, 'udo', `${resource}.ts`),
    await renderTsModule(doc),
    dryRun,
  );

  if (target === 'react') {
    // --- React page scaffold (per-resource, scaffold-once) ---
    {
      const { featureDir, filename } = scaffoldPagePath(doc);
      await emitScaffold(
        plan,
        'react-page',
        join(root, frontendRoot, 'features', featureDir, filename),
        await renderScaffoldPage(doc),
        force,
        dryRun,
      );
    }

    // --- ResourcePage runtime helper (one-time install per project) ---
    {
      const runtimePath = join(root, frontendRoot, 'lib/udo-ui/resource-page.tsx');
      await emitScaffold(
        plan,
        'resource-page-runtime',
        runtimePath,
        await renderResourcePageRuntime(),
        force,
        dryRun,
      );
    }
  } else if (target === 'autoform') {
    // --- autoform target: validation (regen) + feature config (scaffold-once) ---
    const { featureDir } = scaffoldPagePath(doc);
    const validationDir = join(root, frontendRoot, 'features', featureDir, 'validation');

    await emitRegen(
      plan,
      'autoform-generated',
      join(validationDir, 'generated.ts'),
      renderAutoformGenerated(doc),
      dryRun,
    );

    await emitScaffold(
      plan,
      'autoform-config',
      join(validationDir, 'autoform-config.ts'),
      renderAutoformConfig(doc),
      force,
      dryRun,
    );
  }

  // --- Multi-resource manifest (regenerated from the output dir contents) ---
  {
    const udoDir = join(root, frontendRoot, 'udo');
    const manifestPath = join(udoDir, 'index.ts');
    const contents = buildManifest(udoDir);
    writeIfNeeded(manifestPath, contents, dryRun);
    plan.push({ artifact: 'manifest', kind: 'WRITE', path: manifestPath, contents });
  }

  // --- Routes injection (idempotent, opt-out aware) ---
  {
    const routesPath = join(root, 'routes/api.php');
    const existing = loadRoutesFile(routesPath);
    const result = injectRoutes(existing, doc);
    if (result.changed) {
      writeIfNeeded(routesPath, result.contents, dryRun);
      plan.push({ artifact: 'routes', kind: 'PATCH', path: routesPath, contents: result.contents });
    } else {
      plan.push({
        artifact: 'routes',
        kind: 'SKIP-PATCH-PRESENT',
        path: routesPath,
        reason: result.reason,
      });
    }
  }

  return plan;
}

async function emitRegen(
  plan: PlannedAction[],
  artifact: string,
  path: string,
  contents: string,
  dryRun: boolean,
) {
  writeIfNeeded(path, contents, dryRun);
  plan.push({ artifact, kind: 'WRITE', path, contents });
}

async function emitScaffold(
  plan: PlannedAction[],
  artifact: string,
  path: string,
  contents: string,
  force: boolean,
  dryRun: boolean,
) {
  if (existsSync(path) && !force) {
    plan.push({
      artifact,
      kind: 'SKIP-EXISTS',
      path,
      reason: 'Scaffold-once file already exists. Pass --force to overwrite.',
    });
    return;
  }
  writeIfNeeded(path, contents, dryRun);
  plan.push({ artifact, kind: 'WRITE', path, contents });
}
