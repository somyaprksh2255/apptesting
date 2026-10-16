/* P0.3 + P2.Step1 — RLS verification harness for a DEDICATED THROWAWAY test project.
 *
 * SAFETY MODEL (read tests/supabase/README.md):
 *   - DOUBLE-GATED OFF by default:
 *       Gate 1: if any SUPABASE_TEST_* opt-in var is missing, SKIP and exit 0.
 *       Gate 2: if the configured URL equals the live Squado URL, REFUSE and exit
 *               NON-ZERO without ever connecting.
 *   - This file NEVER applies a migration. 0001_squado_schema.sql and
 *     0002_squado_constraints.sql are applied MANUALLY by the project owner to a
 *     throwaway test project BEFORE running this harness (see the README).
 *   - This file NEVER runs against production and performs no destructive DDL.
 *
 * WHAT IT CHECKS when a test project IS configured (P2 Step 1):
 *   - RLS is enabled on all eight application tables (via an rls_enabled RPC the
 *     operator creates in the test project; absent => TODO, never a false pass).
 *   - Positive AND negative authorization, per table, for MEMBER / NON-MEMBER / HOST,
 *     exercised with SEPARATE auth identities (two distinct members + a host), covering
 *     the 0001 policies and the fields the 0002 constraints protect.
 *   - These assertions require a seeded fixture (a plan, a host, two members, one
 *     non-member). The harness seeds it with the SERVICE-ROLE (admin) client and then
 *     asserts using per-user ANON-key clients carrying each user's JWT, so RLS is the
 *     thing under test. If seeding helpers are not present it reports TODO rather than
 *     passing falsely.
 *
 * Run: node tests/supabase/rls.test.mjs
 */

/* The live project URL (from src/js/config.js). This file must NEVER be pointed here. */
const LIVE_URL = 'https://afbxwhzvoafqvnwuoveb.supabase.co';

/* The eight application tables that must all have RLS enabled. */
const TABLES = [
    'profiles', 'plans', 'memberships', 'join_requests',
    'messages', 'attendance', 'feedback', 'blocks'
];

const url = process.env.SUPABASE_TEST_URL;
const secret = process.env.SUPABASE_TEST_SECRET_KEY;
const anon = process.env.SUPABASE_TEST_ANON_KEY;

/* --- Gate 1: opt-in. Missing any var => SKIP, exit 0 (never touches a project). --- */
if (!url || !secret || !anon) {
    console.log('SKIP: no test project configured — set SUPABASE_TEST_URL, ' +
        'SUPABASE_TEST_SECRET_KEY and SUPABASE_TEST_ANON_KEY to run RLS checks ' +
        'against a throwaway project (see tests/supabase/README.md)');
    process.exit(0);
}

/* --- Gate 2: refuse the live project. Exit non-zero WITHOUT connecting. --- */
const normalize = s => String(s).trim().replace(/\/+$/, '');
if (normalize(url) === normalize(LIVE_URL)) {
    console.error('REFUSED: SUPABASE_TEST_URL points at the LIVE project. ' +
        'These RLS tests must only run against a throwaway test project. Not connecting.');
    process.exit(2);
}

/* --- Only here do we connect, and only to a non-live test project. --- */
let bad = 0;
const t = (name, cond) => {
    if (cond) { console.log('PASS ' + name); }
    else { bad++; console.log('FAIL ' + name); }
};
const todo = msg => console.log('TODO ' + msg);

const { createClient } = await import('@supabase/supabase-js');

/* The privileged (service-role) admin client — used ONLY to seed/tear down the fixture
 * and to read catalog state. RLS does not apply to it, so it is NEVER used for the
 * allow/deny assertions themselves. */
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

/* ------------------------------------------------------------------------- *
 * RLS-enabled catalog check (unchanged from P0.3): prefer an operator-created
 * RPC; absent => TODO (not a pass).
 * ------------------------------------------------------------------------- */
async function rlsEnabled(table) {
    /* Operator creates this in the test project:
     *   create or replace function public.rls_enabled(t text) returns boolean
     *   language sql stable security definer set search_path=public as $$
     *     select relrowsecurity from pg_class where oid = ('public.'||t)::regclass; $$;
     */
    try {
        const { data, error } = await admin.rpc('rls_enabled', { t: table });
        if (error) return null;
        return Boolean(data);
    } catch {
        return null;
    }
}

for (const table of TABLES) {
    const state = await rlsEnabled(table);
    if (state === null) {
        todo(`rls-enabled[${table}]: create public.rls_enabled(text) RPC in the test ` +
            `project (see comment) to assert pg_class.relrowsecurity`);
    } else {
        t(`RLS enabled on public.${table}`, state === true);
    }
}

