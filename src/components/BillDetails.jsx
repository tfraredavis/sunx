import { useEffect, useState } from 'react';
import { DISPLAY_MONTHS, MONTH_LABELS } from '../lib/calc.js';

/** Editable values pulled from the bill: service address, energy charge $/kWh, and 12 months of kWh. */
export default function BillDetails({ bill, onChange, manual }) {
  const [address, setAddress] = useState(bill.address || '');
  const [rate, setRate] = useState(bill.rate ? String(bill.rate) : '');
  const [months, setMonths] = useState(bill.months.map((m) => (m ? String(m) : '')));

  // Keep local drafts in sync if the bill is replaced (e.g. a new upload).
  useEffect(() => setAddress(bill.address || ''), [bill.address]);
  useEffect(() => setRate(bill.rate ? String(bill.rate) : ''), [bill.rate]);
  useEffect(() => setMonths(bill.months.map((m) => (m ? String(m) : ''))), [bill.months]);

  const commitAddress = () => {
    const v = address.trim();
    if (v !== (bill.address || '')) onChange({ address: v });
  };

  const commitRate = () => {
    const n = parseFloat(rate);
    const v = Number.isFinite(n) && n >= 0 ? n : 0;
    if (v !== bill.rate) onChange({ rate: v });
  };

  const commitMonth = (i) => {
    const n = parseFloat(months[i]);
    const v = Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    if (v !== bill.months[i]) {
      const next = [...bill.months];
      next[i] = v;
      onChange({ months: next });
    }
  };

  const onEnter = (e) => e.key === 'Enter' && e.currentTarget.blur();

  return (
    <section className="card bill-details">
      {manual && (
        <p className="notice">
          We couldn’t read your bill. Please enter your monthly electricity consumption below.
        </p>
      )}

      <div className="field-row">
        <label className="field grow">
          <span>Home address</span>
          <input
            type="text"
            value={address}
            placeholder="Street, City, ST ZIP"
            onChange={(e) => setAddress(e.target.value)}
            onBlur={commitAddress}
            onKeyDown={onEnter}
          />
        </label>
        <label className="field rate">
          <span>Energy charge ($/kWh)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.0001"
            value={rate}
            placeholder="0.1200"
            onChange={(e) => setRate(e.target.value)}
            onBlur={commitRate}
            onKeyDown={onEnter}
          />
        </label>
      </div>

      <fieldset className="months">
        <legend>Monthly consumption (kWh)</legend>
        <div className="months-grid">
          {DISPLAY_MONTHS.map((i) => (
            <label key={i} className="field month">
              <span>{MONTH_LABELS[i]}</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={months[i]}
                placeholder="0"
                onChange={(e) => {
                  const next = [...months];
                  next[i] = e.target.value;
                  setMonths(next);
                }}
                onBlur={() => commitMonth(i)}
                onKeyDown={onEnter}
              />
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
