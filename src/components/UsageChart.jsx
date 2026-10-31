import { Chart } from 'react-chartjs-2';
import { COLORS } from '../lib/chartSetup.js';
import { DISPLAY_MONTHS, MONTH_LABELS } from '../lib/calc.js';
import { kwh } from '../lib/format.js';

/**
 * Consumption bars (Apr → Mar). When `production` is given, an orange production bar is drawn
 * to the right of each month's consumption bar.
 * Tooltip: consumption, production, and net for the hovered month.
 */
export default function UsageChart({ months, production, selected = null, onSelect }) {
  const labels = DISPLAY_MONTHS.map((i) => MONTH_LABELS[i]);
  const cons = DISPLAY_MONTHS.map((i) => months[i]);
  const prod = production ? DISPLAY_MONTHS.map((i) => production[i]) : null;

  // Bars are half the old width. With solar, each month shows the gray consumption bar with a
  // separate orange production bar to its right (grouped side by side, same width each).
  const datasets = [
    {
      label: 'Consumption',
      data: cons,
      backgroundColor: COLORS.bar,
      hoverBackgroundColor: '#5C5C63',
      borderRadius: 3,
      barPercentage: prod ? 0.9 : 0.45,
      maxBarThickness: 22,
    },
  ];

  if (prod) {
    datasets.push({
      label: 'Solar production',
      data: prod,
      backgroundColor: COLORS.orange,
      hoverBackgroundColor: '#E46A40',
      borderColor: COLORS.orange,
      borderWidth: 0,
      borderRadius: 3,
      barPercentage: 0.9,
      maxBarThickness: 22,
    });
  }

  // Pinned month (calendar index) → position on the Apr→Mar axis, outlined in white.
  const selPos = selected === null ? -1 : DISPLAY_MONTHS.indexOf(selected);
  const outline = (base) => cons.map((_, i) => (i === selPos ? '#FFFFFF' : base));
  datasets[0].borderColor = outline('rgba(0,0,0,0)');
  datasets[0].borderWidth = cons.map((_, i) => (i === selPos ? 2 : 0));
  if (prod) {
    datasets[1].borderColor = outline(COLORS.orange);
    datasets[1].borderWidth = prod.map((_, i) => (i === selPos ? 2 : 0));
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    onClick: (evt, _els, chart) => {
      if (!onSelect) return;
      const hit = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, false)[0];
      if (hit) onSelect(DISPLAY_MONTHS[hit.index]);
    },
    onHover: (evt, els) => {
      if (onSelect && evt.native?.target) evt.native.target.style.cursor = els.length ? 'pointer' : 'default';
    },
    plugins: {
      legend: { position: 'bottom', labels: { sort: (a, b) => a.datasetIndex - b.datasetIndex } },
      tooltip: {
        itemSort: (a, b) => a.datasetIndex - b.datasetIndex,
        callbacks: {
          label: (c) => ` ${c.dataset.label}: ${kwh(c.parsed.y)} kWh`,
          afterBody: (items) => {
            if (!prod) return [];
            const i = items[0].dataIndex;
            const net = cons[i] - prod[i];
            if (Math.round(net) === 0) return ['', ' Net: 0 kWh'];
            return ['', net > 0 ? ` Net: ${kwh(net)} kWh from the grid` : ` Net: ${kwh(-net)} kWh sent to the grid`];
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        ticks: { callback: (v) => kwh(v) },
        title: { display: true, text: 'kWh' },
      },
    },
  };

  return (
    <div className="chart chart-usage">
      <Chart type="bar" data={{ labels, datasets }} options={options} />
    </div>
  );
}
