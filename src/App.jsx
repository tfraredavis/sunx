import { useEffect, useMemo, useState } from 'react';
import './lib/chartSetup.js';
import Upload from './components/Upload.jsx';
import BillDetails from './components/BillDetails.jsx';
import UsageChart from './components/UsageChart.jsx';
import SpendChart from './components/SpendChart.jsx';
import SolarCashFlowChart from './components/SolarCashFlowChart.jsx';
import SectionNav from './components/SectionNav.jsx';
import InlineNumber from './components/InlineNumber.jsx';
import LeadForm from './components/LeadForm.jsx';
import BatteryPlaceholder from './components/BatteryPlaceholder.jsx';
import MonthDetail from './components/MonthDetail.jsx';
import RoofImage from './components/RoofImage.jsx';
import { fileToPayload } from './lib/fileToPayload.js';
import { DEFAULT_Z, defaultEscalation } from './lib/utility.js';
import {
  toTwelveMonths,
  sum,
  annualCost,
  futureSpend,
  sizeForOffset,
  offsetForSize,
  monthlyProduction,
  costRange,
  cumulativeCashFlow,
  cumulativeSpend,
  breakevenYear,
  CASHFLOW_YEARS,
} from './lib/calc.js';
import { dollars, kwh } from './lib/format.js';

const DEFAULT_A = 40; // years
const DEFAULT_C = 100; // % offset
const MAX_C = 200;

const SECTIONS = [
  { id: 'consumption', label: 'Consumption' },
  { id: 'solar', label: 'Solar generation' },
  { id: 'battery', label: 'Battery' },
];
const SAVINGS_YEAR = 30; // "After 30 years you'll have saved…"

const EMPTY_BILL = { utility: null, address: '', rate: 0, months: new Array(12).fill(0) };