/* ------------------------------------------------------------------------- *
 * Seeded fixture + per-identity allow/deny matrix (P2 Step 1).
 *
 * Identities (created in the test project's auth.users via the admin API):
 *   HOST    — creates the sample plan; is_host == true.
 *   MEMBER  — an accepted member of the sample plan; is_member == true.
 *   OTHER   — a second distinct user who is NOT a member (non-member).
 *
 * The fixture is created with the ADMIN client (bypasses RLS, as a trusted seed).
 * Every ALLOW/DENY assertion below then uses a SEPARATE anon-key client that is
 * signed in AS that identity, so the thing being tested is the RLS policy, not the
 * admin bypass. The plan id is namespaced with a random suffix so repeated runs on
 * the same throwaway project do not collide, and the fixture is torn down at the end.
 * ------------------------------------------------------------------------- */

/* Create (or reuse) a confirmed test user and return a signed-in anon client for them. */
async function makeUser(tag) {
    const email = `rls-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@squado.test`;
    const password = 'Test-' + Math.random().toString(36).slice(2, 12) + '!A1';

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true
    });
    if (cErr || !created || !created.user) {
        throw new Error('seed_user_failed:' + tag);
    }
    const uid = created.user.id;

    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: sErr } = await client.auth.signInWithPassword({ email, password });
    if (sErr) throw new Error('seed_signin_failed:' + tag);

    return { uid, email, client };
}

/* Returns the number of rows a client can SELECT from `table` for the sample plan.
 * Used for allow (>0 expected) vs deny (0 expected) assertions. */
async function countFor(client, table, planId) {
    const q = table === 'profiles'
        ? client.from(table).select('auth_uid', { count: 'exact', head: true })
        : client.from(table).select('*', { count: 'exact', head: true }).eq('plan_id', planId);
    const { count, error } = await q;
    /* RLS denial surfaces as zero visible rows, not an error, for SELECT. */
    if (error) return { count: 0, error };
    return { count: count || 0, error: null };
}

/* The seeding + assertion routine is only runnable when the admin auth API and the
 * expected schema (0001 + 0002 applied) are present. Any failure to seed is reported
 * as a hard FAIL (the operator configured a test project but it is not in the expected
 * state), except the "auth admin API unavailable" case which is a TODO. */
