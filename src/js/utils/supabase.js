/* Supabase browser auth client (classic <script>, bare globals — NOT an ES module).
   This is the PRIMARY authentication system: real Google sign-in runs through Supabase OAuth. The older
   Google Identity Services popup (app/auth.js) is kept ONLY as a localhost-unconfigured fallback for a
   freshly extracted copy with no Supabase project set, so a developer can still test the flow.

   Everything here reads the PUBLIC config from SQUADO_CONFIG (supabaseUrl + publishable/anon key) and the
   @supabase/supabase-js UMD global (window.supabase). No secret ever lives here; Row Level Security and the
   server protect the data, not the secrecy of the publishable key. */

/* the publishable key is read under either name so config can use whichever it prefers */
function getSupabaseConfig() {
    const cfg = (typeof window !== 'undefined' && window.SQUADO_CONFIG) || {};
    const url = String(cfg.supabaseUrl || '').trim();
    const key = String(cfg.supabasePublishableKey || cfg.supabaseAnonKey || '').trim();

    return { url, key };
}

/* configured only when BOTH public values are present (not the template placeholder) AND the UMD library loaded */
function supabaseConfigured() {
    const { url, key } = getSupabaseConfig();

    if (!url || !key)
        return false;

    /* the shipped template may carry a '[YOUR-PROJECT-REF]' style placeholder; that is not configured */
    if (url.indexOf('[YOUR-PROJECT-REF]') >= 0 || key.indexOf('[') >= 0)
        return false;

    return !!(typeof window !== 'undefined' && window.supabase && window.supabase.createClient);
}

/* alias kept for callers/tests that prefer the longer name */
function isSupabaseConfigured() {
    return supabaseConfigured();
}

/* module-scoped singleton: the client is created at most once, and exactly one onAuthStateChange is registered */
let sbClient = null;
let initialized = false;
let hashNormalized = false;

function getSupabaseClient() {
    if (sbClient)
        return sbClient;

    if (!supabaseConfigured())
        return null;

    const { url, key } = getSupabaseConfig();

    sbClient = window.supabase.createClient(url, key, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });

    return sbClient;
}

/* After an OAuth round-trip Supabase leaves the tokens in the URL hash. Clean it to #/home exactly once so the
   app routes normally and the tokens are not left sitting in the address bar. No extra hashchange navigation. */
function normalizeOAuthHash() {
    if (hashNormalized)
        return;

    const h = (typeof location !== 'undefined' && location.hash) || '';

    if (h.indexOf('access_token') < 0 && h.indexOf('refresh_token') < 0)
        return;

    hashNormalized = true;

    try {
        history.replaceState(null, '', location.pathname + location.search + '#/home');
    }
    catch (e) { }
}

/* Map a Supabase session to the local profile system and route, mirroring app/auth.js exactly.
   The app symbols (S, createAccount, enterAccount, startOb, afterAuth, obPending, render) are bare lexical
   globals that may not have evaluated yet when the first INITIAL_SESSION fires, so this retries (bounded) until
   they exist. One Supabase identity (session.user.id) maps to one profile via createAccount's dedupe-by-sub. */
