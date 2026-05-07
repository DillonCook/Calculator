-- DealCooker in-app feedback capture.
-- No direct client policies are created. Inserts flow through /api/feedback.

create table if not exists public.feedback_submissions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  status text not null default 'email_accepted' check (status in ('email_accepted', 'email_rejected', 'email_unreachable', 'email_not_configured')),
  resend_email_id text null,
  resend_status integer null,
  resend_error text null,
  user_id uuid null references auth.users(id) on delete set null,
  contact_name text null,
  contact_email text not null,
  contact_phone text null,
  message text not null,
  source text null,
  viewport text null,
  route text null,
  app_release text null,
  active_deal text null,
  active_deal_id text null,
  active_strategy text null,
  projection_strategies text null,
  saved_deal_count integer null,
  context jsonb not null default '{}'::jsonb
);

create index if not exists feedback_submissions_created_idx on public.feedback_submissions (created_at desc);
create index if not exists feedback_submissions_status_created_idx on public.feedback_submissions (status, created_at desc);
create index if not exists feedback_submissions_email_created_idx on public.feedback_submissions (contact_email, created_at desc);
create index if not exists feedback_submissions_user_created_idx on public.feedback_submissions (user_id, created_at desc);

alter table public.feedback_submissions enable row level security;
