# DealCooker

A mobile-first real estate investment calculator built with Next.js App Router, Supabase auth/sync, and PWA support.

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
- Scenario save/load vault with account-scoped local storage and Supabase cloud sync
- Variable expense matrix with per-strategy toggles (LT/STR/PadSplit/Flip)
- Purchase tax/insurance auto estimates with override inputs
- Short share links backed by Supabase snapshots
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

GitHub Actions runs `npm ci`, lint, tests, and production build on pushes to `main` and on pull requests.

## Private Production Setup

1. Keep the GitHub repository private and configure deployment secrets in the host, not in source.
2. Apply the Supabase migration in `supabase/migrations/20260429000000_private_production_foundation.sql`.
3. Configure the Supabase URL, anon/publishable key, service-role key, Open Claw key, Resend feedback-email key, `NEXT_PUBLIC_APP_URL=https://dealcooker.app`, and `NEXT_PUBLIC_APP_RELEASE`.
4. Run the RLS smoke checks in `supabase/README.md` before inviting users.
5. Verify email sign-in, password reset, Google sign-in, account switching, Deal Vault sync, share links, backup export, print, and mobile layout.

Feedback email uses `RESEND_API_KEY`, `FEEDBACK_TO_EMAIL`, and `FEEDBACK_FROM_EMAIL`. The Resend API key must stay server-side in deployment secrets.

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
- Privacy Policy at `/legal/privacy` (local storage, cloud sync, share-link, and sanitized error-log disclosures).

## Next recommended steps

1. Review terms/privacy with an attorney before a public launch.
2. Add portfolio-level dashboard for multi-property comparisons.
3. Add branded PDF templates and one-click email sharing.
4. Add role scopes and billing only when moving beyond private production.
5. Move proprietary calculation paths behind server APIs if browser-source secrecy becomes a hard requirement.
