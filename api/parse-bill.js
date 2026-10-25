// POST /api/parse-bill
// Body: { mediaType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: "<base64>" }
// Returns: { utility, address, energyChargePerKwh, monthlyUsage: [{ year, month, kwh }] }
//
// Uses Claude vision to read the bill. The API key stays on the server.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5-5';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const PROMPT = `You are reading a residential electric utility bill. Extract the following and respond with ONLY a JSON object, no prose, no markdown fences.

{
  "utility": string or null,            // the electric utility's name as printed (e.g. "Puget Sound Energy")
  "service_address": string or null,    // the SERVICE address (where electricity is used), one line: "street, city, ST ZIP". Not the mailing/remit-to address unless it is the only address.
  "energy_charge_per_kwh": number or null, // $/kWh for the ENERGY CHARGE ONLY for the current billing period.
                                        // Use the energy charge line item(s) that are billed per kWh. If tiered/blocked, return total energy charge dollars ÷ total kWh in those lines.
                                        // Exclude basic/customer/service charges, fixed charges, taxes, riders, credits, and fees.
  "monthly_usage": [                    // electricity use by month from the usage history graph or table
    { "year": number, "month": number, "kwh": number }   // month is 1-12
  ]
}

Rules for monthly_usage:
- Use the usage history graph or table (often 12-13 months). Read bar values as precisely as possible; if bars are unlabeled, estimate from the axis.
- Assign each value to the calendar month in which most of that billing period falls.
- If the bill only shows the current billing period, return a single entry for that period.
- If you cannot find any usage, return an empty array.
- Use null for anything you cannot find. Do not guess an address or utility.`;

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON in model response');
  return JSON.parse(text.slice(start, end + 1));
}

function clean(raw) {
  const monthly = Array.isArray(raw.monthly_usage) ? raw.monthly_usage : [];
  const monthlyUsage = monthly
    .map((m) => ({
      year: Number.isFinite(Number(m.year)) ? Number(m.year) : null,
      month: Number(m.month),
      kwh: Number(m.kwh),
    }))
    .filter((m) => m.month >= 1 && m.month <= 12 && Number.isFinite(m.kwh) && m.kwh >= 0);

  const rate = Number(raw.energy_charge_per_kwh);
  return {
    utility: typeof raw.utility === 'string' && raw.utility.trim() ? raw.utility.trim() : null,
    address:
      typeof raw.service_address === 'string' && raw.service_address.trim()
        ? raw.service_address.trim()
        : null,
    energyChargePerKwh: Number.isFinite(rate) && rate > 0 && rate < 5 ? rate : null,
    monthlyUsage,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });

  const { mediaType, data } = req.body || {};
  if (!data || typeof data !== 'string') return res.status(400).json({ error: 'Missing file data' });

  let fileBlock;
  if (mediaType === 'application/pdf') {
    fileBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  } else if (IMAGE_TYPES.has(mediaType)) {
    fileBlock = { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
  } else {
    return res.status(400).json({ error: `Unsupported file type: ${mediaType}` });
  }

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: 2000,
        messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PROMPT }] }],
      }),
    });

    if (!r.ok) {
      const raw = await r.text();
      let detail = raw.slice(0, 300);
      try {
        const e = JSON.parse(raw).error;
        if (e) detail = `${e.type}: ${e.message}`;
      } catch {}
      console.error('Anthropic API error', r.status, detail);
      return res.status(502).json({ error: 'Bill parsing service error', detail: `Anthropic ${r.status} ${detail}` });
    }

    const body = await r.json();
    const text = (body.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    return res.status(200).json(clean(extractJson(text)));
  } catch (err) {
    console.error('parse-bill failed', err);
    return res.status(502).json({ error: 'Could not read the bill', detail: String(err?.message || err) });
  }
}

// Exported for tests.
export const _internal = { extractJson, clean };
