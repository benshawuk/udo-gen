#!/usr/bin/env node
import { Command } from 'commander';
import kleur from 'kleur';
import { parseUdoFile } from './parse.js';
import { defaultTable } from './utils/naming.js';
import { renderModelBase } from './generate/model-base.js';
import { renderModelExtension } from './generate/model-extension.js';
import { renderMigration } from './generate/migration.js';
import { renderFormRequest } from './generate/form-request.js';
import { renderTsModule } from './generate/ts-module.js';
import { renderAutoformGenerated, renderAutoformConfig, renderAutoformForm } from './generate/autoform.js';
import { renderTransformer } from './generate/resource-transformer.js';
import { renderFactory } from './generate/factory.js';
import {
  renderControllerBase,
  renderControllerExtension,
} from './generate/controller-base.js';
import { planAndGenerate, type PlannedAction, type FrontendTarget } from './generate/index.js';
import { diffUdo, renderAlterMigration } from './generate/migration-alter.js';
import { readSnapshot, writeSnapshot } from './generate/snapshot.js';
import { relative, join, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const program = new Command();

program
  .name('udo')
  .description('Schema-first code generator for Laravel + React from a Unified Data Object.')
  .version('0.0.1');

program
  .command('validate <path>')
  .description('Parse a UDO file (.udo.json JSONC or .pudo.php PHP class) and validate against the v1 schema.')
  .action((path: string) => {
    const result = parseUdoFile(path);

    if (result.ok) {
      console.log(
        `${kleur.green('✓')} ${kleur.bold(result.document.resource)} — valid (${result.filePath})`,
      );
      const fieldCount = Object.keys(result.document.fields).length;
      const relCount = Object.keys(result.document.relationships ?? {}).length;
      console.log(`  ${kleur.dim(`${fieldCount} field(s), ${relCount} relationship(s)`)}`);
      process.exit(0);
    }

    console.error(
      `${kleur.red('✗')} ${kleur.bold('Invalid UDO')} (${kleur.dim(result.stage)}): ${result.filePath}`,
    );
    for (const err of result.errors) {
      console.error(`  ${kleur.red('•')} ${err}`);
    }
    process.exit(1);
  });

program
  .command('gen-preview <path>')
  .description('Render one artifact to stdout for a validated UDO. Proves the template path end-to-end.')
  .option('-a, --artifact <name>', 'Artifact to render', 'model-base')
  .action(async (path: string, options: { artifact: string }) => {
    const result = parseUdoFile(path);
    if (!result.ok) {
      console.error(`${kleur.red('✗')} UDO is invalid; fix errors before previewing.`);
      for (const err of result.errors) console.error(`  ${kleur.red('•')} ${err}`);
      process.exit(1);
    }

    switch (options.artifact) {
      case 'model-base': {
        const output = await renderModelBase(result.document);
        process.stdout.write(output);
        break;
      }
      case 'model-extension': {
        const output = await renderModelExtension(result.document);
        process.stdout.write(output);
        break;
      }
      case 'migration': {
        const output = await renderMigration(result.document);
        process.stdout.write(output);
        break;
      }
      case 'form-request': {
        const output = await renderFormRequest(result.document);
        process.stdout.write(output);
        break;
      }
      case 'ts-module': {
        const output = await renderTsModule(result.document);
        process.stdout.write(output);
        break;
      }
      case 'autoform-generated': {
        process.stdout.write(renderAutoformGenerated(result.document));
        break;
      }
      case 'autoform-config': {
        process.stdout.write(renderAutoformConfig(result.document));
        break;
      }
      case 'autoform-form': {
        process.stdout.write(renderAutoformForm(result.document));
        break;
      }
      case 'transformer': {
        const output = await renderTransformer(result.document);
        process.stdout.write(output);
        break;
      }
      case 'factory': {
        const output = await renderFactory(result.document);
        process.stdout.write(output);
        break;
      }
      case 'controller-base': {
        const output = await renderControllerBase(result.document);
        process.stdout.write(output);
        break;
      }
      case 'controller-extension': {
        const output = await renderControllerExtension(result.document);
        process.stdout.write(output);
        break;
      }
      default:
        console.error(
          `${kleur.red('✗')} Unknown artifact '${options.artifact}'. Known: model-base, model-extension, migration, form-request, ts-module, autoform-generated, autoform-config, autoform-form, transformer, factory, controller-base, controller-extension`,
        );
        process.exit(2);
    }
  });

program
  .command('gen <path>')
  .description('Generate all artifacts for a UDO into a Laravel project.')
  .option('-o, --out <dir>', 'Laravel project root (defaults to cwd)', process.cwd())
  .option('--dry-run', 'Print the plan without writing files', false)
  .option('--force', 'Overwrite scaffold-once files (Model.php, Controller.php)', false)
  .option('--target <target>', 'Frontend target: react (default) or autoform', 'react')
  .option(
    '--frontend-root <dir>',
    "Root dir for frontend files, relative to project root (e.g. 'frontend', 'src')",
    'resources/js',
  )
  .action(
    async (
      path: string,
      options: {
        out: string;
        dryRun: boolean;
        force: boolean;
        target: string;
        frontendRoot: string;
      },
    ) => {
    const result = parseUdoFile(path);
    if (!result.ok) {
      console.error(`${kleur.red('✗')} UDO is invalid; fix errors before generating.`);
      for (const err of result.errors) console.error(`  ${kleur.red('•')} ${err}`);
      process.exit(1);
    }

    const VALID_TARGETS: FrontendTarget[] = ['react', 'autoform'];
    if (!VALID_TARGETS.includes(options.target as FrontendTarget)) {
      console.error(
        `${kleur.red('✗')} Unknown --target '${options.target}'. Known: ${VALID_TARGETS.join(', ')}`,
      );
      process.exit(2);
    }
    const target = options.target as FrontendTarget;

    const plan = await planAndGenerate(result.document, {
      out: options.out,
      dryRun: options.dryRun,
      force: options.force,
      target,
      frontendRoot: options.frontendRoot,
    });

    const header = options.dryRun
      ? `${kleur.yellow('●')} ${kleur.bold('Plan (no files written)')} — out=${kleur.dim(options.out)}`
      : `${kleur.green('●')} ${kleur.bold('Generated')} — out=${kleur.dim(options.out)}`;
    console.log(header);

    for (const action of plan) {
      const label = labelFor(action);
      const rel = relative(options.out, action.path);
      console.log(`  ${label}  ${rel}`);
      if (action.reason) console.log(`    ${kleur.dim(action.reason)}`);
    }

    const wrote = plan.filter((p) => p.kind === 'WRITE' || p.kind === 'PATCH').length;
    const skipped = plan.length - wrote;
    console.log(
      `${kleur.dim(`  ${wrote} written/patched, ${skipped} skipped`)}` +
        (options.dryRun ? kleur.dim(' (dry-run)') : ''),
    );
  });

function labelFor(action: PlannedAction): string {
  switch (action.kind) {
    case 'WRITE':
      return kleur.green('WRITE     ');
    case 'PATCH':
      return kleur.cyan('PATCH     ');
    case 'SKIP-EXISTS':
      return kleur.yellow('SKIP-EXIST');
    case 'SKIP-OPTED-OUT':
      return kleur.dim('SKIP-OPT  ');
    case 'SKIP-MIGRATION-PRESENT':
      return kleur.dim('SKIP-MIGR ');
    case 'SKIP-PATCH-PRESENT':
      return kleur.dim('SKIP-PATCH');
  }
}

program
  .command('migrate <udoPath>')
  .description('Diff a UDO against its snapshot and emit an additive ALTER migration.')
  .option('-o, --out <dir>', 'Laravel project root (defaults to cwd)', process.cwd())
  .option('--dry-run', 'Print the diff without writing the migration', false)
  .action(async (udoPath: string, options: { out: string; dryRun: boolean }) => {
    const result = parseUdoFile(udoPath);
    if (!result.ok) {
      console.error(`${kleur.red('✗')} UDO is invalid; fix errors before migrating.`);
      for (const err of result.errors) console.error(`  ${kleur.red('•')} ${err}`);
      process.exit(1);
    }
    const current = result.document;

    const snapshot = readSnapshot(options.out, current.resource);
    if (!snapshot) {
      console.error(
        `${kleur.red('✗')} No snapshot found for ${current.resource}. Run \`udo gen\` first to create the initial migration and snapshot.`,
      );
      process.exit(1);
    }

    const diff = diffUdo(snapshot, current);
    const hasAny = diff.added.length + diff.removed.length + diff.changed.length;
    if (hasAny === 0) {
      console.log(`${kleur.dim('●')} No changes detected for ${current.resource}.`);
      return;
    }

    // Print diff summary
    console.log(`${kleur.bold(current.resource)} — pending changes:`);
    for (const a of diff.added) {
      console.log(`  ${kleur.green('+ ADD ')} ${a.name} (${a.field.type})`);
    }
    for (const r of diff.removed) {
      console.log(`  ${kleur.red('- DROP')} ${r.name}`);
    }
    for (const c of diff.changed) {
      const props = c.changes.map((cc) => cc.property).join(', ');
      console.log(`  ${kleur.yellow('~ WARN')} ${c.name} (${props}) — manual ALTER required`);
    }

    const table = current.table ?? defaultTable(current.resource);
    const contents = await renderAlterMigration(current, diff);

    const ts = migrationTs(new Date());
    const filename = `${ts}_alter_${table}_table.php`;
    const path = join(options.out, 'database/migrations', filename);

    if (options.dryRun) {
      console.log(`\n${kleur.dim(`(dry-run) would write: ${relative(options.out, path)}`)}`);
      return;
    }

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
    writeSnapshot(options.out, current);

    console.log(
      `\n${kleur.green('✓')} Wrote ${kleur.bold(relative(options.out, path))} and updated snapshot.`,
    );
    if (diff.changed.length > 0) {
      console.log(
        `${kleur.yellow('!')} ${diff.changed.length} field(s) have type/constraint changes — review TODO comments in the migration before running.`,
      );
    }
  });

function migrationTs(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}_` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}


program.parseAsync(process.argv).catch((err) => {
  console.error(kleur.red(`udo: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
