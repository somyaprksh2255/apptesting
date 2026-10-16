/* Authentication. "Continue with Google" is real Google Identity Services (OAuth popup); no sign-in is ever simulated.
   Flow: Google popup -> Google confirms the token was issued to this app and returns the person's identity
   (stable id "sub", email, email_verified) -> unverified emails are refused -> look up the profile saved for that "sub"
   -> new: create it (onboarding not done) | existing + onboarded: open Home | existing + not onboarded: resume onboarding.
   Profiles live on this device (no backend): each is keyed by the Google "sub", so one Google account = one profile.
   The signed-in person is addressed as 'me' while the app runs; signing out files their data under the account id and
   signing in restores it (store.js swapId), so accounts never share squads, requests, messages or notifications. */
const AUTH = window.AUTH = {
    state: S.me && !S.me.guest ? 'authenticated' : 'unauthenticated',
    user: null,
    resolving: false,
    busy: false,
    pending: null,
    /* a stored session without a usable profile is rejected instead of being half-loaded */
    error: !!(S.me && !S.me.guest && !(S.me.name && (S.me.username || S.me.onboarded === false)))
};

/* A stored profile is NOT a session. A session exists only because Google just confirmed this person: enterAccount()
   writes S.session = { acct, sub, at }, and tier() (state/access.js) counts someone as signed in only while it is present,
   matches the account and is younger than config.sessionDays. Anything else is signed out locally (profile kept on the device).
   Honest limit: with no backend this marker lives in the same local storage as the profile, so it protects the interface
   from stale or half-loaded states; it is not tamper-proof security. */
window.checkSession = () => {
    if (S.me.guest || AUTH.error || sessionOk())
        return false;

    leaveAccount();
    setTimeout(() => toast('Please sign in again. Your session ended.'), 0);

    return true;
};

checkSession();

/* accounts tied to a Google identity; legacy ones (saved before that) have no sub until linked */
const accounts = () => S.users.filter(u => u.real && u.sub);
const legacyAccounts = () => S.users.filter(u => u.real && !u.sub && u.name && u.username);
/* Client ID: src/js/config.js is the source of truth. On a local dev host only (127.0.0.1 / localhost) a device-local
   fallback may be pasted in the "not set up" screen, so a freshly extracted copy of the project served from the same origin
   keeps working without editing config.js again. A client ID is public, not a secret. It is ignored on every other host. */
const DEV_CID_KEY = 'squado-dev-google-client-id';
const isLocalDev = () => ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname || '');
const cidOk = v => /^[\w-]+\.apps\.googleusercontent\.com$/.test(String(v || '').trim());
const devClientId = () => {
    if (!isLocalDev())
        return '';

    try {
        return (localStorage.getItem(DEV_CID_KEY) || '').trim();
    }
    catch (e) {
        return '';
    }
};
const gClientId = () =>
    String((window.SQUADO_CONFIG && window.SQUADO_CONFIG.googleClientId) || '').trim() || devClientId();
const obPending = () => !S.me.guest && S.me.onboarded === false;

/* first onboarding step whose answer is missing or no longer valid (a username may have been taken since) */
function obFirstOpen(o) {
    return !(o.name || '').trim()
        ? 0
        : unOk(o.username, '') != 'ok'
            ? 1
            : !isCity(o.city)
                ? 2
                : !o.gender
                    ? 3
                    : !o.age
                        ? 4
                        : 5;
}

/* resume at the saved step, but never past a step that is not actually complete */
window.obRestore = () => {
    const saved = (S.me && S.me.ob) || {};

    O.ob = { step: 0, name: S.me.name || '', username: '', city: '', locOk: 0, gender: '', age: '', interests: [], ...saved, an: 0 };
    O.ob.step = Math.max(0, Math.min(+saved.step || 0, obFirstOpen(O.ob)));
};

function startOb(n) {
    O.ob = { step: 0, name: n || '', username: '', city: '', locOk: 0, gender: '', age: '', interests: [] };

    /* resuming: restore what was already entered for this account */
    if (obPending())
        obRestore();

    O.unRemote = '';
    S.in = false;
    render();
}

window.saveObProgress = () => {
    if (obPending()) {
        S.me.ob = { ...O.ob, an: 0 };
        save();
    }
};

/* refresh in the middle of onboarding: stay in onboarding, at the saved step */
if (obPending()) {
    S.in = false;
    obRestore();
}

