// GET /api/health — setup check. Reports whether each key is set and accepted.
// Never returns key values. Uses free calls only (Anthropic model list, one PVWatts run).

export default async function handler(req, res) {
  const out = {
    anthropic: { keySet: false },
    nrel: { keySet: false },
    google: { keySet: Boolean((process.env.GOOGLE_MAPS_API_KEY || '').trim()) },
  };

  const ak = (process.env.ANTHROPIC_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
  if (ak) {
    out.anthropic.keySet = true;
    try {
      const r = await fetch('https://api.anthropic.com/v1/models?limit=1', {
        headers: { 'x-api-key': ak, 'anthropic-version': '2023-06-01' },
      });
      out.anthropic.status = r.status;
      out.anthropic.ok = r.ok;
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        out.anthropic.error = e?.error ? `${e.error.type}: ${e.error.message}` : 'unknown error';
      }
    } catch (err) {
      out.anthropic.error = String(err?.message || err);
    }
  }

  const nk = (process.env.NREL_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
  out.nrel.keySet = Boolean(nk);
  const p = new URLSearchParams({
    api_key: nk || 'DEMO_KEY', lat: '47.74', lon: '-121.98', system_capacity: '1',
    azimuth: '180', tilt: '10', losses: '14', module_type: '0', array_type: '1',
  });
  for (const host of ['developer.nlr.gov', 'developer.nrel.gov']) {
    const h = (out.nrel[host] = {});
    try {
      const r = await fetch(`https://${host}/api/pvwatts/v8.json?${p}`);
      const body = await r.json().catch(() => ({}));
      h.status = r.status;
      h.ok = r.ok && !body.errors?.length && Boolean(body.outputs);
      if (!h.ok) h.error = body.errors?.join('; ') || (body.error ? `${body.error.code}: ${body.error.message}` : 'no JSON body');
    } catch (err) {
      h.error = String(err?.message || err);
    }
  }

  // Google Solar API: one building-insights lookup (Duvall, WA) to confirm the key and API are enabled.
  const gk = (process.env.GOOGLE_MAPS_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
  if (gk) {
    try {
      const r = await fetch(
        'https://solar.googleapis.com/v1/buildingInsights:findClosest?' +
          new URLSearchParams({ 'location.latitude': '47.7426', 'location.longitude': '-121.9857', requiredQuality: 'BASE', key: gk })
      );
      const body = await r.json().catch(() => ({}));
      out.google.status = r.status;
      out.google.ok = r.ok;
      if (!r.ok) out.google.error = body?.error ? `${body.error.status || body.error.code}: ${body.error.message}` : 'unknown error';
    } catch (err) {
      out.google.error = String(err?.message || err);
    }
  }

  res.setHeader('cache-control', 'no-store');
  return res.status(200).json(out);
}
