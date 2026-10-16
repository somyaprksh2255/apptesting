/* Keeps the chat composer above the on-screen keyboard (Section 03).
   On Android Chrome the layout viewport shrinks for the keyboard, so 100dvh already works. iOS Safari does not shrink it:
   the keyboard covers the bottom of the page and the browser may scroll the page up. visualViewport reports the part that is
   really visible, so while a chat is open its height is published as --vvh and the chat layout uses it instead of 100dvh.
   Outside a chat nothing is set (the variable is removed) and the existing layout is untouched.
   Browsers without visualViewport simply keep the 100dvh behaviour. Needs a real phone to verify (see README). */
function syncViewport() {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const chat = !!(document.body.classList && document.body.classList.contains('in-chat'));

    if (!vv || !chat) {
        root.style && root.style.removeProperty && root.style.removeProperty('--vvh');

        return false;
    }

    const list = document.querySelector('.gmsgs');
    const stick = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 40;

    root.style.setProperty('--vvh', Math.round(vv.height) + 'px');

    /* the newest message stays reachable when the keyboard opens, and the page itself is not left scrolled */
    if (list && stick)
        list.scrollTop = list.scrollHeight;

    if (vv.offsetTop > 0 && typeof scrollTo == 'function')
        scrollTo(0, 0);

    return true;
}

if (window.visualViewport && window.visualViewport.addEventListener) {
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
}
