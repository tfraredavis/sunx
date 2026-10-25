// POST /api/roof
// Body: { lat, lon }
// Returns: { image: "data:image/png;base64,...", imageryDate, imageryQuality } — a Sunroof-style picture:
// aerial photo of the house with Google Solar API annual sunlight (flux) as a heatmap on the roofs.
// Returns 404 { error } when the Solar API has no coverage for the location.

import { fromArrayBuffer } from 'geotiff';
import { PNG } from 'pngjs';

const SOLAR = 'https://solar.googleapis.com/v1';

// "Iron" palette (dark → purple → red → orange → near-white), as in Google's Solar API samples.
const PALETTE = ['00000A', '91009C', 'E64616', 'FEB400', 'FFFFF6'].map((h) => [
  parseInt(h.slice(0, 2), 16),
  parseInt(h.slice(2, 4), 16),
  parseInt(h.slice(4, 6), 16),
]);
const HEAT_ALPHA = 0.8;

function colorAt(t) {
  const x = Math.min(1, Math.max(0, t)) * (PALETTE.length - 1);
  const i = Math.min(PALETTE.length - 2, Math.floor(x));
  const f = x - i;
  const a = PALETTE[i];
  const b = PALETTE[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

async function getJson(url) {
  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

async function readTiff(url, key) {
  const r = await fetch(`${url}&key=${encodeURIComponent(key)}`);
  if (!r.ok) throw new Error(`GeoTIFF download failed (${r.status})`);
  const tiff = await fromArrayBuffer(await r.arrayBuffer());
  const image = await tiff.getImage();
  const rasters = await image.readRasters();
  return { width: image.getWidth(), height: image.getHeight(), rasters };
}

/** Nearest-neighbour lookup so layers with different resolutions line up on the RGB grid. */
function sampler(layer, width, height) {
  const sx = layer.width / width;
  const sy = layer.height / height;
  return (x, y, band = 0) => layer.rasters[band][Math.floor(y * sy) * layer.width + Math.floor(x * sx)];
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
}

export function compose(rgb, mask, flux) {
  const { width, height } = rgb;
  const m = sampler(mask, width, height);
  const f = sampler(flux, width, height);

  // Stretch colors to this property's roofs (5th–98th percentile) so differences between roof faces show.
  const roofVals = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const v = f(x, y);
      if (m(x, y) > 0 && v > 0) roofVals.push(v);
    }
  roofVals.sort((a, b) => a - b);
  const lo = percentile(roofVals, 0.05);
  const hi = Math.max(lo + 1, percentile(roofVals, 0.98));

  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let r = rgb.rasters[0][i];
      let g = rgb.rasters[1][i];
      let b = rgb.rasters[2][i];
      const v = f(x, y);
      if (m(x, y) > 0 && v > 0) {
        const c = colorAt((v - lo) / (hi - lo));
        r = r * (1 - HEAT_ALPHA) + c[0] * HEAT_ALPHA;
        g = g * (1 - HEAT_ALPHA) + c[1] * HEAT_ALPHA;
        b = b * (1 - HEAT_ALPHA) + c[2] * HEAT_ALPHA;
      }
      const o = i * 4;
      png.data[o] = r;
      png.data[o + 1] = g;
      png.data[o + 2] = b;
      png.data[o + 3] = 255;
    }
  return PNG.sync.write(png);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const key = (process.env.GOOGLE_MAPS_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
  if (!key) return res.status(503).json({ error: 'Server is missing GOOGLE_MAPS_API_KEY' });

  const lat = Number(req.body?.lat);
  const lon = Number(req.body?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'Missing lat/lon' });

  try {
    // 1. Snap to the nearest building (address geocodes are often on the street, not the roof).
    const bi = await getJson(
      `${SOLAR}/buildingInsights:findClosest?` +
        new URLSearchParams({
          'location.latitude': String(lat),
          'location.longitude': String(lon),
          requiredQuality: 'BASE',
          key,
        })
    );
    if (bi.status === 404) return res.status(404).json({ error: 'No roof imagery for this address' });
    if (!bi.ok) {
      console.error('buildingInsights error', bi.status, bi.body?.error?.message);
      return res.status(502).json({ error: 'Roof imagery service error', detail: bi.body?.error?.message });
    }
    const center = bi.body.center || { latitude: lat, longitude: lon };
    const box = bi.body.boundingBox;
    let radius = 25;
    if (box?.sw && box?.ne) {
      const dLat = (box.ne.latitude - box.sw.latitude) * 111_320;
      const dLon = (box.ne.longitude - box.sw.longitude) * 111_320 * Math.cos((center.latitude * Math.PI) / 180);
      radius = Math.min(35, Math.max(20, Math.hypot(dLat, dLon) / 2 + 8));
    }

    // 2. Imagery + annual flux layers around that building.
    const dl = await getJson(
      `${SOLAR}/dataLayers:get?` +
        new URLSearchParams({
          'location.latitude': String(center.latitude),
          'location.longitude': String(center.longitude),
          radiusMeters: String(Math.round(radius)),
          view: 'IMAGERY_AND_ANNUAL_FLUX_LAYERS',
          requiredQuality: 'BASE',
          pixelSizeMeters: '0.1',
          key,
        })
    );
    if (dl.status === 404) return res.status(404).json({ error: 'No roof imagery for this address' });
    if (!dl.ok || !dl.body.rgbUrl || !dl.body.maskUrl || !dl.body.annualFluxUrl) {
      console.error('dataLayers error', dl.status, dl.body?.error?.message);
      return res.status(502).json({ error: 'Roof imagery service error', detail: dl.body?.error?.message });
    }

    const [rgb, mask, flux] = await Promise.all([
      readTiff(dl.body.rgbUrl, key),
      readTiff(dl.body.maskUrl, key),
      readTiff(dl.body.annualFluxUrl, key),
    ]);
    const png = compose(rgb, mask, flux);

    const d = dl.body.imageryDate;
    return res.status(200).json({
      image: `data:image/png;base64,${png.toString('base64')}`,
      imageryDate: d ? `${d.year}-${String(d.month).padStart(2, '0')}` : null,
      imageryQuality: dl.body.imageryQuality || null,
    });
  } catch (err) {
    console.error('roof failed', err);
    return res.status(502).json({ error: 'Could not build roof image', detail: String(err?.message || err) });
  }
}
