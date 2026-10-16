const K = 'squado-v5';

/* State schema 2: every signed-up person has their own account id (S.acct).
   Inside the running app the signed-in person is still addressed as 'me';
   swapId() converts 'me' <-> the real account id whenever someone signs out / in,
   so data that belongs to one account is never inherited by another. */
const SV = 2;
const LEGACY_PROFILE_K = 'squado-mock-profile';
const ACCT_SLICES = ['unread', 'blocked', 'notif', 'fbLater'];
const $ = s => document.querySelector(s);

const GUEST = () => ({
    id: 'me',
    guest: 1,
    name: 'friend',
    username: '',
    gender: '',
    city: 'Bhopal',
    interests: [],
    rel: {
        hosted: 0,
        joined: 0,
        completed: 0,
        cancel: 0,
        noshow: 0
    }
});

const clone = v => JSON.parse(JSON.stringify(v));

const FRESH = () => ({
    sv: SV,
    in: true,
    me: GUEST(),
    acct: null,
    users: [],
    plans: [],
    events: [],
    notifs: [],
    msgs: {},
    unread: {},
    blocked: [],
    reports: [],
    feedback: [],
    feedbackSummaries: {},
    trustSummaries: {},
    fbLater: {},
    notif: true
});

const newAcctId = () =>
    'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* Re-label one person everywhere shared data refers to them. */
const swapId = (from, to) => {
    const sw = v => v == from ? to : v;

    S.plans.forEach(p => {
        p.creator = sw(p.creator);
        p.members = p.members.map(sw);
        (p.reqs || []).forEach(r => r.u = sw(r.u));

        if (p.rej)
            p.rej = p.rej.map(sw);

        if (p.removed)
            p.removed = p.removed.map(sw);

        if (p.left)
            p.left = p.left.map(sw);

        if (p.mlog)
            p.mlog.forEach(m => {
                m.u = sw(m.u);
                m.by = sw(m.by);
            });

        if (p.roster)
            p.roster = p.roster.map(sw);

        if (p.noShows)
            p.noShows = p.noShows.map(sw);
    });


    Object.values(S.msgs).forEach(L =>
        L.forEach(m => {
            if (m.by)
                m.by = sw(m.by);
        })
    );

    (S.attendance || []).forEach(a => {
        a.uid = sw(a.uid);
        (a.audit || []).forEach(x => x.by = sw(x.by));

        if (a.dispute && a.dispute.by)
            a.dispute.by = sw(a.dispute.by);
    });

    S.plans.forEach(p => {
        if (p.completion) {
            p.completion.by = sw(p.completion.by);
            p.completion.confirms = (p.completion.confirms || []).map(sw);
            (p.completion.disputes || []).forEach(d => d.u = sw(d.u));
        }
    });

    (S.feedback || []).forEach(f => {
        f.by = sw(f.by);

        if (f.to)
            f.to = sw(f.to);
    });

    S.notifs.forEach(n => {
        n.to = sw(n.to);

        if (n.userId)
            n.userId = sw(n.userId);
    });
};

/* Older saved state had one shared 'me' and a single profile snapshot. */
const migrateState = () => {
    let profile = null;

    try {
        profile = JSON.parse(localStorage.getItem(LEGACY_PROFILE_K));
    }
    catch (e) {
    }

    /* demo-only seed notifications (ids n1-n4) and malformed approve/reject records are dropped */
    S.notifs = (S.notifs || []).filter(
        n =>
            n.t &&
            !['n1', 'n2', 'n3', 'n4'].includes(n.id)
    );
    S.notifs.forEach(n => n.to = n.to || 'me');
    S.users = S.users || clone(U);
    S.msgs = S.msgs || {};

    if (S.me && !S.me.guest) {
        S.acct = newAcctId();
    }
    else if (profile && profile.name) {
        const id = newAcctId();
        const slices = {};

        ACCT_SLICES.forEach(k => slices[k] = S[k]);
        swapId('me', id);

        S.users.push({
            ...profile,
            id,
            real: 1,
            slices
        });

        S.me = GUEST();
        S.acct = null;
        S.unread = {};
        S.blocked = [];
        S.fbLater = {};
        S.notif = true;
    }
    else {
        /* a guest with no profile owns nothing: start clean, without demo memberships */
        S = null;
        return;
    }

    S.sv = SV;

    try {
        localStorage.removeItem(LEGACY_PROFILE_K);
    }
    catch (e) {
    }
};

