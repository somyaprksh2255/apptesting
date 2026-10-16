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
