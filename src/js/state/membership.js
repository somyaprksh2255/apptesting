/* Membership lifecycle (Section 02): the ONE place where a person's relationship to a squad changes.

   The plan keeps its state in lists it already had. Mapping of the five lifecycle states onto the existing model:
     accepted   p.members   (the host, p.creator, is always accepted)
     pending    p.reqs      [{ u, at }]
     rejected   p.rej       (silent: the requester is never notified; they see their own status on the plan page)
     left       p.left      (left by choice; may ask again)
     removed    p.removed   (permanently removed by the host; cannot ask again; this squad only, never a platform ban)
   p.mlog is the history: [{ u, s, at, by }], one entry per transition. It is never used to grant access; it only records.

   Invariants (memReconcile enforces them deterministically, on load and after every transition):
     - a person is in exactly one state per squad. Precedence when records conflict: removed > accepted > pending > rejected > left
     - no duplicates in any list; the host is accepted and can never be pending, rejected, left or removed
     - removal is a permanent record: deleting a visible row elsewhere cannot lift it

   Every transition returns { ok:true, ... } or { ok:false, why } and changes nothing when refused, so a repeated, stale or
   forged action is harmless and idempotent. The acting person is 'me' (checked against the real host/member role through
   state/access.js) or a sample user acting inside the simulation.

   LIMIT: this is browser-local state, not shared authoritative data. It cannot stop two devices acting at once or a person
   editing their own local storage. The later backend must enforce the same rules (notably capacity) atomically. */

const MEM_LISTS = { accepted: 'members', pending: 'reqs', rejected: 'rej', left: 'left', removed: 'removed' };

const squadMin = () => Math.max(2, +(window.SQUADO_CONFIG && SQUADO_CONFIG.minSquad) || 2);
const squadMax = () => Math.max(squadMin(), +(window.SQUADO_CONFIG && SQUADO_CONFIG.maxSquad) || 8);
const capacityOk = n => Number.isInteger(n) && n >= squadMin() && n <= squadMax();

/* history (records only) */
function memLog(p, u, s, by) {
    if (!Array.isArray(p.mlog))
        p.mlog = [];

    p.mlog.push({ u, s, at: Date.now(), by: by || u });

    if (p.mlog.length > 300)
        p.mlog = p.mlog.slice(-300);
}

/* make the five lists agree, deterministically. Returns true if anything had to be repaired. */
function memReconcile(p) {
    if (!p || typeof p != 'object')
        return false;

    const before = JSON.stringify([p.members, p.reqs, p.rej, p.left, p.removed, p.max]);
    const uniq = a => [...new Set(Array.isArray(a) ? a.filter(x => typeof x == 'string' && x) : [])];

    const removed = uniq(p.removed).filter(u => u != p.creator);
    const members = uniq(p.members).filter(u => !removed.includes(u));

    if (p.creator && !members.includes(p.creator))
        members.unshift(p.creator);

    const seen = new Set();
    const reqs = (Array.isArray(p.reqs) ? p.reqs : []).filter(r => {
        if (!r || typeof r.u != 'string' || !r.u || seen.has(r.u) || removed.includes(r.u) || members.includes(r.u) || r.u == p.creator)
            return false;

        seen.add(r.u);

        return true;
    });

    const rej = uniq(p.rej).filter(u => !removed.includes(u) && !members.includes(u) && !seen.has(u));
    const left = uniq(p.left).filter(u => !removed.includes(u) && !members.includes(u) && !seen.has(u) && !rej.includes(u));

    p.members = members;
    p.reqs = reqs;
    p.rej = rej;
    p.left = left;
    p.removed = removed;

    if (!Number.isInteger(p.max) || p.max < members.length)
        p.max = Math.max(members.length, squadMin());

    return JSON.stringify([p.members, p.reqs, p.rej, p.left, p.removed, p.max]) != before;
}

/* does this actor hold host authority over the squad? 'me' must really be the host; sample actors are the sample host */
const memHost = (p, actor) => (actor && actor != 'me' ? actor == p.creator : isAdmin(p));

