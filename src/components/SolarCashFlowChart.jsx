import { Bar } from 'react-chartjs-2';
import { COLORS } from '../lib/chartSetup.js';
import { dollars } from '../lib/format.js';

const GREEN = '#1F8A4C';

/**
 * Cumulative cash flow of going solar, years 0..40: starts at minus the system cost,
 * then climbs by each year's bill savings. Gray while negative, dark green once positive.
 */
export default function SolarCashFlowChart({ series }) {
  const data = {
    labels: series.map((_, i) => String(i)),
    datasets: [
      {
        label: 'Cumulative cash flow',
        data: series,
        backgroundColor: series.map((v) => (v >= 0 ? GREEN : COLORS.bar)),
        hoverBackgroundColor: series.map((v) => (v >= 0 ? '#26A35A' : '#5C5C63')),
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
          label: (c) => ` ${c.parsed.y >= 0 ? 'Saved so far' : 'Not yet paid back'}: ${dollars(Math.abs(c.parsed.y))}`,
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
    <div className="chart chart-solar-cashflow">
      <Bar data={data} options={options} />
    </div>
  );
}
