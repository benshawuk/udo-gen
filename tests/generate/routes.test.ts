import { describe, expect, it } from 'vitest';
import { injectRoutes } from '../../src/generate/routes.js';
import type { UdoDocument } from '../../src/types.js';

function widget(overrides: Partial<UdoDocument> = {}): UdoDocument {
  return {
    udoVersion: 1,
    resource: 'Widget',
    table: 'widgets',
    fields: { name: { type: 'string' } },
    ...overrides,
  };
}

describe('injectRoutes', () => {
  it('appends use-statement + apiResource line into an empty routes file', () => {
    const before = `<?php\n\nuse Illuminate\\Support\\Facades\\Route;\n`;
    const result = injectRoutes(before, widget());
    expect(result.changed).toBe(true);
    expect(result.contents).toContain('use App\\Http\\Controllers\\WidgetController;');
    expect(result.contents).toContain("Route::apiResource('widgets', WidgetController::class);");
    expect(result.contents).toContain('// >>> udo-gen:Widget');
  });

  it('is idempotent — second call does not duplicate the line', () => {
    const before = `<?php\n\nuse Illuminate\\Support\\Facades\\Route;\n`;
    const first = injectRoutes(before, widget());
    const second = injectRoutes(first.contents, widget());
    expect(second.changed).toBe(false);
    expect(second.contents).toBe(first.contents);
  });

  it('honours controller: "custom" by skipping', () => {
    const before = `<?php\n`;
    const result = injectRoutes(before, widget({ controller: 'custom' }));
    expect(result.changed).toBe(false);
    expect(result.reason).toMatch(/custom/);
  });

  it('uses kebab-case path from the table name', () => {
    const before = `<?php\n`;
    const result = injectRoutes(before, widget({ table: 'verification_codes', resource: 'VerificationCode' }));
    expect(result.contents).toContain(
      "Route::apiResource('verification-codes', VerificationCodeController::class);",
    );
  });
});
