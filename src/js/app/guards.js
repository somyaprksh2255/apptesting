/* Action authorization (Section 01).
   Every handler that touches protected account or squad state is wrapped here, outermost, so a hidden or stale button
   (or a hand-made data-a element) is not an authorization check: the same central decisions from state/access.js
   (tier, groupAccess, isAdmin, joinCheck, canViewProfile) are asked again at the moment of the action.
   The handlers also re-check their own critical rules; this layer is the one place that lists who may do what.

   RULES: action -> [kind, where the id lives]
     ready   a signed-in person with a finished profile
     event   ... and an event that exists                 person  ... and an existing other person
     profile ... and a profile they may view              visible ... and a plan they may see
     join    ... and joinCheck(plan) == 'ok'              pending ... and their own pending request
     group   ... and accepted membership of the squad     member  ... accepted member who is not the host
     admin   ... and the host of the squad (the only administrative role Squado has) */
const RULES = {
    join: ['join', 'v'],
    cjoin: ['join', 'v'],
    unreq: ['pending', 'v'],

    members: ['group', 'v'],
    gopts: ['group', 'v'],
    ginfo: ['group', 'v'],
    attachments: ['group', 'v'],
    openMediaCamera: ['group', 'v'],
    capturePhoto: ['group', 'v'],
    mediaRetry: ['group', 'v'],
    attachLocation: ['group', 'v'],
    detachLocation: ['group', 'v'],
    openMediaLocation: ['group', 'v'],
    sendMedia: ['group', 'k'],
    react: ['group', 'k'],
    send: ['group', 'arg'],
    nextSheet: ['group', 'v'],
    nextGo: ['group', 'k'],

    leave: ['member', 'v'],

    accept: ['admin', 'plan'],
    reject: ['admin', 'plan'],
    remove: ['admin', 'k'],
    cancel: ['admin', 'v'],
    end: ['admin', 'v'],
    hostScan: ['admin', 'v'],
    reviewRequest: ['admin', 'k'],

    goPlan: ['visible', 'v'],
    user: ['profile', 'v'],
    block: ['person', 'v'],
    going: ['event', 'v'],
    evPlan: ['event', 'v'],

    post: ['ready'],
    postOut: ['ready'],
    edit: ['ready'],
    saveEd: ['ready'],
    unblock: ['ready'],
    report: ['ready'],
    submitRep: ['ready'],
    notifs: ['ready'],
    notifGo: ['ready'],
    fbOpen: ['ready'],
    scanOpen: ['ready'],
    attClaim: ['ready']
};

/* actions that open a sheet showing one squad's private content: closed again if access is lost */
const GROUP_SHEETS = ['members', 'gopts', 'ginfo', 'attachments', 'openMediaCamera', 'openMediaLocation', 'nextSheet', 'reviewRequest'];

const SIGNIN_TITLE = {
    join: 'Want to join the squad?',
    cjoin: 'Want to join the squad?',
    going: 'Want to mark yourself going?',
    post: 'Ready to make a plan?',
    postOut: 'Ready to make a plan?'
};

const DENY_MSG = {
    unavailable: 'That one is no longer available.',
    notmember: 'Only accepted squad members can do that.',
    removed: 'You\'re no longer part of this squad.',
    host: 'Hosts can\'t leave their own plan. Cancel it instead.',
    blocked: 'You blocked this person. Unblock them in Settings to see their profile.',
    private: 'That profile isn\'t available.'
};

const ADMIN_MSG = {
    accept: 'Only the host can approve requests.',
    reject: 'Only the host can decline requests.',
    remove: 'Only the host can remove people.',
    cancel: 'Only the host can cancel this plan.',
    end: 'Only the host can do that.',
    hostScan: 'Only the host can do that.',
    reviewRequest: 'This join request is no longer available.'
};

/* the id this action is about */
function ruleId(name, e) {
    const key = RULES[name][1];

    if (key == 'arg')
        return typeof e == 'string' ? e : '';

    const d = (e && e.dataset) || {};

    return key == 'plan' ? d.k || String(d.v || '').split('|')[0] : d[key] || '';
}