let S;

try {
    S = JSON.parse(
        localStorage.getItem(K)
    );
}
catch (e) {
}

if (S && S.sv != SV)
    migrateState();

S = S || FRESH();

if (!S.me)
    S.me = GUEST();

if (S.me.guest)
    S.acct = null;
else if (!S.acct)
    S.acct = newAcctId();

if (S.me.guest)
    S.in = true;


if (!S.notifs)
    S.notifs = [];

/* rejected requests are never announced: drop any such notification saved by an older version */
S.notifs = S.notifs.filter(n => n.type != 'join-rejected');

if (!S.session || typeof S.session != 'object')
    S.session = null;

if (!S.unread)
    S.unread = {};

if (!S.blocked)
    S.blocked = [];

if (!S.feedback) S.feedback = [];
if (!S.feedbackSummaries) S.feedbackSummaries = {};
if (!S.trustSummaries) S.trustSummaries = {};

if (!S.fbLater)
    S.fbLater = {};

if (!S.attendance)
    S.attendance = [];

/* Defensive identity normalization for real accounts. */
if (S.me && !S.me.guest && S.me.id !== 'me') S.me.id = 'me';


let saveWarned = 0;

const save = () => {
    try {
        localStorage.setItem(
            K,
            JSON.stringify(S)
        );

        return true;
    }
    catch (e) {
        /* storage full (e.g. many photos in chats): say so instead of silently losing changes */
        if (!saveWarned && window.toast) {
            saveWarned = 1;
            toast('Storage is full, so recent changes may not be saved.');
        }

        return false;
    }
};

/* One-time cleanup of known preloaded prototype fixtures from older localStorage snapshots.
   Generated user records are retained. The marker prevents test-only fixture IDs or user-generated IDs
   from being re-filtered on subsequent refreshes. */
if (!S.legacyFixtureCleanupDone) {
    S.plans = (Array.isArray(S.plans) ? S.plans : []).filter(p => p && p.id && !/^p(?:[1-9]|10)$/.test(String(p.id)));
    S.events = (Array.isArray(S.events) ? S.events : []).filter(e => e && e.id && !/^e[1-4]$/.test(String(e.id)));
    S.users = (Array.isArray(S.users) ? S.users : []).filter(u => u && (u.real || !/^u[1-8]$/.test(String(u.id || ''))));
    S.notifs = (Array.isArray(S.notifs) ? S.notifs : []).filter(n => n && !/^n[1-4]$/.test(String(n.id || '')));
    const validPlanIds = new Set(S.plans.map(p => p.id));
    S.msgs = Object.fromEntries(Object.entries(S.msgs || {}).filter(([id]) => validPlanIds.has(id)));
    S.unread = Object.fromEntries(Object.entries(S.unread || {}).filter(([id]) => validPlanIds.has(id)));
    S.legacyFixtureCleanupDone = true;
    save();
}

const O = {
    createMode: 'choose',
    E: {
        id: '',
        title: '',
        category: 'garba',
        info: '',
        date: '',
        endDate: '',
        startTime: '',
        endTime: '',
        loc: '',
        venue: '',
        ageGroup: '',
        capacity: '',
        visibility: 'public',
        host: '',
        status: 'draft'
    },
    W: {
        type: '',
        vibe: [],
        loc: '',
        locLat: null,
        locLng: null,
        locSource: '',
        locPlace: '',
        when: '',
        size: 0,
        desc: ''
    },

    ob: {
        step: 0,
        name: '',
        username: '',
        city: '',
        locOk: 0,
        gender: '',
        age: '',
        interests: []
    },

    os: {
        step: 0,
        move: '',
        size: 0,
        loc: '',
        locLat: null,
        locLng: null,
        locSource: '',
        locPlace: '',
        areaLat: null,
        areaLng: null,
        desc: '',
        cname: ''
    },

    ui: {
        f: 'All',
        s: 'For you',
        q: ''
    },

    chat: {
        draft: ''
    },

    media: null,
    locPicker: null,
    fm: null,

    loaded: {},

    loading: {},

    rep: null,

    fb: {},

    dev: { cid: '' },

    scan: { code: '', busy: false, hostPlan: null },

    ci: null,

    ed: {},

    unRemote: ''
};