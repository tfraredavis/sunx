import { Chart } from 'react-chartjs-2';
import { COLORS } from '../lib/chartSetup.js';
import { dollars } from '../lib/format.js';

const GREEN = '#1F8A4C';
const LABEL_YEARS = [25, 40];

// Draws net cumulative cash flow above the year-25 and year-40 bars.
// Reads values from options.plugins.cashflowLabels so it updates with the inputs.
const cashflowLabels = {
  id: 'cashflowLabels',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.items?.length) return;
    const { ctx, scales, chartArea } = chart;
    ctx.save();
    ctx.font = "800 13px 'Manrope', system-ui, sans-serif";
    ctx.textBaseline = 'bottom';
    for (const { index, top, value } of opts.items) {
      const x = scales.x.getPixelForValue(index);
      const y = scales.y.getPixelForValue(top) - 6;
      const text = dollars(value);
      const w = ctx.measureText(text).width;
      ctx.textAlign = x + w / 2 > chartArea.right ? 'right' : 'center';
      ctx.fillStyle = value >= 0 ? GREEN : COLORS.text;
      ctx.fillText(text, ctx.textAlign === 'right' ? Math.min(x + 9, chart.width - 2) : x, y);
    }
    ctx.restore();
  },
};

/**
 * Cumulative electricity spend, years 1..40.
 * Bars: staying with the utility. Orange line (when `solarSeries` is given): going solar —
 * system cost up front plus the remaining bill. Once solar is shown, the part of each bar above
 * the line (net positive cash flow) is dark green, and years 25 and 40 are labeled with net cash flow.
 */
export default function SpendChart({ series, solarSeries = null, cashflow = null }) {
  const labels = series.map((_, i) => String(i + 1));
  const withSolar = Boolean(solarSeries);

  const base = withSolar ? series.map((v, i) => Math.min(v, Math.max(0, solarSeries[i]))) : series;
  const above = withSolar ? series.map((v, i) => v - base[i]) : null;

  const bar = { type: 'bar', borderRadius: 2, maxBarThickness: 18, stack: 'spend', borderSkipped: false };
  const datasets = [
    {
      ...bar,
      label: withSolar ? 'Without solar' : 'Cumulative electricity expense',
      data: base,
      backgroundColor: COLORS.bar,
      hoverBackgroundColor: '#5C5C63',
      order: 2, // stacking follows `order`: gray base sits on the axis
    },
  ];
  if (withSolar) {
    datasets.push(
      {
        ...bar,
        label: 'Net positive cash flow',
        data: above,
        backgroundColor: GREEN,
        hoverBackgroundColor: '#26A35A',
        order: 3, // green stacks above the gray base
      },
      {
        type: 'line',
        label: 'With solar',
        data: solarSeries,
        stack: 'solar',
        borderColor: COLORS.orange,
        backgroundColor: COLORS.orange,
        borderWidth: 3,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.2,
        order: 1,
      }
    );
  }

  const labelItems =
    withSolar && cashflow
      ? LABEL_YEARS.filter((yr) => yr <= series.length).map((yr) => ({ index: yr - 1, top: series[yr - 1], value: cashflow[yr] }))
      : [];

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: withSolar ? 22 : 0, right: withSolar ? 6 : 0 } },
    plugins: {
      cashflowLabels: { items: labelItems },
      legend: {
        display: withSolar,
        position: 'bottom',
        labels: { sort: (a, b) => [0, 2, 1].indexOf(a.datasetIndex) - [0, 2, 1].indexOf(b.datasetIndex) },
      },
      tooltip: {
        // One row per scenario: hide the green segment row; totals come from the full series.
        filter: (item) => item.dataset.label !== 'Net positive cash flow',
        itemSort: (a, b) => a.datasetIndex - b.datasetIndex,
        callbacks: {
          title: (items) => `Year ${items[0].label}`,
          label: (c) => {
            const i = c.dataIndex;
            if (!withSolar) return ` Total spent: ${dollars(series[i])}`;
            return c.dataset.type === 'line'
              ? ` With solar: ${dollars(solarSeries[i])}`
              : ` Without solar: ${dollars(series[i])}`;
          },
          footer: (items) => {
            if (!withSolar) return '';
            const i = items[0].dataIndex;
            const gap = series[i] - solarSeries[i];
            return gap >= 0 ? `Savings so far: ${dollars(gap)}` : `Not yet paid back: ${dollars(-gap)}`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        title: { display: true, text: 'Year' },
        ticks: { autoSkip: false, maxRotation: 0, callback: (_, i) => ((i + 1) % 5 === 0 || i === 0 ? i + 1 : '') },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: { callback: (v) => dollars(v) },
      },
    },
  };

  return (
    <div className="chart chart-spend">
      <Chart type="bar" data={{ labels, datasets }} options={options} plugins={[cashflowLabels]} />
    </div>
  );
}