/* 'ok' or the reason this person may not do this right now */
function authorize(name, e) {
    const R = RULES[name];

    if (!R)
        return 'ok';

    const t = tier();

    if (t == 'guest')
        return 'auth';

    if (t != 'ready')
        return 'onboarding';

    const kind = R[0];

    if (kind == 'ready')
        return 'ok';

    const id = ruleId(name, e);

    if (!idOk(id))
        return 'unavailable';

    if (kind == 'event')
        return S.events.some(x => x.id == id) ? 'ok' : 'unavailable';

    if (kind == 'person')
        return id != 'me' && S.users.some(u => u.id == id) ? 'ok' : 'unavailable';

    if (kind == 'profile')
        return canViewProfile(id) ? 'ok' : S.blocked.includes(id) ? 'blocked' : 'private';

    if (kind == 'visible')
        return planVisible(pl(id)) ? 'ok' : 'unavailable';

    if (kind == 'join')
        return joinCheck(pl(id));

    if (kind == 'pending')
        return membership(pl(id), 'me') == 'pending' ? 'ok' : 'unavailable';

    const p = pl(id);

    if (!p)
        return 'unavailable';

    if (!groupAccess(p))
        return membership(p, 'me') == 'removed' ? 'removed' : 'notmember';

    if (kind == 'member' && isAdmin(p))
        return 'host';

    if (kind == 'admin' && !isAdmin(p))
        return 'admin';

    return 'ok';
}

function deny(name, why, e) {
    if (why == 'auth') {
        const d = (e && e.dataset) || {};

        return requireAuth({ a: name == 'cjoin' ? 'join' : name, k: d.k, v: d.v, hash: location.hash }, null, SIGNIN_TITLE[name] || 'Quick sign in to continue');
    }

    /* onboarding unfinished: the onboarding screen is the only thing reachable, nothing else runs */
    if (why == 'onboarding')
        return;

    const id = RULES[name] ? ruleId(name, e) : '';
    const p = idOk(id) ? pl(id) : null;

    if (RULES[name][0] == 'join') {
        modal('');

        if (why == 'member')
            return;

        return toast(JOIN_MSG[why] ? JOIN_MSG[why](p || {}) : DENY_MSG.unavailable);
    }

    toast(why == 'admin' ? ADMIN_MSG[name] || 'Only the host can do that.' : DENY_MSG[why] || DENY_MSG.unavailable);

    /* access to a squad is gone: close its sheets and replace the screen right now, never leave it half-usable */
    if (['removed', 'notmember', 'unavailable'].includes(why) && RULES[name][0] != 'profile') {
        O.media = null;
        O.ctx = null;
        modal('');

        if (p && location.hash == '#/gc/' + p.id)
            render();
    }
}

Object.keys(RULES).forEach(name => {
    const inner = A[name];

    if (typeof inner != 'function')
        return;

    A[name] = e => {
        const why = authorize(name, e);

        if (why != 'ok')
            return deny(name, why, e);

        const out = inner(e);

        if (GROUP_SHEETS.includes(name)) {
            const id = ruleId(name, e);

            if (idOk(id))
                O.ctx = { plan: id };
        }

        return out;
    };
});

/* ---- the session and the page can change underneath us ---- */

/* back/forward cache: a page restored from it may still show the previous (signed-out) account's screen */
addEventListener('pageshow', e => {
    if (e && e.persisted) {
        checkSession();
        render();
    }
});

addEventListener('focus', () => {
    if (checkSession())
        render();
});

/* another tab signed out, switched account, or removed this person from the squad being viewed */
addEventListener('storage', e => {
    if (!e || e.key !== K)
        return;

    let n = null;

    try {
        n = e.newValue ? JSON.parse(e.newValue) : null;
    }
    catch (x) { }

    const [r, a] = routeParts();
    const p = n && Array.isArray(n.plans) && r == 'gc' ? n.plans.find(x => x.id == a) : null;
    const lost = !!p && (!(p.members || []).includes('me') || (p.removed || []).includes('me'));
    const switched = !n || (n.acct || null) !== (S.acct || null) || ((n.session || {}).at || 0) !== ((S.session || {}).at || 0);

    if (switched || lost) {
        clearPrivateUi();
        $('#app').innerHTML = '';

        if (typeof location.reload == 'function')
            location.reload();
    }
});
