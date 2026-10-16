/* server/attendance.mjs — the authoritative host-scan check-in operation (design §3.1-§3.4).
 *
 * recordCheckIn({ hostUid, planId, scannedUid }) runs the 8 server checks against TRUSTED
 * database rows (never a client-supplied isHost/isMember/uid/status flag) and performs the
 * write through the atomic `record_checkin` RPC (FEAT-001, 0003_attendance.sql). It reuses
 * the privileged client singleton (getServerSupabase) and the membership authorization
 * helper (isPlanMember) from ./supabase.mjs.
 *
 * Contract (design §3.2): returns a structured { ok, reason, uid?, name? } object. `hostUid`
 * is the verified token subject supplied by the route (never from the request body). Any
 * thrown error from a select / rpc / isPlanMember propagates to the caller so the route maps
 * it to a 502 server_error — a thrown membership-lookup error MUST NOT be reported as
 * `notmember`. Server-side logging uses names/codes only; a provider error object is never
 * returned to the caller.
 */

import { getServerSupabase, isPlanMember } from './supabase.mjs';

/* Run the 8 trusted-DB checks (design §3.3) in the order that fails cheap authorization
 * first and evaluates the self-check against the verified token immediately before the write.
 * Throws (does not catch) on any select / rpc / membership-lookup failure. */
export async function recordCheckIn({ hostUid, planId, scannedUid }) {
    const client = getServerSupabase();

    /* (2) Requester is the actual host of the plan. No row => the plan is not mirrored to the
     * server yet (distinct from a closed plan); a different creator => forbidden. */
    const { data: plan, error: planErr } = await client
        .from('plans')
        .select('creator, status')
        .eq('id', planId)
        .maybeSingle();
    if (planErr) throw new Error('plan_lookup_failed');
    if (!plan) return { ok: false, reason: 'noplan' };
    if (plan.creator !== hostUid) return { ok: false, reason: 'forbidden' };

    /* (3) Plan is in a check-in-permitting state (vocabulary is open|closed in 0001). */
    if (plan.status !== 'open') return { ok: false, reason: 'state' };

    /* (4) Scanned identity maps to a valid profile. `name` is a convenience greeting field,
     * not a check — it may be '' when the profile row is unseeded. */
    const { data: profile, error: profileErr } = await client
        .from('profiles')
        .select('id, name')
        .eq('id', scannedUid)
        .maybeSingle();
    if (profileErr) throw new Error('profile_lookup_failed');
    if (!profile) return { ok: false, reason: 'unknown' };
    const profileName = profile.name || '';

    /* (5) Scanned user is an ACCEPTED member of THIS plan. isPlanMember returns false ONLY
     * when the membership row is absent; a query error THROWS and must propagate (=> 502),
     * never be wrapped as notmember. */
    const member = await isPlanMember(planId, scannedUid);
    if (!member) return { ok: false, reason: 'notmember' };

    /* (6) Host is not scanning themselves — evaluated against the trusted token uid,
     * immediately before the write (the host is also a member row, so this guard, not a
     * membership role, is what blocks a self check-in). */
    if (scannedUid === hostUid) return { ok: false, reason: 'self' };

    /* (7)+(8) Atomic insert / conditional-update / dispute-detect inside the RPC under the
     * existing unique(plan_id,uid) constraint. */
    const { data, error } = await client.rpc('record_checkin', {
        p_plan: planId,
        p_uid: scannedUid,
        p_host: hostUid
    });
    if (error) throw new Error('checkin_rpc_failed');

    if (data === 'checked_in') return { ok: true, reason: 'checked_in', uid: scannedUid, name: profileName };
    if (data === 'duplicate') return { ok: true, reason: 'duplicate', uid: scannedUid, name: profileName };
    if (data === 'disputed') return { ok: false, reason: 'disputed' };

    /* An unexpected RPC return value is treated as a server fault, not a silent success. */
    throw new Error('checkin_rpc_unexpected');
}