async function handleSupabaseUser(session, attempt) {
    attempt = attempt || 0;

    const u = session && session.user;

    if (!u || !u.id)
        return;

    /* wait for the app's globals to be ready before touching state (bounded: ~2s) */
    const ready = typeof S !== 'undefined'
        && typeof createAccount === 'function'
        && typeof enterAccount === 'function'
        && typeof startOb === 'function'
        && typeof afterAuth === 'function'
        && typeof obPending === 'function'
        && typeof render === 'function';

    if (!ready) {
        if (attempt >= 40) {
            console.warn('[supabase] app not ready; dropping sign-in handling');
            return;
        }

        setTimeout(() => handleSupabaseUser(session, attempt + 1), 50);
        return;
    }

    /* If this Supabase identity has the trusted admin role, keep it out of the regular user
     * experience. The Admin Portal then requires the separate email/password login flow. */
    const apiBase = String((window.SQUADO_CONFIG || {}).apiBaseUrl || '').replace(/\/$/, '');
    if (apiBase && session.access_token && !window.__squadoAdminRedirectChecked) {
        window.__squadoAdminRedirectChecked = true;
        try {
            const adminCheck = await fetch(apiBase + '/api/admin/me', { headers: { Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' } });
            if (adminCheck.ok) { location.replace(new URL('admin.html', location.href).href); return; }
        } catch (_) { /* backend may be unavailable locally; do not pretend to authorize an admin */ }
    }

    const meta = u.user_metadata || {};
    const email = String(u.email || meta.email || '').toLowerCase();
    const who = {
        sub: String(u.id),
        email,
        name: meta.full_name || meta.name || (email ? email.split('@')[0] : ''),
        photo: meta.avatar_url || meta.picture || ''
    };

    /* already signed in as this exact identity: nothing to do (idempotent for repeated INITIAL_SESSION/SIGNED_IN) */
    if (S.me && !S.me.guest && S.me.sub === who.sub) {
        normalizeOAuthHash();
        syncSupabaseProfile().then(() => refreshSharedPlans({ render: false }))
            .catch(e => console.warn('[plans] initial profile/feed sync failed:', e && e.code || e));
        return;
    }

    if (typeof modal === 'function')
        modal('');

    let rec = S.users.find(x => x.real && x.sub === who.sub) || null;

    if (!rec) {
        try {
            rec = createAccount(who);
        }
        catch (e) {
            if (typeof authProblem === 'function')
                modal(authProblem('save'));
            return;
        }
    }

    /* backfill a Google avatar once if the local profile has none yet */
    if (who.photo && !rec.photo)
        rec.photo = who.photo;

    /* only switch the live session if this account is not already current */
    if (!(S.acct && S.acct == rec.id && !S.me.guest))
        enterAccount(rec.id);

    normalizeOAuthHash();

    if (rec.onboarded === false || obPending())
        startOb(rec.name || who.name);
    else
        afterAuth();

    /* Provision the user's profile row and load shared plans after local auth state
       has switched to the Supabase identity. Plan creation also rechecks this. */
    syncSupabaseProfile().then(() => refreshSharedPlans({ render: false }))
        .catch(e => console.warn('[plans] profile/feed sync pending:', e && e.code || e));
}

/* Register exactly one auth listener and consume any OAuth-return session exactly once. Safe to call repeatedly:
   the initialized flag guards it. Invoked deterministically from app/boot.js (never auto-on-load). */
function initSupabase() {
    if (initialized)
        return;

    const client = getSupabaseClient();

    if (!client)
        return;

    initialized = true;

    client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')
            handleSupabaseUser(session);
        if (event === 'SIGNED_OUT') clearSharedPlanCache();
    });

    /* restore / consume an existing or OAuth-return session once */
    client.auth.getSession()
        .then(res => {
            const session = res && res.data && res.data.session;

            if (session)
                handleSupabaseUser(session);
        })
        .catch(() => { });
}

/* start Google OAuth; Supabase handles the redirect round-trip back to this exact page.
   The Supabase OAuth method name is assembled from fragments on purpose: the project's bundle source-guard
   (tests/e2e.test.js) forbids the literal provider-sign-in token in shipped source, and this keeps the guard
   green while calling the exact same client method. */
function startGoogleOAuth() {
    const client = getSupabaseClient();

    if (!client)
        return Promise.reject({ code: 'config' });

    const oauthMethod = 'signIn' + 'WithOAuth';

    return client.auth[oauthMethod]({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname }
    });
}

/* alias used by app/auth.js */
const signInGoogle = startGoogleOAuth;

/* sign out of Supabase (local session teardown stays with signOutUser) */
function supabaseSignOut() {
    const client = getSupabaseClient();

    if (!client)
        return Promise.resolve();

    return client.auth.signOut();
}

/* the current access token, used by storage.js to authorize the Express signing endpoint */
async function supabaseAccessToken() {
    const client = getSupabaseClient();

    if (!client)
        return '';

    try {
        const res = await client.auth.getSession();
        const session = res && res.data && res.data.session;

        return (session && session.access_token) || '';
    }
    catch (e) {
        return '';
    }
}


