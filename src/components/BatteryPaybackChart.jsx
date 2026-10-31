import { Bar } from 'react-chartjs-2';
import { COLORS } from '../lib/chartSetup.js';
import { dollars } from '../lib/format.js';

export const PAYBACK_COLORS = { cost: '#D9775A', solar: '#7FA886', incentive: '#E0B85E' };

// Annotations: total cost under year 0, "Paid off in Year N", and the final net above the last bar.
const annotations = {
  id: 'paybackNotes',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts) return;
    const { ctx, scales, chartArea } = chart;
    ctx.save();
    ctx.font = "700 12px 'Manrope', system-ui, sans-serif";
    // Year 0 total cost
    ctx.fillStyle = PAYBACK_COLORS.cost;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Year 0: ${dollars(opts.total)} total cost`, scales.x.getPixelForValue(0) - 8, scales.y.getPixelForValue(-opts.total) + 6);
    // Paid off
    if (opts.paybackYear !== null && opts.paybackYear <= opts.years) {
      const x = scales.x.getPixelForValue(opts.paybackYear);
      ctx.fillStyle = COLORS.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`Paid off in Year ${opts.paybackYear}`, x, scales.y.getPixelForValue(Math.max(opts.paybackTop, 0)) - 10);
    }
    // Final net
    const xl = scales.x.getPixelForValue(opts.years);
    ctx.fillStyle = opts.finalNet >= 0 ? COLORS.ink : PAYBACK_COLORS.cost;
    ctx.textAlign = xl > chartArea.right - 40 ? 'right' : 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(dollars(opts.finalNet), Math.min(xl + 10, chart.width - 2), scales.y.getPixelForValue(Math.max(opts.finalNet, 0)) - 6);
    ctx.restore();
  },
};

/**
 * Floating stacked bars per year, starting from minus the total cost:
 * green = cumulative solar savings, yellow = cumulative grid-services incentives,
 * red = cost not yet recovered (up to $0). Bars above $0 show net gain.
 */
export default function BatteryPaybackChart({ rows, paybackYear }) {
  const total = rows[0].total;
  const solar = rows.map((r) => (r.year === 0 ? null : [-total, -total + r.solarCum]));
  const incentive = rows.map((r) => (r.year === 0 ? null : [-total + r.solarCum, -total + r.solarCum + r.incentiveCum]));
  const cost = rows.map((r) => (r.net < 0 ? [r.net, 0] : null));
  const last = rows[rows.length - 1];

  const bar = { grouped: false, borderSkipped: false, borderRadius: 0, maxBarThickness: 22 };
  const data = {
    labels: rows.map((r) => String(r.year)),
    datasets: [
      { ...bar, label: 'Cost not yet recovered', data: cost, backgroundColor: PAYBACK_COLORS.cost },
      { ...bar, label: 'Solar savings', data: solar, backgroundColor: PAYBACK_COLORS.solar },
      { ...bar, label: 'Grid services incentive', data: incentive, backgroundColor: PAYBACK_COLORS.incentive },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 24, right: 8 } },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      paybackNotes: {
        total,
        years: last.year,
        paybackYear,
        paybackTop: paybackYear !== null && rows[paybackYear] ? rows[paybackYear].net : 0,
        finalNet: last.net,
      },
      tooltip: {
        callbacks: {
          title: (items) => `Year ${items[0].label}`,
          label: () => null,
          afterBody: (items) => {
            const r = rows[items[0].dataIndex];
            return [
              ` Solar savings so far: ${dollars(r.solarCum)}`,
              ` Incentives so far: ${dollars(r.incentiveCum)}`,
              ` Net: ${dollars(r.net)}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        title: { display: true, text: 'Year' },
        ticks: { autoSkip: false, maxRotation: 0, callback: (_, i) => (i % 5 === 0 ? i : '') },
      },
      y: {
        suggestedMin: -total * 1.3,
        ticks: { callback: (v) => dollars(v) },
        grid: { color: (ctx) => (ctx.tick.value === 0 ? 'rgba(255,255,255,0.45)' : COLORS.grid) },
      },
    },
  };

  return (
    <div className="chart chart-battery-payback">
      <Bar data={data} options={options} plugins={[annotations]} />
    </div>
  );
}
