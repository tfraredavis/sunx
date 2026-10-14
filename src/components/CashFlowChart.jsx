import { Bar } from 'react-chartjs-2';
import { COLORS } from '../lib/chartSetup.js';
import { dollars } from '../lib/format.js';

/** Cumulative cash flow by year, 0..40. Negative years muted, positive years orange. */
export default function CashFlowChart({ series }) {
  const labels = series.map((_, i) => String(i));

  const data = {
    labels,
    datasets: [
      {
        label: 'Cumulative cash flow',
        data: series,
        backgroundColor: series.map((v) => (v >= 0 ? COLORS.orange : COLORS.bar)),
        borderRadius: 2,
        maxBarThickness: 18,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => `Year ${items[0].label}`,
          label: (c) => ` ${dollars(c.parsed.y)}`,
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
        ticks: { callback: (v) => dollars(v) },
        grid: { color: (ctx) => (ctx.tick.value === 0 ? 'rgba(255,255,255,0.35)' : COLORS.grid) },
      },
    },
  };

  return (
    <div className="chart chart-cashflow">
      <Bar data={data} options={options} />
    </div>
  );
}
