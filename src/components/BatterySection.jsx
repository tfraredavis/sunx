import { useMemo, useState } from 'react';
import PanelUpload from './PanelUpload.jsx';
import PanelGraphic from './PanelGraphic.jsx';
import BackupChart from './BackupChart.jsx';
import BatteryPaybackChart, { PAYBACK_COLORS } from './BatteryPaybackChart.jsx';
import InlineNumber from './InlineNumber.jsx';
import {
  BATTERY_KWH,
  BATTERY_KW,
  BATTERY_COST,
  CRITICAL_KWH_DEFAULT,
  COMFORT_PCT_DEFAULT,
  GRID_SERVICES,
  DAYS,
  MONTH_NAMES,
  recommendBatteries,
  outageLoad,
  backupHours,
  longestIndefiniteRun,
  formatDuration,
  combinedCashFlow,
  combinedYearlyFlows,
} from '../lib/battery.js';
import { breakevenYear, irr } from '../lib/calc.js';
import { isPse } from '../lib/utility.js';
import { dollars } from '../lib/format.js';

const PAYBACK_YEARS = 30;
const STOCK_MARKET_PCT = 10;
const WINTER = [11, 0, 1]; // Dec, Jan, Feb
const BUCKET = { critical: ['critical'], comfort: ['critical', 'comfort'] };

/**
 * Battery storage section: panel upload → panel graphic + Critical/Comfort → backup duration →
 * battery cost → combined solar + battery payback → summary.
 */
