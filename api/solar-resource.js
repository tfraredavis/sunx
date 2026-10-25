// POST /api/solar-resource
// Body: { address: "street, city, ST ZIP" }
// Returns: { lat, lon, acAnnualPerKw, acMonthlyPerKw: [Jan..Dec] }
//
// 1. Geocodes the address (US Census geocoder, no key; falls back to the ZIP code's centroid).
// 2. Runs NREL/NLR PVWatts v8 for a 1 kW DC system so the app can scale to any size.

const PVWATTS_URLS = [
  'https://developer.nlr.gov/api/pvwatts/v8.json',
  'https://developer.nrel.gov/api/pvwatts/v8.json', // legacy host
];

// System assumptions (agreed spec).
const PV_ASSUMPTIONS = {
  system_capacity: 1, // kW DC — results are per kW
  azimuth: 180, // south
  tilt: 10,
  losses: 14,
  module_type: 0, // standard
  array_type: 1, // fixed, roof mounted
};

async function geocodeCensus(address) {
  const url =
    'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?' +
    new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' });
  const r = await fetch(url);
  if (!r.ok) return null;
  const body = await r.json();
  const match = body?.result?.addressMatches?.[0];
  if (!match) return null;
  return { lat: match.coordinates.y, lon: match.coordinates.x };
}

async function geocodeZip(address) {
  const zip = (address.match(/\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/) || [])[1];
  if (!zip) return null;
  const r = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!r.ok) return null;
  const body = await r.json();
  const place = body?.places?.[0];
  if (!place) return null;
  return { lat: Number(place.latitude), lon: Number(place.longitude) };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const address = (req.body?.address || '').trim();
  if (!address) return res.status(400).json({ error: 'Missing address' });

  const apiKey = (process.env.NREL_API_KEY || '').trim().replace(/^['"]|['"]$/g, '') || 'DEMO_KEY';

  try {
    const loc = (await geocodeCensus(address).catch(() => null)) || (await geocodeZip(address).catch(() => null));
    if (!loc) return res.status(422).json({ error: 'Could not locate that address' });

    const params = new URLSearchParams({
      api_key: apiKey,
      lat: String(loc.lat),
      lon: String(loc.lon),
      ...Object.fromEntries(Object.entries(PV_ASSUMPTIONS).map(([k, v]) => [k, String(v)])),
    });
    // Try the current NLR host first, then the legacy NREL host.
    let body = null;
    const failures = [];
    for (const base of PVWATTS_URLS) {
      try {
        const r = await fetch(`${base}?${params}`);
        const b = await r.json().catch(() => ({}));
        if (r.ok && !b.errors?.length && b.outputs) {
          body = b;
          break;
        }
        const msg = b.errors?.join('; ') || (b.error ? `${b.error.code}: ${b.error.message}` : 'no JSON body');
        failures.push(`${new URL(base).hostname} ${r.status} ${msg}`);
      } catch (err) {
        failures.push(`${new URL(base).hostname} ${String(err?.message || err)}`);
      }
    }
    if (!body) {
      console.error('PVWatts error', failures);
      return res
        .status(502)
        .json({ error: 'Solar production service error', detail: failures.join(' | '), lat: loc.lat, lon: loc.lon });
    }

    const monthly = body.outputs?.ac_monthly;
    const annual = body.outputs?.ac_annual;
    if (!Array.isArray(monthly) || monthly.length !== 12 || !annual) {
      return res.status(502).json({ error: 'Unexpected solar production response' });
    }

    return res.status(200).json({
      lat: loc.lat,
      lon: loc.lon,
      acAnnualPerKw: annual,
      acMonthlyPerKw: monthly,
    });
  } catch (err) {
    console.error('solar-resource failed', err);
    return res.status(502).json({ error: 'Could not estimate solar production' });
  }
}