/* After sign-in (and onboarding) bring the person back to what they started, as far as it is still valid:
   - the stored intent is re-validated: only known actions, plain ids, whitelisted pages, and not older than 30 minutes
   - it is used once, then removed (no loops)
   - "open" intents re-open their own sheet, which asks for the final confirmation: nothing is ever sent, published, blocked
     or marked automatically
   - everything is authorized again right now (authorize() in app/guards.js) */
function replay() {
    let it = S.intent;

    if (!it) {
        try {
            it = JSON.parse(sessionStorage.getItem('pu-intent') || 'null');
        }
        catch (e) { }
    }

    S.intent = null;

    try {
        sessionStorage.removeItem('pu-intent');
    }
    catch (e) { }

    it = cleanIntent(it);

    if (!it)
        return false;

    if (it.hash && location.hash != it.hash)
        location.hash = it.hash;
    else
        render();

    const mode = it.a ? RESUME[it.a] : 'nav';
    const sid = O.sess;

    setTimeout(() => {
        if (O.sess !== sid || tier() != 'ready')
            return;

        if (mode == 'open') {
            const e = { dataset: { k: it.k || undefined, v: it.v || undefined } };
            const why = authorize(it.a, e);

            /* the plan went away or closed while they were signing in: say so, with a safe way out */
            if (why == 'unavailable' || why == 'closed')
                return modal(resumeBlockedSheet());

            A[it.a](e);
        }
        else if (['going', 'scanOpen', 'attClaim', 'block'].includes(it.a))
            toast('You\'re signed in. Tap it again to continue.');
    }, 500);

    return true;
}

/* after signing in or finishing onboarding: resume what the user started, else land on Home */
const afterAuth = () => {
    if (replay())
        return;

    if (location.hash == '#/home')
        render();
    else
        goHash('#/home');
};

/* sign in: move one stored account into the live session */
function enterAccount(id) {
    const rec = accounts().find(u => u.id == id);

    if (!rec)
        return false;

    const { slices, real, ...profile } = rec;

    /* whoever was on screen before (another account, a guest) leaves nothing behind for this person */
    clearPrivateUi();

    S.users = S.users.filter(u => u !== rec);
    S.me = { ...profile, id: 'me' };
    S.unread = (slices && slices.unread) || {};
    S.blocked = (slices && slices.blocked) || [];
    S.notif = slices && slices.notif !== undefined ? slices.notif : true;
    S.fbLater = (slices && slices.fbLater) || {};
    swapId(id, 'me');
    S.acct = id;
    S.session = { acct: id, sub: S.me.sub || '', at: Date.now() };
    S.in = true;
    AUTH.state = 'authenticated';
    AUTH.error = false;
    save();

    return true;
}

/* sign out: file the live session away under the account id */
function leaveAccount() {
    const id = S.acct;

    if (id && S.me.name && (S.me.sub || S.me.username)) {
        S.users = S.users.filter(u => u.id != id);
        S.users.push({
            ...S.me,
            id,
            real: 1,
            slices: { unread: S.unread, blocked: S.blocked, notif: S.notif, fbLater: S.fbLater }
        });
    }

    swapId('me', id || newAcctId());
    S.me = GUEST();
    S.acct = null;
    S.unread = {};
    S.blocked = [];
    S.fbLater = {};
    S.notif = true;
    S.intent = null;
    S.session = null;
    S.in = true;
    clearPrivateUi();

    try {
        sessionStorage.removeItem('pu-intent');
    }
    catch (e) { }

    AUTH.state = 'unauthenticated';
    AUTH.error = false;
    save();
}

/* --- Google Identity Services --- */

/* opens Google's account picker; resolves with an access token. Rejects {code}: cancelled | blocked | failed | config */
function googleToken(cid) {
    return new Promise((res, rej) => {
        const timer = setTimeout(() => rej({ code: 'failed' }), 120000);
        const done = f => v => { clearTimeout(timer); f(v); };
        const ok = done(res), no = done(rej);
        let client;

        try {
            client = google.accounts.oauth2.initTokenClient({
                client_id: cid,
                scope: 'openid email profile',
                callback: r =>
                    r && r.access_token && !r.error
                        ? ok(r.access_token)
                        : no({ code: r && r.error == 'access_denied' ? 'cancelled' : 'failed' }),
                error_callback: e =>
                    no({
                        code: e && e.type == 'popup_closed'
                            ? 'cancelled'
                            : e && e.type == 'popup_failed_to_open'
                                ? 'blocked'
                                : 'failed'
                    })
            });
        }
        catch (e) {
            return no({ code: 'config' });
        }

        client.requestAccessToken({ prompt: 'select_account' });
    });
}

