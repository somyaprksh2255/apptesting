const tag = (t, c) =>
    `<span
        class="tag"
        style="background:${T[t][2]};color:${['chai', 'food', 'bhandara'].includes(t) ? '#17131F' : '#fff'}"
    >
        ${T[t][0]} ${esc(c || T[t][1])}
    </span>`;

const whoB = p =>
    p.who && p.who != 'Everyone'
        ? `<span
            class="pill"
            style="background:var(--pink);color:#fff;border-color:var(--pink)"
        >
            ${p.who == 'Girls only' ? '🚺' : '🚹'} ${p.who}
        </span>`
        : '';

function cta(p) {
    const m = groupAccess(p);
    const rq = membership(p, 'me') == 'pending';

    return p.status != 'open'
        ? `<span class="btn sm off">
            ${p.status == 'ended' ? 'Wrapped ✅' : 'Cancelled'}
        </span>`
        : m
            ? `<a
                class="btn sm"
                href="#/gc/${p.id}"
            >
                Open the GC
            </a>`
            : membership(p, 'me') == 'removed'
                ? '<span class="btn sm off">Not available</span>'
                : (p.rej || []).includes('me')
                ? '<span class="btn sm off">Not this time</span>'
                : rq
                    ? '<span class="btn sm off">Requested ⏳</span>'
                    : p.members.length >= p.max
                        ? '<span class="btn sm off">Squad full 🔥</span>'
                        : `<button
                            class="btn sm pink"
                            data-a="join"
                            data-v="${p.id}"
                        >
                            ${p.live ? 'Pull up' : 'I\'m down'}
                        </button>`;
}

function card(p) {
    return `
        <article class="card">
            <a
                class="cl"
                href="#/plan/${p.id}"
                aria-label="${esc(p.title)}"
            ></a>

            <div class="row">
                ${tag(p.type, p.custom)}

                ${
                    p.live
                        ? '<span class="live"><i></i>LIVE NOW</span>'
                        : ''
                }

                ${whoB(p)}

                ${
                    p.review
                        ? '<span class="pill">👀 Under review</span>'
                        : ''
                }
            </div>

            <h3>
                ${esc(p.title)}
            </h3>

            <p class="q">
                ${esc(p.desc)}
            </p>

            <div class="meta">
                <span>
                    📍 ${esc(p.loc)}${kmTxt(p)}
                </span>

                ${
                    p.live
                        ? ''
                        : `
                            <span>
                                🕘 ${
                                    p.day && p.day != 'Today'
                                        ? esc(p.day) + ' · '
                                        : ''
                                }${p.when}
                            </span>
                        `
                }

                <span>
                    👥 ${p.members.length} / ${p.max} people
                </span>
            </div>

            <div class="row">
                ${p.vibe
                    .map(
                        v =>
                            `<span class="pill">
                                ${lbl(v)}
                            </span>`
                    )
                    .join('')}
            </div>

            <div class="row sp">
                <div class="stack">
                    ${groupAccess(p)
                        ? p.members
                            .slice(0, 5)
                            .map(m => av(m, 30))
                            .join('')
                        : avAnonStack(p.members.length, 30)}
                </div>

                ${cta(p)}
            </div>
        </article>
    `;
}