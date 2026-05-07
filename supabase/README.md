# Supabase Production Setup

Apply the SQL files in `migrations/` before inviting private production users.

## Tables

- `scenarios`: one row per saved Deal Vault scenario. RLS limits reads, inserts, updates, and deletes to `auth.uid() = user_id`.
- `shares`: short share-link snapshots. Public users can read only active public links; owners can manage their own links.
- `client_error_events`: sanitized production client/server error events written only by the server API route.
- `analytics_events`: first-party product usage and PWA install-funnel events written only by the server API route.
- `deal_review_requests`: contact + deal snapshots submitted through the deal review request flow, written only by the server API route.
- `feedback_submissions`: in-app feedback messages plus Resend delivery ids/status, written only by the server API route.

## Required Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENCLAW_API_KEY`
- `OPENCLAW_OWNER_USER_ID` when Open Claw requests do not send an owner id
- `NEXT_PUBLIC_APP_URL=https://dealcooker.app` for auth callback and password recovery links
- `NEXT_PUBLIC_APP_RELEASE` for release correlation in first-party error logs
- `NEXT_PUBLIC_CLIENT_ERROR_LOGS=1` only when you want first-party client error posts enabled outside production
- `RESEND_API_KEY` for feedback and deal-review delivery
- `FEEDBACK_TO_EMAIL=dillon@theinvestoragent.io` recommended so production does not depend on the fallback
- `FEEDBACK_FROM_EMAIL` optional; defaults to `DealCooker <noreply@dealcooker.app>` and must use a Resend-verified sender/domain
- `DEAL_REVIEW_TO_EMAIL` optional; defaults to `FEEDBACK_TO_EMAIL` or `dillon@theinvestoragent.io`
- `DEAL_REVIEW_FROM_EMAIL` optional; defaults to `FEEDBACK_FROM_EMAIL` or `DealCooker <noreply@dealcooker.app>`

## RLS Smoke Checks

1. Create two test users in Supabase Auth.
2. Sign in as user A and save a scenario.
3. Sign in as user B and verify user A's scenario is not returned from `scenarios`.
4. Create a share link and verify `/s/[slug]` opens while `is_public = true` and `expires_at > now()`.
5. Set `expires_at` in the past and verify the same share link reports unavailable.
6. Trigger a harmless production client error and verify `client_error_events` receives no deal payload, email, password, token, listing URL, or full URL.
7. Submit a deal review request and verify `deal_review_requests` receives one row through the server route, with no direct client insert policy.
8. Submit in-app feedback and verify `feedback_submissions` receives one row with `status = 'email_accepted'` and a `resend_email_id`; then confirm the same id in Resend delivery logs.
