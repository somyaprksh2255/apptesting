/* Deliberate, styled fallback screens for links that cannot be shown (Section 01).
   Every message is a fixed string: it never repeats the link, an id, or anything about the resource, so a fallback
   can never leak private details, and a missing plan and a plan you may not see look exactly the same. */

const FALLBACKS = {
    invalid: ['That link doesn\'t look right', 'It may be incomplete or mistyped. Head back to what\'s happening.', 'Discover plans', '#/explore'],
    missing: ['Plan escaped 💀', 'This one\'s gone.', 'Back to what\'s happening', '#/explore'],
    event: ['Event not found 💀', 'It may have ended.', 'Back to Discover', '#/explore'],
    denied: ['This page isn\'t available', 'You don\'t have access to it.', 'Back to Home', '#/home'],
    notfound: ['Page not found', 'That page doesn\'t exist.', 'Back to Home', '#/home'],
    error: ['Something went wrong', 'That page couldn\'t load. Your data is safe.', 'Back to Home', '#/home']
};

function fallbackPage(kind) {
    const f = FALLBACKS[kind] || FALLBACKS.error;

    return `
        <main class="wrap" style="max-width:520px;text-align:center" data-fallback="${kind}">
            ${empty(f[0], f[1], f[2], f[3])}
            <p>
                <button class="btn ghost sm" data-a="goBack">Go back</button>
            </p>
        </main>
    `;
}

/* shown after sign-in when the thing the person started can no longer continue */
function resumeBlockedSheet() {
    return `
        <div class="authst">
            <span class="okc bad">${I('x', '26px')}</span>
            <h2>That's no longer available</h2>
            <p class="mut">You're signed in, but the plan you were looking at can't continue. It may be full, closed, or gone.</p>
        </div>
        <a class="btn pink wide" href="#/explore" data-a="close">Discover plans</a>
        <p style="text-align:center">
            <button class="btn ghost sm" data-a="close">Close</button>
        </p>
    `;
}
