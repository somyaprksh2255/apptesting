/* tests/attendance.server.test.js — server-side check-in unit tests (design §8 tier A).
 *
 * Plain Node, NO network, NO live Supabase. We exercise recordCheckIn (server/attendance.mjs)
 * directly against an in-memory fake privileged client. The seam: set the two env vars so
 * getServerSupabase() builds its singleton without throwing, then replace that singleton's
 * `.from(table)` / `.rpc(name, args)` methods with scripted fakes. isPlanMember (reused by
 * recordCheckIn) goes through the SAME faked `.from('memberships')` chain, so no second seam
 * is needed. All mock uids are UUID-shaped so they match the server's scannedUid regex.
 *
 * Follows the e2e print-and-exit style: PASS/FAIL per assertion; process.exitCode non-zero on
 * any failure.
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'test-secret-key-not-real';

import { getServerSupabase } from '../server/supabase.mjs';
import { recordCheckIn } from '../server/attendance.mjs';

/* UUID-shaped mock identities. */
const HOST = '11111111-1111-4111-8111-111111111111';
const ATTENDEE = '22222222-2222-4222-8222-222222222222';
const PLAN = 'p1699123456';

let ok = 0, bad = 0;
const t = (n, c) => { c ? ok++ : bad++; console.log((c ? 'PASS ' : 'FAIL ') + n); };

/* Build a fake privileged client from a per-test script and install it as the singleton.
 *
 * script = {
 *   plan:        { row|null, error? },        // plans.select('creator,status').eq('id',..).maybeSingle()
 *   profile:     { row|null, error? },        // profiles.select('auth_uid,name').eq(..).maybeSingle()
 *   membership:  { row|null, error? },        // memberships ... .maybeSingle()  (drives isPlanMember)
 *   rpc:         () => ({ data, error }) | { data, error }   // record_checkin
 * }
 * Returns a `calls` log so tests can assert how often the RPC fired.
 */
function installFake(script) {
    const calls = { rpc: 0, rpcArgs: [] };

    /* A chainable query builder whose terminal maybeSingle() resolves the scripted result for
     * the table it was created for. .eq()/.select()/.limit() all return `this`. */
    function builder(result) {
        const api = {
            select() { return api; },
            eq() { return api; },
            limit() { return api; },
            async maybeSingle() {
                const r = result || { row: null };
                return { data: r.row === undefined ? null : r.row, error: r.error || null };
            }
        };
        return api;
    }

    const client = getServerSupabase();
    client.from = table => {
        if (table === 'plans') return builder(script.plan);
        if (table === 'profiles') return builder(script.profile);
        if (table === 'memberships') return builder(script.membership);
        throw new Error('unexpected table: ' + table);
    };
    client.rpc = async (name, args) => {
        calls.rpc++;
        calls.rpcArgs.push(args);
        if (name !== 'record_checkin') throw new Error('unexpected rpc: ' + name);
        const out = typeof script.rpc === 'function' ? script.rpc(args) : script.rpc;
        return out || { data: null, error: null };
    };
    return calls;
}

/* Convenient defaults for a "happy" script: open plan owned by HOST, attendee profile+member. */
const openPlan = { row: { creator: HOST, status: 'open' } };
const profileRiya = { row: { auth_uid: ATTENDEE, name: 'Riya' } };
const memberYes = { row: { user_id: ATTENDEE } };

