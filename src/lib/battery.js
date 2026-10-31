// Battery sizing, backup duration and combined solar + battery payback. Pure functions (unit tested).

export const BATTERY_KWH = 15; // energy per battery
export const BATTERY_KW = 10; // power per battery
export const BATTERY_COST = 10000; // $ per battery (placeholder until real pricing)
export const CRITICAL_KWH_DEFAULT = 10; // kWh/day for the Critical bucket
export const COMFORT_PCT_DEFAULT = 50; // % of each month's normal daily use for the Comfort bucket

// Grid services: PSE Flex Batteries, per battery (placeholder for the utility grid-services database).
export const GRID_SERVICES = { name: 'PSE Flex Battery incentive', year1: 1500, recurring: 500 };

export const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Recommended battery count from the breakers that are ON backup (main breaker excluded):
 *  - any single breaker over 60A → 2
 *  - three or more 50A/60A breakers → 2
 *  - four or more 40A/50A/60A breakers → 2
 *  - otherwise → 1
 */
export function recommendBatteries(selected) {
  const amps = selected.map((b) => Number(b.amps) || 0);
  if (amps.some((a) => a > 60)) return 2;
  if (amps.filter((a) => a === 50 || a === 60).length >= 3) return 2;
  if (amps.filter((a) => a === 40 || a === 50 || a === 60).length >= 4) return 2;
  return 1;
}

/**
 * Daily outage load (kWh/day) for each calendar month (index 0 = Jan).
 * mode 'critical': flat kWh/day. mode 'comfort': pct of that month's normal daily use from the bill.
 */
export function outageLoad({ mode, criticalKwh, comfortPct, monthlyKwh }) {
  if (mode === 'critical') return DAYS.map(() => criticalKwh);
  return monthlyKwh.map((m, i) => ((comfortPct / 100) * m) / DAYS[i]);
}

/**
 * Backup hours per month (same formula as GridReady):
 *   battery-only hours = battery kWh ÷ daily load × 24
 *   solar-added hours  = daily solar ÷ daily load × 24; if daily solar ≥ daily load → Infinity
 * Returns [{ batteryHours, solarHours, total, indefinite, load, solar }] for each calendar month.
 */
export function backupHours({ batteryKwh, loadPerDay, solarPerDay }) {
  return loadPerDay.map((load, i) => {
    const solar = solarPerDay[i] || 0;
    if (!(load > 0)) return { batteryHours: Infinity, solarHours: Infinity, total: Infinity, indefinite: true, load, solar };
    const batteryHours = (batteryKwh / load) * 24;
    const indefinite = solar >= load;
    const solarHours = indefinite ? Infinity : (solar / load) * 24;
    return { batteryHours, solarHours, total: indefinite ? Infinity : batteryHours + solarHours, indefinite, load, solar };
  });
}

/**
 * Longest run of consecutive indefinite months, wrapping across December→January.
 * Returns { length, start, end } using calendar indexes, or { length: 0 } if none. length 12 = all year.
 */
export function longestIndefiniteRun(flags) {
  const n = flags.length;
  if (flags.every(Boolean)) return { length: n, start: 0, end: n - 1 };
  let best = { length: 0 };
  for (let s = 0; s < n; s++) {
    if (!flags[s] || flags[(s - 1 + n) % n]) continue; // only start at the beginning of a run
    let len = 0;
    while (len < n && flags[(s + len) % n]) len++;
    if (len > best.length) best = { length: len, start: s, end: (s + len - 1) % n };
  }
  return best;
}

/** "29 hours" under 48 h, otherwise "2.3 days". */
export function formatDuration(hours) {
  if (!Number.isFinite(hours)) return 'unlimited';
  if (hours < 48) return `${Math.round(hours)} hours`;
  return `${(hours / 24).toFixed(1)} days`;
}

/**
 * Combined solar + battery cash flow, years 0..years.
 * Returns per year: cumulative solar savings, cumulative incentives, total cost, and net cumulative cash flow.
 * Solar savings: year-1 savings × (1+z)^(n−1). Incentives per battery: year1 in year 1, recurring every later year.
 */
export function combinedCashFlow({ solarCost, batteries, batteryCost = BATTERY_COST, solarYear1, zPct, years, grid = GRID_SERVICES }) {
  const total = solarCost + batteries * batteryCost;
  const g = zPct / 100;
  const rows = [{ year: 0, solarCum: 0, incentiveCum: 0, total, net: -total }];
  let solarCum = 0;
  let incentiveCum = 0;
  for (let n = 1; n <= years; n++) {
    solarCum += solarYear1 * Math.pow(1 + g, n - 1);
    incentiveCum += batteries * (n === 1 ? grid.year1 : grid.recurring);
    rows.push({ year: n, solarCum, incentiveCum, total, net: solarCum + incentiveCum - total });
  }
  return rows;
}

/** Yearly (non-cumulative) flows for IRR from combinedCashFlow rows. */
export function combinedYearlyFlows(rows) {
  return rows.map((r, i) => (i === 0 ? r.net : r.net - rows[i - 1].net));
}
