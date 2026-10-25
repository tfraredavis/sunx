import { Chart } from 'react-chartjs-2';
import { COLORS } from '../lib/chartSetup.js';
import { dollars } from '../lib/format.js';

// Dashed vertical marker at breakeven. Reads its position from options.plugins.breakevenMarker
// so it updates when the inputs change.
const breakevenMarker = {
  id: 'breakevenMarker',
  afterDatasetsDraw(chart, _args, opts) {
    if (opts?.index === null || opts?.index === undefined) return;
    const x = chart.scales.x.getPixelForValue(opts.index);
    const { top, bottom, right } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, top + 16);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#F2F2F2';
    ctx.font = "700 12px 'Manrope', system-ui, sans-serif";
    const alignRight = x > right - 130;
    ctx.textAlign = alignRight ? 'right' : 'left';
    ctx.fillText(`Breakeven · Year ${opts.year}`, alignRight ? x - 6 : x + 6, top + 10);
    ctx.restore();
  },
};

/**
 * Cumulative electricity spend, years 1..40.
 * Gray bars: staying with the utility. Orange line (when `solarSeries` is given): going solar —
 * system cost up front plus the remaining bill. Where they cross is breakeven, marked with a dashed line.
 */
export default function SpendChart({ series, solarSeries = null, breakeven = null }) {
  const labels = series.map((_, i) => String(i + 1));

  const datasets = [
    {
      type: 'bar',
      label: solarSeries ? 'Without solar' : 'Cumulative electricity expense',
      data: series,
      backgroundColor: COLORS.bar,
      hoverBackgroundColor: '#5C5C63',
      borderRadius: 2,
      maxBarThickness: 18,
      order: 2,
    },
  ];
  if (solarSeries) {
    datasets.push({
      type: 'line',
      label: 'With solar',
      data: solarSeries,
      borderColor: COLORS.orange,
      backgroundColor: COLORS.orange,
      borderWidth: 3,
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.2,
      order: 1,
    });
  }

  // Breakeven year → bar index (labels start at year 1).
  const breakevenIdx = solarSeries && breakeven && breakeven >= 1 ? breakeven - 1 : null;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: solarSeries ? 8 : 0 } },
    plugins: {
      breakevenMarker: { index: breakevenIdx, year: breakeven },
      legend: { display: Boolean(solarSeries), position: 'bottom', labels: { sort: (a, b) => a.datasetIndex - b.datasetIndex } },
      tooltip: {
        itemSort: (a, b) => a.datasetIndex - b.datasetIndex,
        callbacks: {
          title: (items) => `Year ${items[0].label}`,
          label: (c) =>
            solarSeries ? ` ${c.dataset.label}: ${dollars(c.parsed.y)}` : ` Total spent: ${dollars(c.parsed.y)}`,
          footer: (items) => {
            if (!solarSeries) return '';
            const i = items[0].dataIndex;
            const gap = series[i] - solarSeries[i];
            return gap >= 0 ? `Savings so far: ${dollars(gap)}` : `Not yet paid back: ${dollars(-gap)}`;
          },
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
      <Chart type="bar" data={{ labels, datasets }} options={options} plugins={[breakevenMarker]} />
    </div>
  );
}