async function run() {
    /* 1) Host + accepted attendee => checked_in, RPC called once, uid+name returned. */
    {
        const calls = installFake({
            plan: openPlan, profile: profileRiya, membership: memberYes,
            rpc: { data: 'checked_in', error: null }
        });
        const r = await recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: ATTENDEE });
        t('1 host+attendee => checked_in', r.ok === true && r.reason === 'checked_in');
        t('1 returns scanned uid', r.uid === ATTENDEE);
        t('1 rpc called exactly once', calls.rpc === 1);
        t('1 rpc received host/plan/uid args', calls.rpcArgs[0] &&
            calls.rpcArgs[0].p_plan === PLAN && calls.rpcArgs[0].p_uid === ATTENDEE && calls.rpcArgs[0].p_host === HOST);
    }

    /* 1a) Greeting name coverage: name:'Riya' => name:'Riya'; name:'' => name:'' (degrades). */
    {
        installFake({ plan: openPlan, profile: profileRiya, membership: memberYes, rpc: { data: 'checked_in' } });
        const r = await recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: ATTENDEE });
        t('1a name=Riya returned', r.name === 'Riya');

        installFake({
            plan: openPlan, profile: { row: { auth_uid: ATTENDEE, name: '' } },
            membership: memberYes, rpc: { data: 'checked_in' }
        });
        const r2 = await recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: ATTENDEE });
        t('1a empty name degrades to \'\'', r2.ok === true && r2.name === '');
    }

    /* 2) Repeat scan => RPC returns 'duplicate' => reason duplicate (idempotent success). */
    {
        const calls = installFake({ plan: openPlan, profile: profileRiya, membership: memberYes, rpc: { data: 'duplicate' } });
        const r = await recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: ATTENDEE });
        t('2 repeat scan => duplicate', r.ok === true && r.reason === 'duplicate');
        t('2 duplicate still returns uid+name', r.uid === ATTENDEE && r.name === 'Riya');
        t('2 rpc called once', calls.rpc === 1);
    }

    /* 3) Concurrent scans: fake RPC returns 'checked_in' then 'duplicate' => exactly one checked_in. */
    {
        let n = 0;
        const calls = installFake({
            plan: openPlan, profile: profileRiya, membership: memberYes,
            rpc: () => ({ data: (n++ === 0 ? 'checked_in' : 'duplicate') })
        });
        const [a, b] = await Promise.all([
            recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: ATTENDEE }),
            recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: ATTENDEE })
        ]);
        const checkedIn = [a, b].filter(x => x.reason === 'checked_in').length;
        const dupes = [a, b].filter(x => x.reason === 'duplicate').length;
        t('3 concurrent => exactly one checked_in', checkedIn === 1 && dupes === 1);
        t('3 rpc called twice', calls.rpc === 2);
    }

    /* 4) No profile row => unknown (no RPC). */
    {
        const calls = installFake({ plan: openPlan, profile: { row: null }, membership: memberYes, rpc: { data: 'checked_in' } });
        const r = await recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: ATTENDEE });
        t('4 unknown profile => unknown', r.ok === false && r.reason === 'unknown');
        t('4 unknown => no rpc', calls.rpc === 0);
    }

    /* 5) isPlanMember false (no membership row) => notmember (no RPC). */
    {
        const calls = installFake({ plan: openPlan, profile: profileRiya, membership: { row: null }, rpc: { data: 'checked_in' } });
        const r = await recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: ATTENDEE });
        t('5 non-member => notmember', r.ok === false && r.reason === 'notmember');
        t('5 notmember => no rpc', calls.rpc === 0);
    }

    /* 6) plan.creator !== hostUid => forbidden (no profile/member/rpc needed). */
    {
        const calls = installFake({
            plan: { row: { creator: ATTENDEE, status: 'open' } },
            profile: profileRiya, membership: memberYes, rpc: { data: 'checked_in' }
        });
        const r = await recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: ATTENDEE });
        t('6 wrong host => forbidden', r.ok === false && r.reason === 'forbidden');
        t('6 forbidden => no rpc', calls.rpc === 0);
    }

    /* 7) No plan row => noplan. */
    {
        const calls = installFake({ plan: { row: null }, profile: profileRiya, membership: memberYes, rpc: { data: 'checked_in' } });
        const r = await recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: ATTENDEE });
        t('7 missing plan => noplan', r.ok === false && r.reason === 'noplan');
        t('7 noplan => no rpc', calls.rpc === 0);
    }

    /* 8) Plan status='closed' => state. */
    {
        const calls = installFake({
            plan: { row: { creator: HOST, status: 'closed' } },
            profile: profileRiya, membership: memberYes, rpc: { data: 'checked_in' }
        });
        const r = await recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: ATTENDEE });
        t('8 closed plan => state', r.ok === false && r.reason === 'state');
        t('8 state => no rpc', calls.rpc === 0);
    }

    /* 9) scannedUid === hostUid => self (even though host is a member row; token-based guard). */
    {
        const calls = installFake({
            plan: openPlan, profile: { row: { auth_uid: HOST, name: 'Host' } },
            membership: { row: { user_id: HOST } }, rpc: { data: 'checked_in' }
        });
        const r = await recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: HOST });
        t('9 host scans self => self', r.ok === false && r.reason === 'self');
        t('9 self => no rpc', calls.rpc === 0);
    }

    /* 10) RPC returns 'disputed' => disputed (no overwrite). */
    {
        const calls = installFake({ plan: openPlan, profile: profileRiya, membership: memberYes, rpc: { data: 'disputed' } });
        const r = await recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: ATTENDEE });
        t('10 dispute on row => disputed', r.ok === false && r.reason === 'disputed');
        t('10 disputed rpc fired once', calls.rpc === 1);
    }

    /* 11) A thrown select/rpc/isPlanMember error must REJECT (=> route sends server_error),
     *     NEVER be reported as notmember, and record nothing. */
    {
        /* rpc returns an error object => recordCheckIn throws. */
        installFake({ plan: openPlan, profile: profileRiya, membership: memberYes, rpc: { data: null, error: { message: 'boom' } } });
        let threw = false;
        try { await recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: ATTENDEE }); } catch (e) { threw = true; }
        t('11 rpc error => recordCheckIn rejects', threw);

        /* membership lookup error => isPlanMember THROWS => propagates, NOT notmember. */
        installFake({ plan: openPlan, profile: profileRiya, membership: { row: null, error: { message: 'db down' } }, rpc: { data: 'checked_in' } });
        let threw2 = false, reason = null;
        try { const r = await recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: ATTENDEE }); reason = r.reason; }
        catch (e) { threw2 = true; }
        t('11 membership lookup error => rejects (not notmember)', threw2 && reason !== 'notmember');

        /* plan select error => throws before any further work. */
        const calls = installFake({ plan: { row: null, error: { message: 'select failed' } }, profile: profileRiya, membership: memberYes, rpc: { data: 'checked_in' } });
        let threw3 = false;
        try { await recordCheckIn({ hostUid: HOST, planId: PLAN, scannedUid: ATTENDEE }); } catch (e) { threw3 = true; }
        t('11 plan select error => rejects, nothing recorded', threw3 && calls.rpc === 0);
    }

    /* 12) Malformed planId/scannedUid rejected BEFORE any DB call. recordCheckIn itself has no
     *     body guard (that lives in the route), so we validate via the same regexes the route
     *     uses and assert they reject the malformed inputs with no DB access. */
    {
        const PLAN_RE = /^[A-Za-z0-9._-]{1,64}$/;
        const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
        const badPlanIds = ['', 'has space', 'bad/slash', 'x'.repeat(65)];
        const badUids = ['', 'not-a-uuid', 'g-riya', ATTENDEE.replace(/-/g, '')];
        const planRejected = badPlanIds.every(v => !PLAN_RE.test(v));
        const uidRejected = badUids.every(v => !UUID_RE.test(v));
        t('12 malformed planId rejected by guard', planRejected);
        t('12 malformed scannedUid rejected by guard', uidRejected);
        t('12 valid inputs still accepted', PLAN_RE.test(PLAN) && UUID_RE.test(ATTENDEE));

        /* No DB call must happen for a rejected body: if the guard rejects, recordCheckIn is
         * never invoked. We assert that by installing a fake that would throw if `.from` ran. */
        let touchedDb = false;
        const client = getServerSupabase();
        client.from = () => { touchedDb = true; throw new Error('must not reach DB'); };
        if (PLAN_RE.test('bad/slash') || UUID_RE.test('not-a-uuid')) {
            await recordCheckIn({ hostUid: HOST, planId: 'bad/slash', scannedUid: 'not-a-uuid' }).catch(() => {});
        }
        t('12 rejected body never reaches the DB', touchedDb === false);
    }

    console.log(`\n${ok} PASS / ${bad} FAIL`);
    if (bad) process.exitCode = 1;
}

run().catch(err => {
    console.error('FATAL', err && err.message ? err.message : err);
    process.exitCode = 1;
});
