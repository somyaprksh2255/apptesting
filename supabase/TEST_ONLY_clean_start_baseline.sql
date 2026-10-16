-- SQUADO CLEAN-START TEST BASELINE — REVIEW COPY
-- Target: ONLY the new, empty Supabase TEST project. Never run on the existing live project.
-- This file combines the active core migrations in the intended order for one-time use in SQL Editor.
-- Identity standard: public.profiles.id = auth.users.id, matching current app code.
-- The archived duplicate 0010 draft is intentionally excluded.
-- Static review only: this SQL has NOT been executed against a PostgreSQL/Supabase engine in this environment.
-- Run only after reviewing the script and confirming this test project is empty.

begin;


-- ==================== BEGIN 0001_squado_schema.sql ====================
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
-- Mirrors S.me / S.users entries. `id` is the Supabase user id.
create table if not exists public.profiles (
    id   uuid primary key references auth.users (id) on delete cascade,
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
    creator     uuid not null references public.profiles (id) on delete cascade,
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
    user_id    uuid not null references public.profiles (id) on delete cascade,
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
    user_id    uuid not null references public.profiles (id) on delete cascade,
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
    by         uuid references public.profiles (id) on delete set null,
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
    uid        uuid not null references public.profiles (id) on delete cascade,
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
    by         uuid not null references public.profiles (id) on delete cascade,
    to_uid     uuid references public.profiles (id) on delete set null,
    rating     int,
    notes      text,
    created_at timestamptz not null default now()
);

create index if not exists feedback_plan_idx on public.feedback (plan_id);

