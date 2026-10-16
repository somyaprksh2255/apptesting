/* Host-scanner attendance records and meetup completion.
   Chain: membership -> attendance record -> completion (organizer + attendee confirmations) -> feedback eligibility -> ratings / profile stats.

   Records (persisted in S.attendance, one per member per plan; every write path below goes through attTxn):
     { id, planId, uid, status:'present'|'absent'|'claimed', method:'in_app_scanner'|'organizer',
       at, token (first 8 chars of the session token, a reference only), dispute?:{at,note,via}, audit:[{at,by,action,from,to,reason}] }
     present = verified by the host scanning the member's personal QR; legacy absent/claimed records remain readable.
     claimed = member says they were there but didn't scan; unverified until the organizer marks them present.
   No record at all means "not checked in yet", never "absent".

   Completion on the plan: p.completion = { by, at, confirms:[uid], disputes:[{u,at}] }; p.status 'ended' only once rules are met.

   Host check-ins are routed through the attendance API when available. Legacy meetup-link validation is retained only for old links. */

/* count settings may be 0 (organizer alone); hours must be > 0 */
const cfgCount = (k, d) => {
    const v = (window.SQUADO_CONFIG || {})[k];

    return Number.isInteger(v) && v >= 0 ? v : d;
};

const ATT_SCAN = ['native_camera', 'in_app_scanner'];

if (!S.attendance)
    S.attendance = [];

const attGet = (p, uid) => S.attendance.find(a => a.planId == p.id && a.uid == uid) || null;

/* verified attendance: present, still in the squad, not under dispute */
const attPresent = (p, uid) => {
    const a = attGet(p, uid);

    return !!a && a.status == 'present' && !a.dispute && p.members.includes(uid);
};

const attCount = p => p.members.filter(m => attPresent(p, m)).length;

const attEq = (a, b) => {
    a = String(a);
    b = String(b);

    let d = a.length ^ b.length;

    for (let i = 0; i < Math.max(a.length, b.length); i++)
        d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);

    return d === 0;
};

/* all-or-nothing write: fn mutates and returns a result code; only 'ok'-style results are kept and saved */
function attTxn(p, fn, keep = ['ok']) {
    const snap = JSON.stringify({ a: S.attendance, p });
    const r = fn();

    if (!keep.includes(r)) {
        const s = JSON.parse(snap);

        S.attendance = s.a;
        Object.keys(p).forEach(k => delete p[k]);
        Object.assign(p, s.p);

        return r;
    }

    if (!save()) {
        const s = JSON.parse(snap);

        S.attendance = s.a;
        Object.keys(p).forEach(k => delete p[k]);
        Object.assign(p, s.p);

        return 'save';
    }

    return r;
}

const attId = () => 'a' + Date.now() + Math.random().toString(36).slice(2, 6);

function attUpsert(p, uid, status, method, by, action, reason) {
    let a = attGet(p, uid);
    const from = a ? a.status : 'none';

    if (!a) {
        a = { id: attId(), planId: p.id, uid, status, method, at: Date.now(), token: '', audit: [] };
        S.attendance.push(a);
    }

    a.status = status;
    a.method = method;
    a.at = Date.now();
    delete a.dispute;
    a.audit.push({ at: Date.now(), by, action, from, to: status, reason: reason || '' });

    return a;
}

/* Meetup QR generation, session creation, and manual attendance overrides were removed from the UI.
   Hosts check members in through the Scanner on the Groups card, using the member's personal QR. */

/* ---- member: check-in (the ONE validation used by the native-camera link and the in-app scanner) ---- */

/* validation only, nothing is written. Returns 'ok' or a failure code. */
function attCheck(p, token) {
    if (S.me.guest)
        return 'auth';

    if (!p)
        return 'noplan';

    if (p.status == 'cancelled')
        return 'cancelled';

    if (p.status == 'ended')
        return 'ended';

    const s = p.checkin;

    if (!s)
        return 'nosession';

    if (!/^[0-9a-f]{32}$/.test(String(token)))
        return 'invalid';

    if (!attEq(token, s.token))
        return (s.old || []).some(o => attEq(o, token)) ? 'revoked' : 'invalid';

    if (s.closed)
        return 'closed';

    if (Date.now() >= s.expiresAt)
        return 'expired';

    if (!p.members.includes('me'))
        return 'notmember';

    return 'ok';
}

/* 'checked_in' | 'duplicate' | 'disputed' | attCheck failure | 'method' | 'save' */
function attCheckIn(planId, token, method) {
    if (!ATT_SCAN.includes(method))
        return 'method';

    const p = pl(planId);
    const c = attCheck(p, token);

    if (c != 'ok')
        return c;

    const a = attGet(p, 'me');

    if (a && a.status == 'present' && !a.dispute)
        return 'duplicate';

    return attTxn(p, () => {
        if (a && a.status == 'absent') {
            /* the organizer said absent: a scan doesn't overrule that, it opens a dispute they must resolve */
            a.dispute = { at: Date.now(), via: method, note: 'Member scanned the meetup code' };
            a.audit.push({ at: Date.now(), by: 'me', action: 'dispute', from: 'absent', to: 'absent', reason: 'Scanned the meetup code' });
            return 'disputed';
        }

        const r = attUpsert(p, 'me', 'present', method, 'me', 'check_in', '');

        r.token = p.checkin.token.slice(0, 8);

        return 'checked_in';
    }, ['checked_in', 'disputed']);
}

