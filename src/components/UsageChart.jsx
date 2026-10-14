import { Chart } from 'react-chartjs-2';
import { COLORS } from '../lib/chartSetup.js';
import { DISPLAY_MONTHS, MONTH_LABELS } from '../lib/calc.js';
import { kwh } from '../lib/format.js';

/** Consumption bars (Apr → Mar) with an optional production line overlay. */
export default function UsageChart({ months, production }) {
  const labels = DISPLAY_MONTHS.map((i) => MONTH_LABELS[i]);

  const datasets = [
    {
      type: 'bar',
      label: 'Consumption',
      data: DISPLAY_MONTHS.map((i) => months[i]),
      backgroundColor: COLORS.bar,
      hoverBackgroundColor: '#5C5C63',
      borderRadius: 4,
      maxBarThickness: 36,
      order: 2,
    },
  ];

  if (production) {
    datasets.push({
      type: 'line',
      label: 'Solar production',
      data: DISPLAY_MONTHS.map((i) => production[i]),
      borderColor: COLORS.orange,
      backgroundColor: COLORS.orange,
      borderWidth: 3,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.35,
      order: 1,
    });
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom' },
      tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${kwh(c.parsed.y)} kWh` } },
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
