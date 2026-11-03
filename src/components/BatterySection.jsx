import { useEffect, useMemo, useRef, useState } from 'react';
import PanelUpload from './PanelUpload.jsx';
import PanelGraphic from './PanelGraphic.jsx';
import BackupChart from './BackupChart.jsx';
import BatteryPaybackChart, { PAYBACK_COLORS } from './BatteryPaybackChart.jsx';
import InlineNumber from './InlineNumber.jsx';
import LeadForm from './LeadForm.jsx';
import {
  BATTERY_KWH,
  BATTERY_KW,
  CRITICAL_KWH_DEFAULT,
  COMFORT_PCT_DEFAULT,
  GRID_SERVICES,
  DAYS,
  MONTH_NAMES,
  batteryCost,
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
const WINTER = [11, 0, 1]; // Dec, Jan, Feb
const BUCKET = { critical: ['critical'], comfort: ['critical', 'comfort'] };

/**
 * Renders two page sections:
 *  #battery   — panel photo + graphic (left) beside load selection, battery count and backup duration (right)
 *  #financial — combined solar + battery payback chart and the summary
 */
export default function BatterySection({ monthlyKwh, production, utility, solarCost, solarYear1, zPct, solarReady, address, solarDesign }) {
  const [panels, setPanels] = useState([]);
  const [skipped, setSkipped] = useState(false);
  const [mode, setMode] = useState(null); // 'critical' | 'comfort'
  const [selected, setSelected] = useState(new Set());
  const [criticalKwh, setCriticalKwh] = useState(CRITICAL_KWH_DEFAULT);
  const [comfortPct, setComfortPct] = useState(COMFORT_PCT_DEFAULT);
  const [batteryOverride, setBatteryOverride] = useState(null);
  const [showFinancial, setShowFinancial] = useState(false);
  const [leadAt, setLeadAt] = useState(null); // where the consultant form is open: 'battery' | 'financial' | null

  // Keep the right column (selection, sizing, backup chart) in view next to a long panel. If the column is
  // taller than the screen, it pins by its bottom edge so the backup chart stays visible.
  const rightRef = useRef(null);
  useEffect(() => {
    const el = rightRef.current;
    if (!el) return;
    const place = () => {
      const top = Math.min(72, window.innerHeight - el.offsetHeight - 16);
      el.style.top = `${top}px`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  });

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

  // ---- Sizing: default to the minimum batteries the selected circuits need ----
  const selectedBreakers = allBreakers.filter((b) => selected.has(b.id));
  const required = recommendBatteries(selectedBreakers);
  const batteries = batteryOverride ?? required;
  const batteryKwh = batteries * BATTERY_KWH;
  const underPowered = batteries < required;

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

  // ---- Summary: "will pay for itself in X years, will have an annual return of Y%, and power your home for a Z month outage." ----
  const summaryParts = [
    payback === null ? `will not pay for itself within ${PAYBACK_YEARS} years` : `will pay for itself in ${payback} years`,
  ];
  if (totalIrr !== null && totalIrr > 0) summaryParts.push(`will have an annual return of ${totalIrr.toFixed(1)}%`);
  if (hours) {
    summaryParts.push(
      run.length > 0
        ? `power your home for ${[8, 11, 18].includes(run.length) ? 'an' : 'a'} ${run.length} month outage`
        : `keep your essentials running for at least ${formatDuration(winterMin)} during a winter outage`
    );
  }
  const summary =
    summaryParts.length > 2
      ? `${summaryParts.slice(0, -1).join(', ')}, and ${summaryParts[summaryParts.length - 1]}`
      : summaryParts.join(' and ');

  const incentiveName = pse ? GRID_SERVICES.name : 'Grid services incentive (estimated from PSE Battery Flex)';
  const incentiveSentence = `${incentiveName} returns ${dollars(batteries * GRID_SERVICES.year1)} in Year 1 and ${dollars(
    batteries * GRID_SERVICES.recurring
  )} in each additional year.`;

  const leadDesign = {
    ...solarDesign,
    batteries,
    batteryKwh,
    batteryKw: batteries * BATTERY_KW,
    batteryCost: batteryCost(batteries),
    backupMode: mode,
    outageKwhPerDay: loadPerDay,
    circuitsOnBackup: selectedBreakers.map((b) => ({ label: b.label, amps: b.amps, poles: b.poles })),
    combinedPaybackYear: payback,
    combinedNet30: rows[rows.length - 1].net,
    combinedAnnualReturnPct: totalIrr,
  };

  function openFinancial() {
    setShowFinancial(true);
    setTimeout(() => document.getElementById('financial')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  return (
    <>
      {/* ================= Battery ================= */}
      <section id="battery" className="section">
        <div className={`battery-layout${ready ? ' is-ready' : ''}`}>
          {/* Left: panel */}
          <div className="battery-left">
            <div className="card">
              {!skipped && (
                <PanelUpload
                  hasPanels={panels.length > 0}
                  onPanels={(p) => setPanels((prev) => [...prev, ...p])}
                  onSkip={() => setSkipped(true)}
                />
              )}
              {panels.length > 0 && (
                <>
                  <PanelGraphic panels={panels} selected={selected} onToggle={toggle} />
                  <p className="footnote">Tap any circuit to put it on backup (orange) or shed it (gray).</p>
                </>
              )}
              {skipped && <p className="muted">No panel photo — we'll use typical values for your home.</p>}
            </div>
          </div>

          {/* Right: load selection + backup duration (stays in view while scrolling the panel) */}
          {ready && (
            <div className="battery-right" ref={rightRef}>
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
                  <p className="copy copy-sm">
                    {mode === 'critical' ? (
                      <>
                        During an outage you'd use about{' '}
                        <InlineNumber value={criticalKwh} onCommit={setCriticalKwh} min={0} max={200} decimals={1} label="Outage use kWh per day" /> kWh
                        per day.
                      </>
                    ) : (
                      <>
                        During an outage you'd use about{' '}
                        <InlineNumber value={comfortPct} onCommit={setComfortPct} min={0} max={100} decimals={0} suffix="%" label="Outage use percent" />{' '}
                        of your normal electricity ({Math.min(...loadPerDay).toFixed(0)}–{Math.max(...loadPerDay).toFixed(0)} kWh per day across the
                        year).
                      </>
                    )}
                  </p>
                )}

              </div>

              {mode && (
                <div className="card">
                  <h2 className="card-title">Battery sizing</h2>
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
                    </span>
                  </div>
                  {underPowered && (
                    <p className="warning" role="status">
                      Peak load may exceed what {batteries} {batteries === 1 ? 'battery' : 'batteries'} can supply.
                    </p>
                  )}
                  <p className="copy copy-sm">
                    Cost: <strong>{dollars(batteryCost(batteries))}</strong>
                  </p>
                  <p className="copy copy-sm sizing-incentive">{incentiveSentence}</p>
                </div>
              )}

              {hours && (
                <div className="card">
                  <h2 className="card-title card-title-tight">Battery backup duration</h2>
                  <p className="card-subtitle">
                    {batteryKwh} kWh of batteries, {mode === 'critical' ? `${criticalKwh} kWh/day` : `${comfortPct}% of normal use`}
                  </p>
                  {!solarReady && <p className="muted">Solar recharge isn't included because solar production isn't available yet.</p>}
                  <BackupChart hours={hours} />
                  <p className="copy copy-sm">
                    {Number.isFinite(winterMin)
                      ? `During the winter, you'll get at least ${formatDuration(winterMin)} of backup.`
                      : 'During the winter, solar recharges your batteries faster than you use them, for indefinite backup.'}
                    {run.length === 12 &&
                      ' Year-round, the solar will recharge the batteries faster than you draw them down, resulting in indefinite backup.'}
                    {run.length > 0 &&
                      run.length < 12 &&
                      ` If the grid is down from ${MONTH_NAMES[run.start]}–${MONTH_NAMES[run.end]}, the solar will recharge the batteries faster than you draw them down, resulting in indefinite backup.`}
                  </p>
                </div>
              )}

              {hours && (
                <div className="cta">
                  <button type="button" className={`btn ${showFinancial ? 'btn-primary' : 'btn-outline'}`} onClick={openFinancial}>
                    See financial return
                  </button>
                  <span className="cta-or">OR</span>
                  <button
                    type="button"
                    className={`btn ${leadAt === 'battery' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setLeadAt('battery')}
                  >
                    Submit design to local consultant
                  </button>
                </div>
              )}
              {hours && leadAt === 'battery' && <LeadForm initialAddress={address} design={leadDesign} />}
            </div>
          )}
        </div>
      </section>

      {/* ================= Financial return ================= */}
      {hours && showFinancial && (
        <section id="financial" className="section">
          <div className="card">
            <h2 className="card-title">{PAYBACK_YEARS}-year financial payback</h2>
            <div className="payback-stats">
              <div className="payback-row">
                <span>
                  Solar <strong>{dollars(solarCost)}</strong>
                </span>
                <span>
                  Batteries <strong>{dollars(batteryCost(batteries))}</strong>
                </span>
                <span>
                  Total cost <strong>{dollars(rows[0].total)}</strong>
                </span>
              </div>
              <div className="payback-row">
                <span>
                  Payback <strong>{payback === null ? `${PAYBACK_YEARS}+ years` : `${payback} years`}</strong>
                </span>
                <span>
                  {PAYBACK_YEARS}-year net <strong>{dollars(rows[rows.length - 1].net)}</strong>
                </span>
                <span>
                  Annual return <strong>{totalIrr === null ? '—' : `${totalIrr.toFixed(1)}%`}</strong>
                </span>
              </div>
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
                  <strong>{incentiveName}</strong> returns {dollars(batteries * GRID_SERVICES.year1)} in Year 1 and{' '}
                  {dollars(batteries * GRID_SERVICES.recurring)} in each additional year.
                </span>
              </li>
            </ul>
          </div>

          <div className="card summary">
            <p className="copy copy-hero">In summary, your solar and battery system {summary}.</p>
          </div>

          <button
            type="button"
            className={`btn ${leadAt === 'financial' ? 'btn-primary' : 'btn-outline'} btn-wide`}
            onClick={() => setLeadAt('financial')}
          >
            Submit to a local consultant to review design and provide exact quote
          </button>
          {leadAt === 'financial' && <LeadForm initialAddress={address} design={leadDesign} />}
        </section>
      )}
    </>
  );
}
