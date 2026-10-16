-- Squado Admin Console: additive schema for trusted admin roles, events, safety reports,
-- account restrictions and audit history. Apply manually in the owned Supabase project.
-- This migration does not create an admin automatically. See docs/ADMIN-SETUP.md.

create table if not exists public.squado_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'admin' check (role in ('admin','owner')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.squado_events (
  id text primary key,
  payload jsonb not null,
  status text not null default 'draft' check (status in ('draft','published','cancelled')),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists squado_events_status_idx on public.squado_events(status, updated_at desc);

create table if not exists public.squado_safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_uid uuid not null references auth.users(id),
  reporter_email text not null default '',
  target_uid uuid references auth.users(id) on delete set null,
  target_reference text,
  target_label text,
  target_type text not null default 'user' check (target_type in ('user','plan','message','other')),
  plan_id text,
  reason text not null,
  details text not null default '',
  status text not null default 'new' check (status in ('new','reviewing','reviewed','dismissed','actioned')),
  review_note text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists squado_reports_status_created_idx on public.squado_safety_reports(status, created_at desc);
create index if not exists squado_reports_target_idx on public.squado_safety_reports(target_uid, created_at desc);

create table if not exists public.squado_account_restrictions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('active','warned','suspended')),
  reason text not null default '',
  expires_at timestamptz,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.squado_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_uid uuid not null references auth.users(id),
  action text not null,
  target_type text not null,
  target_id text,
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists squado_admin_audit_created_idx on public.squado_admin_audit_log(created_at desc);

-- These tables are accessed through the server's service-role client only. Do not grant
-- direct client access to authenticated users; the server performs role checks per request.
alter table public.squado_admins enable row level security;
alter table public.squado_events enable row level security;
alter table public.squado_safety_reports enable row level security;
alter table public.squado_account_restrictions enable row level security;
alter table public.squado_admin_audit_log enable row level security;

revoke all on public.squado_admins from anon, authenticated;
revoke all on public.squado_events from anon, authenticated;
revoke all on public.squado_safety_reports from anon, authenticated;
revoke all on public.squado_account_restrictions from anon, authenticated;
revoke all on public.squado_admin_audit_log from anon, authenticated;

-- Run this separate, reviewed statement after creating the private email/password admin
-- account in Supabase Auth. Replace the placeholder; do not commit the real email into code.
-- insert into public.squado_admins (user_id, email, role, active)
-- select id, lower(email), 'owner', true from auth.users
-- where lower(email) = lower('YOUR_PRIVATE_ADMIN_EMAIL')
-- on conflict (user_id) do update set email = excluded.email, role = 'owner', active = true;