export default function App() {
  const [stage, setStage] = useState('upload'); // upload | parsing | ready
  const [uploadError, setUploadError] = useState('');
  const [manual, setManual] = useState(false);
  const [bill, setBill] = useState(EMPTY_BILL);

  const [z, setZ] = useState(DEFAULT_Z);
  const [a, setA] = useState(DEFAULT_A);
  // Whichever of b / c the user last edited drives the other.
  const [sizing, setSizing] = useState({ source: 'c', value: DEFAULT_C });

  const [solar, setSolar] = useState({ status: 'idle', data: null, error: '' });
  const [showSolar, setShowSolar] = useState(false); // solar section revealed by the button
  const [pinnedMonth, setPinnedMonth] = useState(null); // calendar index of the month tapped on the chart
  const [showBattery, setShowBattery] = useState(false); // battery section revealed
  const [showLeadForm, setShowLeadForm] = useState(false);

  // ---- Bill upload & parsing ----------------------------------------------------------
  async function handleFile(file) {
    setUploadError('');
    setStage('parsing');
    try {
      const payload = await fileToPayload(file);
      const r = await fetch('/api/parse-bill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      let parsed = null;
      if (r.ok) {
        parsed = await r.json();
      } else {
        // Diagnostic only (browser console) — the homeowner sees the manual-entry prompt.
        const body = await r.text();
        console.error('[sunx] parse-bill failed', r.status, body.slice(0, 500));
      }
      const months = parsed ? toTwelveMonths(parsed.monthlyUsage) : null;

      setBill({
        utility: parsed?.utility || null,
        address: parsed?.address || '',
        rate: parsed?.energyChargePerKwh || 0,
        months: months || new Array(12).fill(0),
      });
      setZ(defaultEscalation(parsed?.utility));
      setManual(!months);
      setStage('ready');
    } catch (err) {
      // File couldn't be prepared (unreadable image / too large): stay on upload with a message.
      setUploadError(err.message || 'Something went wrong. Please try again.');
      setStage('upload');
    }
  }

  // ---- Solar resource (PVWatts) whenever the address changes --------------------------
  useEffect(() => {
    if (stage !== 'ready' || !bill.address) {
      setSolar({ status: 'idle', data: null, error: '' });
      return;
    }
    let cancelled = false;
    setSolar((s) => ({ ...s, status: 'loading', error: '' }));
    fetch('/api/solar-resource', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: bill.address }),
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          console.error('[sunx] solar-resource failed', r.status, body);
          const err = new Error(body.error || 'Could not estimate solar production');
          err.loc = Number.isFinite(body.lat) ? { lat: body.lat, lon: body.lon } : null;
          throw err;
        }
        return body;
      })
      .then((data) => !cancelled && setSolar({ status: 'ready', data, error: '', loc: { lat: data.lat, lon: data.lon } }))
      .catch((err) => !cancelled && setSolar({ status: 'error', data: null, error: err.message, loc: err.loc || null }));
    return () => {
      cancelled = true;
    };
  }, [stage, bill.address]);

  // ---- Derived values -----------------------------------------------------------------
  const y = sum(bill.months); // annual kWh
  const x = annualCost(y, bill.rate); // annual $
  const w = futureSpend(x, z, a);
  const utilityName = bill.utility || 'your utility';

  const kwhPerKw = solar.data?.acAnnualPerKw || 0;
  const maxB = kwhPerKw && y ? sizeForOffset(MAX_C, y, kwhPerKw) : 0;
  const b = sizing.source === 'c' ? sizeForOffset(sizing.value, y, kwhPerKw) : Math.min(sizing.value, maxB);
  const actualOffset = offsetForSize(b, y, kwhPerKw); // what the rounded b actually produces
  const c = sizing.source === 'c' ? sizing.value : actualOffset;
  // Savings are capped at 100% of the bill: excess production earns nothing for now
  // (utility-specific net metering / buyback rules come later).
  const savingsOffset = Math.min(actualOffset, 100);
  const { low: d, high: e } = costRange(b);

  const production = useMemo(
    () => (solar.data ? monthlyProduction(b, solar.data.acMonthlyPerKw) : null),
    [b, solar.data]
  );

  // Solar cash flow starts at minus the HIGH end of the cost range (conservative), then adds
  // year-1 bill savings compounded by the utility rate increase each year.
  const cashflow = useMemo(
    () => cumulativeCashFlow({ systemCost: e, x, offsetPct: savingsOffset, zPct: z, years: CASHFLOW_YEARS }),
    [e, x, savingsOffset, z]
  );
  const breakeven = breakevenYear(cashflow);
  const spendSeries = useMemo(() => cumulativeSpend(x, z, CASHFLOW_YEARS), [x, z]);

  const hasUsage = y > 0;
  const solarReady = hasUsage && solar.status === 'ready' && kwhPerKw > 0;
  const solarShown = showSolar && solarReady;

  // ---- Render -------------------------------------------------------------------------
  return (
    <div className="page">
      <header className="brand">
        <span className="logo">
          sun<span>x</span>
        </span>
      </header>

      <main>
        {stage !== 'ready' && (
          <Upload onFile={handleFile} busy={stage === 'parsing'} error={uploadError} />
        )}

        {stage === 'ready' && (
          <>
            {showSolar && (
              <SectionNav
                items={SECTIONS}
                watch={`${solarReady}-${showBattery}`}
                onSelect={(id) => id === 'battery' && setShowBattery(true)}
              />
            )}

            {/* ---------------- Energy consumption ---------------- */}
            <section id="consumption" className="section">
              <BillDetails bill={bill} manual={manual} onChange={(patch) => setBill((bl) => ({ ...bl, ...patch }))} />

              {hasUsage && (
                <div className="card usage">
                  <UsageChart
                    months={bill.months}
                    production={solarShown ? production : null}
                    selected={solarShown ? pinnedMonth : null}
                    onSelect={solarShown ? setPinnedMonth : undefined}
                  />
                  {solarShown && (
                    <MonthDetail month={pinnedMonth} consumption={bill.months} production={production} utility={bill.utility} />
                  )}

                  <p className="copy copy-hero">
                    In a year, you spend <strong>{dollars(x)}</strong> to use <strong>{kwh(y)} kWh</strong>. If{' '}
                    {utilityName} continues raising rates{' '}
                    <InlineNumber value={z} onCommit={setZ} min={0} max={100} decimals={2} suffix="%" label="Annual rate increase" />{' '}
                    each year, in <InlineNumber value={a} onCommit={setA} min={0} max={100} label="Years" /> years you
                    will have spent <strong>{dollars(w)}</strong>.
                  </p>
                  <SpendChart series={spendSeries} />
                </div>
              )}

              {hasUsage && !showSolar && (
                <button
                  type="button"
                  className="btn btn-primary reveal-solar"
                  onClick={() => {
                    setShowSolar(true);
                    setTimeout(() => document.getElementById('solar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                  }}
                >
                  <span>By comparison, see how much it will cost to generate your own power with solar</span>
                  <svg className="reveal-arrow" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <path d="M12 5v14M5 12l7 7 7-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </section>

            {/* ---------------- Solar generation ---------------- */}
            {hasUsage && showSolar && (
              <section id="solar" className="section">
                <div className="card solar">
                  {solar.loc && <RoofImage lat={solar.loc.lat} lon={solar.loc.lon} />}
                  {solar.status === 'loading' && <p className="muted">Estimating solar production for your address…</p>}
                  {solar.status === 'idle' && <p className="muted">Enter your home address above to size a solar system.</p>}
                  {solar.status === 'error' && <p className="error">{solar.error}. Check the address above.</p>}
                  {solarReady && (
                    <p className="copy">
                      A{' '}
                      <InlineNumber
                        value={b}
                        onCommit={(v) => setSizing({ source: 'b', value: v })}
                        min={0}
                        max={maxB}
                        decimals={2}
                        fixed
                        label="System size in kW"
                      />{' '}
                      kW solar system can offset{' '}
                      <InlineNumber
                        value={c}
                        onCommit={(v) => setSizing({ source: 'c', value: v })}
                        min={0}
                        max={MAX_C}
                        decimals={1}
                        suffix="%"
                        label="Offset percentage"
                      />{' '}
                      of your electricity bill and costs{' '}
                      <strong>
                        {dollars(d)}–{dollars(e)}
                      </strong>
                      .
                    </p>
                  )}
                </div>

                {solarReady && (
                  <div className="card solar-cashflow">
                    <p className="copy">
                      {breakeven === null ? (
                        <>This will result in a payback period of more than {CASHFLOW_YEARS} years.</>
                      ) : (
                        <>
                          This will result in a <strong>{breakeven} year</strong> payback period.
                        </>
                      )}{' '}
                      After {SAVINGS_YEAR} years you'll have saved <strong>{dollars(cashflow[SAVINGS_YEAR])}</strong>.
                    </p>
                    <SolarCashFlowChart series={cashflow} />
                  </div>
                )}

                {solarReady && (
                  <div className="cta">
                    <button
                      type="button"
                      className={`btn ${showLeadForm ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setShowLeadForm(true)}
                    >
                      Submit this preliminary design to a local consultant to provide exact shading map, panel layout, and quote
                    </button>
                    <span className="cta-or">OR</span>
                    <button
                      type="button"
                      className={`btn ${showBattery ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => {
                        setShowBattery(true);
                        setTimeout(() => document.getElementById('battery')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                      }}
                    >
                      Add batteries for off-grid capabilities
                    </button>
                  </div>
                )}

                {solarReady && showLeadForm && (
                  <LeadForm
                    initialAddress={bill.address}
                    design={{
                      utility: bill.utility,
                      address: bill.address,
                      energyChargePerKwh: bill.rate,
                      monthlyKwh: bill.months,
                      annualKwh: y,
                      annualCost: x,
                      rateEscalationPct: z,
                      years: a,
                      systemKw: b,
                      offsetPct: c,
                      costLow: d,
                      costHigh: e,
                      monthlyProductionKwh: production,
                      breakevenYear: breakeven,
                      cashflow30: cashflow[SAVINGS_YEAR],
                    }}
                  />
                )}
              </section>
            )}

            {/* ---------------- Battery storage ---------------- */}
            {hasUsage && showSolar && showBattery && (
              <section id="battery" className="section">
                <BatteryPlaceholder />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
