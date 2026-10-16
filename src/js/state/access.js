/* Central access control (Section 01).
   ONE place answers "who is this, and may they see / do this?". Routes, pages, action handlers, notifications and
   sheets all call these functions, so two components can never disagree about the same person and resource.

   IMPORTANT LIMIT: Squado has no backend. These are frontend safeguards that keep the interface honest; they are not
   server-side security. Anyone with access to the device can edit its local storage. Real enforcement needs a server
   (see README "Access control").

   Who is asking (tier):
     guest        nobody is signed in (or the stored session is not a verified, current one)
     onboarding   signed in with Google, profile not finished yet
     ready        signed in with a finished profile

   What they are to one squad (membership), derived from the plan's own records (no parallel membership system):
     host      p.creator == 'me'                    (the only administrative role Squado has)
     member    accepted: in p.members
     pending   request waiting: in p.reqs
     rejected  host passed: in p.rej                (silent: never notified)
     removed   permanently removed by the host: in p.removed   (cannot ask to join that squad again)
     left      left by choice: in p.left            (may ask to join again, like any new person)
     none      no relationship
   'removed' always wins, even if stale data still lists the person as a member. */

const ID_RE = /^[A-Za-z0-9_-]{1,48}$/;
const idOk = v => typeof v == 'string' && ID_RE.test(v);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const gl = (p, k) => (p && Array.isArray(p[k]) ? p[k] : []);

/* ---- who is asking ---- */

const sessionDays = () => {
    const d = +(window.SQUADO_CONFIG && SQUADO_CONFIG.sessionDays);

    return d > 0 ? d : 30;
};

/* A session exists only because Google just confirmed this person (app/auth.js enterAccount writes S.session).
   A profile sitting in local storage is NOT proof of a session. */
const sessionOk = () => {
    const s = S.session;
    const n = Date.now();

    return !!(
        s &&
        S.acct &&
        s.acct === S.acct &&
        (!S.me.sub || s.sub === S.me.sub) &&
        +s.at > 0 &&
        s.at <= n + 6e4 &&
        n - s.at < sessionDays() * 864e5
    );
};

const isAuthed = () => !S.me.guest && sessionOk() && !(window.AUTH && AUTH.error);

const onboarded = () => isAuthed() && S.me.onboarded !== false && !!S.me.username && !!S.me.name;

const tier = () => (!isAuthed() ? 'guest' : onboarded() ? 'ready' : 'onboarding');

/* Platform administration lives in the separate /admin.html portal. The user app never grants
 * platform-admin capabilities based on a client-side email allowlist. */
const canManageEvents = () => false;


/* ---- routes ---- */

const ROUTE_ACCESS = {
    '': 'public',
    home: 'public',
    explore: 'public',
    plan: 'public',
    event: 'public',
    checkin: 'public',
    signup: 'public',
    login: 'public',
    create: 'ready',
    outside: 'ready',
    posted: 'ready',
    groups: 'ready',
    gc: 'ready',
    me: 'ready',
    settings: 'ready'
};

