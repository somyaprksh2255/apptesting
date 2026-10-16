/* Groups list: every squad the user joined or created, with last message, time and unread state */

const planWhen = p =>
    p.live
        ? 'Live now'
        : (p.day && p.day != 'Today' ? p.day : 'Tonight') +
          ' · ' +
          p.when;

const planCtx = p =>
    `${esc(p.custom || T[p.type][1])} · ${planWhen(p)} · ${p.members.length} members`;

const gAvatar = (
    p,
    s = '48px'
) =>
    `<span
        class="gav"
        style="width:${s};height:${s};background:${T[p.type][2]};color:${['chai', 'food', 'bhandara'].includes(p.type) ? '#17131F' : '#fff'}"
    >
        ${T[p.type][0]}
    </span>`;

/* last-message preview text: media messages carry no .x, so name them instead of printing "undefined" */
const msgPreview = m =>
    m.type == 'photo-location'
        ? 'Shared a photo with a location'
        : m.type == 'photo'
            ? 'Shared a photo'
            : m.type == 'location'
                ? 'Shared a location'
                : esc(m.x || '');

function groupItem(p, active) {
    const L = msgs(p.id).filter(
        m =>
            !m.sys &&
            (!m.by || !S.blocked.includes(m.by))
    );

    const l = L[L.length - 1];
    const u = unreadFor(p.id);

    return `
        <a
            class="gi ${active ? 'on' : ''} ${u ? 'unread' : ''}"
            href="#/gc/${p.id}"
            ${active ? ' aria-current="true"' : ''}
        >
            ${gAvatar(p)}

            <div class="gm">
                <div class="gr">
                    <b>${esc(p.title)}</b>
                    <span class="gtm">
                        ${l ? l.t || '' : ''}
                    </span>
                </div>

                <div class="gctx">
                    ${planCtx(p)}
                </div>

                <div class="gr">
                    <span class="gprev">
                        ${
                            l
                                ? (l.by == 'me'
                                    ? 'You'
                                    : esc(usr(l.by).name)) +
                                  ': ' +
                                  msgPreview(l)
                                : 'No messages yet'
                        }
                    </span>

                    ${
                        u
                            ? `<i
                                class="ub"
                                aria-label="${u} unread"
                            >
                                ${u}
                            </i>`
                            : ''
                    }
                </div>
            </div>
        </a>
    `;
}

/* a hosted ("Created by you") card: the group details are the MAIN stack and the host-only Scanner + Completion
   controls are the SECONDARY stack, both INSIDE one .ghcard container (not a detached second card).
   Rendering is gated on isHost(p); execution is re-checked at trigger time by RULES.hostScan / RULES.end + compHost. */
function hostGroupCard(p, active) {
    return `
        <div class="ghcard hosted ${active ? 'on' : ''}">
            ${groupItem(p, active)}

            <div
                class="ghsecondary"
                role="group"
                aria-label="Host controls for ${esc(p.title)}"
            >
                <button
                    type="button"
                    class="ghbtn ghbtn-scanner"
                    data-a="hostScan"
                    data-v="${p.id}"
                    aria-label="Open the QR attendance scanner for ${esc(p.title)}"
                >
                    ${I('scan-line', '1.6em')}
                    <span>Scanner</span>
                    <span class="ghsub">Host only</span>
                </button>

                <button
                    type="button"
                    class="ghbtn ghbtn-completion"
                    data-a="ask"
                    data-do="end"
                    data-v="${p.id}"
                    aria-label="Complete the plan ${esc(p.title)}"
                >
                    ${I('check-circle', '1.6em')}
                    <span>Completion</span>
                    <span class="ghsub">Host only</span>
                </button>
            </div>
        </div>
    `;
}

function groupList(act) {
    const sort = list =>
        list.sort(
            (a, b) =>
                ((S.unread || {})[b.id] || 0) -
                    ((S.unread || {})[a.id] || 0) ||
                b.live - a.live ||
                mins(a.when) - mins(b.when)
        );

    /* four mutually-exclusive sections: an open plan is EITHER hosted-by-me OR joined-by-me OR pending;
       ended plans the user was in are history. A plan never appears in two sections. */
    const created = sort(
        S.plans.filter(p => p.status == 'open' && isHost(p))
    );

    const joined = sort(
        S.plans.filter(p => p.status == 'open' && !isHost(p) && groupAccess(p))
    );

    const waiting = S.plans.filter(
        p => membership(p, 'me') == 'pending'
    );

    const past = sort(
        S.plans.filter(
            p =>
                p.status == 'ended' &&
                (p.members.includes('me') || (p.roster || []).includes('me') || p.creator == 'me')
        )
    );

    const hasAny = created.length || joined.length || waiting.length || past.length;

    return `
        <section
            class="glist"
            aria-label="Your groups"
        >
            <h1>Groups</h1>

            <p class="mut">
                Your squads, all in one place.
            </p>

            ${
                created.length
                    ? `
                        <h2>Created by you</h2>

                        <div class="gis">
                            ${created
                                .map(p => hostGroupCard(p, p.id == act))
                                .join('')}
                        </div>
                    `
                    : ''
            }

            ${
                joined.length
                    ? `
                        <h2>Joined by you</h2>

                        <div class="gis">
                            ${joined
                                .map(p => groupItem(p, p.id == act))
                                .join('')}
                        </div>
                    `
                    : ''
            }

            ${
                waiting.length
                    ? `
                        <h2>Waiting on the host</h2>

                        ${waiting
                            .map(
                                p =>
                                    `
                                        <a
                                            class="li"
                                            href="#/plan/${p.id}"
                                        >
                                            ${T[p.type][0]}

                                            <b style="flex:1">
                                                ${esc(p.title)}
                                            </b>

                                            <span class="mut">
                                                Requested
                                            </span>
                                        </a>
                                    `
                            )
                            .join('')}
                    `
                    : ''
            }

            ${
                past.length
                    ? `
                        <h2>Past squads</h2>

                        <div class="gis">
                            ${past
                                .map(p => groupItem(p, p.id == act))
                                .join('')}
                        </div>
                    `
                    : ''
            }

            ${
                hasAny
                    ? ''
                    : empty(
                        'No squads yet',
                        'Join a plan and your squad conversations will appear here.',
                        'Discover plans',
                        '#/explore'
                    )
            }
        </section>
    `;
}