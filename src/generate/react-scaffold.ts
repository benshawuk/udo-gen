import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { UdoDocument } from '../types.js';
import { pascalToKebab, defaultTable } from '../utils/naming.js';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '..', '..', 'templates');
const eta = new Eta({ views: templateDir, autoEscape: false, autoTrim: false });

export interface ScaffoldPageContext {
  resource: string;
}

export async function renderScaffoldPage(doc: UdoDocument): Promise<string> {
  const ctx: ScaffoldPageContext = { resource: doc.resource };
  const rendered = await eta.renderAsync('react-page-scaffold', ctx);
  if (typeof rendered !== 'string') {
    throw new Error('Eta returned non-string output for react-page-scaffold template.');
  }
  return rendered.replace(/\n*$/, '\n');
}

export async function renderResourcePageRuntime(): Promise<string> {
  const rendered = await eta.renderAsync('resource-page-runtime', {});
  if (typeof rendered !== 'string') {
    throw new Error('Eta returned non-string output for resource-page-runtime template.');
  }
  return rendered.replace(/\n*$/, '\n');
}

/**
 * Path components for the per-resource scaffold page.
 * features/{plural-kebab}/{kebab}-page.tsx
 */
export function scaffoldPagePath(doc: UdoDocument): { featureDir: string; filename: string } {
  const kebab = pascalToKebab(doc.resource);
  const table = doc.table ?? defaultTable(doc.resource);
  const featureDir = table.replace(/_/g, '-');
  return {
    featureDir,
    filename: `${kebab}-page.tsx`,
  };
}
