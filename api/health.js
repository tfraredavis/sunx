// GET /api/health — setup check. Reports whether each key is set and accepted.
// Never returns key values. Uses free calls only (Anthropic model list, one PVWatts run).

export default async function handler(req, res) {
  const out = { anthropic: { keySet: false }, nrel: { keySet: false } };

  const ak = process.env.ANTHROPIC_API_KEY;
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

  const nk = process.env.NREL_API_KEY;
  out.nrel.keySet = Boolean(nk);
  try {
    const p = new URLSearchParams({
      api_key: nk || 'DEMO_KEY', lat: '47.74', lon: '-121.98', system_capacity: '1',
      azimuth: '180', tilt: '10', losses: '14', module_type: '0', array_type: '1',
    });
    const r = await fetch(`https://developer.nlr.gov/api/pvwatts/v8.json?${p}`);
    const body = await r.json().catch(() => ({}));
    out.nrel.status = r.status;
    out.nrel.ok = r.ok && !body.errors?.length;
    if (!out.nrel.ok) out.nrel.error = body.errors?.join('; ') || body.error?.message || 'unknown error';
  } catch (err) {
    out.nrel.error = String(err?.message || err);
  }

  res.setHeader('cache-control', 'no-store');
  return res.status(200).json(out);
}
