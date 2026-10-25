import { useEffect, useState } from 'react';
import { kwh } from '../lib/format.js';

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const isPse = (utility) => /puget sound energy|\bpse\b/i.test(utility || '');

/**
 * Pinned detail panel for the month the user clicked/tapped on the usage chart.
 * `month` is a calendar index (0 = Jan) or null.
 */
export default function MonthDetail({ month, consumption, production, utility }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [month]);

  if (month === null) return <p className="month-hint">Tap a month to see details.</p>;

  const cons = consumption[month];
  const prod = production[month];
  const net = cons - prod;
  const surplus = Math.round(-net);
  const showNetMetering = surplus > 0 && isPse(utility);

  return (
    <div className="month-detail" aria-live="polite">
      <h3>{FULL_MONTHS[month]}</h3>
      <dl>
        <div>
          <dt>Consumption</dt>
          <dd>{kwh(cons)} kWh</dd>
        </div>
        <div>
          <dt>Production</dt>
          <dd className="is-prod">{kwh(prod)} kWh</dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd>
            {Math.round(net) === 0
              ? '0 kWh'
              : net > 0
                ? `${kwh(net)} kWh from the grid`
                : `${kwh(-net)} kWh sent to the grid`}
          </dd>
        </div>
      </dl>

      {showNetMetering && (
        <>
          <button type="button" className="info-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span className="info-icon" aria-hidden="true">i</span>
            Learn more about your utility’s net metering
          </button>
          {open && (
            <p className="info-text">
              PSE stores all {kwh(surplus)} kWh of excess energy credits for you to use in later months.
            </p>
          )}
        </>
      )}
    </div>
  );
}
