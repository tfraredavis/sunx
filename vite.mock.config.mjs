import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const mockApi = {
  name: 'mock-api',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const send = (obj) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(obj));
      };
      if (req.url === '/api/parse-bill') {
        return send({
          utility: 'Puget Sound Energy',
          address: '15600 Main St NE, Duvall, WA 98019',
          energyChargePerKwh: 0.1189,
          monthlyUsage: [
            [2025, 10, 820], [2025, 11, 1120], [2025, 12, 1380], [2026, 1, 1410], [2026, 2, 1190],
            [2026, 3, 1020], [2026, 4, 860], [2026, 5, 700], [2026, 6, 640], [2026, 7, 690],
            [2026, 8, 720], [2026, 9, 760],
          ].map(([year, month, kwh]) => ({ year, month, kwh })),
        });
      }
      if (req.url === '/api/solar-resource') {
        // Plausible Seattle-area per-kW monthly AC output at 10° tilt
        const m = [33, 52, 85, 112, 138, 145, 160, 142, 105, 64, 34, 26];
        return send({ lat: 47.74, lon: -121.98, acAnnualPerKw: m.reduce((a, b) => a + b), acMonthlyPerKw: m });
      }
      next();
    });
  },
};

export default defineConfig({ root: '/home/claude/sunx', plugins: [react(), mockApi], server: { port: 5199 } });