-- blocks: persisted so RLS can mirror the client `S.blocked` exclusion faithfully
-- (planVisible / canViewProfile). blocker blocked `blocked`.
create table if not exists public.blocks (
    blocker uuid not null references public.profiles (id) on delete cascade,
    blocked uuid not null references public.profiles (id) on delete cascade,
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
--   NOT EXISTS (blocks b WHERE b.blocker=auth.uid() AND b.blocked=profiles.id)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
    for select
    using (
        id = auth.uid()                                           -- id == 'me'
        or (
            not exists (                                                -- NOT S.blocked.includes(id)
                select 1 from public.blocks b
                where b.blocker = auth.uid()
                  and b.blocked = public.profiles.id
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
                      and them_m.user_id = public.profiles.id
                      and them_m.state   = 'member'
                )
                -- (B) this user creates a plan visible to me (planVisible = is_member OR not-blocked-creator)
                or exists (
                    select 1
                    from public.plans p
                    where p.creator = public.profiles.id
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
                    where jr.user_id = public.profiles.id
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
    with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
    for update
    using (id = auth.uid())
    with check (id = auth.uid());

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
            join public.profiles pr on pr.id = auth.uid()
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
-- ==================== END 0001_squado_schema.sql ====================

-- ==================== BEGIN 0002_squado_constraints.sql ====================
-- =============================================================================
-- Squado — additive schema-constraint hardening
-- Migration: 0002_squado_constraints.sql
--
--   ****  REVIEWABLE ARTIFACT ONLY — DO NOT RUN AGAINST A LIVE DATABASE.  ****
--
-- This migration layers the schema-constraint hardening flagged in the backend
-- audit §2 ("Missing / weak constraints") ON TOP OF 0001_squado_schema.sql. It
-- is a SEPARATE file by design: 0001 is left byte-for-byte unchanged (per the
-- P2 Step 1 instruction "address the documented schema constraint gaps in a new
-- migration rather than editing 0001").
--
-- Apply ORDER: 0001 first, then this file (0002). Apply it MANUALLY, only after
-- review, and ONLY in the SQL editor (or `supabase db` CLI) of a DEDICATED,
-- THROWAWAY test project that YOU own — NEVER production. No agent, build, or
-- test applies this file; the running browser app stays localStorage-
-- authoritative for this phase (design §17 A3), exactly as under 0001.
--
-- Safety properties of this file (verify before applying):
--   * Every statement is ADDITIVE and uses an idempotency guard where PostgreSQL
--     allows one: `create index if not exists`, `create or replace function`,
--     `drop trigger if exists` immediately followed by `create trigger`, and
--     `add constraint` wrapped in a "does it already exist?" guard so re-running
--     is a no-op. (`alter table ... add column` uses `if not exists`.)
--   * NO `drop table`, NO `drop column`, NO `delete from`, NO `truncate`, and no
--     `drop constraint` of anything created by 0001. Nothing here deletes data.
--   * Column additions are NULLABLE or carry a safe DEFAULT, so adding them to a
--     table that already holds rows cannot fail or rewrite existing data in a
--     lossy way.
--
-- REVERSIBILITY-IN-SPIRIT: each object added here is named, so a reviewer can
-- reverse any single change with a targeted `drop index` / `drop trigger` /
-- `alter table ... drop constraint` / `alter table ... drop column` if desired.
-- The DOWN steps are listed in a comment block at the END of this file (NOT
-- executed) so the forward migration never deletes anything on its own.
--
-- Each change below cites the audit §2 gap it closes and the frontend behaviour
-- it mirrors so a reviewer can check it clause-for-clause.
-- =============================================================================


-- =============================================================================
-- 1. profiles.username — forbid empty / whitespace-only usernames
--    (audit §2: "profiles.username unique permits many NULLs ... the app requires
--     a username but the DB does not enforce it")
--
-- DESIGN CHOICE — CHECK, not NOT NULL.
--   0001 declares `username text unique`. In PostgreSQL a UNIQUE column already
--   permits multiple NULLs, and that NULL window is MEANINGFUL to the app: a
--   profile row is created at sign-in BEFORE onboarding picks a username
--   (src/js/app/auth.js createAccount pushes the record first; finishOb sets the
--   username later). Forcing NOT NULL now would break that create-then-onboard
--   order and would require a backfill for any pre-existing NULL-username row.
--
--   So instead of NOT NULL we forbid the value the app can NEVER legitimately
--   store: an empty or whitespace-only username. This keeps the "NULL until
--   onboarded" semantics intact while guaranteeing that any PRESENT username is
--   non-blank (matching the client, which blocks a too-short/blank username at
--   onboarding — e2e "signup validation: too-short username blocks Next").
--
--   BACKFILL NOTE: if a reviewer later decides to make username mandatory, the
--   backfill is: (a) assign usernames to any NULL rows, then (b) `alter table
--   public.profiles alter column username set not null;` in a FOLLOW-UP migration.
--   That is intentionally NOT done here because it is not additive and needs data.
-- =============================================================================
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'profiles_username_nonblank_chk'
    ) then
        alter table public.profiles
            add constraint profiles_username_nonblank_chk
            check (username is null or btrim(username) <> '');
    end if;
end
$$;


-- =============================================================================
-- 2. profiles.email — forbid blanks, enforce a loose format, and make present
--    emails unique (case-insensitively)
--    (audit §2: "no not null on profiles.email, no uniqueness, no format/citext
--     handling")
--
-- DESIGN CHOICE — no NOT NULL, no citext extension.
--   * NOT NULL is NOT added: handleSupabaseUser maps a Supabase identity to a
--     profile and only writes a VERIFIED Google email; a profile may briefly exist
--     before an email is attached, and we do not want to break that order (same
--     reasoning as username above). We instead forbid a blank string.
--   * citext is deliberately AVOIDED. Requiring `create extension citext` would
--     add an extension dependency to every throwaway test project and to prod,
--     complicating the manual apply step the instruction warns about. Instead we
--     get case-insensitive uniqueness with a PARTIAL UNIQUE INDEX on lower(email)
--     over non-null rows — no extension required, and NULLs are still allowed
--     (multiple pre-email profiles remain legal).
--   * The format CHECK is intentionally LOOSE (a single '@' with non-empty local
--     and domain parts). Email validation is famously not fully regex-expressible;
--     the authoritative check is Supabase Auth / Google verification. This CHECK
--     only rejects obvious garbage, and tolerates NULL.
-- =============================================================================
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'profiles_email_format_chk'
    ) then
        alter table public.profiles
            add constraint profiles_email_format_chk
            check (
                email is null
                or (
                    btrim(email) <> ''
                    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
                )
            );
    end if;
end
$$;

-- Case-insensitive uniqueness for PRESENT emails only (NULLs excluded, so
-- pre-email profiles do not collide with each other).
create unique index if not exists profiles_email_lower_uniq
    on public.profiles (lower(email))
    where email is not null;


-- =============================================================================
-- 3. memberships — at most ONE host per plan
--    (audit §2: "memberships has no single-host guarantee (nothing prevents two
--     role='host' rows for one plan)")
--
-- Mirrors membership.js: a plan's host is its single creator (p.creator). A
-- partial UNIQUE index on (plan_id) WHERE role='host' makes a second host row for
-- the same plan a uniqueness violation, while leaving the many 'member' rows per
-- plan unconstrained. Additive, idempotent, deletes nothing.
-- =============================================================================
create unique index if not exists memberships_one_host_per_plan
    on public.memberships (plan_id)
    where role = 'host';


-- =============================================================================
-- 4. attendance — represent the client's present | absent | claimed model
--    (audit §2: "attendance has no status/method columns and no check constraints
--     mirroring the client's present | absent | claimed model")
--
-- The client (src/js/state/attendance.js) tracks, per attendee, a STATUS and the
-- METHOD by which it was recorded (see the file header and `attUpsert`):
--   * status:  present | absent | claimed       (claimed = self-asserted, pending)
--   * method:  native_camera | in_app_scanner | manual | organizer
--              native_camera / in_app_scanner are the two verified SCAN methods
--              (attendance.js `ATT_SCAN`); manual = organizer typed it in;
--              organizer = the host's own auto-present mark.
-- These are the EXACT string literals the client writes, taken verbatim from
-- attendance.js (not a reinterpretation) so the DB can store what the app tracks.
-- 0001's attendance table carries only an opaque `audit` jsonb + a `dispute`
-- jsonb. We ADD nullable columns so the DB can represent the same model, with
-- CHECK constraints restricting them to the known vocab. Columns are NULLABLE
-- (no backfill needed) and the CHECKs tolerate NULL so existing rows stay valid.
-- =============================================================================
alter table public.attendance
    add column if not exists status text;

alter table public.attendance
    add column if not exists method text;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'attendance_status_chk'
    ) then
        alter table public.attendance
            add constraint attendance_status_chk
            check (status is null or status in ('present', 'absent', 'claimed'));
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'attendance_method_chk'
    ) then
        alter table public.attendance
            add constraint attendance_method_chk
            check (method is null or method in ('native_camera', 'in_app_scanner', 'manual', 'organizer'));
    end if;
end
$$;


-- =============================================================================
-- 5. messages — kind/field integrity + a text length bound
--    (audit §2: "messages: no check tying kind='photo' to a non-null media_path;
--     no length/check on text")
--
-- 5a. A photo-bearing message MUST carry a media_path. The client kinds that
--     render an image are 'photo' and 'photo-location' (GroupList.js msgPreview /
--     the chat renderer). For those kinds media_path must be present and non-blank;
--     for every other kind media_path is irrelevant and may be NULL.
--
-- 5b. Text length bound. config.chatMaxLen is 300 for USER chat text, but 'sys'
--     messages (system join/leave/cancel notices) are server/app generated and can
--     be longer, so a hard 300 cap on the column would reject legitimate system
--     rows. We therefore use a generous DB-level ceiling of 4000 chars as a
--     storage sanity bound (defence against an unbounded write), NOT a mirror of
--     the 300-char UX limit — the 300 cap stays a frontend concern. The CHECK
--     tolerates NULL text (e.g. a pure photo/location message).
-- =============================================================================
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'messages_photo_media_chk'
    ) then
        alter table public.messages
            add constraint messages_photo_media_chk
            check (
                kind not in ('photo', 'photo-location')
                or (media_path is not null and btrim(media_path) <> '')
            );
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'messages_text_len_chk'
    ) then
        alter table public.messages
            add constraint messages_text_len_chk
            check (text is null or char_length(text) <= 4000);
    end if;
end
$$;


-- =============================================================================
-- 6. updated_at maintenance — a trigger that stamps updated_at on every UPDATE
--    (audit §2: "No updated_at triggers: updated_at columns exist but nothing
--     maintains them")
--
-- 0001 gives profiles, plans, memberships, attendance an `updated_at timestamptz
-- not null default now()` but nothing advances it on UPDATE. We add ONE shared
-- trigger function and attach a BEFORE UPDATE trigger to each table that has the
-- column. (join_requests, messages, feedback, blocks have no updated_at in 0001,
-- so they get no trigger — we do NOT add columns there; that would be scope
-- creep beyond the audit's "columns exist but nothing maintains them".)
--
-- The function is defensive: it only sets updated_at, and does so for any table
-- it is attached to. `create or replace function` + `drop trigger if exists`
-- make this fully idempotent.
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
    before update on public.profiles
    for each row
    execute function public.set_updated_at();

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
    before update on public.plans
    for each row
    execute function public.set_updated_at();

drop trigger if exists memberships_set_updated_at on public.memberships;
create trigger memberships_set_updated_at
    before update on public.memberships
    for each row
    execute function public.set_updated_at();

drop trigger if exists attendance_set_updated_at on public.attendance;
create trigger attendance_set_updated_at
    before update on public.attendance
    for each row
    execute function public.set_updated_at();


-- =============================================================================
-- END — reviewable only. Apply manually AFTER 0001, to a dedicated TEST project.
-- Never run against a live DB by tooling.
--
-- -----------------------------------------------------------------------------
-- DOWN / rollback reference (NOT executed — run by hand only if you must revert):
--
--   drop trigger if exists attendance_set_updated_at  on public.attendance;
--   drop trigger if exists memberships_set_updated_at on public.memberships;
--   drop trigger if exists plans_set_updated_at       on public.plans;
--   drop trigger if exists profiles_set_updated_at    on public.profiles;
--   drop function if exists public.set_updated_at();
--   alter table public.messages    drop constraint if exists messages_text_len_chk;
--   alter table public.messages    drop constraint if exists messages_photo_media_chk;
--   alter table public.attendance  drop constraint if exists attendance_method_chk;
--   alter table public.attendance  drop constraint if exists attendance_status_chk;
--   alter table public.attendance  drop column     if exists method;
--   alter table public.attendance  drop column     if exists status;
--   drop index  if exists public.memberships_one_host_per_plan;
--   drop index  if exists public.profiles_email_lower_uniq;
--   alter table public.profiles    drop constraint if exists profiles_email_format_chk;
--   alter table public.profiles    drop constraint if exists profiles_username_nonblank_chk;
-- =============================================================================
-- ==================== END 0002_squado_constraints.sql ====================

-- ==================== BEGIN 0003_attendance.sql ====================
-- =============================================================================
-- Squado — attendance check-in extensions (status/method/marked_by + RPC + RLS)
-- Migration: 0003_attendance.sql
--
--   ****  REVIEWABLE ARTIFACT ONLY — DO NOT RUN AGAINST A LIVE DATABASE.  ****
--
-- This file is a forward-looking, reviewable design artifact (design.md §3.4 +
-- §5, FEAT-001). It is NOT applied automatically by any agent, build, or test,
-- and it is NOT wired into the running app (the browser app stays localStorage-
-- authoritative; local S.attendance is a non-authoritative display cache — see
-- design §3.7).
--
-- Apply it MANUALLY, only after you have reviewed it, and only in the Supabase
-- SQL editor (or `supabase db` CLI) of a project YOU own, AFTER 0001 and 0002. The agent
-- must never execute it, never migrate, and never delete existing data.
--
-- Safety properties of this file (verify before applying):
--   * every statement is ADDITIVE: `add column if not exists`, an idempotent
--     `do $$ ... exception when duplicate_object ...` CHECK, `create index if
--     not exists`, `create or replace function`, and `drop policy if exists`
--     immediately followed by `create policy` (that `drop policy` recreates a
--     policy object — it NEVER drops a table, column, or row and NEVER deletes
--     application data).
--   * NO `drop table`, NO `delete from`, NO `truncate` anywhere.
--   * the existing `unique (plan_id, uid)` on public.attendance (from 0001) is
--     the duplicate-prevention authority and is left untouched.
--   * attendance history (`audit jsonb`) and `dispute jsonb` are preserved; the
--     RPC appends to `audit` and never overwrites a dispute.
--
-- Depends on 0001 and the preceding constraints migration 0002: public.attendance (id, plan_id, uid, audit, dispute,
-- created_at, updated_at, unique(plan_id,uid)), public.profiles(id), and
-- the is_host()/is_member() SECURITY DEFINER helpers.
-- =============================================================================

-- =============================================================================
-- 1. ADDITIVE COLUMNS  (idempotent; `add column if not exists`)
--    status  — the check-in state the local attUpsert also uses
--    method  — how the row was recorded ('in_app_scanner' for a host scan)
--    marked_by — the host (id) who recorded a host-scan row; null for self
-- =============================================================================

alter table public.attendance add column if not exists status    text not null default 'present';
alter table public.attendance add column if not exists method    text;
alter table public.attendance add column if not exists marked_by uuid references public.profiles (id) on delete set null;

-- =============================================================================
-- 2. STATUS CHECK  (a CHECK has no IF NOT EXISTS, so wrap for idempotent re-apply)
--    Mirrors the local attendance vocabulary: 'present' | 'absent' | 'claimed'.
-- =============================================================================

do $$ begin
    alter table public.attendance add constraint attendance_status_chk check (status in ('present', 'absent', 'claimed'));
exception when duplicate_object then null; end $$;

-- =============================================================================
-- 3. LOOKUP INDEX  (lookups by scanned user id)
-- =============================================================================

create index if not exists attendance_uid_idx on public.attendance (uid);

-- =============================================================================
-- 4. ATOMIC CHECK-IN RPC  (design §3.4)
--    One-statement insert / conditional-update / dispute-detect under the
--    existing unique(plan_id,uid). SECURITY DEFINER so the server (service-role)
--    can run it; the grant lock-down below pins it as server-only.
--    Returns: 'checked_in' | 'duplicate' | 'disputed'.
--    The appended audit element matches the EXISTING local shape
--    {at, by, action, from, to, reason} (see state/attendance.js attUpsert).
-- =============================================================================

create or replace function public.record_checkin(
    p_plan   text,
    p_uid    uuid,
    p_host   uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
    -- audit element matches the EXISTING local shape {at,by,action,from,to,reason}
    v_entry  jsonb;
begin
    insert into public.attendance (plan_id, uid, status, method, marked_by, audit)
    values (
        p_plan, p_uid, 'present', 'in_app_scanner', p_host,
        jsonb_build_array(jsonb_build_object(
            'at', v_now_ms, 'by', p_host::text, 'action', 'host_scan',
            'from', 'none', 'to', 'present', 'reason', 'Scanned in by the host'))
    )
    on conflict (plan_id, uid) do nothing;

    if found then
        return 'checked_in';          -- fresh insert
    end if;

    -- a row already existed: decide duplicate / disputed / upgrade-from-absent
    perform 1 from public.attendance where plan_id = p_plan and uid = p_uid and dispute is not null;
    if found then
        return 'disputed';            -- do NOT overwrite a dispute (check 8)
    end if;

    perform 1 from public.attendance where plan_id = p_plan and uid = p_uid and status = 'present';
    if found then
        return 'duplicate';           -- already present, no dispute (check 7)
    end if;

    -- existing row is 'absent'/'claimed' with no dispute: host override to present
    v_entry := jsonb_build_object(
        'at', v_now_ms, 'by', p_host::text, 'action', 'host_scan',
        'from', (select status from public.attendance where plan_id = p_plan and uid = p_uid),
        'to', 'present', 'reason', 'Scanned in by the host');
    update public.attendance
       set status = 'present', method = 'in_app_scanner', marked_by = p_host,
           updated_at = now(), audit = audit || jsonb_build_array(v_entry)
     where plan_id = p_plan and uid = p_uid;
    return 'checked_in';
end;
$$;

-- Server-only grant lock-down (design §5 item 4): the service-role server client
-- bypasses grants, so it can still call the RPC; anon/authenticated (any direct-
-- from-browser call) cannot, so a browser can never invoke the RPC directly and
-- bypass the 8 server checks.
revoke all on function public.record_checkin(text, uuid, uuid) from public, anon, authenticated;

-- =============================================================================
-- 5. RLS — RESTATED, NOT LOOSENED  (design §5 item 5)
--    0001's attendance_insert/update already require is_host(plan_id) for a host-
--    recorded row OR uid=auth.uid()+is_member for a self-claim. We KEEP both as-is
--    (same predicates). The privileged server client bypasses RLS (service-role),
--    so RLS here is defense-in-depth for any direct-from-browser path. `drop
--    policy if exists` recreates the POLICY object only; it never drops a table or
--    deletes data, and makes re-applying this file idempotent.
-- =============================================================================

-- INSERT: a member claims their own row, OR the host records attendance.
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance
    for insert
    with check (
        (uid = auth.uid() and public.is_member(plan_id))   -- claim my own check-in
        or public.is_host(plan_id)                         -- host records attendance
        -- Optional, reviewer-gated (R3) defense-in-depth for host inserts:
        -- and (uid = auth.uid() or marked_by = auth.uid())
    );

-- UPDATE: the member adjusts their own row, OR the host adjusts any row on the plan.
drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance
    for update
    using (uid = auth.uid() or public.is_host(plan_id))
    with check (uid = auth.uid() or public.is_host(plan_id));

-- =============================================================================
-- END — reviewable only. Apply manually, after 0001. Never run against a live DB
-- by tooling. Dispute/audit/history are preserved; nothing destructive is added.
-- =============================================================================
-- ==================== END 0003_attendance.sql ====================

-- ==================== BEGIN 0005_admin_console.sql ====================
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
-- ==================== END 0005_admin_console.sql ====================

-- ==================== BEGIN 0006_shared_plan_location.sql ====================

-- Add shared discovery/location fields without deleting existing plans.
alter table public.plans
  add column if not exists city text,
  add column if not exists loc_lat double precision,
  add column if not exists loc_lng double precision,
  add column if not exists loc_source text,
  add column if not exists loc_place text,
  add column if not exists day text,
  add column if not exists event_id text;

create index if not exists plans_city_status_idx
  on public.plans (city, status);

create index if not exists plans_created_at_idx
  on public.plans (created_at desc);
-- ==================== END 0006_shared_plan_location.sql ====================

-- ==================== BEGIN 0008_blocked_user_snapshots.sql ====================
-- Squado: safe display snapshots for the current user's private block list.
-- Does not relax RLS or grant access to blocked users' full profile rows.
alter table public.blocks add column if not exists blocked_name text;
alter table public.blocks add column if not exists blocked_username text;
alter table public.blocks add column if not exists blocked_photo_url text;
alter table public.blocks add column if not exists blocked_city text;

comment on column public.blocks.blocked_name is 'Non-sensitive display-name snapshot shown only to the blocker';
comment on column public.blocks.blocked_username is 'Non-sensitive username snapshot shown only to the blocker';
comment on column public.blocks.blocked_photo_url is 'Avatar URL snapshot shown only to the blocker';
comment on column public.blocks.blocked_city is 'City snapshot shown only to the blocker';
-- ==================== END 0008_blocked_user_snapshots.sql ====================

-- ==================== BEGIN 0009_shared_feedback.sql ====================
-- Squado shared feedback: additive, non-destructive migration.
-- Apply only after reviewing the existing migration history.

alter table public.feedback
  add column if not exists kind text not null default 'meetup',
  add column if not exists tags text[] not null default '{}';

-- Existing rows remain meetup feedback; keep them, but enforce valid new records.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'feedback_kind_chk') then
    alter table public.feedback add constraint feedback_kind_chk check (kind in ('meetup','person'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'feedback_rating_chk') then
    alter table public.feedback add constraint feedback_rating_chk check (rating is null or rating between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'feedback_no_self_review_chk') then
    alter table public.feedback add constraint feedback_no_self_review_chk check (to_uid is null or to_uid <> by);
  end if;
end $$;

create unique index if not exists feedback_meetup_once_idx
  on public.feedback(plan_id, by) where kind = 'meetup' and to_uid is null;
create unique index if not exists feedback_person_once_idx
  on public.feedback(plan_id, by, to_uid) where kind = 'person' and to_uid is not null;
create index if not exists feedback_target_kind_idx on public.feedback(to_uid, kind);

-- Individual feedback is private to its author. Public UI must use the aggregate RPCs below.
drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback for select using (by = auth.uid());
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert with check (by = auth.uid());
drop policy if exists feedback_update on public.feedback;
create policy feedback_update on public.feedback for update using (false) with check (false);
drop policy if exists feedback_delete on public.feedback;
create policy feedback_delete on public.feedback for delete using (false);

create or replace function public.submit_squado_feedback(
  p_plan_id text, p_kind text, p_rating integer, p_tags text[] default '{}',
  p_notes text default null, p_to_uid uuid default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); plan_row public.plans%rowtype;
begin
  if uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_kind not in ('meetup','person') or p_rating < 1 or p_rating > 5 then raise exception 'invalid_feedback'; end if;
  select * into plan_row from public.plans where id = p_plan_id;
  if not found then raise exception 'plan_not_found'; end if;
  if plan_row.completion is null or coalesce(jsonb_array_length(coalesce(plan_row.completion->'disputes','[]'::jsonb)),0) > 0 then
    raise exception 'feedback_not_open';
  end if;
  if not exists (select 1 from public.attendance a where a.plan_id = p_plan_id and a.uid = uid and a.status = 'present' and a.dispute is null) then
    raise exception 'verified_attendance_required';
  end if;
  if p_kind = 'person' then
    if p_to_uid is null or p_to_uid = uid then raise exception 'invalid_review_target'; end if;
    if not exists (select 1 from public.attendance a where a.plan_id = p_plan_id and a.uid = p_to_uid and a.status = 'present' and a.dispute is null) then
      raise exception 'review_target_not_eligible';
    end if;
  elsif p_to_uid is not null then raise exception 'invalid_review_target'; end if;
  insert into public.feedback(plan_id, by, to_uid, rating, notes, kind, tags)
    values (p_plan_id, uid, p_to_uid, p_rating, left(coalesce(p_notes,''),500), p_kind,
      (select coalesce(array_agg(t), '{}') from (select distinct t from unnest(coalesce(p_tags,'{}')) t limit 12) q));
  return jsonb_build_object('ok',true);
exception when unique_violation then raise exception 'duplicate_feedback';
end $$;
revoke all on function public.submit_squado_feedback(text,text,integer,text[],text,uuid) from public;
grant execute on function public.submit_squado_feedback(text,text,integer,text[],text,uuid) to authenticated;

create or replace function public.squado_plan_feedback_summary(p_plan_id text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with r as (select rating, tags from public.feedback where plan_id=p_plan_id and kind='meetup' and to_uid is null),
  n as (select count(*)::integer n, round(avg(rating)::numeric,1) avg from r),
  t as (select tag, count(*)::integer count from r cross join lateral unnest(tags) tag group by tag order by count(*) desc limit 3)
  select case when n.n < 3 then null else jsonb_build_object('n',n.n,'avg',n.avg,'tags',coalesce((select jsonb_agg(jsonb_build_array(tag,count)) from t),'[]'::jsonb)) end from n;
$$;
revoke all on function public.squado_plan_feedback_summary(text) from public;
grant execute on function public.squado_plan_feedback_summary(text) to authenticated;

create or replace function public.squado_user_trust_summary(p_user uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with r as (select rating, tags from public.feedback where kind='person' and to_uid=p_user),
  n as (select count(rating)::integer n, round(avg(rating)::numeric,1) avg from r),
  t as (select tag, count(*)::integer count from r cross join lateral unnest(tags) tag group by tag order by count(*) desc limit 8)
  select jsonb_build_object('n',n.n,'avg',case when n.n < 3 then null else n.avg end,
    'tags',case when n.n < 3 then '{}'::jsonb else coalesce((select jsonb_object_agg(tag,count) from t),'{}'::jsonb) end) from n;
$$;
revoke all on function public.squado_user_trust_summary(uuid) from public;
grant execute on function public.squado_user_trust_summary(uuid) to authenticated;
-- ==================== END 0009_shared_feedback.sql ====================

-- Storage buckets required by the application. This only creates/updates the bucket configuration;
-- it does not delete bucket objects. Run only on the new test project.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('chat-media', 'chat-media', false)
on conflict (id) do update set public = excluded.public;

commit;