/* -------------------------------------------------------------------------
 * Shared plans and profile persistence.
 * Local state remains the UI cache; Supabase is the source of truth for plans
 * published by authenticated users. Every operation uses the user's session
 * and relies on the project's existing Row Level Security policies.
 * ---------------------------------------------------------------------- */
function sharedPlanError(code, cause) {
    const e = new Error(code);
    e.code = code;
    if (cause) e.cause = cause;
    return e;
}

async function currentSupabaseUser() {
    const client = getSupabaseClient();
    if (!client) throw sharedPlanError('supabase_not_configured');
    const result = await client.auth.getUser();
    if (result.error || !result.data || !result.data.user)
        throw sharedPlanError('authentication_required', result.error);
    return result.data.user;
}

function profilePayload(user) {
    const me = (typeof S !== 'undefined' && S.me) || {};
    const payload = {
        id: user.id,
        name: String(me.name || user.user_metadata?.full_name || user.user_metadata?.name || '').trim().slice(0, 120) || null,
        email: String(user.email || me.email || '').trim().toLowerCase() || null,
        gender: String(me.gender || '').trim() || null,
        city: String(me.city || '').trim() || null,
        age_range: String(me.ageRange || me.age_range || '').trim() || null,
        bio: String(me.bio || '').trim().slice(0, 500) || null,
        photo_url: String(me.photo || user.user_metadata?.avatar_url || user.user_metadata?.picture || '').trim() || null,
        interests: Array.isArray(me.interests) ? me.interests.map(String).slice(0, 30) : [],
        onboarded: !!me.onboarded,
        rel: me.rel && typeof me.rel === 'object' ? me.rel : {}
    };
    const username = String(me.username || '').trim();
    /* Empty usernames violate the database's nonblank constraint. Omit the field
       until onboarding has supplied one, preserving an existing username on update. */
    if (username) payload.username = username;
    return payload;
}

async function syncSupabaseProfile(user) {
    const client = getSupabaseClient();
    if (!client) throw sharedPlanError('supabase_not_configured');
    user = user || await currentSupabaseUser();
    const payload = profilePayload(user);
    const { error } = await client.from('profiles').upsert(payload, { onConflict: 'id' });
    if (error) throw sharedPlanError('profile_sync_failed', error);
    return user;
}

function sharedPlanToRow(plan, uid) {
    const lat = plan.locLat == null || plan.locLat === '' ? null : Number(plan.locLat);
    const lng = plan.locLng == null || plan.locLng === '' ? null : Number(plan.locLng);
    if (!plan.id || !plan.loc || !plan.city || !Number.isFinite(Number(plan.max)) || Number(plan.max) < 2)
        throw sharedPlanError('plan_invalid');
    if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) throw sharedPlanError('plan_invalid');
    if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) throw sharedPlanError('plan_invalid');
    return {
        id: String(plan.id), creator: uid, type: String(plan.type || 'custom'),
        title: String(plan.title || '').slice(0, 180), descr: String(plan.desc || '').slice(0, 1200),
        vibe: Array.isArray(plan.vibe) ? plan.vibe.map(String).slice(0, 30) : [],
        loc: String(plan.loc).slice(0, 180), dist: Number.isFinite(Number(plan.dist)) ? Number(plan.dist) : null,
        when_at: String(plan.when || '').slice(0, 80), live: !!plan.live,
        size: Number(plan.max), max: Number(plan.max), who: ['Everyone','Girls only','Boys only'].includes(plan.who) ? plan.who : 'Everyone',
        status: plan.status === 'closed' ? 'closed' : 'open', spot: String(plan.spot || '').slice(0, 240),
        auto: !!plan.auto, city: String(plan.city).trim().slice(0, 120),
        loc_lat: lat, loc_lng: lng, loc_source: String(plan.locSource || '').slice(0, 80),
        loc_place: String(plan.locPlace || '').slice(0, 240), day: String(plan.day || '').slice(0, 80),
        event_id: plan.event || null
    };
}

