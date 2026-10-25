# Sunx

Homeowner tool for exploring the savings and resilience benefits of solar and batteries.
Upload an electric bill → see annual spend, future spend with rate escalation, a right-sized
solar system, its cost range, monthly production vs. consumption, and cumulative cash flow.

**Stack:** Vite + React (front end), Vercel serverless functions in `/api` (keep API keys server-side),
Chart.js for charts.

---

## One-time setup

### 1. Put the code on GitHub

1. Create an empty repo named `sunx` on GitHub (no README, .gitignore, or license).
2. From this folder:
   ```bash
   git remote add origin https://github.com/<your-username>/sunx.git
   git push -u origin main
   ```

### 2. Get an Anthropic API key (bill parsing)

1. Go to <https://console.anthropic.com> → **API Keys** → **Create Key**.
2. Make sure billing is set up under **Plans & Billing**.
3. The key starts with `sk-ant-api…`. Keep it out of the code and out of chats; it only goes into Vercel (step 4).

### 3. Get an NREL / NLR API key (PVWatts solar production)

NREL was renamed the **National Laboratory of the Rockies (NLR)**, and the developer site moved from
`developer.nrel.gov` to **`developer.nlr.gov`**.

1. Open <https://developer.nlr.gov/signup/> in a normal browser (the form needs JavaScript).
2. Fill in your name and email and submit. The key is issued right away (check your email).
3. The free tier allows 1,000 requests/hour.

Until you add a key, the app falls back to NLR's shared `DEMO_KEY`, which is heavily rate-limited
(fine for a quick test, not for real use).

### 4. Google Maps Platform key (roof heatmap)

The solar section shows a Sunroof-style picture of the roof using Google's **Solar API**
(the data behind Project Sunroof). You can reuse the Google Cloud project from GridReady.

1. <https://console.cloud.google.com> → select the project → **APIs & Services → Library** →
   search **Solar API** → **Enable**. Billing must be on for the project.
2. **APIs & Services → Credentials** → use an existing key or **Create credentials → API key**.
   Restrict it to the **Solar API** (API restrictions). Don't add a website restriction; the key is used
   server-side only.
3. Add it to Vercel as `GOOGLE_MAPS_API_KEY`.

Each roof image makes two Solar API requests (building insights + data layers), billed per Google's pricing.
If an address has no Solar API coverage, the picture is simply left out.

### 5. Deploy on Vercel

1. <https://vercel.com> → **Add New… → Project** → import the `sunx` GitHub repo.
   Framework preset: **Vite** (auto-detected). Leave build settings as default.
2. **Settings → Environment Variables**, add for Production, Preview, and Development:
   - `ANTHROPIC_API_KEY` = your Anthropic key
   - `NREL_API_KEY` = your NLR key
   - `GOOGLE_MAPS_API_KEY` = your Google Maps Platform key (Solar API enabled)
   - *(optional)* `ANTHROPIC_MODEL` to override the default `claude-sonnet-5-5`
3. **Deployments → Redeploy** so the variables take effect.

Every push to `main` redeploys automatically.

---

## Local development (optional)

Requires Node 20+.

```bash
npm install
npm i -g vercel        # once
vercel link            # once, connects this folder to the Vercel project
vercel env pull .env.local
vercel dev             # runs the front end AND the /api functions at http://localhost:3000
```

`npm run dev` alone runs only the front end; `/api` calls will fail without `vercel dev`.

Tests: `npm test` (calculation math + API handlers with mocked network calls).

---

## How it works

### Bill parsing — `api/parse-bill.js`
- Accepts PDF or any image the browser can open (JPG, PNG, WebP, GIF, BMP; HEIC on Safari).
  Images are converted to JPEG in the browser (max 2000 px edge) before upload. Files must be under ~4 MB
  after encoding (Vercel's request limit).
- Claude extracts: utility name, service address, monthly kWh history, total kWh billed, and every
  electric per-kWh line item (rate × kWh).
- Energy charge $/kWh = Σ(rate × kWh) ÷ kWh billed — i.e. blended tier rate + all per-kWh adders and credits
  (conservation, power cost adjustment, exchange credit, other per-kWh charges/credits). Excludes basic
  charge, taxes, gas, and one-time event credits.
- Monthly kWh → 12 calendar months: newest year wins for duplicate months; a single month is used for all
  12; any missing months are filled with the average of the months found. All 12 are editable.
- If nothing usable comes back, the page asks the user to enter monthly consumption manually.

### Solar production — `api/solar-resource.js`
- Geocodes the address with the US Census geocoder (no key); falls back to the ZIP code centroid
  (zippopotam.us).
- Calls PVWatts v8 for a **1 kW DC** system: azimuth 180°, tilt 10°, 14% losses, standard modules,
  fixed roof mount. The app scales the per-kW annual and monthly output to any size.
- Re-runs whenever the address is edited.

### Calculations — `src/lib/calc.js`
| Value | Formula |
|---|---|
| y (annual kWh) | sum of 12 months |
| x (annual $) | y × energy charge $/kWh |
| w | Σₙ₌₁..ₐ x·(1+z)ⁿ⁻¹ |
| b (kW DC) | (c% × y) ÷ (PVWatts kWh per kW), rounded to 0.01 |
| c (%) | b × kWh/kW ÷ y (when the user edits b) |
| d / e | b × $2.20/W / b × $2.70/W (gross, no incentives) |
| Monthly production | b × PVWatts monthly output per kW |
| Cash flow | Year 0 = −(d+e)/2; year n += x × min(offset%, 100%) × (1+z)ⁿ⁻¹ — offset% is what the rounded b actually produces; savings are capped at 100% of the bill |
| Breakeven | first whole year with cumulative ≥ 0; “Beyond 40 years” if none |

Defaults: z = 5% (0–100), a = 25 years (0–100), c = 100% (0–200). The chart always runs 40 years.
No panel degradation, inverter replacement, or O&M yet. Offset % is treated as expense % (full retail
net metering).

### Lead form
Name, Email Address, Phone, Home Address (prefilled from the bill), all required. A valid submit calls
`submitLead()` in `src/lib/submitLead.js`, which is intentionally a no-op for now. The payload already
includes the contact info and all design data for future consultant routing by ZIP.

### Batteries
“Add batteries for off-grid capabilities” opens a placeholder section.

---

## Planned next steps (not built)
- Utility rate-escalation database (replaces the 5% default).
- Net metering / buyback model per utility: self-consumed kWh × retail + exported kWh × export credit
  − fixed charges.
- Better monthly estimate when the bill has only one month.
- Degradation and inverter replacement in the cash flow.
- Consultant routing by ZIP + post-submission next-steps page.
- Battery section.
