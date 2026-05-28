import { readFileSync } from 'node:fs';
import type { UdoDocument } from '../types.js';

export interface RoutesInjection {
  /** Final contents of routes/api.php after injection. */
  contents: string;
  /** True if a change was made. */
  changed: boolean;
  /** Human-readable reason when no change was made. */
  reason?: string;
}

const SENTINEL_PREFIX = '// >>> udo-gen:';

function useStatement(resource: string): string {
  return `use App\\Http\\Controllers\\${resource}Controller;`;
}

function apiResourceLine(resource: string, routePath: string): string {
  return `Route::apiResource('${routePath}', ${resource}Controller::class);`;
}

function sentinel(resource: string): string {
  return `${SENTINEL_PREFIX}${resource}`;
}

function tableToRoutePath(table: string): string {
  return table.replace(/_/g, '-');
}

function defaultTable(resource: string): string {
  const snake = resource.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return snake.endsWith('s') ? snake : `${snake}s`;
}

export function injectRoutes(existing: string, doc: UdoDocument): RoutesInjection {
  // Honour opt-out
  if (doc.controller === 'custom') {
    return { contents: existing, changed: false, reason: 'controller: "custom" — routes not injected' };
  }

  const resource = doc.resource;
  const route = tableToRoutePath(doc.table ?? defaultTable(resource));
  const use = useStatement(resource);
  const line = apiResourceLine(resource, route);
  const tag = sentinel(resource);

  // Already present? Skip.
  if (existing.includes(line) || existing.includes(tag)) {
    return { contents: existing, changed: false, reason: 'Route already present' };
  }

  let contents = existing;

  // Add use-statement after the last `use` line (or after <?php if none).
  if (!contents.includes(use)) {
    const useMatches = contents.match(/^use .+;$/gm);
    if (useMatches && useMatches.length > 0) {
      const lastUse = useMatches[useMatches.length - 1]!;
      const idx = contents.lastIndexOf(lastUse) + lastUse.length;
      contents = contents.slice(0, idx) + `\n${use}` + contents.slice(idx);
    } else {
      // Insert after <?php
      const phpIdx = contents.indexOf('<?php');
      if (phpIdx === -1) {
        contents = `<?php\n\n${use}\n\n` + contents;
      } else {
        const nl = contents.indexOf('\n', phpIdx);
        const insertAt = nl === -1 ? phpIdx + 5 : nl + 1;
        contents = contents.slice(0, insertAt) + `\n${use}\n` + contents.slice(insertAt);
      }
    }
  }

  // Append the route line at end of file with a sentinel comment.
  const trimmed = contents.replace(/\n+$/, '');
  contents = `${trimmed}\n\n${tag}\n${line}\n`;

  return { contents, changed: true };
}

export function loadRoutesFile(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    // If routes/api.php doesn't exist, create a sensible default.
    return `<?php\n\nuse Illuminate\\Support\\Facades\\Route;\n`;
  }
}
