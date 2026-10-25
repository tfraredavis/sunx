import { Bar } from 'react-chartjs-2';
import { COLORS } from '../lib/chartSetup.js';
import { dollars } from '../lib/format.js';

/** Cumulative electricity spend with the utility, years 1..40. */
export default function SpendChart({ series }) {
  const data = {
    labels: series.map((_, i) => String(i + 1)),
    datasets: [
      {
        label: 'Cumulative electricity expense',
        data: series,
        backgroundColor: COLORS.bar,
        hoverBackgroundColor: '#5C5C63',
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
          label: (c) => ` Total spent: ${dollars(c.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        title: { display: true, text: 'Year' },
        ticks: { autoSkip: false, maxRotation: 0, callback: (_, i) => ((i + 1) % 5 === 0 || i === 0 ? i + 1 : '') },
      },
      y: {
        beginAtZero: true,
        ticks: { callback: (v) => dollars(v) },
      },
    },
  };

  return (
    <div className="chart chart-spend">
      <Bar data={data} options={options} />
    </div>
  );
}
