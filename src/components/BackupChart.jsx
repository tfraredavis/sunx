import { Bar } from 'react-chartjs-2';
import { COLORS } from '../lib/chartSetup.js';
import { DISPLAY_MONTHS, MONTH_LABELS } from '../lib/calc.js';

const BATTERY = '#D85A30';
const SOLAR = '#FAC775';

// Labels above bars: bold ∞ for indefinite months, total hours for the rest.
const topLabels = {
  id: 'backupTopLabels',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.items) return;
    const { ctx, scales } = chart;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    opts.items.forEach((it, i) => {
      const x = scales.x.getPixelForValue(i);
      const y = scales.y.getPixelForValue(it.top) - 6;
      if (it.indefinite) {
        ctx.font = "bold 20px Georgia, serif";
        ctx.fillStyle = '#F0A27F';
        ctx.fillText('∞', x, y + 2);
      } else {
        ctx.font = "700 12px 'Manrope', system-ui, sans-serif";
        ctx.fillStyle = '#F0A27F';
        ctx.fillText(`${Math.round(it.total)}h`, x, y);
      }
    });
    ctx.restore();
  },
};

/** Stacked monthly backup hours (Apr → Mar). `hours` is indexed by calendar month. */
export default function BackupChart({ hours }) {
  const ordered = DISPLAY_MONTHS.map((m) => hours[m]);
  const finite = ordered.filter((h) => !h.indefinite).map((h) => h.total);
  const maxBattery = Math.max(...ordered.map((h) => (Number.isFinite(h.batteryHours) ? h.batteryHours : 0)), 1);
  // Top of the scale (labeled ∞): a bit above the longest finite month.
  const base = finite.length ? Math.max(...finite) : maxBattery * 2;
  const yMax = Math.max(10, Math.ceil((base * 1.15) / 10) * 10);

  const batteryData = ordered.map((h) => Math.min(h.batteryHours, yMax));
  const solarData = ordered.map((h, i) => (h.indefinite ? yMax - batteryData[i] : Math.min(h.solarHours, yMax - batteryData[i])));

  const data = {
    labels: DISPLAY_MONTHS.map((m) => MONTH_LABELS[m]),
    datasets: [
      { label: 'Battery-only hours', data: batteryData, backgroundColor: BATTERY, borderRadius: 0, maxBarThickness: 44 },
      { label: 'Solar recharge added', data: solarData, backgroundColor: SOLAR, borderRadius: 3, maxBarThickness: 44 },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 32 } },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      backupTopLabels: {
        items: ordered.map((h, i) => ({ indefinite: h.indefinite, total: h.total, top: batteryData[i] + solarData[i] })),
      },
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          label: () => null,
          afterBody: (items) => {
            const h = ordered[items[0].dataIndex];
            return [
              ` Outage use: ${h.load.toFixed(1)} kWh/day`,
              ` Solar: ${h.solar.toFixed(1)} kWh/day`,
              ` Backup: ${h.indefinite ? 'indefinite' : `${Math.round(h.total)} hours`}`,
            ];
          },
        },
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false } },
      y: {
        stacked: true,
        min: 0,
        max: yMax,
        title: { display: true, text: 'Hours of backup' },
        afterBuildTicks: (axis) => {
          if (!axis.ticks.some((t) => t.value === yMax)) axis.ticks.push({ value: yMax });
          axis.ticks = axis.ticks.filter((t) => t.value === yMax || t.value <= yMax * 0.94);
        },
        ticks: { callback: (v) => (v === yMax ? '∞' : `${v}h`) },
      },
    },
  };

  return (
    <div className="chart chart-backup">
      <Bar data={data} options={options} plugins={[topLabels]} />
    </div>
  );
}
