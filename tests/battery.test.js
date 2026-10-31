import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recommendBatteries,
  outageLoad,
  backupHours,
  longestIndefiniteRun,
  formatDuration,
  combinedCashFlow,
  combinedYearlyFlows,
} from '../src/lib/battery.js';
import { irr, breakevenYear } from '../src/lib/calc.js';
import { _internal } from '../api/parse-panel.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const br = (...amps) => amps.map((a) => ({ amps: a }));

test('recommendBatteries rules', () => {
  assert.equal(recommendBatteries(br(15, 20, 30)), 1);
  assert.equal(recommendBatteries(br(50, 60)), 1); // two 50/60A → 1
  assert.equal(recommendBatteries(br(50, 60, 50)), 2); // three 50/60A → 2
  assert.equal(recommendBatteries(br(100)), 2); // any breaker over 60A → 2
  assert.equal(recommendBatteries(br(40, 40, 50, 30)), 1); // three 40/50/60A → 1
  assert.equal(recommendBatteries(br(40, 40, 50, 60)), 2); // four 40/50/60A → 2
  assert.equal(recommendBatteries([]), 1);
});

test('outageLoad: critical flat, comfort % of each month', () => {
  assert.deepEqual(outageLoad({ mode: 'critical', criticalKwh: 10, comfortPct: 50, monthlyKwh: [] }), new Array(12).fill(10));
  const monthly = new Array(12).fill(0).map((_, i) => 31 * 20); // 620 kWh each month
  const c = outageLoad({ mode: 'comfort', criticalKwh: 10, comfortPct: 50, monthlyKwh: monthly });
  close(c[0], 10); // Jan: 50% of 620/31 = 10
  close(c[1], 310 / 28); // Feb has 28 days
});

test('backupHours matches the GridReady formula (13.5 kWh, 18.75 kWh/day example)', () => {
  const [jan, jun] = backupHours({ batteryKwh: 13.5, loadPerDay: [18.75, 18.75], solarPerDay: [9.1, 20] });
  close(jan.batteryHours, 17.28);
  close(jan.solarHours, (9.1 / 18.75) * 24);
  close(jan.total, 17.28 + (9.1 / 18.75) * 24);
  assert.equal(jun.indefinite, true);
  assert.equal(jun.total, Infinity);
});

test('longestIndefiniteRun wraps across the year', () => {
  const f = [false, false, true, true, true, true, true, true, true, true, false, false]; // Mar–Oct
  assert.deepEqual(longestIndefiniteRun(f), { length: 8, start: 2, end: 9 });
  const wrap = [true, false, false, false, false, false, false, false, false, false, true, true]; // Nov–Jan
  assert.deepEqual(longestIndefiniteRun(wrap), { length: 3, start: 10, end: 0 });
  assert.equal(longestIndefiniteRun(new Array(12).fill(false)).length, 0);
  assert.equal(longestIndefiniteRun(new Array(12).fill(true)).length, 12);
});

test('formatDuration', () => {
  assert.equal(formatDuration(29.4), '29 hours');
  assert.equal(formatDuration(55.2), '2.3 days');
  assert.equal(formatDuration(Infinity), 'unlimited');
});

test('combinedCashFlow: costs, solar savings, PSE incentives per battery', () => {
  const rows = combinedCashFlow({ solarCost: 27668, batteries: 1, solarYear1: 2055, zPct: 7.5, years: 25 });
  assert.equal(rows[0].net, -37668);
  close(rows[1].incentiveCum, 1500);
  close(rows[2].incentiveCum, 2000);
  close(rows[1].solarCum, 2055);
  close(rows[2].solarCum, 2055 + 2055 * 1.075);
  const flows = combinedYearlyFlows(rows);
  close(flows[1], 2055 + 1500);
  assert.ok(irr(flows) > 0);
  const two = combinedCashFlow({ solarCost: 27668, batteries: 2, solarYear1: 2055, zPct: 7.5, years: 25 });
  close(two[1].incentiveCum, 3000);
  assert.equal(two[0].net, -47668);
  assert.ok(breakevenYear(two.map((r) => r.net)) >= breakevenYear(rows.map((r) => r.net)));
});

test('parse-panel clean: drops main/slotless, normalizes fields', () => {
  const out = _internal.clean({
    panels: [
      {
        name: 'Main',
        main_amps: 200,
        breakers: [
          { slot: 1, label: 'EV charger', amps: 60, poles: 2, category: 'other' },
          { slot: 3, label: '', amps: 15, poles: 1, category: 'weird' },
          { slot: null, label: 'x', amps: 20, poles: 1, category: 'critical' },
        ],
      },
      { name: 'Empty', breakers: [] },
    ],
  });
  assert.equal(out.panels.length, 1);
  assert.equal(out.panels[0].mainAmps, 200);
  assert.equal(out.panels[0].breakers.length, 2);
  assert.equal(out.panels[0].breakers[1].category, 'unknown');
});
