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
-- created_at, updated_at, unique(plan_id,uid)), public.profiles(auth_uid), and
-- the is_host()/is_member() SECURITY DEFINER helpers.
-- =============================================================================

-- =============================================================================
-- 1. ADDITIVE COLUMNS  (idempotent; `add column if not exists`)
--    status  — the check-in state the local attUpsert also uses
--    method  — how the row was recorded ('in_app_scanner' for a host scan)
--    marked_by — the host (auth_uid) who recorded a host-scan row; null for self
-- =============================================================================

alter table public.attendance add column if not exists status    text not null default 'present';
alter table public.attendance add column if not exists method    text;
alter table public.attendance add column if not exists marked_by uuid references public.profiles (auth_uid) on delete set null;

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
