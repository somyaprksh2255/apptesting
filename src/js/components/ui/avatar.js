const av = (
    id,
    z = 36
) => {
    const u = usr(id);
    const i = /^u\d+$/.test(id)
        ? +id.slice(1)
        : [...String(id)].reduce(
            (a, ch) => a + ch.charCodeAt(0),
            0
        );
    const c = AVC[i % 5];

    return u.photo
        ? `<img
            class="av"
            alt="${esc(u.name)}"
            src="${u.photo}"
            style="width:${z}px;height:${z}px;object-fit:cover"
        >`
        : `<span
            class="av"
            title="${esc(u.name)}"
            style="width:${z}px;height:${z}px;background:${c};color:${c == '#C6F432' ? '#17131F' : '#fff'};font-size:${z * .42}px"
        >
            ${esc((u.name || '?')[0])}
        </span>`;
};

/* Anonymous stand-in for people the viewer may not identify (guests, non-members): no name, initial, photo or title. */
const avAnon = (z = 36) =>
    `<span
        class="av anon"
        aria-hidden="true"
        style="width:${z}px;height:${z}px"
    >
        ${I('user-round', Math.round(z * .5) + 'px')}
    </span>`;

const avAnonStack = (n, z = 30, max = 5) =>
    Array(Math.max(0, Math.min(n, max)))
        .fill(0)
        .map(() => avAnon(z))
        .join('');