/* asks Google who the token belongs to, and refuses anything that is not a verified Google identity for this app */
async function googleIdentity(token, cid) {
    let info, user;

    try {
        const a = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token));

        if (!a.ok)
            throw { code: 'failed' };

        info = await a.json();

        const b = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } });

        if (!b.ok)
            throw { code: 'failed' };

        user = await b.json();
    }
    catch (e) {
        throw e && e.code ? e : { code: 'network' };
    }

    /* the token must have been issued to this app, and both answers must describe the same person */
    if ((info.aud || info.azp) != cid || !user.sub || (info.sub && info.sub != user.sub))
        throw { code: 'failed' };

    if (!user.email || !(user.email_verified === true || user.email_verified === 'true'))
        throw { code: 'unverified' };

    return { sub: String(user.sub), email: String(user.email).toLowerCase(), name: user.name || '' };
}

/* the profile record for a Google identity; never creates a second one for the same sub */
function createAccount(who) {
    const have = S.users.find(u => u.real && u.sub == who.sub);

    if (have)
        return have;

    const rec = {
        id: newAcctId(),
        real: 1,
        sub: who.sub,
        email: who.email,
        name: who.name || who.email.split('@')[0],
        username: '',
        gender: '',
        city: '',
        ageRange: '',
        bio: '',
        photo: '',
        interests: [],
        onboarded: false,
        ob: null,
        rel: { hosted: 0, joined: 0, completed: 0, cancel: 0, noshow: 0 },
        slices: { unread: {}, blocked: [], notif: true, fbLater: {} }
    };

    S.users.push(rec);

    if (!save()) {
        S.users = S.users.filter(u => u !== rec);
        throw { code: 'save' };
    }

    return rec;
}

/* routing after a successful sign-in: finished profile -> where they were going / Home; unfinished -> onboarding */
function openAccount(rec) {
    if (!enterAccount(rec.id))
        throw { code: 'lookup' };

    modal('');

    if (obPending())
        startOb();
    else
        afterAuth();
}

/* the Google script is loaded async: give it a few seconds before calling it unreachable */
const googleReady = async () => {
    for (let i = 0; i < 50; i++) {
        if (window.google && google.accounts && google.accounts.oauth2)
            return true;

        await new Promise(r => setTimeout(r, 100));
    }

    return false;
};

A.gGoogle = async () => {
    if (AUTH.busy)
        return;

    checkSession();

    /* already signed in (another tab, an old sheet): never start a second sign-in */
    if (!S.me.guest)
        return modal('');

    /* PRIMARY path: when Supabase is configured (its UMD library is loaded and the public URL + key are present),
       Google sign-in goes through Supabase OAuth (redirect round-trip, handled by initSupabase on return) and the
       GIS popup below is NOT run. The GIS flow only runs as a fallback when Supabase is NOT configured — i.e. the
       library failed to load or no project is set (local dev, or a copy served without the CDN). In production the
       Supabase branch always wins, so GIS is not an independent production auth system. */
    if (typeof supabaseConfigured === 'function' && supabaseConfigured()) {
        try {
            await signInGoogle();
            return;
        }
        catch (e) {
            return modal(authProblem('network'));
        }
    }

    const cid = gClientId();

    if (location.protocol == 'file:')
        return modal(authProblem('file'));

    if (!cid)
        return modal(authProblem('config'));

    if (!cidOk(cid))
        return modal(authProblem('badclient'));

    /* normally Google's script is already there and nothing waits; otherwise show a real "connecting" step */
    if (!(window.google && google.accounts && google.accounts.oauth2)) {
        AUTH.busy = true;
        modal(authLoading('Connecting to Google…'));

        const tk0 = O.tok;
        const ready = await googleReady();

        AUTH.busy = false;

        /* the person closed the sheet while we waited: do nothing */
        if (O.tok != tk0)
            return;

        if (!ready)
            return modal(authProblem('network'));
    }

    AUTH.busy = true;
    AUTH.pending = null;

    let tk;
    const step = m => { modal(authLoading(m)); return tk = O.tok; };

    try {
        tk = step('Signing you in…');
        const token = await googleToken(cid);

        if (O.tok != tk)
            return;

        tk = step('Verifying your account…');

        const who = await googleIdentity(token, cid);

        if (O.tok != tk)
            return;

        step('Checking your profile…');

        let rec;

        try {
            rec = S.users.find(u => u.real && u.sub == who.sub) || null;
        }
        catch (e) {
            throw { code: 'lookup' };
        }

        if (!rec && legacyAccounts().length) {
            AUTH.pending = who;
            return modal(authLink());
        }

        if (!rec) {
            step('Setting up your profile…');
            rec = createAccount(who);
        }

        openAccount(rec);
    }
    catch (e) {
        /* the person closed the sheet while Google was working: stay quiet and stable instead of re-opening an error */
        if (tk !== undefined && O.tok != tk)
            return;

        modal(authProblem((e && e.code) || 'failed'));
    }
    finally {
        AUTH.busy = false;
    }
};

