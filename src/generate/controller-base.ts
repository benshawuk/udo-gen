import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { UdoDocument } from '../types.js';
import { pascalToCamel } from '../utils/naming.js';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '..', '..', 'templates');
const eta = new Eta({ views: templateDir, autoEscape: false, autoTrim: false });

export interface ControllerBaseContext {
  resource: string;
  modelVar: string;
  eagerLoad: string[];
  defaultSortColumn: string | null;
  defaultSortDirection: 'asc' | 'desc';
  pageSize: number;
  ownedBy: string | null;
}

function controllerKnobs(doc: UdoDocument): {
  eagerLoad: string[];
  defaultSort: string | null;
  pageSize: number;
  ownedBy: string | null;
} {
  const controller = doc.controller ?? 'auto';
  if (controller === 'auto' || controller === 'custom') {
    return { eagerLoad: [], defaultSort: null, pageSize: 25, ownedBy: null };
  }
  return {
    eagerLoad: controller.eagerLoad ?? [],
    defaultSort: controller.defaultSort ?? null,
    pageSize: controller.pageSize ?? 25,
    ownedBy: controller.ownedBy ?? null,
  };
}

export function buildControllerBaseContext(doc: UdoDocument): ControllerBaseContext {
  const knobs = controllerKnobs(doc);
  let defaultSortColumn: string | null = null;
  let defaultSortDirection: 'asc' | 'desc' = 'asc';
  if (knobs.defaultSort) {
    if (knobs.defaultSort.startsWith('-')) {
      defaultSortColumn = knobs.defaultSort.slice(1);
      defaultSortDirection = 'desc';
    } else {
      defaultSortColumn = knobs.defaultSort;
      defaultSortDirection = 'asc';
    }
  }

  return {
    resource: doc.resource,
    modelVar: pascalToCamel(doc.resource),
    eagerLoad: knobs.eagerLoad,
    defaultSortColumn,
    defaultSortDirection,
    pageSize: knobs.pageSize,
    ownedBy: knobs.ownedBy,
  };
}

export async function renderControllerBase(doc: UdoDocument): Promise<string> {
  const ctx = buildControllerBaseContext(doc);
  const rendered = await eta.renderAsync('controller-base', ctx);
  if (typeof rendered !== 'string') {
    throw new Error('Eta returned non-string output for controller-base template.');
  }
  return rendered.replace(/\n*$/, '\n');
}

export async function renderControllerExtension(doc: UdoDocument): Promise<string> {
  const ctx = {
    resource: doc.resource,
    modelVar: pascalToCamel(doc.resource),
  };
  const rendered = await eta.renderAsync('controller-extension', ctx);
  if (typeof rendered !== 'string') {
    throw new Error('Eta returned non-string output for controller-extension template.');
  }
  return rendered.replace(/\n*$/, '\n');
}