/* may u ask to join? 'ok' or why not (the same wording keys as JOIN_MSG) */
function memCanRequest(p, u) {
    if (!p || p.status != 'open')
        return 'closed';

    if (gl(p, 'removed').includes(u))
        return 'removed';

    if (gl(p, 'members').includes(u))
        return 'member';

    if (gl(p, 'reqs').some(r => r.u == u))
        return 'pending';

    if (gl(p, 'rej').includes(u))
        return 'rejected';

    if (gl(p, 'members').length >= p.max)
        return 'full';

    return 'ok';
}

/* ask to join; on an auto-accept squad this lands directly in accepted (still capacity-checked) */
function memRequest(p, u, extra, manual) {
    memReconcile(p);

    const why = memCanRequest(p, u);

    if (why != 'ok')
        return { ok: false, why };

    p.left = p.left.filter(x => x != u);

    if (p.auto && !manual) {
        p.members.push(u);
        memLog(p, u, 'accepted', u);

        return { ok: true, state: 'accepted' };
    }

    p.reqs.push({ ...(extra || {}), u, at: Date.now() });
    memLog(p, u, 'pending', u);

    return { ok: true, state: 'pending' };
}

/* the requester withdraws their own pending request */
function memCancelRequest(p, u) {
    memReconcile(p);

    if (!p || !p.reqs.some(r => r.u == u))
        return { ok: false, why: 'notpending' };

    p.reqs = p.reqs.filter(r => r.u != u);
    memLog(p, u, 'withdrawn', u);

    return { ok: true };
}

/* host approves a pending request */
function memApprove(p, u, actor) {
    actor = actor || 'me';
    memReconcile(p);

    if (!p || !memHost(p, actor))
        return { ok: false, why: 'admin' };

    if (p.status != 'open')
        return { ok: false, why: 'closed' };

    if (p.removed.includes(u))
        return { ok: false, why: 'removed' };

    if (!p.reqs.some(r => r.u == u))
        return { ok: false, why: 'notpending' };

    if (actor == 'me' && S.blocked.includes(u))
        return { ok: false, why: 'blocked' };

    if (p.members.length >= p.max)
        return { ok: false, why: 'full' };

    p.reqs = p.reqs.filter(r => r.u != u);
    p.rej = p.rej.filter(x => x != u);
    p.left = p.left.filter(x => x != u);
    p.members.push(u);
    memLog(p, u, 'accepted', actor);

    return { ok: true };
}

/* host declines a pending request (only ever a pending one: a stale decision cannot overwrite a newer state) */
function memReject(p, u, actor) {
    actor = actor || 'me';
    memReconcile(p);

    if (!p || !memHost(p, actor))
        return { ok: false, why: 'admin' };

    if (p.status != 'open')
        return { ok: false, why: 'closed' };

    if (!p.reqs.some(r => r.u == u))
        return { ok: false, why: 'notpending' };

    p.reqs = p.reqs.filter(r => r.u != u);
    p.rej.push(u);
    memLog(p, u, 'rejected', actor);

    return { ok: true };
}

/* an accepted member leaves by choice (never the host) */
function memLeave(p, u) {
    memReconcile(p);

    if (!p || !p.members.includes(u))
        return { ok: false, why: 'notmember' };

    if (u == p.creator)
        return { ok: false, why: 'host' };

    p.members = p.members.filter(x => x != u);
    p.left.push(u);
    memLog(p, u, 'left', u);

    return { ok: true };
}

/* host permanently removes an accepted member from THIS squad */
function memRemove(p, u, actor) {
    actor = actor || 'me';
    memReconcile(p);

    if (!p || !memHost(p, actor))
        return { ok: false, why: 'admin' };

    if (u == p.creator || u == actor)
        return { ok: false, why: 'host' };

    if (p.removed.includes(u))
        return { ok: false, why: 'already' };

    if (!p.members.includes(u))
        return { ok: false, why: 'notmember' };

    p.members = p.members.filter(x => x != u);
    p.reqs = p.reqs.filter(r => r.u != u);
    p.left = p.left.filter(x => x != u);
    p.removed.push(u);
    memLog(p, u, 'removed', actor);

    return { ok: true };
}

/* repair any stored plan whose lists disagree (older or edited data) before anything reads them */
S.plans.forEach(memReconcile);

/* a plan id that no existing plan uses (two creations in the same millisecond cannot collide) */
function newPlanId() {
    let id = 'p' + Date.now();

    while (S.plans.some(p => p.id == id))
        id += 'x';

    return id;
}
