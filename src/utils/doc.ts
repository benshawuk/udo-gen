import type { UdoDocument } from '../types.js';

/**
 * The controller's ownedBy column, or null when ownership scoping is off.
 * When set, the column is server-managed: excluded from the FormRequest and
 * from the TS Create/Update payloads, and forced from auth()->id() on store.
 */
export function ownedByColumn(doc: UdoDocument): string | null {
  const controller = doc.controller ?? 'auto';
  if (controller === 'auto' || controller === 'custom') return null;
  return controller.ownedBy ?? null;
}
