function toast(m) {
    const t = document.createElement('div');

    t.className = 'toast';
    t.innerHTML = UI(eh(m));
    t.setAttribute('role', 'status');

    document.body.append(t);

    setTimeout(
        () => t.remove(),
        2200
    );
}

function confetti() {
    [
        '🎉',
        '🪩',
        '🔥',
        '💃',
        '✨',
        '🪔'
    ].forEach(
        (e, i) => {
            const s = document.createElement('span');

            s.className = 'cf';
            s.innerHTML = TW(e);
            s.style.left = 15 + i * 14 + '%';
            s.style.animationDelay = i * 70 + 'ms';

            document.body.append(s);

            setTimeout(
                () => s.remove(),
                1700
            );
        }
    );
}

function modal(h) {
    O.editing = 0;

    const m = $('#modal');

    /* every sheet change ends a running camera and makes any camera / location request still waiting stale */
    O.tok = (O.tok || 0) + 1;

    /* a sheet that was showing one squad's private content is gone once the sheet is closed */
    if (!h)
        O.ctx = null;

    if (m._cameraStream) {
        m._cameraStream.getTracks().forEach(t => t.stop());
        m._cameraStream = null;
    }

    m.innerHTML = h
        ? `<div class="sheet" role="dialog" aria-modal="true">${UI(h)}</div>`
        : '';

    m.classList.toggle(
        'open',
        !!h
    );
}

$('#modal').onclick = e => {
    if (e.target.id == 'modal')
        modal('');
};