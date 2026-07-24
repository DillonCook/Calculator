# DealCooker Open Testing Release Checklist

Use this before opening a build to public testers.

## Product Flow

- Create a fresh account with email/password and Google.
- Reset password from `https://www.dealcooker.app` and confirm the callback lands in the app.
- Start from a blank vault, load the sample deal, create a real blank deal, duplicate it, delete it, and confirm the active deal is correct.
- Sign out, sign into a different account, and confirm the previous account's local deals do not appear.
- Send feedback from desktop and mobile. Confirm the email includes contact, route, active deal, strategy, app release, and browser context.

## Sharing And Reports

- Create a short share link and open it in a clean browser profile.
- Confirm the shared deal imports as a copy and the sender's original deal is unchanged.
- Print to PDF for each major strategy and scan for missing assumptions, unreadable text, or misleading values.
- Confirm the report disclaimer and support email are visible in the exported output.

## Data Safety

- Export a Deal Vault backup and import it into another browser profile.
- Test Retry sync after forcing the app offline, then reconnect.
- Confirm Supabase row-level security still prevents cross-account scenario reads.
- Confirm `.env.local` values are not committed and production env vars exist in Vercel.

## Visual And Device Pass

- Desktop: Chrome, Edge, and Safari if available.
- Mobile: iPhone Safari, Android Chrome, and one tablet width.
- Check dark and light mode for Settings, Deal Vault, Edit Deal, projections, charts, and print view.
- Confirm install/download controls only appear on mobile or tablet widths.

## Production Smoke

- Run `npm run lint`.
- Run `npm run test:ui`.
- Run `npm run build`.
- Open `https://www.dealcooker.app`, sign in, save a deal, reload, and confirm it syncs back.
- Send one live feedback message after deployment.
