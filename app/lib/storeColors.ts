export function parseStoreHexColor(value: string | null | undefined): string | null {
  if (value == null || typeof value !== 'string') return null;
  const v = value.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v;
  return null;
}

export function resolveStoreColor(value: string | null | undefined): string {
  return parseStoreHexColor(value) ?? '#e7e6e6';
}

export function storeTextColor(bg: string): string {
  const h = bg.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.65 ? '#111827' : '#f9fafb';
}
