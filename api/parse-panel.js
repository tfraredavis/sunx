// POST /api/parse-panel
// Body: { mediaType, data } — one photo or PDF of an electrical panel (call once per file).
// Returns: { panels: [{ name, mainAmps, breakers: [{ slot, label, amps, poles, category }] }] }
//
// Claude reads the panel directory and breaker handles. Each breaker gets a backup category:
//   critical — life-preserving / essential loads
//   comfort  — water heating, space heating, cooling
//   other    — everything else (EV, laundry, hot tub, subpanel feeds, …)
//   unknown  — blank, illegible, or "spare"

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const CATEGORIES = new Set(['critical', 'comfort', 'other', 'unknown']);

const PROMPT = `This is a photo (or document) of a residential electrical panel. Read every breaker and the panel directory.
Respond with ONLY a JSON object, no prose, no markdown fences:

{
  "panels": [
    {
      "name": string,              // e.g. "Main panel" or "Subpanel" (use what's printed, or describe it)
      "main_amps": number or null, // main breaker rating if visible
      "breakers": [
        {
          "slot": number,          // standard numbering: left column odd 1,3,5… top→bottom; right column even 2,4,6… top→bottom.
                                   // If the panel's printed numbers are unclear, number by physical position in that pattern.
                                   // A 2-pole breaker uses the slot number of its TOP position.
                                   // Tandem/half-size breakers sharing one slot: list each circuit with the same slot.
          "label": string,         // the circuit's CURRENT label. Labels are often crossed out and rewritten:
                                   // use the newest (not crossed-out) text. Expand obvious abbreviations ("DW" → "Dishwasher").
                                   // Use "" if blank/illegible, "Spare" if marked spare.
          "amps": number or null,  // rating printed on the handle (15, 20, 30, 40, 50, 60, 100…)
          "poles": 1 or 2,         // 2 if it is a double-pole (240V) breaker or two handles tied together
          "category": "critical" | "comfort" | "other" | "unknown"
        }
      ]
    }
  ]
}

Do NOT include the main breaker in "breakers".

Category rules (backup planning):
- "critical": refrigerator, freezer, internet/router, home office, general outlets/receptacles/plugs (device charging),
  lights/lighting, smoke alarms, cooking (range, cooktop, oven, microwave), well pump, septic pump, sump pump,
  garage door opener, medical equipment, and anything else clearly life-preserving.
- "comfort": water heater, any space heating (furnace, heat pump, baseboard/wall heaters, heat strips, radiant floors),
  any cooling (AC, mini-split, heat pump).
- "other": EV charger, dryer, washer, dishwasher, garbage disposal, hot tub/spa/jacuzzi, pool equipment, sauna,
  towel warmers, central vacuum, workshop/shop equipment, subpanel feeds, surge protectors, and other non-essential loads.
- "unknown": blank, illegible, or spare.

If the image contains more than one panel, return one entry per panel. If it isn't a panel, return {"panels": []}.`;

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON in model response');
  return JSON.parse(text.slice(start, end + 1));
}

function clean(raw) {
  const panels = Array.isArray(raw?.panels) ? raw.panels : [];
  return {
    panels: panels
      .map((p, pi) => {
        const breakers = (Array.isArray(p.breakers) ? p.breakers : [])
          .map((b) => {
            const amps = Number(b.amps);
            const slot = Math.round(Number(b.slot));
            const poles = Number(b.poles) === 2 ? 2 : 1;
            const category = CATEGORIES.has(b.category) ? b.category : 'unknown';
            return {
              slot: Number.isFinite(slot) && slot > 0 ? slot : null,
              label: typeof b.label === 'string' ? b.label.trim() : '',
              amps: Number.isFinite(amps) && amps > 0 ? amps : null,
              poles,
              category,
            };
          })
          .filter((b) => b.slot !== null);
        const main = Number(p.main_amps);
        return {
          name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `Panel ${pi + 1}`,
          mainAmps: Number.isFinite(main) && main > 0 ? main : null,
          breakers,
        };
      })
      .filter((p) => p.breakers.length > 0),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
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
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: 6000,
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
      console.error('Anthropic API error (panel)', r.status, detail);
      return res.status(502).json({ error: 'Panel reading service error', detail: `Anthropic ${r.status} ${detail}` });
    }
    const body = await r.json();
    const text = (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return res.status(200).json(clean(extractJson(text)));
  } catch (err) {
    console.error('parse-panel failed', err);
    return res.status(502).json({ error: 'Could not read the panel', detail: String(err?.message || err) });
  }
}

export const _internal = { extractJson, clean };
