import { Chart } from 'react-chartjs-2';
import { COLORS } from '../lib/chartSetup.js';
import { DISPLAY_MONTHS, MONTH_LABELS } from '../lib/calc.js';
import { kwh } from '../lib/format.js';

/**
 * Consumption bars (Apr → Mar). When `production` is given, translucent orange production bars
 * are drawn over the consumption bars (same slot, not side by side) so both stay visible.
 * Tooltip: consumption, production, and net for the hovered month.
 */
export default function UsageChart({ months, production, selected = null, onSelect }) {
  const labels = DISPLAY_MONTHS.map((i) => MONTH_LABELS[i]);
  const cons = DISPLAY_MONTHS.map((i) => months[i]);
  const prod = production ? DISPLAY_MONTHS.map((i) => production[i]) : null;

  const datasets = [
    {
      label: 'Consumption',
      data: cons,
      backgroundColor: COLORS.bar,
      hoverBackgroundColor: '#5C5C63',
      borderRadius: 4,
      maxBarThickness: 44,
      grouped: false,
      order: 2,
    },
  ];

  if (prod) {
    datasets.push({
      label: 'Solar production',
      data: prod,
      backgroundColor: 'rgba(216, 90, 48, 0.55)',
      hoverBackgroundColor: 'rgba(216, 90, 48, 0.7)',
      borderColor: COLORS.orange,
      borderWidth: 1.5,
      borderRadius: 4,
      maxBarThickness: 44,
      grouped: false,
      order: 1,
    });
  }

  // Pinned month (calendar index) → position on the Apr→Mar axis, outlined in white.
  const selPos = selected === null ? -1 : DISPLAY_MONTHS.indexOf(selected);
  const outline = (base) => cons.map((_, i) => (i === selPos ? '#FFFFFF' : base));
  datasets[0].borderColor = outline('rgba(0,0,0,0)');
  datasets[0].borderWidth = cons.map((_, i) => (i === selPos ? 2 : 0));
  if (prod) datasets[1].borderColor = outline(COLORS.orange);

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
