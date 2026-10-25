import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import parseBill, { _internal } from '../api/parse-bill.js';
import solarResource from '../api/solar-resource.js';

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
}

test('extractJson tolerates surrounding text / fences', () => {
  assert.deepEqual(_internal.extractJson('```json\n{"a":1}\n```'), { a: 1 });
});

test('clean filters bad months and implausible rates', () => {
  const out = _internal.clean({
    utility: ' Puget Sound Energy ',
    service_address: '123 Main St, Duvall, WA 98019',
    electric_kwh_billed: 800,
    per_kwh_line_items: [{ description: 'Energy', rate: 0.1189, kwh: 800 }],
    monthly_usage: [
      { year: 2026, month: 9, kwh: 800 },
      { year: 2026, month: 13, kwh: 1 },
      { year: 2026, month: 8, kwh: 'n/a' },
    ],
  });
  assert.equal(out.utility, 'Puget Sound Energy');
  assert.equal(out.energyChargePerKwh, 0.1189);
  assert.equal(out.monthlyUsage.length, 1);
  assert.equal(
    _internal.clean({ electric_kwh_billed: 10, per_kwh_line_items: [{ rate: 12, kwh: 10 }] }).energyChargePerKwh,
    null
  );
});

test('parse-bill sends a PDF document block and returns cleaned data', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  let sent;
  mock.method(globalThis, 'fetch', async (url, init) => {
    sent = JSON.parse(init.body);
    assert.equal(init.headers['x-api-key'], 'test-key');
    return new Response(
      JSON.stringify({
        content: [
          {
            type: 'text',
            text: '{"utility":"PSE","service_address":"1 A St, Duvall, WA 98019","electric_kwh_billed":700,"per_kwh_line_items":[{"rate":0.12,"kwh":700}],"monthly_usage":[{"year":2026,"month":9,"kwh":700}]}',
          },
        ],
      }),
      { status: 200 }
    );
  });
  const res = mockRes();
  await parseBill({ method: 'POST', body: { mediaType: 'application/pdf', data: 'JVBERi0=' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(sent.messages[0].content[0].type, 'document');
  assert.equal(res.body.utility, 'PSE');
  assert.equal(res.body.monthlyUsage[0].kwh, 700);
  mock.restoreAll();
});

test('solar-resource geocodes then calls PVWatts with agreed assumptions', async () => {
  process.env.NREL_API_KEY = 'nrel-key';
  const calls = [];
  mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url));
    if (String(url).includes('geocoding.geo.census.gov')) {
      return new Response(
        JSON.stringify({ result: { addressMatches: [{ coordinates: { x: -121.98, y: 47.74 } }] } }),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({ errors: [], outputs: { ac_annual: 1000, ac_monthly: new Array(12).fill(1000 / 12) } }),
      { status: 200 }
    );
  });
  const res = mockRes();
  await solarResource({ method: 'POST', body: { address: '1 A St, Duvall, WA 98019' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.acAnnualPerKw, 1000);
  const pv = new URL(calls[1]);
  assert.equal(pv.hostname, 'developer.nlr.gov');
  assert.equal(pv.searchParams.get('azimuth'), '180');
  assert.equal(pv.searchParams.get('tilt'), '10');
  assert.equal(pv.searchParams.get('losses'), '14');
  assert.equal(pv.searchParams.get('module_type'), '0');
  assert.equal(pv.searchParams.get('array_type'), '1');
  assert.equal(pv.searchParams.get('system_capacity'), '1');
  assert.equal(pv.searchParams.get('api_key'), 'nrel-key');
  mock.restoreAll();
});

test('solar-resource falls back to ZIP when the street address does not match', async () => {
  mock.method(globalThis, 'fetch', async (url) => {
    const u = String(url);
    if (u.includes('census')) return new Response(JSON.stringify({ result: { addressMatches: [] } }), { status: 200 });
    if (u.includes('zippopotam')) {
      assert.ok(u.endsWith('/98019'));
      return new Response(JSON.stringify({ places: [{ latitude: '47.74', longitude: '-121.98' }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ errors: [], outputs: { ac_annual: 990, ac_monthly: new Array(12).fill(82.5) } }), {
      status: 200,
    });
  });
  const res = mockRes();
  await solarResource({ method: 'POST', body: { address: '12345 Nowhere Rd, Duvall, WA 98019' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.acAnnualPerKw, 990);
  mock.restoreAll();
});

test('energy charge from PSE line items matches tiers + per-kWh adders', () => {
  const items = [
    { description: 'Tier 1 (First 600 kWh Used)', rate: 0.148363, kwh: 600 },
    { description: 'Tier 2 (Above 600 kWh Used)', rate: 0.16778, kwh: 126 },
    { description: 'Electric Cons. Program Charge', rate: 0.009409, kwh: 726 },
    { description: 'Power Cost Adjustment', rate: 0.038719, kwh: 726 },
    { description: 'Energy Exchange Credit', rate: -0.006648, kwh: 726 },
    { description: 'Other Electric Charges & Credits', rate: -0.002378, kwh: 726 },
  ];
  const expected = (0.148363 * 600 + 0.16778 * 126) / 726 + 0.009409 + 0.038719 - 0.006648 - 0.002378;
  const got = _internal.clean({ electric_kwh_billed: 726, per_kwh_line_items: items }).energyChargePerKwh;
  assert.ok(Math.abs(got - expected) < 1e-6, `${got} vs ${expected}`);
  assert.equal(got, 0.190835);
});