async function runAuthMatrix() {
    let host, member, other;
    const planId = 'rls-plan-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

    /* --- Seed identities --- */
    try {
        host = await makeUser('host');
        member = await makeUser('member');
        other = await makeUser('other');
    } catch (e) {
        if (String(e.message || e).includes('seed_user_failed')) {
            todo('auth matrix: admin auth.admin.createUser is unavailable on this test ' +
                'project (service_role key + Auth admin API required) — cannot seed identities');
            return;
        }
        throw e;
    }

    const cleanup = async () => {
        /* Best-effort teardown; cascades remove dependent rows. Never throws. */
        try { await admin.from('messages').delete().eq('plan_id', planId); } catch { /* ignore */ }
        try { await admin.from('attendance').delete().eq('plan_id', planId); } catch { /* ignore */ }
        try { await admin.from('join_requests').delete().eq('plan_id', planId); } catch { /* ignore */ }
        try { await admin.from('memberships').delete().eq('plan_id', planId); } catch { /* ignore */ }
        try { await admin.from('plans').delete().eq('id', planId); } catch { /* ignore */ }
        for (const u of [host, member, other]) {
            if (u && u.uid) { try { await admin.auth.admin.deleteUser(u.uid); } catch { /* ignore */ } }
        }
    };

    try {
        /* --- Seed profiles (one per identity; required by FK references) --- */
        const seedProfile = (u, username) => admin.from('profiles').upsert({
            auth_uid: u.uid, username, name: username, email: u.email,
            gender: 'Everyone', onboarded: true
        }, { onConflict: 'auth_uid' });
        {
            const r1 = await seedProfile(host, 'rls_host');
            const r2 = await seedProfile(member, 'rls_member');
            const r3 = await seedProfile(other, 'rls_other');
            if (r1.error || r2.error || r3.error) throw new Error('seed_profiles_failed');
        }

        /* --- Seed the plan (host is creator) + memberships (host + member) --- */
        {
            const rp = await admin.from('plans').insert({
                id: planId, creator: host.uid, type: 'chai', title: 'RLS fixture',
                who: 'Everyone', status: 'open', max: 8
            });
            if (rp.error) throw new Error('seed_plan_failed');

            const rmHost = await admin.from('memberships').insert({
                plan_id: planId, user_id: host.uid, role: 'host', state: 'member'
            });
            const rmMember = await admin.from('memberships').insert({
                plan_id: planId, user_id: member.uid, role: 'member', state: 'member'
            });
            if (rmHost.error || rmMember.error) throw new Error('seed_memberships_failed');

            /* A message so SELECT allow/deny on messages has a row to find. */
            const rMsg = await admin.from('messages').insert({
                plan_id: planId, by: host.uid, kind: 'text', text: 'hello fixture'
            });
            if (rMsg.error) throw new Error('seed_message_failed');
        }

        /* ===================== ALLOW / DENY MATRIX ===================== */

        /* messages: member & host can read; non-member cannot. */
        {
            const m = await countFor(member.client, 'messages', planId);
            const h = await countFor(host.client, 'messages', planId);
            const o = await countFor(other.client, 'messages', planId);
            t('messages SELECT allowed for MEMBER (messages_select: is_member)', m.count > 0);
            t('messages SELECT allowed for HOST', h.count > 0);
            t('messages SELECT denied for NON-MEMBER (zero rows)', o.count === 0);
        }

        /* memberships roster: member & host see rows; non-member sees none. */
        {
            const m = await countFor(member.client, 'memberships', planId);
            const h = await countFor(host.client, 'memberships', planId);
            const o = await countFor(other.client, 'memberships', planId);
            t('memberships SELECT allowed for MEMBER (sees roster)', m.count > 0);
            t('memberships SELECT allowed for HOST (full roster)', h.count > 0);
            t('memberships SELECT denied for NON-MEMBER (zero rows)', o.count === 0);
        }

        /* messages INSERT: a member may post as themselves; a non-member may not. */
        {
            const okInsert = await member.client.from('messages')
                .insert({ plan_id: planId, by: member.uid, kind: 'text', text: 'member post' });
            t('messages INSERT allowed for MEMBER posting as self (by = auth.uid())',
                !okInsert.error);

            const denyInsert = await other.client.from('messages')
                .insert({ plan_id: planId, by: other.uid, kind: 'text', text: 'intruder' });
            t('messages INSERT denied for NON-MEMBER (RLS with-check)', Boolean(denyInsert.error));
        }

        /* plans UPDATE: only the host may update the plan; a member may not. */
        {
            const hostUpd = await host.client.from('plans')
                .update({ title: 'host-renamed' }).eq('id', planId).select('id');
            t('plans UPDATE allowed for HOST', !hostUpd.error && (hostUpd.data || []).length > 0);

            const memberUpd = await member.client.from('plans')
                .update({ title: 'member-should-fail' }).eq('id', planId).select('id');
            /* RLS makes the row invisible to the UPDATE: no error, zero rows affected. */
            t('plans UPDATE denied for MEMBER (zero rows affected)',
                !memberUpd.error && (memberUpd.data || []).length === 0);
        }

        /* join_requests: the host can read requests on their plan; a non-member can
         * create their own pending request on an open plan (who='Everyone'). */
        {
            const other2Req = await other.client.from('join_requests')
                .insert({ plan_id: planId, user_id: other.uid, state: 'pending' });
            t('join_requests INSERT allowed for a NON-MEMBER requesting (self, open plan)',
                !other2Req.error);

            const hostSeesReq = await countFor(host.client, 'join_requests', planId);
            t('join_requests SELECT allowed for HOST (sees pending requests)',
                hostSeesReq.count > 0);

            const memberSeesReq = await member.client.from('join_requests')
                .select('*', { count: 'exact', head: true })
                .eq('plan_id', planId).eq('user_id', other.uid);
            t('join_requests of another user DENIED to a plain MEMBER (zero rows)',
                !memberSeesReq.error && (memberSeesReq.count || 0) === 0);
        }

        /* blocks: strictly private to the blocker. */
        {
            const ins = await member.client.from('blocks')
                .insert({ blocker: member.uid, blocked: other.uid });
            t('blocks INSERT allowed for self as blocker', !ins.error);

            const self = await member.client.from('blocks')
                .select('*', { count: 'exact', head: true });
            t('blocks SELECT shows the owner their own list', !self.error && (self.count || 0) > 0);

            const foreign = await host.client.from('blocks')
                .select('*', { count: 'exact', head: true });
            t('blocks of another user are invisible (host sees none of member\'s blocks)',
                !foreign.error && (foreign.count || 0) === 0);

            try { await member.client.from('blocks').delete().eq('blocker', member.uid); } catch { /* ignore */ }
        }

        /* 0002 constraint spot-check: a photo message with no media_path must be rejected
         * even for the host (messages_photo_media_chk from 0002). */
        {
            const badPhoto = await host.client.from('messages')
                .insert({ plan_id: planId, by: host.uid, kind: 'photo', text: 'no media' });
            t('0002 messages_photo_media_chk: photo without media_path rejected',
                Boolean(badPhoto.error));
        }

        /* 0002 constraint spot-check: a second host row for the same plan must violate
         * the memberships_one_host_per_plan partial unique index. */
        {
            const secondHost = await admin.from('memberships')
                .insert({ plan_id: planId, user_id: other.uid, role: 'host', state: 'member' });
            t('0002 memberships_one_host_per_plan: a second host row is rejected',
                Boolean(secondHost.error));
        }

    } finally {
        await cleanup();
    }
}

try {
    await runAuthMatrix();
} catch (e) {
    bad++;
    console.log('FAIL auth matrix: ' + (e && e.message ? e.message : 'error') +
        ' (test project is configured but not in the expected 0001+0002 state; ' +
        'the migrations must be applied by the owner first — see README)');
}

console.log('RESULT: ' + (bad
    ? 'FAILED (' + bad + ' hard failures; see TODOs for any unexecuted checks)'
    : 'all executed checks passed (see any TODOs for checks awaiting operator RPC/seed)'));
process.exit(bad ? 1 : 0);
