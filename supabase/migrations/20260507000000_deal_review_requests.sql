-- DealCooker deal review request lead capture.
-- No direct client policies are created. Inserts flow through /api/deal-review.

create table if not exists public.deal_review_requests (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'contacted', 'assigned', 'working', 'closed', 'dead')),
  user_id uuid null references auth.users(id) on delete set null,
  contact_name text null,
  contact_email text not null,
  contact_phone text null,
  market text null,
  review_focus text not null default 'General review',
  notes text null,
  deal_name text not null default 'Untitled Deal',
  listing_url text null,
  active_strategy text null,
  active_strategy_label text null,
  purchase_price numeric null,
  rehab_budget numeric null,
  arv numeric null,
  monthly_cash_flow numeric null,
  total_cash_needed numeric null,
  cash_on_cash_return numeric null,
  roi numeric null,
  irr numeric null,
  dscr numeric null,
  payload_snapshot jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb
);

create index if not exists deal_review_requests_created_idx on public.deal_review_requests (created_at desc);
create index if not exists deal_review_requests_status_created_idx on public.deal_review_requests (status, created_at desc);
create index if not exists deal_review_requests_market_created_idx on public.deal_review_requests (market, created_at desc);
create index if not exists deal_review_requests_user_created_idx on public.deal_review_requests (user_id, created_at desc);

alter table public.deal_review_requests enable row level security;