const routeParts = h => ((h === undefined ? location.hash : h).replace(/^#\/?/, '') || '').split('/');
const routeAccess = r => (hasOwn(ROUTE_ACCESS, r) ? ROUTE_ACCESS[r] : null);

/* only these shapes may ever be used as a return destination */
const SAFE_HASH = [
    /^#\/(home|explore|create|outside|groups|me|settings)$/,
    /^#\/(plan|event|gc|posted)\/[A-Za-z0-9_-]{1,48}$/,
    /^#\/checkin\/[A-Za-z0-9_-]{1,48}\/[0-9a-f]{32}$/i
];

const safeHash = h => (typeof h == 'string' && h.length <= 140 && SAFE_HASH.some(r => r.test(h)) ? h : '');

/* ---- remembered intent (what a guest was trying to do) ----
   RESUME says what happens after sign-in:
     open  re-check, then open the same sheet again (a sheet always asks for the final confirmation)
     nav   only bring the person back to the right page; they tap the action again themselves
   Nothing is ever sent, published, blocked or marked automatically. */
const RESUME = {
    join: 'open',
    nextSheet: 'open',
    edit: 'open',
    fbOpen: 'open',
    report: 'open',
    going: 'nav',
    post: 'nav',
    postOut: 'nav',
    block: 'nav',
    scanOpen: 'nav',
    attClaim: 'nav'
};

const INTENT_TTL = 30 * 60 * 1000;

function cleanIntent(raw) {
    if (!raw || typeof raw != 'object')
        return null;

    const at = +raw.at;

    if (!(at > 0) || Date.now() - at > INTENT_TTL || at > Date.now() + 6e4)
        return null;

    const a = typeof raw.a == 'string' && hasOwn(RESUME, raw.a) ? raw.a : '';
    const k = idOk(raw.k) ? raw.k : '';
    const v = idOk(raw.v) ? raw.v : '';

    let hash = safeHash(raw.hash);

    if (['join', 'nextSheet', 'fbOpen', 'scanOpen', 'attClaim'].includes(a) && v)
        hash = safeHash('#/plan/' + v) || hash;
    else if (a == 'going' && v)
        hash = safeHash('#/event/' + v) || hash;
    else if (a == 'post')
        hash = '#/create';
    else if (a == 'postOut')
        hash = '#/outside';

    if (!a && !hash)
        return null;

    return { a, k, v, hash, at };
}

/* ---- membership ---- */

function membership(p, uid) {
    uid = uid || 'me';

    if (!p || !Array.isArray(p.members))
        return 'none';

    if (uid == 'me' && !isAuthed())
        return 'guest';

    if (gl(p, 'removed').includes(uid))
        return 'removed';

    if (p.members.includes(uid))
        return p.creator == uid ? 'host' : 'member';

    if (gl(p, 'reqs').some(r => r.u == uid))
        return 'pending';

    if (gl(p, 'rej').includes(uid))
        return 'rejected';

    if (gl(p, 'left').includes(uid))
        return 'left';

    return 'none';
}

/* private content of a squad (chat, member list, attachments, exact spot, controls): accepted members only */
const groupAccess = p => tier() == 'ready' && ['host', 'member'].includes(membership(p, 'me'));

/* the host is the only administrative role that exists in Squado */
const isAdmin = p => groupAccess(p) && p.creator == 'me';

/* public plan details are open to everyone, except a plan whose host you blocked (you are not shown it) */
const planVisible = p => !!p && (groupAccess(p) || !S.blocked.includes(p.creator));

/* may this person ask to join? 'ok' or the reason it is refused */
function joinCheck(p) {
    const t = tier();

    if (t == 'guest')
        return 'auth';

    if (t == 'onboarding')
        return 'onboarding';

    if (!p || !planVisible(p))
        return 'unavailable';

    const m = membership(p, 'me');

    if (m == 'host' || m == 'member')
        return 'member';

    /* closed / removed / pending / rejected / full: the lifecycle rules live in state/membership.js */
    const c = memCanRequest(p, 'me');

    if (c != 'ok')
        return c;

    if ((p.who == 'Girls only' && S.me.gender != 'Girl') || (p.who == 'Boys only' && S.me.gender != 'Boy'))
        return 'gender';

    return 'ok';
}

/* private profiles: only people you legitimately share a context with, never a blocked person */
function canViewProfile(id) {
    if (tier() != 'ready')
        return false;

    if (id == 'me')
        return true;

    if (!idOk(id) || !S.users.some(u => u.id == id) || S.blocked.includes(id))
        return false;

    return S.plans.some(
        p =>
            (groupAccess(p) && p.members.includes(id)) ||
            (p.creator == id && planVisible(p)) ||
            (isAdmin(p) && gl(p, 'reqs').some(r => r.u == id))
    );
}

/* ---- notifications: what may be shown about a squad ---- */

const PRIVATE_NOTIF = ['message', 'member', 'join_request', 'join-approved'];

/* rejected requests are never announced: this type is not created, not stored and not shown */
const SILENT_NOTIF = ['join-rejected'];

function notifView(n) {
    const p = n.planId && pl(n.planId);

    if (PRIVATE_NOTIF.includes(n.type) && n.planId && !(p && groupAccess(p))) {
        return {
            t: 'Squad update',
            b: 'You no longer have access to this squad',
            ic: 'lock',
            c: n.c,
            route: p && planVisible(p) ? '#/plan/' + p.id : ''
        };
    }

    return { t: n.t, b: n.b, ic: n.ic, c: n.c, route: notifRoute(n) };
}

/* ---- clearing private UI ---- */

/* sign-out, account switching, lost session: nothing from the previous person's screen may survive */
function clearPrivateUi() {
    O.sess = (O.sess || 0) + 1;
    O.chat = { draft: '', id: null };
    O.confirm = null;
    O.media = null;
    O.rep = null;
    O.fm = null;
    O.fb = {};
    O.ci = null;
    O.scan = { code: '', busy: false, hostPlan: null };
    O.posting = false;
    O.ed = {};
    O.ctx = null;
    O.W = { type: '', vibe: [], loc: '', when: '', size: 0, desc: '' };
    O.os = { step: 0, move: '', size: 0, loc: '', desc: '', cname: '' };
    O.ob = { step: 0, name: '', username: '', city: '', locOk: 0, gender: '', age: '', interests: [] };
    O.unRemote = '';

    modal('');

    try {
        document.body.classList && document.body.classList.remove('in-chat');
    }
    catch (e) { }
}

/* a sheet that shows one squad's private content is open: if access is lost, close it and say so */
function enforceAccess() {
    const c = O.ctx;

    /* viewing a squad chat that this person can no longer open: drop the draft and any attachment in progress */
    const [r, a] = routeParts();

    if (r == 'gc' && a && !groupAccess(pl(a))) {
        O.chat.draft = '';

        if (O.media && O.media.id == a)
            O.media = null;
    }

    if (!c || !c.plan)
        return;

    if (!groupAccess(pl(c.plan))) {
        O.ctx = null;
        O.media = null;
        modal('');
        toast('You no longer have access to that squad.');
    }
}

/* what to tell someone whose join request is refused */
const JOIN_MSG = {
    unavailable: () => 'This plan is no longer available.',
    closed: () => 'This plan is no longer available.',
    removed: () => 'You can\'t ask to join this squad.',
    pending: () => 'Request already sent ⏳',
    rejected: () => 'The host passed on this one 🫶',
    full: () => 'Squad full 🔥',
    gender: p => 'This one\'s ' + String(p.who).toLowerCase() + ' 🫶'
};
