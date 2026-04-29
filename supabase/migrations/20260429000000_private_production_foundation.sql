-- DealCooker private production foundation.
-- Apply in Supabase SQL editor or through the Supabase CLI before enabling cloud sync for real users.

create table if not exists public.scenarios (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Deal',
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scenarios_user_updated_idx on public.scenarios (user_id, updated_at desc);

alter table public.scenarios enable row level security;

drop policy if exists "scenarios_select_own" on public.scenarios;
drop policy if exists "scenarios_insert_own" on public.scenarios;
drop policy if exists "scenarios_update_own" on public.scenarios;
drop policy if exists "scenarios_delete_own" on public.scenarios;

create policy "scenarios_select_own"
  on public.scenarios
  for select
  using (auth.uid() = user_id);

create policy "scenarios_insert_own"
  on public.scenarios
  for insert
  with check (auth.uid() = user_id);

create policy "scenarios_update_own"
  on public.scenarios
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "scenarios_delete_own"
  on public.scenarios
  for delete
  using (auth.uid() = user_id);

create table if not exists public.shares (
  slug text primary key,
  user_id uuid null references auth.users(id) on delete set null,
  owner_id uuid null references auth.users(id) on delete set null,
  scenario_id text null,
  payload_snapshot jsonb not null,
  is_public boolean not null default true,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists shares_owner_idx on public.shares (coalesce(user_id, owner_id), created_at desc);
create index if not exists shares_public_expiry_idx on public.shares (is_public, expires_at);

alter table public.shares enable row level security;

drop policy if exists "shares_select_public_or_own" on public.shares;
drop policy if exists "shares_insert_own" on public.shares;
drop policy if exists "shares_delete_own" on public.shares;

create policy "shares_select_public_or_own"
  on public.shares
  for select
  using (
    (is_public = true and expires_at > now())
    or auth.uid() = user_id
    or auth.uid() = owner_id
  );

create policy "shares_insert_own"
  on public.shares
  for insert
  with check (
    auth.uid() = user_id
    or auth.uid() = owner_id
  );

create policy "shares_delete_own"
  on public.shares
  for delete
  using (
    auth.uid() = user_id
    or auth.uid() = owner_id
  );

create table if not exists public.client_error_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid null references auth.users(id) on delete set null,
  route text null,
  source text not null,
  operation text null,
  severity text not null default 'error' check (severity in ('info', 'warning', 'error')),
  message text not null,
  stack text null,
  release text null,
  metadata jsonb null
);

create index if not exists client_error_events_created_idx on public.client_error_events (created_at desc);
create index if not exists client_error_events_source_idx on public.client_error_events (source, created_at desc);

alter table public.client_error_events enable row level security;

-- No direct client policies are created for client_error_events.
-- Inserts are performed through /api/client-errors with the server-only service role key.
