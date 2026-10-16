-- Squado shared-plans compatibility migration for the EXISTING live schema.
-- Review before use. Additive only: no DROP TABLE, DELETE, TRUNCATE, or existing-table replacement.
-- This migration intentionally uses public.profiles.id because the live table has
-- id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE.
-- Apply only after reviewing against a disposable Supabase test project first.

begin;

-- Add profile fields the current Squado browser code reads/writes. Existing columns
-- (id, username, name, city, gender, interests, created_at) are preserved.
alter table public.profiles
  add column if not exists email text,
  add column if not exists age_range text,
  add column if not exists bio text,
  add column if not exists photo_url text,
  add column if not exists onboarded boolean not null default false,
  add column if not exists rel jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- Shared plans. IDs are text because the existing frontend generates string plan IDs.
create table if not exists public.plans (
  id text primary key,
  creator uuid not null references public.profiles(id) on delete cascade,
  type text,
  title text,
  descr text,
  vibe text[] not null default '{}',
  loc text not null,
  dist numeric,
  when_at text,
  live boolean not null default false,
  size integer,
  who text not null default 'Everyone' check (who in ('Everyone','Girls only','Boys only')),
  status text not null default 'open' check (status in ('open','closed')),
  max integer not null check (max >= 2),
  spot text,
  auto boolean not null default false,
  completion jsonb,
  city text not null,
  loc_lat double precision,
  loc_lng double precision,
  loc_source text,
  loc_place text,
  day text,
  event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_lat_chk check (loc_lat is null or loc_lat between -90 and 90),
  constraint plans_lng_chk check (loc_lng is null or loc_lng between -180 and 180)
);
create index if not exists plans_creator_idx on public.plans(creator);
create index if not exists plans_status_idx on public.plans(status);
create index if not exists plans_city_status_idx on public.plans(city,status);
create index if not exists plans_created_at_idx on public.plans(created_at desc);

create table if not exists public.memberships (
  plan_id text not null references public.plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('host','member')),
  state text not null default 'member' check (state in ('member','left','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(plan_id,user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);

create table if not exists public.join_requests (
  plan_id text not null references public.plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','rejected')),
  at timestamptz not null default now(),
  primary key(plan_id,user_id)
);
create index if not exists join_requests_user_idx on public.join_requests(user_id);

-- Minimal block relation required by plan discovery's exclusion policy.
create table if not exists public.blocks (
  blocker uuid not null references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  at timestamptz not null default now(),
  primary key(blocker,blocked),
  constraint blocks_not_self_chk check (blocker <> blocked)
);
create index if not exists blocks_blocked_idx on public.blocks(blocked);
alter table public.blocks enable row level security;
drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks for select to authenticated using (blocker=auth.uid());
drop policy if exists blocks_insert on public.blocks;
create policy blocks_insert on public.blocks for insert to authenticated with check (blocker=auth.uid());
drop policy if exists blocks_delete on public.blocks;
create policy blocks_delete on public.blocks for delete to authenticated using (blocker=auth.uid());

-- Helpers are SECURITY DEFINER to avoid RLS recursion when checking membership/host status.
create or replace function public.is_member(plan text)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$ select exists (select 1 from public.memberships m where m.plan_id=plan and m.user_id=auth.uid() and m.state='member'); $$;

create or replace function public.is_host(plan text)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$ select exists (select 1 from public.plans p where p.id=plan and p.creator=auth.uid()); $$;

alter table public.plans enable row level security;
alter table public.memberships enable row level security;
alter table public.join_requests enable row level security;

-- Explicit table privileges; RLS policies remain the row-level authorization boundary.
grant select, insert, update, delete on public.plans to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select, insert, update, delete on public.join_requests to authenticated;
grant select, insert, delete on public.blocks to authenticated;

-- Plans are discoverable to authenticated users except where the creator is blocked by them.
-- Exact location/spot should still be hidden by UI/API until membership; do not expose spot in public cards.
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans for select to authenticated
using (auth.uid() is not null and not exists (
  select 1 from public.blocks b where b.blocker=auth.uid() and b.blocked=plans.creator
));
drop policy if exists plans_insert on public.plans;
create policy plans_insert on public.plans for insert to authenticated with check (creator=auth.uid());
drop policy if exists plans_update on public.plans;
create policy plans_update on public.plans for update to authenticated using (creator=auth.uid()) with check (creator=auth.uid());
drop policy if exists plans_delete on public.plans;
create policy plans_delete on public.plans for delete to authenticated using (creator=auth.uid());

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
using (user_id=auth.uid() or public.is_member(plan_id) or public.is_host(plan_id));
drop policy if exists memberships_insert on public.memberships;
create policy memberships_insert on public.memberships for insert to authenticated
with check ((user_id=auth.uid() and role='member') or (public.is_host(plan_id) and role in ('host','member')));
drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update to authenticated
using (user_id=auth.uid() or public.is_host(plan_id))
with check ((user_id=auth.uid() and role='member') or public.is_host(plan_id));
drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
using (user_id=auth.uid() or public.is_host(plan_id));

drop policy if exists join_requests_select on public.join_requests;
create policy join_requests_select on public.join_requests for select to authenticated
using (user_id=auth.uid() or public.is_host(plan_id));
drop policy if exists join_requests_insert on public.join_requests;
create policy join_requests_insert on public.join_requests for insert to authenticated
with check (user_id=auth.uid() and exists (
  select 1 from public.plans p where p.id=plan_id and p.status='open'
) and not exists (
  select 1 from public.memberships m where m.plan_id=plan_id and m.user_id=auth.uid() and m.state in ('member','removed')
));
drop policy if exists join_requests_update on public.join_requests;
create policy join_requests_update on public.join_requests for update to authenticated
using (public.is_host(plan_id)) with check (public.is_host(plan_id));
drop policy if exists join_requests_delete on public.join_requests;
create policy join_requests_delete on public.join_requests for delete to authenticated
using (public.is_host(plan_id) or user_id=auth.uid());

-- Seed a host membership atomically whenever a plan is created. This avoids a
-- published plan existing without its host membership if the second browser request fails.
create or replace function public.add_plan_host_membership()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$ begin
  insert into public.memberships(plan_id,user_id,role,state)
  values(new.id,new.creator,'host','member')
  on conflict(plan_id,user_id) do update set role='host',state='member',updated_at=now();
  return new;
end; $$;
drop trigger if exists plans_add_host_membership on public.plans;
create trigger plans_add_host_membership after insert on public.plans
for each row execute function public.add_plan_host_membership();

-- Prevent direct invocation of helper/trigger functions by ordinary clients.
revoke all on function public.is_member(text) from public, anon;
revoke all on function public.is_host(text) from public, anon;
revoke all on function public.add_plan_host_membership() from public, anon, authenticated;
grant execute on function public.is_member(text) to authenticated;
grant execute on function public.is_host(text) to authenticated;

commit;
