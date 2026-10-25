// Pure calculation functions. No React here so they can be unit tested.

export const COST_PER_W_LOW = 2.2;
export const COST_PER_W_HIGH = 2.7;
export const CASHFLOW_YEARS = 40;

// Display order for the usage chart: April → March. Values are calendar month indexes (0 = Jan).
export const DISPLAY_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];
export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Turn parsed bill usage entries into 12 calendar-month values (Jan..Dec).
 * - Multiple entries for the same month (e.g. a 13-month history): the most recent year wins.
 * - Exactly one month found: that value is used for every month.
 * - Some months missing: filled with the average of the months found (user can edit).
 * - Nothing found: returns null (app falls back to manual entry).
 */
export function toTwelveMonths(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const byMonth = new Array(12).fill(null);
  const yearOf = new Array(12).fill(-Infinity);
  for (const e of entries) {
    const i = e.month - 1;
    const y = e.year ?? 0;
    if (byMonth[i] === null || y >= yearOf[i]) {
      byMonth[i] = e.kwh;
      yearOf[i] = y;
    }
  }

  const found = byMonth.filter((v) => v !== null);
  if (found.length === 0) return null;
  if (found.length === 1) return new Array(12).fill(Math.round(found[0]));

  const avg = found.reduce((a, b) => a + b, 0) / found.length;
  return byMonth.map((v) => Math.round(v === null ? avg : v));
}

export const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

/** x: annual $ = annual kWh × energy charge $/kWh */
export function annualCost(annualKwh, ratePerKwh) {
  return annualKwh * ratePerKwh;
}

/** w: Σ_{n=1..a} x·(1+z)^(n−1). z is a percent (5 = 5%). */
export function futureSpend(x, zPct, years) {
  const g = zPct / 100;
  let total = 0;
  for (let n = 1; n <= years; n++) total += x * Math.pow(1 + g, n - 1);
  return total;
}

/** Cumulative utility spend at the end of each year 1..years: Σ_{n=1..k} x·(1+z)^(n−1). */
export function cumulativeSpend(x, zPct, years = CASHFLOW_YEARS) {
  const g = zPct / 100;
  const out = [];
  let total = 0;
  for (let n = 1; n <= years; n++) {
    total += x * Math.pow(1 + g, n - 1);
    out.push(total);
  }
  return out;
}

/** Round to 2 decimals (kW). */
export const roundKw = (kw) => Math.round(kw * 100) / 100;

/** b from c: kW DC needed to offset c% of annual kWh. */
export function sizeForOffset(cPct, annualKwh, kwhPerKw) {
  if (!kwhPerKw || kwhPerKw <= 0) return 0;
  return roundKw(((cPct / 100) * annualKwh) / kwhPerKw);
}

/** c from b: offset % produced by a b kW system. */
export function offsetForSize(bKw, annualKwh, kwhPerKw) {
  if (!annualKwh || annualKwh <= 0) return 0;
  return ((bKw * kwhPerKw) / annualKwh) * 100;
}

/** Monthly production (Jan..Dec) for a b kW system, from PVWatts per-kW monthly output. */
export function monthlyProduction(bKw, acMonthlyPerKw) {
  return acMonthlyPerKw.map((m) => m * bKw);
}

/** d and e: low/high installed cost (gross) for a b kW DC system. */
export function costRange(bKw) {
  return { low: bKw * 1000 * COST_PER_W_LOW, high: bKw * 1000 * COST_PER_W_HIGH };
}

/**
 * Cumulative cash flow by year, 0..years.
 * Year 0 = −system cost. Year n savings = x × offset × (1+z)^(n−1).
 * Offset % is treated as expense % (agreed simplification; no degradation, no inverter replacement).
 */
export function cumulativeCashFlow({ systemCost, x, offsetPct, zPct, years = CASHFLOW_YEARS }) {
  const g = zPct / 100;
  const out = [-systemCost];
  let cum = -systemCost;
  for (let n = 1; n <= years; n++) {
    cum += x * (offsetPct / 100) * Math.pow(1 + g, n - 1);
    out.push(cum);
  }
  return out;
}

/** First whole year where cumulative cash flow ≥ 0 (i.e. rounded up), or null if never within the series. */
export function breakevenYear(series) {
  if (series[0] >= 0) return 0;
  for (let n = 1; n < series.length; n++) if (series[n] >= 0) return n;
  return null;
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
