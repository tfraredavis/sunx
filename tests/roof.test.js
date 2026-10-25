import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { writeArrayBuffer } from 'geotiff';
import { PNG } from 'pngjs';
import roof, { compose } from '../api/roof.js';

const W = 40;
const H = 40;

function fakeLayers() {
  const n = W * H;
  const r = new Uint8Array(n).fill(90);
  const g = new Uint8Array(n).fill(110);
  const b = new Uint8Array(n).fill(80);
  const mask = new Uint8Array(n);
  const flux = new Float32Array(n);
  for (let y = 10; y < 30; y++)
    for (let x = 10; x < 30; x++) {
      mask[y * W + x] = 1;
      flux[y * W + x] = 600 + x * 30; // brighter toward the east
    }
  return { r, g, b, mask, flux };
}

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (v) => ((res.body = v), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
}

test('compose: heatmap only on roof pixels, photo elsewhere', () => {
  const L = fakeLayers();
  const buf = compose(
    { width: W, height: H, rasters: [L.r, L.g, L.b] },
    { width: W, height: H, rasters: [L.mask] },
    { width: W, height: H, rasters: [L.flux] }
  );
  const png = PNG.sync.read(buf);
  assert.equal(png.width, W);
  const px = (x, y) => Array.from(png.data.slice((y * W + x) * 4, (y * W + x) * 4 + 3));
  assert.deepEqual(px(2, 2), [90, 110, 80]); // off-roof unchanged
  assert.notDeepEqual(px(20, 20), [90, 110, 80]); // roof tinted
  // east side (more flux) should be brighter than west side
  const lum = (p) => p[0] + p[1] + p[2];
  assert.ok(lum(px(28, 20)) > lum(px(11, 20)));
});

test('roof handler: snaps to building, downloads layers with key, returns PNG data URL', async () => {
  process.env.GOOGLE_MAPS_API_KEY = 'gkey';
  const L = fakeLayers();
  const tiffs = {
    // geotiff's writer only emits 8-bit samples, so flux is scaled into 0–255 for this test.
    rgb: writeArrayBuffer(
      Array.from({ length: W * H * 3 }, (_, i) => [L.r, L.g, L.b][i % 3][Math.floor(i / 3)]),
      { width: W, height: H }
    ),
    mask: writeArrayBuffer(Array.from(L.mask), { width: W, height: H }),
    flux: writeArrayBuffer(Array.from(L.flux, (v) => Math.round(v / 10)), { width: W, height: H }),
  };
  const calls = [];
  mock.method(globalThis, 'fetch', async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('buildingInsights:findClosest')) {
      return new Response(
        JSON.stringify({
          center: { latitude: 47.7401, longitude: -121.9801 },
          boundingBox: { sw: { latitude: 47.74, longitude: -121.9803 }, ne: { latitude: 47.7402, longitude: -121.98 } },
        }),
        { status: 200 }
      );
    }
    if (u.includes('dataLayers:get')) {
      const base = 'https://solar.googleapis.com/v1/geoTiff:get?id=';
      return new Response(
        JSON.stringify({
          rgbUrl: base + 'rgb',
          maskUrl: base + 'mask',
          annualFluxUrl: base + 'flux',
          imageryDate: { year: 2024, month: 6, day: 1 },
          imageryQuality: 'HIGH',
        }),
        { status: 200 }
      );
    }
    if (u.includes('geoTiff:get')) {
      assert.ok(u.includes('key=gkey'));
      const id = new URL(u).searchParams.get('id');
      return new Response(tiffs[id], { status: 200 });
    }
    throw new Error('unexpected ' + u);
  });

  const res = mockRes();
  await roof({ method: 'POST', body: { lat: 47.74, lon: -121.98 } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.ok(res.body.image.startsWith('data:image/png;base64,'));
  assert.equal(res.body.imageryDate, '2024-06');
  const dl = new URL(calls.find((c) => c.includes('dataLayers')));
  assert.equal(dl.searchParams.get('location.latitude'), '47.7401');
  assert.equal(dl.searchParams.get('view'), 'IMAGERY_AND_ANNUAL_FLUX_LAYERS');
  mock.restoreAll();
});

test('roof handler: 404 from Solar API → 404 (no coverage)', async () => {
  process.env.GOOGLE_MAPS_API_KEY = 'gkey';
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 }));
  const res = mockRes();
  await roof({ method: 'POST', body: { lat: 1, lon: 1 } }, res);
  assert.equal(res.statusCode, 404);
  mock.restoreAll();
});