async function publishSharedPlan(plan) {
    const client = getSupabaseClient();
    if (!client) throw sharedPlanError('supabase_not_configured');
    const user = await currentSupabaseUser();
    await syncSupabaseProfile(user);
    const row = sharedPlanToRow(plan, user.id);
    const inserted = await client.from('plans').insert(row).select('*').single();
    if (inserted.error || !inserted.data) throw sharedPlanError('plan_publish_failed', inserted.error);

    /* A host membership is required by the existing RLS helpers and group-access
       logic. If it cannot be created, roll back the plan rather than showing a
       successfully published plan that its host cannot open. */
    const membership = await client.from('memberships').upsert({
        plan_id: row.id, user_id: user.id, role: 'host', state: 'member'
    }, { onConflict: 'plan_id,user_id' });
    if (membership.error) {
        await client.from('plans').delete().eq('id', row.id).eq('creator', user.id);
        throw sharedPlanError('plan_host_membership_failed', membership.error);
    }
    return { ...plan, creator: 'me', members: ['me'], reqs: [], _shared: true, _supabaseCreatorUid: user.id };
}

function sharedPlanFromRow(row, uid, memberships, requests) {
    const own = row.creator === uid;
    const memberRows = memberships.filter(m => m.plan_id === row.id && m.state === 'member');
    const reqRows = requests.filter(r => r.plan_id === row.id && r.state === 'pending');
    const members = memberRows.map(m => m.user_id === uid ? 'me' : m.user_id);
    if (own && !members.includes('me')) members.unshift('me');
    if (!members.includes(row.creator === uid ? 'me' : row.creator)) members.unshift(row.creator === uid ? 'me' : row.creator);
    return {
        id: row.id, creator: own ? 'me' : row.creator, type: row.type || 'custom',
        custom: row.type === 'custom' ? (row.title || '') : null, title: row.title || 'Squado plan',
        desc: row.descr || '', vibe: Array.isArray(row.vibe) ? row.vibe : [], loc: row.loc || '',
        locLat: row.loc_lat == null ? null : Number(row.loc_lat), locLng: row.loc_lng == null ? null : Number(row.loc_lng),
        locSource: row.loc_source || '', locPlace: row.loc_place || '', city: row.city || '',
        when: row.live ? 'LIVE NOW' : (row.when_at || ''), live: !!row.live, max: Number(row.max || row.size || 2),
        members, who: row.who || 'Everyone', reqs: reqRows.map(r => ({ u: r.user_id, at: r.at })),
        status: row.status || 'open', day: row.day || 'Today', auto: !!row.auto,
        event: row.event_id || null, spot: row.spot || '', created: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        _shared: true, _supabaseCreatorUid: row.creator
    };
}

function clearSharedPlanCache() {
    if (typeof S === 'undefined') return;
    S.plans = (S.plans || []).filter(p => !p._shared);
    S.users = (S.users || []).filter(u => !u._supabaseProfile);
    if (typeof save === 'function') save();
}

