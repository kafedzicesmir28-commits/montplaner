/**
 * Short labels shown in planner cells (screen + print).
 * Known shift names map to fixed codes; others use first two letters (uppercase).
 */

const ABBREV_OVERRIDES: Record<string, string> = {
  stettbach: 'ST',
  bahnreise: 'BR',
  busbahnho: 'BB',
  busbahnhof: 'BB',
};

function labelKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function shiftPlannerAbbrev(label: string): string {
  const s = label.trim();
  if (!s) return '';
  if (s.length <= 3) return s.toUpperCase();
  const key = labelKey(s);
  const over = ABBREV_OVERRIDES[key];
  if (over) return over;
  return s.slice(0, 2).toUpperCase();
}
