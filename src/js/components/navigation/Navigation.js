/* One responsive <nav>: fixed bottom bar < 900px, sidebar >= 900px (see styles/nav.css) */

function navh(r) {
    r = NAVMAP[r] || r;

    return `
        <nav
            class="nav"
            aria-label="Main"
        >
            <div class="brand">
                <img
                    src="assets/logo.svg"
                    alt=""
                    width="30"
                    height="30"
                >
                Squado
            </div>

            ${NAV
                .map(
                    n =>
                        `
                            <a
                                href="#/${n.h}"
                                class="${n.h == 'create' ? 'mk' : ''}"
                                ${r == n.h ? ' aria-current="page"' : ''}
                            >
                                <b>
                                    ${I(n.i, '24px')}

                                    ${
                                        n.h == 'groups' && unreadTotal()
                                            ? `<i
                                                class="nbadge"
                                                aria-label="${unreadTotal()} unread messages"
                                            >
                                                ${unreadTotal()}
                                            </i>`
                                            : ''
                                    }
                                </b>

                                <span>
                                    ${n.l}
                                </span>
                            </a>
                        `
                )
                .join('')}
        </nav>
    `;
}