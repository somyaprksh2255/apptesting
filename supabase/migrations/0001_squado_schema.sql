-- =============================================================================
-- Squado — application schema + Row Level Security (RLS)
-- Migration: 0001_squado_schema.sql
--
--   ****  REVIEWABLE ARTIFACT ONLY — DO NOT RUN AGAINST A LIVE DATABASE.  ****
--
-- This file is a forward-looking, reviewable design artifact (design.md §11,
-- FEAT-004). It is NOT applied automatically by any agent, build, or test, and
-- it is NOT wired into the running app (the browser app stays localStorage-
-- authoritative for this change — design §17 A3).
--
-- Apply it MANUALLY, only after you have reviewed it, and only in the Supabase
-- SQL editor (or `supabase db` CLI) of a project YOU own. The agent must never
-- execute it, never migrate, and never delete existing data.
--
-- Safety properties of this file (verify before applying):
--   * every statement is ADDITIVE: `create table if not exists`,
--     `create index if not exists`, `create or replace function`,
--     `drop policy if exists` immediately followed by `create policy`
--     (that `drop policy` recreates a policy object — it NEVER drops a table,
--     column, or row and NEVER deletes application data).
--   * NO `drop table`, NO `delete from`, NO `truncate` anywhere.
--   * RLS is ENABLED on every application table.
--
-- Identity: Supabase Auth owns `auth.users`. The app schema references
-- `auth.uid()` (the signed-in user's uuid) and `auth.users(id)`.
--
-- The RLS policies below mirror the frontend access rules in
-- `src/js/state/access.js` and `src/js/state/membership.js`. The exact JS
-- predicate each policy mirrors is quoted in a comment directly above it so a
-- reviewer can check them clause-for-clause. The frontend rules are UX-only
-- safeguards (localStorage is forgeable); these policies are the real,
-- server-enforced equivalent.
-- =============================================================================

-- gen_random_uuid() for uuid primary keys.
create extension if not exists pgcrypto;

-- =============================================================================
-- 1. TABLES  (additive; `create table if not exists`; no DROP/DELETE of data)
-- =============================================================================

-- profiles: one row per Supabase identity (one auth.users id => one profile).
-- Mirrors S.me / S.users entries. `auth_uid` is the Supabase user id.
create table if not exists public.profiles (
    auth_uid   uuid primary key references auth.users (id) on delete cascade,
    username   text unique,
    name       text,
    email      text,
    gender     text,                         -- '', 'Girl', 'Boy', ... (access.js who-gate)
    city       text,
    age_range  text,
    bio        text,
    photo_url  text,                          -- public avatars-bucket URL (S.me.photo)
    interests  text[] not null default '{}',
    onboarded  boolean not null default false,
    rel        jsonb  not null default '{}'::jsonb,  -- hosted/joined/completed/cancel/noshow
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- plans: a squad/meetup. `id` is the app's text id ('p1', 'p1699...'). The five
-- membership lifecycle lists (members/reqs/rej/left/removed) live in the
-- memberships + join_requests tables below, not as arrays here.
create table if not exists public.plans (
    id          text primary key,
    creator     uuid not null references public.profiles (auth_uid) on delete cascade,
    type        text,
    title       text,
    descr       text,                         -- the app's `desc` field (desc is reserved in SQL)
    vibe        text[] not null default '{}',
    loc         text,
    dist        numeric,
    when_at     text,                         -- the app's free-text `when` ('9:30 PM', 'LIVE NOW')
    live        boolean not null default false,
    size        int,
    who         text not null default 'Everyone',   -- 'Everyone' | 'Girls only' | 'Boys only'
    status      text not null default 'open',       -- 'open' | 'closed'
    max         int,
    spot        text,                         -- exact meeting spot (members-only in the UI)
    auto        boolean not null default false,
    completion  jsonb,                        -- { by, confirms[], disputes[] }
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    constraint plans_who_chk    check (who in ('Everyone', 'Girls only', 'Boys only')),
    constraint plans_status_chk check (status in ('open', 'closed'))
);

create index if not exists plans_creator_idx on public.plans (creator);
create index if not exists plans_status_idx  on public.plans (status);

-- memberships: the 'accepted' / 'left' / 'removed' lifecycle states (membership.js).
-- 'pending' / 'rejected' live in join_requests. The host (plan.creator) is role=host.
create table if not exists public.memberships (
    plan_id    text not null references public.plans (id) on delete cascade,
    user_id    uuid not null references public.profiles (auth_uid) on delete cascade,
    role       text not null default 'member',   -- 'host' | 'member'
    state      text not null default 'member',    -- 'member' | 'left' | 'removed'
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (plan_id, user_id),
    constraint memberships_role_chk  check (role  in ('host', 'member')),
    constraint memberships_state_chk check (state in ('member', 'left', 'removed'))
);

create index if not exists memberships_user_idx on public.memberships (user_id);

-- join_requests: pending ask-to-join (p.reqs) and silent rejection (p.rej).
create table if not exists public.join_requests (
    plan_id    text not null references public.plans (id) on delete cascade,
    user_id    uuid not null references public.profiles (auth_uid) on delete cascade,
    state      text not null default 'pending',  -- 'pending' | 'rejected'
    at         timestamptz not null default now(),
    primary key (plan_id, user_id),
    constraint join_requests_state_chk check (state in ('pending', 'rejected'))
);

create index if not exists join_requests_user_idx on public.join_requests (user_id);

-- messages: group chat. `media_path` is the private chat-media object path (mpath);
-- the signed URL is minted server-side and never stored.
create table if not exists public.messages (
    id         uuid primary key default gen_random_uuid(),
    plan_id    text not null references public.plans (id) on delete cascade,
    by         uuid references public.profiles (auth_uid) on delete set null,
    kind       text not null default 'text',  -- 'text'|'photo'|'location'|'photo-location'|'sys'
    text       text,
    media_path text,                           -- = the message mpath (chat-media object path)
    loc        jsonb,
    created_at timestamptz not null default now(),
    constraint messages_kind_chk check (kind in ('text', 'photo', 'location', 'photo-location', 'sys'))
);

create index if not exists messages_plan_created_idx on public.messages (plan_id, created_at);

-- attendance: check-in records + audit trail + dispute (S.attendance).
create table if not exists public.attendance (
    id         uuid primary key default gen_random_uuid(),
    plan_id    text not null references public.plans (id) on delete cascade,
    uid        uuid not null references public.profiles (auth_uid) on delete cascade,
    audit      jsonb not null default '[]'::jsonb,
    dispute    jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (plan_id, uid)
);

create index if not exists attendance_plan_idx on public.attendance (plan_id);

-- feedback: post-meetup feedback from one member about a plan / another member.
create table if not exists public.feedback (
    id         uuid primary key default gen_random_uuid(),
    plan_id    text not null references public.plans (id) on delete cascade,
    by         uuid not null references public.profiles (auth_uid) on delete cascade,
    to_uid     uuid references public.profiles (auth_uid) on delete set null,
    rating     int,
    notes      text,
    created_at timestamptz not null default now()
);

create index if not exists feedback_plan_idx on public.feedback (plan_id);

-- blocks: persisted so RLS can mirror the client `S.blocked` exclusion faithfully
-- (planVisible / canViewProfile). blocker blocked `blocked`.
create table if not exists public.blocks (
    blocker uuid not null references public.profiles (auth_uid) on delete cascade,
    blocked uuid not null references public.profiles (auth_uid) on delete cascade,
    at      timestamptz not null default now(),
    primary key (blocker, blocked)
);

create index if not exists blocks_blocked_idx on public.blocks (blocked);

-- =============================================================================
-- 2. HELPERS (SECURITY DEFINER so a policy can read a sibling table without
--    recursing through that table's own RLS)
-- =============================================================================

-- is_member(plan) mirrors groupAccess's accepted-member test:
--   const groupAccess = p => tier() == 'ready' && ['host','member'].includes(membership(p,'me'));
-- The host is always an accepted member (membership.js: p.creator is in p.members),
-- so a 'member'-state row OR the role='host' row both count.
create or replace function public.is_member(plan text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.memberships m
        where m.plan_id = plan
          and m.user_id = auth.uid()
          and m.state   = 'member'
    );
$$;

-- is_host(plan) mirrors isAdmin:
--   const isAdmin = p => groupAccess(p) && p.creator == 'me';
create or replace function public.is_host(plan text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.plans pl
        where pl.id = plan
          and pl.creator = auth.uid()
    );
$$;

-- =============================================================================
-- 3. ENABLE ROW LEVEL SECURITY ON EVERY TABLE
-- =============================================================================

alter table public.profiles      enable row level security;
alter table public.plans         enable row level security;
alter table public.memberships   enable row level security;
alter table public.join_requests enable row level security;
alter table public.messages      enable row level security;
alter table public.attendance    enable row level security;
alter table public.feedback      enable row level security;
alter table public.blocks        enable row level security;

-- =============================================================================
-- 4. POLICIES  (each mirrors the quoted access.js / membership.js predicate)
--    `drop policy if exists` recreates the POLICY object only; it never drops a
--    table or deletes data, and makes re-applying this file idempotent.
-- =============================================================================

-- ---- profiles -------------------------------------------------------------
-- SELECT mirrors canViewProfile(id):
--   if (tier() != 'ready') return false;
--   if (id == 'me') return true;                             -- (own row)
--   if (!idOk(id) || !S.users.some(...) || S.blocked.includes(id)) return false;  -- block exclusion
--   return S.plans.some(p =>
--        (groupAccess(p) && p.members.includes(id))          -- (A) co-member of a squad I can see
--     || (p.creator == id && planVisible(p))                 -- (B) creator of a plan visible to me
--     || (isAdmin(p) && gl(p,'reqs').some(r => r.u == id)));  -- (C) a pending requester on a plan I host
-- The block clause mirrors `S.blocked.includes(id)` =>
--   NOT EXISTS (blocks b WHERE b.blocker=auth.uid() AND b.blocked=profiles.auth_uid)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
    for select
    using (
        auth_uid = auth.uid()                                           -- id == 'me'
        or (
            not exists (                                                -- NOT S.blocked.includes(id)
                select 1 from public.blocks b
                where b.blocker = auth.uid()
                  and b.blocked = public.profiles.auth_uid
            )
            and (
                -- (A) co-member: I am an accepted member of a plan this user is in
                exists (
                    select 1
                    from public.memberships me_m
                    join public.memberships them_m
                      on them_m.plan_id = me_m.plan_id
                    where me_m.user_id   = auth.uid()
                      and me_m.state     = 'member'
                      and them_m.user_id = public.profiles.auth_uid
                      and them_m.state   = 'member'
                )
                -- (B) this user creates a plan visible to me (planVisible = is_member OR not-blocked-creator)
                or exists (
                    select 1
                    from public.plans p
                    where p.creator = public.profiles.auth_uid
                      and (
                          public.is_member(p.id)
                          or not exists (
                              select 1 from public.blocks b2
                              where b2.blocker = auth.uid()
                                and b2.blocked = p.creator
                          )
                      )
                )
                -- (C) I host a plan on which this user has a pending join request
                or exists (
                    select 1
                    from public.join_requests jr
                    where jr.user_id = public.profiles.auth_uid
                      and jr.state   = 'pending'
                      and public.is_host(jr.plan_id)
                )
            )
        )
    );

-- INSERT / UPDATE only self:
--   profile edits always write S.me (the signed-in person); finishOb/saveEd mutate S.me only.
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
    for insert
    with check (auth_uid = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
    for update
    using (auth_uid = auth.uid())
    with check (auth_uid = auth.uid());

-- ---- plans ----------------------------------------------------------------
-- SELECT mirrors planVisible:
--   const planVisible = p => !!p && (groupAccess(p) || !S.blocked.includes(p.creator));
--   => is_member(id) OR NOT EXISTS(blocks b WHERE b.blocker=auth.uid() AND b.blocked=plans.creator)
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans
    for select
    using (
        public.is_member(id)
        or not exists (
            select 1 from public.blocks b
            where b.blocker = auth.uid()
              and b.blocked = public.plans.creator
        )
    );

-- INSERT / UPDATE / DELETE only by the host (isAdmin => p.creator == 'me'):
drop policy if exists plans_insert on public.plans;
create policy plans_insert on public.plans
    for insert
    with check (creator = auth.uid());

drop policy if exists plans_update on public.plans;
create policy plans_update on public.plans
    for update
    using (creator = auth.uid())
    with check (creator = auth.uid());

drop policy if exists plans_delete on public.plans;
create policy plans_delete on public.plans
    for delete
    using (creator = auth.uid());

-- ---- memberships ----------------------------------------------------------
-- SELECT for same-plan members and the host (groupAccess sees the member list):
--   groupAccess(p) => ['host','member'].includes(membership(p,'me'))
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
    for select
    using (
        user_id = auth.uid()                 -- always see my own membership rows
        or public.is_member(plan_id)         -- a co-member sees the roster
        or public.is_host(plan_id)           -- the host sees the roster
    );

-- INSERT: the host adds/approves a member, OR self-join lands you in your own row.
-- (memApprove is host-only; memRequest on an auto-accept squad self-inserts.)
drop policy if exists memberships_insert on public.memberships;
create policy memberships_insert on public.memberships
    for insert
    with check (
        user_id = auth.uid()                 -- self (auto-accept join / self-leave bookkeeping)
        or public.is_host(plan_id)           -- host approving a request
    );

-- UPDATE: host (approve/remove transitions) or self (leave).
--   memLeave: an accepted member leaves by choice; memRemove/memApprove are host-only.
drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships
    for update
    using (user_id = auth.uid() or public.is_host(plan_id))
    with check (user_id = auth.uid() or public.is_host(plan_id));

-- DELETE: host removes a member, or the member removes their own row (self-leave).
drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships
    for delete
    using (user_id = auth.uid() or public.is_host(plan_id));

-- ---- join_requests --------------------------------------------------------
-- SELECT by the requester or the plan host:
--   the requester sees their own status on the plan page; isAdmin(p) sees p.reqs.
drop policy if exists join_requests_select on public.join_requests;
create policy join_requests_select on public.join_requests
    for select
    using (user_id = auth.uid() or public.is_host(plan_id));

-- INSERT by self subject to joinCheck (membership.js memCanRequest + access.js joinCheck):
--   plan must be 'open'; the requester must NOT be in p.removed and NOT already a member;
--   who-gender gate: (who=='Girls only' => gender 'Girl') / (who=='Boys only' => gender 'Boy').
-- Capacity (p.members.length >= p.max) is NOT expressible race-free in a row policy, so it is
-- enforced by the join_requests_capacity_gate trigger below (and ultimately on approval).
drop policy if exists join_requests_insert on public.join_requests;
create policy join_requests_insert on public.join_requests
    for insert
    with check (
        user_id = auth.uid()
        and exists (
            select 1 from public.plans p
            where p.id = plan_id
              and p.status = 'open'                                   -- memCanRequest: 'closed'
        )
        and not exists (                                              -- memCanRequest: 'removed'
            select 1 from public.memberships m
            where m.plan_id = plan_id
              and m.user_id = auth.uid()
              and m.state = 'removed'
        )
        and not exists (                                              -- memCanRequest: 'member'
            select 1 from public.memberships m2
            where m2.plan_id = plan_id
              and m2.user_id = auth.uid()
              and m2.state = 'member'
        )
        and exists (                                                  -- joinCheck 'gender' gate
            select 1
            from public.plans p2
            join public.profiles pr on pr.auth_uid = auth.uid()
            where p2.id = plan_id
              and (
                  p2.who = 'Everyone'
                  or (p2.who = 'Girls only' and pr.gender = 'Girl')
                  or (p2.who = 'Boys only'  and pr.gender = 'Boy')
              )
        )
    );

-- UPDATE / DELETE by the host (approve -> membership, reject -> state='rejected', clear).
drop policy if exists join_requests_update on public.join_requests;
create policy join_requests_update on public.join_requests
    for update
    using (public.is_host(plan_id))
    with check (public.is_host(plan_id));

drop policy if exists join_requests_delete on public.join_requests;
create policy join_requests_delete on public.join_requests
    for delete
    using (public.is_host(plan_id) or user_id = auth.uid());  -- host decision, or requester withdraws (memCancelRequest)

-- Capacity gate: refuse a new pending request when the squad is already full
-- (memCanRequest: 'full' => gl(p,'members').length >= p.max). A trigger (not a
-- row policy) is used so the member count is read atomically at insert time.
create or replace function public.join_requests_capacity_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    plan_max   int;
    member_cnt int;
begin
    select p.max into plan_max from public.plans p where p.id = new.plan_id;

    select count(*) into member_cnt
    from public.memberships m
    where m.plan_id = new.plan_id and m.state = 'member';

    if plan_max is not null and member_cnt >= plan_max then
        raise exception 'squad full'               -- JOIN_MSG 'full'
            using errcode = 'check_violation';
    end if;

    return new;
end;
$$;

drop trigger if exists join_requests_capacity_gate_trg on public.join_requests;
create trigger join_requests_capacity_gate_trg
    before insert on public.join_requests
    for each row
    execute function public.join_requests_capacity_gate();

-- ---- messages -------------------------------------------------------------
-- SELECT / INSERT only where is_member(plan_id):
--   private content of a squad (chat, attachments) is accepted members only (groupAccess).
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
    for select
    using (public.is_member(plan_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
    for insert
    with check (public.is_member(plan_id) and by = auth.uid());

-- ---- attendance -----------------------------------------------------------
-- Scoped to plan members / host (groupAccess). A member manages only their own
-- attendance row; the host may read/adjust any row on their plan.
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance
    for select
    using (public.is_member(plan_id) or public.is_host(plan_id));

drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance
    for insert
    with check (
        (uid = auth.uid() and public.is_member(plan_id))   -- claim my own check-in
        or public.is_host(plan_id)                         -- host records attendance
    );

drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance
    for update
    using (uid = auth.uid() or public.is_host(plan_id))
    with check (uid = auth.uid() or public.is_host(plan_id));

-- ---- feedback -------------------------------------------------------------
-- Scoped to plan members / host. The author (`by`) is always the signed-in user.
drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback
    for select
    using (public.is_member(plan_id) or public.is_host(plan_id));

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback
    for insert
    with check (by = auth.uid() and (public.is_member(plan_id) or public.is_host(plan_id)));

-- ---- blocks ---------------------------------------------------------------
-- SELECT / INSERT / DELETE only where blocker == auth.uid():
--   S.blocked is the signed-in person's own list; nobody else reads or writes it.
drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks
    for select
    using (blocker = auth.uid());

drop policy if exists blocks_insert on public.blocks;
create policy blocks_insert on public.blocks
    for insert
    with check (blocker = auth.uid());

drop policy if exists blocks_delete on public.blocks;
create policy blocks_delete on public.blocks
    for delete
    using (blocker = auth.uid());

-- =============================================================================
-- 5. STORAGE BUCKET POLICIES  (design §11.3)
--
-- Create the two buckets MANUALLY in the Supabase dashboard first (Storage):
--   * avatars     — PUBLIC   bucket (profile photos)
--   * chat-media  — PRIVATE  bucket (chat attachments; signed URLs only)
-- These policies then constrain writes/reads on storage.objects. They are
-- additive (`drop policy if exists` recreates the policy object only).
-- Path convention:
--   avatars/{auth.uid()}/<file>
--   chat-media/{plan_id}/{auth.uid()}/<file>
-- storage.foldername(name) returns the path segments as a text[]; [1] is the
-- first folder.
-- =============================================================================

-- avatars (PUBLIC): anyone may read; a user may write only under their own uid folder.
--   avatars/{auth.uid()}/...  =>  storage.foldername(name)[1] = auth.uid()::text
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
    for select
    using (bucket_id = 'avatars');

drop policy if exists avatars_owner_insert on storage.objects;
create policy avatars_owner_insert on storage.objects
    for insert
    with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects
    for update
    using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects
    for delete
    using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- chat-media (PRIVATE): no public read. A member of the plan may read; a member
-- may upload only under chat-media/{plan_id}/{auth.uid()}/...
--   path segment [1] = plan_id (is_member check), [2] = auth.uid() (own folder).
-- Clients normally receive content via short-lived signed URLs minted by the
-- server after its own membership re-check (defense in depth over these policies).
drop policy if exists chat_media_member_read on storage.objects;
create policy chat_media_member_read on storage.objects
    for select
    using (
        bucket_id = 'chat-media'
        and public.is_member((storage.foldername(name))[1])
    );

drop policy if exists chat_media_member_insert on storage.objects;
create policy chat_media_member_insert on storage.objects
    for insert
    with check (
        bucket_id = 'chat-media'
        and public.is_member((storage.foldername(name))[1])     -- is_member(plan_id)
        and (storage.foldername(name))[2] = auth.uid()::text     -- own uid folder
    );

-- =============================================================================
-- END — reviewable only. Apply manually. Never run against a live DB by tooling.
-- =============================================================================