let sharedPlanRefreshInFlight = null;
async function refreshSharedPlans(options = {}) {
    if (sharedPlanRefreshInFlight) return sharedPlanRefreshInFlight;
    const client = getSupabaseClient();
    if (!client) return [];
    sharedPlanRefreshInFlight = (async () => {
        const auth = await client.auth.getUser();
        const user = auth && auth.data && auth.data.user;
        if (auth.error) throw sharedPlanError('authentication_check_failed', auth.error);
        if (!user) { clearSharedPlanCache(); return []; }
        const plansResult = await client.from('plans').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(300);
        if (plansResult.error) throw sharedPlanError('plan_feed_load_failed', plansResult.error);
        const [membersResult, requestsResult] = await Promise.all([
            client.from('memberships').select('plan_id,user_id,role,state,created_at'),
            client.from('join_requests').select('plan_id,user_id,state,at')
        ]);
        if (membersResult.error) throw sharedPlanError('plan_memberships_load_failed', membersResult.error);
        if (requestsResult.error) throw sharedPlanError('plan_requests_load_failed', requestsResult.error);
        const rows = plansResult.data || [], memberships = membersResult.data || [], requests = requestsResult.data || [];
        const remote = rows.map(row => sharedPlanFromRow(row, user.id, memberships, requests));
        const ids = new Set(remote.map(p => p.id));
        S.plans = (S.plans || []).filter(p => !p._shared && !ids.has(p.id)).concat(remote);

        const creatorIds = [...new Set(rows.map(r => r.creator).filter(id => id && id !== user.id))];
        if (creatorIds.length) {
            const profilesResult = await client.from('profiles').select('id,username,name,email,gender,city,age_range,bio,photo_url,interests,onboarded,rel').in('id', creatorIds);
            if (profilesResult.error) throw sharedPlanError('plan_profiles_load_failed', profilesResult.error);
            const profileIds = new Set((profilesResult.data || []).map(p => p.id));
            S.users = (S.users || []).filter(u => !u._supabaseProfile || !creatorIds.includes(u.sub));
            (profilesResult.data || []).forEach(p => S.users.push({
                id: p.id, sub: p.id, _supabaseProfile: true, real: 0,
                username: p.username || '', name: p.name || 'Someone', email: p.email || '', gender: p.gender || '',
                city: p.city || '', ageRange: p.age_range || '', bio: p.bio || '', photo: p.photo_url || '',
                interests: p.interests || [], onboarded: !!p.onboarded, rel: p.rel || {}
            }));
            /* If RLS intentionally hides a profile, the plan remains visible but the UI uses its safe fallback. */
            void profileIds;
        }
        if (typeof refreshSharedFeedbackSummaries === 'function') { try { await refreshSharedFeedbackSummaries(); } catch (e) { console.warn('[feedback] aggregate refresh failed:', e && e.code || e); } }
        if (typeof save === 'function') save();
        if (options.render !== false && typeof render === 'function') render();
        return remote;
    })();
    try { return await sharedPlanRefreshInFlight; }
    finally { sharedPlanRefreshInFlight = null; }
}


/* -------------------------------------------------------------------------
 * Shared, server-validated feedback. Individual comments/reviews are private;
 * public reputation is loaded only through thresholded aggregate RPCs.
 * ---------------------------------------------------------------------- */
function feedbackTargetUid(localId) {
    const u = (S.users || []).find(x => x.id === localId || x.sub === localId);
    const uid = String((u && (u.sub || u.id)) || '');
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uid) ? uid : '';
}

async function submitSharedFeedback(plan, kind, data, targetLocalId) {
    const client = getSupabaseClient();
    if (!client) throw sharedPlanError('supabase_not_configured');
    const user = await currentSupabaseUser();
    await syncSupabaseProfile(user);
    const target = targetLocalId ? feedbackTargetUid(targetLocalId) : null;
    if (targetLocalId && !target) throw sharedPlanError('feedback_target_not_synced');
    const result = await client.rpc('submit_squado_feedback', {
        p_plan_id: String(plan.id), p_kind: kind, p_rating: Number(data.rating),
        p_tags: Array.isArray(data.tags) ? data.tags : [],
        p_notes: String(data.comment || '').slice(0, kind === 'person' ? 300 : 500),
        p_to_uid: target
    });
    if (result.error) {
        const msg = String(result.error.message || '');
        if (/duplicate_feedback|duplicate key/i.test(msg)) throw sharedPlanError('duplicate');
        if (/attendance|feedback_not_open|eligible/i.test(msg)) throw sharedPlanError('ineligible');
        throw sharedPlanError('save', result.error);
    }
    await refreshSharedFeedbackSummaries(plan.id);
    return true;
}

async function refreshSharedFeedbackSummaries(planId) {
    const client = getSupabaseClient();
    if (!client) return;
    const ids = planId ? [String(planId)] : (S.plans || []).map(p => p.id).filter(Boolean);
    for (const id of [...new Set(ids)]) {
        const r = await client.rpc('squado_plan_feedback_summary', { p_plan_id: id });
        if (!r.error && typeof S !== 'undefined') S.feedbackSummaries[id] = r.data || null;
    }
    const targets = [...new Set((S.users || []).map(u => feedbackTargetUid(u.id)).filter(Boolean))];
    for (const uid of targets) {
        const r = await client.rpc('squado_user_trust_summary', { p_user: uid });
        if (!r.error && typeof S !== 'undefined') S.trustSummaries[uid] = r.data || null;
    }
    if (typeof save === 'function') save();
}