/* "I was there but couldn't scan" (no record yet) or "I was there" (marked absent): needs the organizer to resolve. 'ok' | ... */
function attClaim(p) {
    if (S.me.guest)
        return 'auth';

    if (!p || p.status == 'cancelled')
        return 'cancelled';

    if (!p.members.includes('me'))
        return 'notmember';

    const a = attGet(p, 'me');

    if (a && (a.status == 'present' || a.status == 'claimed' || a.dispute))
        return 'duplicate';

    return attTxn(p, () => {
        if (!a)
            attUpsert(p, 'me', 'claimed', 'manual', 'me', 'claim', 'Member says they attended but did not scan');
        else {
            a.dispute = { at: Date.now(), via: 'claim', note: 'Member says they attended' };
            a.audit.push({ at: Date.now(), by: 'me', action: 'dispute', from: 'absent', to: 'absent', reason: 'Member says they attended' });
        }

        return 'ok';
    });
}

/* Manual present/absent overrides were removed. Hosts check members in through the Scanner on the Groups card.
   Existing historical attendance records remain readable; new check-ins are created through the QR scanner flow. */

/* ---- host QR scan: the host checks an attendee in by scanning that attendee's personal QR ----

   SECURITY NOTE (frontend-only, same limit as the rest of this file): the attendee's QR carries only an opaque
   account id (#/user/<id>). Resolving that id to a person here is a convenience lookup, NOT secure server-side
   identity verification: a copied or screenshotted QR can be replayed, and ids from other devices cannot be verified
   on this one. Real identity proof needs a backend (see README, "QR attendance"). This is still the single trusted
   gate for the rules below (host ownership, membership, eligibility, no self-scan, no duplicate). */

/* record one attendee present via the host's scan. 'checked_in' | 'duplicate' | 'self' | 'unknown' | 'notmember'
   | 'state' | 'forbidden' | 'noplan' | 'auth' | 'save' */
function attHostMark(p, uid) {
    if (typeof p == 'string')
        p = pl(p);

    if (S.me.guest)
        return 'auth';

    if (!p)
        return 'noplan';

    if (!isHost(p))
        return 'forbidden';

    /* only an open plan takes check-ins (cancelled / ended are rejected) */
    if (p.status != 'open')
        return 'state';

    if (uid == 'me' || uid == p.creator)
        return 'self';

    /* the id has to resolve to a real account on this device OR to a listed member of this plan */
    if (!(S.users.some(u => u.id == uid) || p.members.includes(uid)))
        return 'unknown';

    /* must be an accepted member (not pending / rejected / removed / left) */
    if (membership(p, uid) != 'member')
        return 'notmember';

    /* already verified-present: idempotent no-op, no second record */
    if (attPresent(p, uid))
        return 'duplicate';

    /* reuse the existing write path (attTxn + attUpsert): the host scanning someone in is a host present-mark,
       so it overwrites a prior 'absent'/dispute to 'present' and keeps method in_app_scanner (a verified method) */
    return attTxn(p, () => {
        attUpsert(p, uid, 'present', 'in_app_scanner', 'me', 'host_scan', 'Scanned in by the host');
        return 'checked_in';
    }, ['checked_in']);
}

/* ---- server-confirmed host scan: translate + mirror into the local DISPLAY cache (no authorization here) ----

   The authoritative record lives in Supabase; the server already ran all 8 checks. These two helpers only mirror a
   confirmed server success into S.attendance so the host's on-screen "N of M" count reflects it. S.attendance stays
   keyed by the app-local id namespace (newAcctId() ids + the running-app alias 'me'); the server returns a Supabase
   sub (UUID), so we translate first. attHostMark (above) is retained UNCHANGED and still backs the direct-helper
   assertions and feedback setup — the live UI scan path no longer calls it. */

/* translate a Supabase sub (UUID) to this device's app-local account id, or null if this device never saw it */
function localIdForSub(sub) {
    if (!sub)
        return null;

    if (S.me && !S.me.guest && S.me.sub === sub)
        return 'me';

    const u = S.users.find(x => x.sub === sub);

    return u ? u.id : null;
}

/* mirror a server-confirmed host scan into the display cache (NO authorization decision — the server made it).
   'checked_in' on success, 'skip' when there is no local id to key the row on. Returns via the attTxn gate so the
   row goes through the same attUpsert path (p.members / attGet / attPresent / attCount all see it). */
function attCacheMark(planId, localId) {
    const p = pl(planId);

    if (!p || !localId)
        return 'skip';

    return attTxn(p, () => {
        attUpsert(p, localId, 'present', 'in_app_scanner', 'me', 'host_scan', 'Scanned in by the host');
        return 'checked_in';
    }, ['checked_in']);
}