/* local dev hosts only: remember a pasted client ID on this device/origin (not in the project files) */
A.gDevSave = () => {
    const v = String((O.dev && O.dev.cid) || '').trim();

    if (!isLocalDev())
        return;

    if (!cidOk(v))
        return modal(authProblem('badclient', v));

    try {
        localStorage.setItem(DEV_CID_KEY, v);
    }
    catch (e) {
        return modal(authProblem('save'));
    }

    O.dev.cid = '';
    authGate('Sign in');
    toast('Client ID saved for this origin');
};

A.gDevClear = () => {
    try {
        localStorage.removeItem(DEV_CID_KEY);
    }
    catch (e) { }

    modal(authProblem('config'));
};

A.linkAcct = e => {
    const rec = legacyAccounts().find(u => u.id == e.dataset.v);
    const who = AUTH.pending;

    if (!rec || !who || S.users.some(u => u.real && u.sub == who.sub))
        return modal(authProblem('lookup'));

    rec.sub = who.sub;
    rec.email = who.email;

    if (!save()) {
        delete rec.sub;
        delete rec.email;
        return modal(authProblem('save'));
    }

    AUTH.pending = null;

    try {
        openAccount(rec);
    }
    catch (x) {
        modal(authProblem('lookup'));
    }
};

A.newGoogleAcct = () => {
    const who = AUTH.pending;

    if (!who)
        return modal(authProblem('failed'));

    modal(authLoading('Setting up your profile…'));

    try {
        const rec = createAccount(who);

        AUTH.pending = null;
        openAccount(rec);
    }
    catch (x) {
        modal(authProblem((x && x.code) || 'failed'));
    }
};

A.authRetry = () => {
    /* only leave the error screen if the stored session is actually usable */
    AUTH.error = !(S.me.guest || (S.me.name && (S.me.username || S.me.onboarded === false)));
    AUTH.resolving = false;
    render();
};

window.finishOb = () => {
    const o = O.ob;

    if (S.me.guest)
        return toast('Sign in first');

    if (unOk(o.username, '') != 'ok')
        return toast('Pick a free username');

    if (!isCity(o.city))
        return toast('Pick a supported location');

    /* onboarding counts as complete only once the profile has actually been saved */
    const prev = S.me;

    S.me = { ...S.me, name: o.name.trim(), username: o.username, gender: o.gender, ageRange: o.age, city: o.city, interests: o.interests, onboarded: true };
    delete S.me.ob;
    S.in = true;

    if (!save()) {
        S.me = prev;
        S.in = false;
        return toast('We couldn\'t save your profile. Please try again.');
    }

    AUTH.state = 'authenticated';
    AUTH.error = false;
    confetti();
    toast('You\'re in, ' + S.me.name + ' 🎉');
    afterAuth();
};

window.signOutUser = async () => {
    /* end the Supabase session first (best-effort); local teardown owns the rest */
    if (typeof supabaseSignOut === 'function') {
        try {
            await supabaseSignOut();
        }
        catch (e) { }
    }

    if (!S.me.guest)
        leaveAccount();

    modal('');
    goHash('#/home');
    render();
    toast('Logged out. Your profile is saved for next time.');
};

/* one central guard for every action that needs an account */
window.requireAuth = (intent, fn, title) => {
    checkSession();

    if (!S.me.guest)
        return fn && fn();

    S.intent = cleanIntent({ ...intent, at: Date.now() });

    try {
        S.intent
            ? sessionStorage.setItem('pu-intent', JSON.stringify(S.intent))
            : sessionStorage.removeItem('pu-intent');
    }
    catch (x) { }

    authGate(title);
};

{
    const oc = A.close;

    A.close = e => {
        if (S.me.guest) {
            S.intent = null;

            try {
                sessionStorage.removeItem('pu-intent');
            }
            catch (x) { }
        }

        oc(e);
    };
}

{
    const oo = A.obCancel;

    A.obCancel = () => {
        /* a signed-in person with an unfinished profile can't browse the app: leaving means signing out */
        if (obPending())
            return signOutUser();

        AUTH.state = 'unauthenticated';
        oo();
    };
}
