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
  if (month === null) return <p className="month-hint">Tap a month to see details.</p>;

  const cons = consumption[month];
  const prod = production[month];
  const net = cons - prod;
  const rounded = Math.round(net);
  const pse = isPse(utility);

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
            {rounded === 0
              ? '0 kWh'
              : net > 0
                ? `${kwh(net)} kWh from the grid`
                : `${kwh(-net)} kWh sent to the grid`}
          </dd>
        </div>
      </dl>

      {pse && rounded < 0 && (
        <p className="info-text">
          PSE offers a 1-1 net metering program, which means they bank all {kwh(-net)} kWh of excess energy produced
          in {FULL_MONTHS[month]} for you to use in later months.
        </p>
      )}
      {pse && rounded > 0 && (
        <p className="info-text">
          You can still spend $0 on electricity this month by using energy credits built up in previous months.
        </p>
      )}
    </div>
  );
}