/* ---- completion (separate from attendance) ---- */

const compDisputes = p =>
    ((p.completion && p.completion.disputes) || []).filter(d => {
        const a = attGet(p, d.u);

        return p.members.includes(d.u) && a && (a.status == 'present' || a.status == 'claimed');
    });

/* scheduled | awaiting_completion | completion_pending | completed | cancelled | disputed.
   There is no machine-readable start/end time on plans (`when` is free text), so no state is ever derived from the clock. */
function lifeState(p) {
    if (p.status == 'cancelled')
        return 'cancelled';

    if (p.status == 'ended')
        return 'completed';

    if (p.completion)
        return compDisputes(p).length ? 'disputed' : 'completion_pending';

    return p.checkin ? 'awaiting_completion' : 'scheduled';
}

/* people other than the organizer whose attendance is verified: the only people who can confirm */
const compVerifiers = p => p.members.filter(m => m != p.creator && attPresent(p, m));

/* required independent confirmations = min(config completionConfirmations (default 1), verified attendees). Nobody to ask -> organizer alone. */
const compNeed = p => Math.min(cfgCount('completionConfirmations', 1), compVerifiers(p).length);

const compHave = p => (p.completion.confirms || []).filter(u => compVerifiers(p).includes(u)).length;

/* Host-only completion: the host's confirmation ALONE completes the plan, as long as no verified attendee has an
   open dispute. There is no attendee quorum/vote (compNeed/compHave are kept defined but no longer gate this).
   Returns 'completed' | 'pending' | 'disputed'.
   Note: an attendee withdrawing the LAST open dispute (via compMember) also reaches here and finalizes the host's
   already-standing completion — that is the host's completion taking effect once the blocker is gone, NOT an
   attendee completing the plan. 'pending' can no longer be returned once the host has confirmed. */
function compSettle(p) {
    if (compDisputes(p).length)
        return 'disputed';

    p.status = 'ended';
    p.endedAt = Date.now();
    p.roster = p.members.filter(m => attPresent(p, m));

    return 'completed';
}

/* organizer says the meetup happened and ended. Does NOT mark anyone present. 'completed' | 'pending' | 'disputed' | 'forbidden' | 'state' | 'save' */
function compHost(p) {
    if (!isHost(p))
        return 'forbidden';

    if (p.status != 'open')
        return 'state';

    return attTxn(p, () => {
        if (!p.completion)
            p.completion = { by: p.creator, at: Date.now(), confirms: [], disputes: [] };

        if (!attGet(p, p.creator))
            attUpsert(p, p.creator, 'present', 'organizer', p.creator, 'organizer_present', 'Organizer confirmed the meetup ended');

        return compSettle(p);
    }, ['completed', 'pending', 'disputed']);
}

/* a verified attendee confirms it happened / disputes it / withdraws their dispute */
function compMember(p, act) {
    if (S.me.guest)
        return 'auth';

    if (!p || p.status != 'open' || !p.completion)
        return 'state';

    if (p.creator == 'me')
        return 'forbidden';

    const a = attGet(p, 'me');

    if (!p.members.includes('me') || !a || !['present', 'claimed'].includes(a.status))
        return 'forbidden';

    if (act == 'confirm' && !attPresent(p, 'me'))
        return 'forbidden';

    return attTxn(p, () => {
        const c = p.completion;

        c.confirms = c.confirms.filter(u => u != 'me');
        c.disputes = c.disputes.filter(d => d.u != 'me');

        if (act == 'confirm')
            c.confirms.push('me');
        else if (act == 'dispute')
            c.disputes.push({ u: 'me', at: Date.now() });

        return compSettle(p);
    }, ['completed', 'pending', 'disputed']);
}

/* ---- profile statistics: derived from records, never incremented ---- */

/* Real accounts: hosted = plans you created; joined = plans you're a member of (not your own; may be upcoming);
   attended = distinct completed plans with verified attendance; organized = your plans that reached completed.
   No-show penalties are no longer part of the reliability system. `completed` equals `attended`.
   Built-in demo people keep their fixed demo numbers (they have no real history on this device). */
function relOf(u) {
    const zero = { hosted: 0, joined: 0, completed: 0, cancel: 0 };

    if (!u)
        return zero;

    if (!(u.real || u.id == 'me')) {
        const r = u.rel || zero;

        return { ...zero, ...r, attended: r.completed };
    }

    if (u.guest)
        return { ...zero, attended: 0, organized: 0 };

    const id = u.id;
    const mine = S.plans.filter(p => p.creator == id);
    const ended = S.plans.filter(p => p.status == 'ended');
    const attended = ended.filter(p => attPresent(p, id)).length;

    return {
        hosted: mine.length,
        joined: S.plans.filter(p => p.creator != id && p.members.includes(id)).length,
        attended,
        completed: attended,
        organized: mine.filter(p => p.status == 'ended').length,
        cancel: (u.rel && u.rel.cancel) || 0
    };
}
