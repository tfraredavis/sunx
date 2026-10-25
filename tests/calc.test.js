import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toTwelveMonths,
  futureSpend,
  sizeForOffset,
  offsetForSize,
  monthlyProduction,
  costRange,
  cumulativeCashFlow,
  breakevenYear,
  sum,
} from '../src/lib/calc.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('toTwelveMonths: 13-month history keeps the most recent year per month', () => {
  const entries = [{ year: 2025, month: 9, kwh: 500 }];
  for (let m = 10; m <= 12; m++) entries.push({ year: 2025, month: m, kwh: m * 100 });
  for (let m = 1; m <= 9; m++) entries.push({ year: 2026, month: m, kwh: m * 100 });
  const out = toTwelveMonths(entries);
  assert.equal(out.length, 12);
  assert.equal(out[8], 900); // Sep 2026 wins over Sep 2025
  assert.equal(out[11], 1200);
});

test('toTwelveMonths: single month fills all 12', () => {
  assert.deepEqual(toTwelveMonths([{ year: 2026, month: 9, kwh: 812 }]), new Array(12).fill(812));
});

test('toTwelveMonths: empty → null', () => {
  assert.equal(toTwelveMonths([]), null);
});

test('futureSpend: w = Σ x(1+z)^(n−1)', () => {
  close(futureSpend(1000, 0, 25), 25000);
  close(futureSpend(1000, 5, 2), 2050);
  close(futureSpend(1000, 5, 0), 0);
  // closed form check
  close(futureSpend(2400, 5, 25), 2400 * ((1.05 ** 25 - 1) / 0.05), 1e-6);
});

test('sizing round trip: b to 0.01 kW, c from b', () => {
  const y = 10000;
  const ratio = 1050;
  const b = sizeForOffset(100, y, ratio);
  assert.equal(b, 9.52);
  close(offsetForSize(b, y, ratio), 99.96, 1e-9);
  assert.equal(sizeForOffset(200, y, ratio), 19.05);
});

test('monthly production sums to b × annual ratio', () => {
  const perKw = [40, 60, 90, 110, 130, 140, 150, 140, 110, 70, 40, 30];
  const ratio = sum(perKw);
  const b = 7.5;
  close(sum(monthlyProduction(b, perKw)), b * ratio);
});

test('cost range $2.20–$2.70/W', () => {
  const { low, high } = costRange(8);
  close(low, 17600);
  close(high, 21600);
});

test('cash flow & breakeven (whole year, rounded up)', () => {
  // cost 10,000, savings 1,000/yr flat → cumulative hits 0 exactly at year 10
  const s = cumulativeCashFlow({ systemCost: 10000, x: 1000, offsetPct: 100, zPct: 0, years: 40 });
  assert.equal(s.length, 41);
  assert.equal(s[0], -10000);
  close(s[25], 15000);
  close(s[40], 30000);
  assert.equal(breakevenYear(s), 10);

  // cost 10,500 → breakeven during year 11 → shown as year 11
  const s2 = cumulativeCashFlow({ systemCost: 10500, x: 1000, offsetPct: 100, zPct: 0, years: 40 });
  assert.equal(breakevenYear(s2), 11);
});

test('breakeven beyond 40 years → null', () => {
  const s = cumulativeCashFlow({ systemCost: 100000, x: 1000, offsetPct: 100, zPct: 0, years: 40 });
  assert.equal(breakevenYear(s), null);
});

test('savings above 100% offset equal a 100% system, just at a higher cost', () => {
  const x = 2000;
  const s100 = cumulativeCashFlow({ systemCost: 20000, x, offsetPct: Math.min(100, 100), zPct: 5, years: 40 });
  const s150 = cumulativeCashFlow({ systemCost: 30000, x, offsetPct: Math.min(150, 100), zPct: 5, years: 40 });
  for (let n = 1; n <= 40; n++) close(s150[n] - s150[n - 1], s100[n] - s100[n - 1]);
  close(s100[40] - s150[40], 10000);
});
