import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import type { UdoDocument } from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(here, '..', '..', 'templates');
const eta = new Eta({ views: templateDir, autoEscape: false, autoTrim: false });

export interface ModelExtensionContext {
  resource: string;
}

export async function renderModelExtension(doc: UdoDocument): Promise<string> {
  const ctx: ModelExtensionContext = { resource: doc.resource };
  const rendered = await eta.renderAsync('model-extension', ctx);
  if (typeof rendered !== 'string') {
    throw new Error('Eta returned non-string output for model-extension template.');
  }
  return rendered.replace(/\n*$/, '\n');
}
