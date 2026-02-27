# Investor Command Center (PWA Foundation)

A mobile-first, premium-feel real estate investment calculator SaaS foundation built with Next.js App Router + Tailwind.

## What is included

- Master deal input model shared across all strategy engines
- Modular calculation engine for:
  - Purchase analysis
  - Long-term rental
  - Airbnb / short-term
  - PadSplit
  - BRRRR
  - Flip
- Master Summary KPI dashboard for:
  - Cash to close
  - Monthly cash flow
  - Cash on cash return
  - ROI
  - True IRR (from yearly cashflow timeline)
- Strategy comparison board to evaluate monthly performance and return metrics side-by-side
- Scenario save/load vault (local storage + cloud-ready JSON schema)
- Variable expense matrix with per-strategy toggles (LT/STR/PadSplit/Flip)
- Purchase tax/insurance auto estimates with override inputs
- Printable PDF-oriented report view (`/print`) powered by an export schema

## Architecture

```text
app/
  layout.tsx
  page.tsx
  print/page.tsx
components/
  dashboard/
    deal-input-panel.tsx
    scenario-toolbar.tsx
    strategy-breakdown.tsx
    strategy-comparison.tsx
    strategy-tabs.tsx
    timeline-card.tsx
  print/
    print-actions.tsx
  ui/
    kpi-card.tsx
lib/
  engine/
    deal-engine.ts
    finance.ts
    investment-math.ts
    strategy-modules.ts
  export/
    pdf-schema.ts
  models/
    deal.ts
  scenario-storage.ts
test/
  engine.test.ts
  ui.integration.test.tsx
```

## Run

```bash
npm install
npm run dev
```

## Validate

```bash
npm run test
npm run lint
npm run build
```

## Open Claw Backend Access (Deal + Short Link)

Use this endpoint when an external tool (like Open Claw) needs to run a deal through the engine and create a short share link without browser login.

- `POST /api/openclaw/deal`
- Auth header: `x-openclaw-key: <OPENCLAW_API_KEY>` (or `Authorization: Bearer <OPENCLAW_API_KEY>`)
- Required env vars:
  - `OPENCLAW_API_KEY`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `OPENCLAW_OWNER_USER_ID` (optional if you send `ownerId` in the request body)

Example request:

```bash
curl -X POST http://localhost:3000/api/openclaw/deal \
  -H "Content-Type: application/json" \
  -H "x-openclaw-key: your-secret-key" \
  -d '{
    "deal": { "purchase": { "dealName": "Open Claw Deal" } },
    "strategy": "purchase",
    "createShortLink": true
  }'
```

Notes:
- Send a full `deal` payload for precise calculations.
- If `createShortLink` is enabled, the route returns a `/s/{slug}` URL in `shortLink.url`.

## Legal baseline included

- Proprietary `LICENSE` with all-rights-reserved language.
- In-app Legal Center at `/legal`.
- Terms of Use at `/legal/terms` (IP ownership, disclaimers, liability limits).
- Privacy Policy at `/legal/privacy` (local storage + share-link data handling disclosures).

## Next recommended steps

1. Add backend sync for scenario records (same schema, API-ready).
2. Add portfolio-level dashboard for multi-property comparisons.
3. Add branded PDF templates and one-click email sharing.
4. Add auth + role scopes once collaboration is needed.
5. Add offline-first PWA install mode with service worker caching.
