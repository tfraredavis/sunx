const usd0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const num0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** $12,345 (negative as −$12,345) */
export function dollars(v) {
  if (!Number.isFinite(v)) return '$—';
  const s = usd0.format(Math.abs(Math.round(v)));
  return v < 0 ? `−$${s}` : `$${s}`;
}

export const kwh = (v) => (Number.isFinite(v) ? num0.format(Math.round(v)) : '—');

/** Trim trailing zeros: 100 → "100", 87.40 → "87.4" */
export function trimNum(v, decimals) {
  if (!Number.isFinite(v)) return '';
  return String(Number(v.toFixed(decimals)));
}