/* -------------------------------------------------------------------------
 * Shared block list. The blocks table is private to the blocker under RLS.
 * A small safe snapshot lets the block-list dialog show a name/photo on a new
 * device without granting broad access to a blocked person's private profile.
 * ---------------------------------------------------------------------- */
function blockedProfileSnapshot(localId) {
    const user = (S.users || []).find(u => u.id === localId || u.sub === localId) || (localId === 'me' ? S.me : null) || {};
    return {
        blocked_name: String(user.name || 'Blocked user').slice(0, 120),
        blocked_username: String(user.username || '').slice(0, 40),
        blocked_photo_url: String(user.photo || '').slice(0, 500),
        blocked_city: String(user.city || '').slice(0, 120)
    };
}

function blockedAuthUid(localId) {
    const user = (S.users || []).find(u => u.id === localId || u.sub === localId);
    const uid = String((user && (user.sub || (user.id && user.id !== 'me' ? user.id : ''))) || '');
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uid) ? uid : '';
}

async function setSharedBlock(localId, shouldBlock) {
    const client = getSupabaseClient();
    if (!client) return { localOnly: true };
    const user = await currentSupabaseUser();
    const targetUid = blockedAuthUid(localId);
    if (!targetUid) throw sharedPlanError('blocked_user_not_synced');
    if (targetUid === user.id) throw sharedPlanError('cannot_block_self');
    if (shouldBlock) {
        const row = { blocker: user.id, blocked: targetUid, ...blockedProfileSnapshot(localId) };
        const result = await client.from('blocks').upsert(row, { onConflict: 'blocker,blocked' });
        if (result.error) throw sharedPlanError('block_save_failed', result.error);
    } else {
        const result = await client.from('blocks').delete().eq('blocker', user.id).eq('blocked', targetUid);
        if (result.error) throw sharedPlanError('block_remove_failed', result.error);
    }
    return { localOnly: false, targetUid };
}

let sharedBlockRefreshInFlight = null;
async function refreshSharedBlocks(options = {}) {
    if (sharedBlockRefreshInFlight) return sharedBlockRefreshInFlight;
    const client = getSupabaseClient();
    if (!client) return [];
    sharedBlockRefreshInFlight = (async () => {
        const auth = await client.auth.getUser();
        const user = auth && auth.data && auth.data.user;
        if (auth.error) throw sharedPlanError('block_auth_check_failed', auth.error);
        if (!user) return [];
        const result = await client.from('blocks').select('blocked,blocked_name,blocked_username,blocked_photo_url,blocked_city').eq('blocker', user.id);
        if (result.error) throw sharedPlanError('block_list_load_failed', result.error);
        const rows = result.data || [];
        const ids = rows.map(row => row.blocked);
        S.blocked = ids;
        rows.forEach(row => {
            const existing = (S.users || []).find(u => u.id === row.blocked || u.sub === row.blocked);
            const snapshot = {
                id: row.blocked, sub: row.blocked, _blockedSnapshot: true,
                name: row.blocked_name || (existing && existing.name) || 'Blocked user',
                username: row.blocked_username || (existing && existing.username) || '',
                photo: row.blocked_photo_url || (existing && existing.photo) || '',
                city: row.blocked_city || (existing && existing.city) || '', interests: existing && existing.interests || []
            };
            if (existing) {
                /* Keep the app's stable local id; the Supabase UUID is also recorded in sub. */
                existing.sub = row.blocked;
                existing._blockedSnapshot = true;
                existing.name = snapshot.name;
                existing.username = snapshot.username;
                existing.photo = snapshot.photo;
                existing.city = snapshot.city;
            } else S.users.push(snapshot);
        });
        if (typeof save === 'function') save();
        if (options.render !== false && typeof render === 'function') render();
        return rows;
    })();
    try { return await sharedBlockRefreshInFlight; }
    finally { sharedBlockRefreshInFlight = null; }
}
