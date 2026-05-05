-- DealCooker owner analytics events.
-- No direct client policies are created. Inserts flow through /api/analytics/events.

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid null references auth.users(id) on delete set null,
  anonymous_id text null,
  session_id text null,
  event_name text not null check (char_length(event_name) between 2 and 80),
  route text null,
  release text null,
  properties jsonb not null default '{}'::jsonb
);

create index if not exists analytics_events_created_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_event_created_idx on public.analytics_events (event_name, created_at desc);
create index if not exists analytics_events_user_created_idx on public.analytics_events (user_id, created_at desc);
create index if not exists analytics_events_anonymous_created_idx on public.analytics_events (anonymous_id, created_at desc);

alter table public.analytics_events enable row level security;
