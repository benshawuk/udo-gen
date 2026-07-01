import { describe, expect, it } from 'vitest';
import type { UdoDocument } from '../../src/types.js';
import { renderControllerBase } from '../../src/generate/controller-base.js';
import { buildFormRequestContext } from '../../src/generate/form-request.js';
import { buildTsModuleContext } from '../../src/generate/ts-module.js';
import { buildAutoformContext } from '../../src/generate/autoform.js';

function ownedDoc(): UdoDocument {
  return {
    udoVersion: 1,
    resource: 'Widget',
    controller: { mode: 'auto', ownedBy: 'user_id' },
    fields: {
      user_id: { type: 'foreignId', required: true, references: 'users.id' },
      name: { type: 'string', required: true, max: 100 },
    },
  } as UdoDocument;
}

describe('controller ownedBy knob', () => {
  it('scopes index() to the owner column', async () => {
    const php = await renderControllerBase(ownedDoc());
    expect(php).toContain("$query->where('user_id', auth()->id());");
  });

  it('forces the owner column on store()', async () => {
    const php = await renderControllerBase(ownedDoc());
    expect(php).toContain("$data['user_id'] = auth()->id();");
  });

  it('guards show/update/destroy with an ownership 404', async () => {
    const php = await renderControllerBase(ownedDoc());
    expect(php).toContain('protected function authorizeOwnership(Widget $widget): void');
    expect(php).toContain("abort_if($widget->getAttribute('user_id') !== auth()->id(), 404);");
    // One guard call per single-record action
    expect(php.match(/\$this->authorizeOwnership\(\$widget\);/g)).toHaveLength(3);
  });

  it('renders no ownership code when the knob is absent', async () => {
    const doc = ownedDoc();
    doc.controller = 'auto';
    const php = await renderControllerBase(doc);
    expect(php).not.toContain('authorizeOwnership');
    expect(php).not.toContain("auth()->id()");
  });

  it('excludes the owner column from the FormRequest', () => {
    const ctx = buildFormRequestContext(ownedDoc());
    expect(ctx.rows.map((r) => r.field)).toEqual(['name']);
  });

  it('excludes the owner column from TS write payloads but keeps it in the Shape', () => {
    const ctx = buildTsModuleContext(ownedDoc());
    expect(ctx.fields.map((f) => f.name)).toEqual(['name']);
    expect(ctx.fieldsMetadata.map((f) => f.name)).toEqual(['name']);
    expect(ctx.shapeFields.map((f) => f.name)).toContain('user_id');
  });

  it('excludes the owner column from autoform rules and fields', () => {
    const ctx = buildAutoformContext(ownedDoc());
    expect(ctx.fields.map((f) => f.name)).toEqual(['name']);
    expect(ctx.clientRules.map((r) => r.field ?? r.name)).not.toContain('user_id');
  });
});
