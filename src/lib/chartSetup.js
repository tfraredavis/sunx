import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);

export const COLORS = {
  orange: '#D85A30',
  orangeSoft: 'rgba(216, 90, 48, 0.18)',
  bar: '#4A4A50',
  barNeg: '#3A3A3F',
  grid: 'rgba(255, 255, 255, 0.07)',
  text: '#A8A8AE',
  ink: '#F2F2F2',
};

Chart.defaults.color = COLORS.text;
Chart.defaults.borderColor = COLORS.grid;
Chart.defaults.font.family = "'Manrope', system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.plugins.tooltip.backgroundColor = '#1E1E21';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.12)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.titleColor = COLORS.ink;
Chart.defaults.plugins.tooltip.bodyColor = COLORS.ink;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.boxHeight = 12;
