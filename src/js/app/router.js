let lastR = '';

/* Route protection lives in state/access.js (ROUTE_ACCESS, tier, groupAccess). Here it is applied at three levels:
   guard()      a guest on a protected route is sent Home with the sign-in sheet; the intended page is remembered
   buildPage()  a page is only built for someone allowed to see it, and ids are validated first
   render()     a page that throws becomes a styled fallback instead of a blank screen */
function guard() {
    if (window.AUTH && AUTH.state == 'loading')
        return;

    const [r] = routeParts();

    if (tier() == 'guest' && routeAccess(r) == 'ready') {
        S.intent = cleanIntent({ hash: location.hash, at: Date.now() });

        try {
            S.intent
                ? sessionStorage.setItem('pu-intent', JSON.stringify(S.intent))
                : sessionStorage.removeItem('pu-intent');
        }
        catch (e) { }

        history.replaceState(null, '', location.pathname + location.search + '#/home');
        setTimeout(() => {
            window.track && (r == 'create' || r == 'outside') && track('create_plan_click');
            authGate(r == 'create' || r == 'outside' ? 'Ready to make a plan?' : 'Sign in to continue');
        });
    }
}

function authView() {
    return AUTH.error ? `\<main style="max-width:520px;text-align:center">\<div class="empty">\<h3>Couldn't load your profile\</h3>\<p class="mut">Check your connection and try again. Your account is safe.\</p>\<button class="btn pink" data-a="authRetry">Try again\</button> \<button class="btn ghost" data-a="logout">Log out\</button>\</div>\</main>` : `\<main style="max-width:520px;text-align:center">${loader('Checking your session...')}\</main>`;
}

/* The skeleton shown for the first 700 ms of Home / Discover. The timer is started only after the page built
   successfully, and only once at a time, so a page that throws can never queue extra renders. */
function lazyLoaded(key) {
    if (O.loaded[key] || O.loading[key])
        return;

    O.loading[key] = 1;
    setTimeout(() => { O.loading[key] = 0; O.loaded[key] = 1; render(); }, 700);
}

/* the HTML for one route, for the person who is asking. Returns { h, n (show nav), k (nav item) } */
function buildPage(r, a, b) {
    const t = tier();
    let k = r;

    /* unfinished onboarding: nothing else is reachable until it is done */
    if (!S.in || t == 'onboarding')
        return { h: signup(), n: false, k };

    if (!r || r == 'signup' || r == 'login')
        k = 'home';
    else if (routeAccess(r) === null)
        return { h: fallbackPage('notfound'), n: true, k: 'home' };

    /* defence in depth: a protected page is never built for someone who may not see it */
    if (routeAccess(k) == 'ready' && t != 'ready')
        return { h: fallbackPage('denied'), n: true, k: 'home' };

    if (['plan', 'event', 'gc', 'posted', 'checkin'].includes(k) && !idOk(a))
        return { h: fallbackPage('invalid'), n: true, k: NAVMAP[k] || k };

    /* a route has exactly the segments it defines: "#/gc/abc/../xyz" or "#/home/x" is not a link we issued */
    const segs = routeParts().filter((x, i, all) => x !== '' || i < all.length - 1 && all.slice(i).some(y => y !== ''));
    const want = k == 'checkin' ? 3 : ['plan', 'event', 'gc', 'posted'].includes(k) ? 2 : 1;

    if (r && segs.length > want)
        return { h: fallbackPage('invalid'), n: true, k: NAVMAP[k] || k };

    if (k == 'checkin' && !/^[0-9a-f]{32}$/i.test(b || ''))
        return { h: fallbackPage('invalid'), n: true, k: 'home' };

    let h = '', n = true;

    if (k == 'home') {
        h = home();
        lazyLoaded('home');
    }
    else if (k == 'explore') {
        h = explore();
        lazyLoaded('ex');
    }
    else if (k == 'create')
        h = create();
    else if (k == 'outside') {
        h = outside();
        n = false;
    }
    else if (k == 'posted') {
        const p = pl(a);

        h = p && isAdmin(p) ? posted(a) : fallbackPage('denied');
    }
    else if (k == 'event') {
        h = eventPage(a);
        n = true; // Keep global navigation available on desktop Event pages; mobile hides it via CSS.
    }
    else if (k == 'plan')
        h = detail(a);
    else if (k == 'checkin')
        h = checkinPage(a, b);
    else if (k == 'gc') {
        if (groupAccess(pl(a)))
            delete S.unread[a];

        h = groupsPage(a);
    }
    else if (k == 'groups')
        h = groupsPage();
    else if (k == 'me')
        h = profile();
    else if (k == 'settings')
        h = settings();
    else
        h = home();

    return { h, n, k };
}

function render() {
    if (window.AUTH && (AUTH.state == 'loading' || AUTH.resolving || AUTH.error)) {
        $('#app').innerHTML = UI(authView());
        return;
    }

    /* a session that is no longer valid ends here, before anything private is drawn */
    window.checkSession && checkSession();
    guard();
    S.plans.forEach(memReconcile);
    enforceAccess();
    unreadSanitize();

    const [r, a, b] = routeParts();

    /* signed in but onboarding unfinished (for example the flag was cleared while the app was open): resume it */
    if (tier() == 'onboarding' && S.in) {
        S.in = false;
        window.obRestore && obRestore();
    }

    /* a protected deep link opened during onboarding is remembered, then revalidated after onboarding */
    if (tier() == 'onboarding' && !S.intent && routeAccess(r) == 'ready')
        S.intent = cleanIntent({ hash: location.hash, at: Date.now() });

    const chatId = r == 'gc' ? a : null;

    if (O.chat.id !== chatId) {
        O.chat.draft = '';
        O.chat.id = chatId;
    }

    let page;

    try {
        page = buildPage(r, a, b);
    }
    catch (err) {
        console.error(err);
        page = { h: fallbackPage('error'), n: true, k: 'home' };
    }

    const { h, n, k } = page;
    const oldChat = document.querySelector('.gmsgs');
    const oldChatAtBottom = oldChat
        ? oldChat.scrollHeight - oldChat.scrollTop - oldChat.clientHeight < 40
        : true;
    const y = scrollY, chg = lastR != location.hash;
    const inChat = k == 'gc' && groupAccess(pl(a));

    try {
        document.body.classList && document.body.classList.toggle('in-chat', k == 'gc');
        document.body.classList && document.body.classList.toggle('in-event', k == 'event');
    }
    catch (e) { }

    window.syncViewport && syncViewport();

    $('#app').innerHTML = UI(appLayout(n ? navh(k) : '', chg ? h.replace('\<main', '\<main data-pg') : h));

    if (lastR == location.hash)
        scrollTo(0, y);
    else
        scrollTo(0, k == 'gc' ? 1e6 : 0);

    lastR = location.hash;

    if (inChat) {
        const m = $('#mi');

        if (m)
            m.addEventListener('keydown', e => {
                /* Enter sends; Enter that confirms an IME composition (or a held-down repeat) must not */
                if (e.key == 'Enter' && !e.isComposing && !e.repeat && e.keyCode !== 229)
                    A.send(a);
            });

        const list = document.querySelector('.gmsgs');

        if (list && (chg || oldChatAtBottom))
            list.scrollTop = list.scrollHeight;
    }
}
