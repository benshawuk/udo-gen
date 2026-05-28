import { describe, expect, it } from 'vitest';
import {
  renderScaffoldPage,
  renderResourcePageRuntime,
  scaffoldPagePath,
} from '../../src/generate/react-scaffold.js';
import type { UdoDocument } from '../../src/types.js';

const sample: UdoDocument = {
  udoVersion: 1,
  resource: 'Post',
  fields: { title: { type: 'string', required: true } },
};

describe('renderScaffoldPage', () => {
  it('produces a default-export React component named after the resource', async () => {
    const output = await renderScaffoldPage(sample);
    expect(output).toContain('export default function PostPage()');
    expect(output).toContain('<ResourcePage resource={Post} />');
  });

  it("imports the resource from '@/udo'", async () => {
    const output = await renderScaffoldPage(sample);
    expect(output).toContain("import { Post } from '@/udo';");
  });

  it("imports ResourcePage from '@/lib/udo-ui/resource-page'", async () => {
    const output = await renderScaffoldPage(sample);
    expect(output).toContain("import { ResourcePage } from '@/lib/udo-ui/resource-page';");
  });

  // Bug-fix regression: TSX files need React imported to compile under
  // the classic JSX transform. The new transform makes the import unused but harmless.
  it('imports React (compatibility with classic JSX transform)', async () => {
    const output = await renderScaffoldPage(sample);
    expect(output).toMatch(/^import \* as React from 'react';/m);
  });
});

describe('renderResourcePageRuntime', () => {
  it('exports the ResourcePage component', async () => {
    const output = await renderResourcePageRuntime();
    expect(output).toContain('export function ResourcePage');
  });

  it('reads resource.endpoint and resource.queryKey from the passed module', async () => {
    const output = await renderResourcePageRuntime();
    expect(output).toContain('resource.endpoint');
    expect(output).toContain('resource.queryKey');
  });

  it('uses useQuery from @tanstack/react-query', async () => {
    const output = await renderResourcePageRuntime();
    expect(output).toContain("import { useQuery } from '@tanstack/react-query';");
  });

  // Bug-fix regression: TSX needs React import for classic JSX transform.
  it('imports React (compatibility with classic JSX transform)', async () => {
    const output = await renderResourcePageRuntime();
    expect(output).toMatch(/^import \* as React from 'react';/m);
  });
});

describe('scaffoldPagePath', () => {
  it('produces kebab-case feature dir and filename', () => {
    const result = scaffoldPagePath(sample);
    expect(result.featureDir).toBe('posts');
    expect(result.filename).toBe('post-page.tsx');
  });

  it('handles multi-word PascalCase resources', () => {
    const result = scaffoldPagePath({
      udoVersion: 1,
      resource: 'VerificationCode',
      table: 'verification_codes',
      fields: { code: { type: 'string' } },
    });
    expect(result.featureDir).toBe('verification-codes');
    expect(result.filename).toBe('verification-code-page.tsx');
  });
});
