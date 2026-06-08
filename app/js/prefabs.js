// The spawnable prefab catalog, grouped by category for the palette.
// Derived from the entity definitions so the two never drift apart.
import { DEFS } from './entities.js';

const CATEGORY_ORDER = ['Structure', 'Supports', 'Loads', 'Vectors', 'Dimensions', 'Annotation'];

export function prefabGroups() {
  const groups = new Map(CATEGORY_ORDER.map((c) => [c, []]));
  for (const [type, d] of Object.entries(DEFS)) {
    if (!groups.has(d.category)) groups.set(d.category, []);
    groups.get(d.category).push({ type, name: d.name });
  }
  return [...groups.entries()].filter(([, items]) => items.length).map(([category, items]) => ({ category, items }));
}