export default function BatterySection({ monthlyKwh, production, utility, solarCost, solarYear1, zPct, solarReady }) {
  const [panels, setPanels] = useState([]);
  const [skipped, setSkipped] = useState(false);
  const [mode, setMode] = useState(null); // 'critical' | 'comfort'
  const [selected, setSelected] = useState(new Set());
  const [criticalKwh, setCriticalKwh] = useState(CRITICAL_KWH_DEFAULT);
  const [comfortPct, setComfortPct] = useState(COMFORT_PCT_DEFAULT);
  const [batteryOverride, setBatteryOverride] = useState(null);

  const allBreakers = useMemo(
    () => panels.flatMap((p, pi) => p.breakers.map((b, bi) => ({ ...b, id: `${pi}-${bi}` }))),
    [panels]
  );
  const ready = panels.length > 0 || skipped;

  function chooseBucket(m) {
    setMode(m);
    setSelected(new Set(allBreakers.filter((b) => BUCKET[m].includes(b.category)).map((b) => b.id)));
  }
  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ---- Sizing ----
  const selectedBreakers = allBreakers.filter((b) => selected.has(b.id));
  const recommended = recommendBatteries(selectedBreakers);
  const batteries = batteryOverride ?? recommended;
  const batteryKwh = batteries * BATTERY_KWH;

  // ---- Backup duration (calendar months) ----
  const loadPerDay = mode ? outageLoad({ mode, criticalKwh, comfortPct, monthlyKwh }) : null;
  const solarPerDay = DAYS.map((d, i) => (production ? production[i] / d : 0));
  const hours = loadPerDay ? backupHours({ batteryKwh, loadPerDay, solarPerDay }) : null;
  const run = hours ? longestIndefiniteRun(hours.map((h) => h.indefinite)) : { length: 0 };
  const winterMin = hours ? Math.min(...WINTER.map((m) => hours[m].total)) : null;

  // ---- Payback (solar + battery) ----
  const rows = useMemo(
    () => combinedCashFlow({ solarCost, batteries, solarYear1, zPct, years: PAYBACK_YEARS }),
    [solarCost, batteries, solarYear1, zPct]
  );
  const payback = breakevenYear(rows.map((r) => r.net));
  const totalIrr = irr(combinedYearlyFlows(rows));
  const pse = isPse(utility);

  // ---- Summary pieces ----
  const summaryParts = [];
  summaryParts.push(
    payback === null ? `will not pay for itself within ${PAYBACK_YEARS} years` : `will pay for itself in ${payback} years`
  );
  const beatBy = totalIrr === null ? null : Math.round((totalIrr - STOCK_MARKET_PCT) * 10) / 10;
  if (beatBy !== null && beatBy > 0) {
    summaryParts.push(`will be an investment ${beatBy.toFixed(1)}% more than the stock market`);
  }
  if (hours) {
    summaryParts.push(
      run.length > 0
        ? `be able to power your home for ${[8, 11, 18].includes(run.length) ? 'an' : 'a'} ${run.length} month outage`
        : `keep your essentials running for at least ${formatDuration(winterMin)} during a winter outage`
    );
  }
  const summary =
    summaryParts.length > 2
      ? `${summaryParts.slice(0, -1).join(', ')}, and ${summaryParts[summaryParts.length - 1]}`
      : summaryParts.join(' and ');

  return (
    <>
      {/* 1. Panel */}
      <div className="card">
        <h2 className="card-title">Your electrical panel</h2>
        {!skipped && (
          <PanelUpload hasPanels={panels.length > 0} onPanels={(p) => setPanels((prev) => [...prev, ...p])} onSkip={() => setSkipped(true)} />
        )}
        {panels.length > 0 && (
          <>
            <PanelGraphic panels={panels} selected={selected} onToggle={toggle} />
            <p className="footnote">
              Tap any circuit to put it on backup (orange) or shed it (gray). Circuits change the battery recommendation; the daily energy
              estimate will follow individual circuits once our load database is ready.
            </p>
          </>
        )}
        {skipped && <p className="muted">No panel photo — we'll use typical values for your home.</p>}
      </div>

      {/* 2. Critical / Comfort */}
      {ready && (
        <div className="card">
          <h2 className="card-title">What do you want to keep running during an outage?</h2>
          <div className="bucket-choice">
            <button type="button" className={`bucket${mode === 'critical' ? ' is-active' : ''}`} onClick={() => chooseBucket('critical')}>
              <span className="bucket-name">Critical</span>
              <span className="bucket-desc">Fridge, freezer, internet, home office, lights, cooking, well/septic/sump pumps</span>
            </button>
            <button type="button" className={`bucket${mode === 'comfort' ? ' is-active' : ''}`} onClick={() => chooseBucket('comfort')}>
              <span className="bucket-name">Comfort</span>
              <span className="bucket-desc">Everything in Critical, plus water heater, heating and cooling</span>
            </button>
          </div>

          {mode && (
            <p className="copy">
              {mode === 'critical' ? (
                <>
                  During an outage you'd use about{' '}
                  <InlineNumber value={criticalKwh} onCommit={setCriticalKwh} min={0} max={200} decimals={1} label="Outage use kWh per day" />{' '}
                  kWh per day.
                </>
              ) : (
                <>
                  During an outage you'd use about{' '}
                  <InlineNumber value={comfortPct} onCommit={setComfortPct} min={0} max={100} decimals={0} suffix="%" label="Outage use percent" /> of
                  your normal electricity ({Math.min(...loadPerDay).toFixed(0)}–{Math.max(...loadPerDay).toFixed(0)} kWh per day across the year).
                </>
              )}
            </p>
          )}

          {mode && (
            <div className="battery-count">
              <span>Batteries</span>
              <div className="stepper">
                <button type="button" aria-label="Fewer batteries" onClick={() => setBatteryOverride(Math.max(1, batteries - 1))}>
                  −
                </button>
                <span className="stepper-value">{batteries}</span>
                <button type="button" aria-label="More batteries" onClick={() => setBatteryOverride(Math.min(10, batteries + 1))}>
                  +
                </button>
              </div>
              <span className="muted">
                {batteryKwh} kWh storage · {batteries * BATTERY_KW} kW output
                {batteryOverride !== null && batteryOverride !== recommended ? ` · we recommend ${recommended}` : ' · recommended'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 3. Backup duration */}
      {hours && (
        <div className="card">
          <h2 className="card-title">
            Battery backup duration ({batteryKwh} kWh of batteries, {mode === 'critical' ? `${criticalKwh} kWh/day` : `${comfortPct}% of normal use`})
          </h2>
          {!solarReady && <p className="muted">Solar recharge isn't included because solar production isn't available yet.</p>}
          <BackupChart hours={hours} />
          <p className="footnote">∞ means solar generation recharges the battery faster than usage drains it, providing indefinite backup power.</p>
          <p className="copy">
            {Number.isFinite(winterMin)
              ? `During the winter, you'll get at least ${formatDuration(winterMin)} of backup.`
              : 'During the winter, solar recharges your batteries faster than you use them, for indefinite backup.'}
            {run.length === 12 && ' Year-round, the solar will recharge the batteries faster than you draw them down, resulting in indefinite backup.'}
            {run.length > 0 &&
              run.length < 12 &&
              ` If the grid is down from ${MONTH_NAMES[run.start]}–${MONTH_NAMES[run.end]}, the solar will recharge the batteries faster than you draw them down, resulting in indefinite backup.`}
          </p>
        </div>
      )}

      {/* 4. Cost + payback */}
      {hours && (
        <div className="card">
          <h2 className="card-title">{PAYBACK_YEARS}-year financial payback</h2>
          <div className="payback-stats">
            <span>
              Batteries <strong>{dollars(batteries * BATTERY_COST)}</strong>
            </span>
            <span>
              Total cost <strong>{dollars(rows[0].total)}</strong>
            </span>
            <span>
              Payback <strong>{payback === null ? `${PAYBACK_YEARS}+ years` : `${payback} years`}</strong>
            </span>
            <span>
              {PAYBACK_YEARS}-year net <strong>{dollars(rows[rows.length - 1].net)}</strong>
            </span>
            {totalIrr !== null && (
              <span>
                Annual return <strong>{totalIrr.toFixed(1)}%</strong>
              </span>
            )}
          </div>
          <BatteryPaybackChart rows={rows} paybackYear={payback} />
          <ul className="payback-legend">
            <li>
              <i style={{ background: PAYBACK_COLORS.cost }} />
              <strong>Cost not yet recovered</strong>
            </li>
            <li>
              <i style={{ background: PAYBACK_COLORS.solar }} />
              <span>
                <strong>Solar savings</strong> start at {dollars(solarYear1)} in Year 1 and assume utility rate inflation of {zPct}% per year.
              </span>
            </li>
            <li>
              <i style={{ background: PAYBACK_COLORS.incentive }} />
              <span>
                <strong>{pse ? GRID_SERVICES.name : 'Grid services incentive (estimated from PSE Flex Batteries)'}</strong> returns{' '}
                {dollars(batteries * GRID_SERVICES.year1)} in Year 1 then {dollars(batteries * GRID_SERVICES.recurring)} recurring per year.
              </span>
            </li>
          </ul>
        </div>
      )}

      {/* 5. Summary */}
      {hours && (
        <div className="card summary">
          <p className="copy copy-hero">In summary, your solar and battery system {summary}.</p>
        </div>
      )}
    </>
  );
}
