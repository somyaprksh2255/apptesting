/* The panel for a chat the person may not open. The same wording for a missing plan, a pending/rejected request,
   a voluntary departure and a stranger; only "removed" says so, because that person was told when it happened. */
function chatDenied(p) {
    const removed = !!p && membership(p, 'me') == 'removed';
    const link = p && planVisible(p) ? ['See the plan', '#/plan/' + p.id] : ['Back to Groups', '#/groups'];

    return `<section class="gpanel">${empty(
        'No access',
        removed
            ? 'You\'re no longer part of this squad.'
            : 'Only accepted squad members can open this chat.',
        link[0],
        link[1]
    )}</section>`;
}

/* One squad conversation: header (plan context), messages, composer */
function groupChat(id) {
    const p = idOk(id) ? pl(id) : null;
    if (!p || !groupAccess(p))
        return chatDenied(p);
    const L = msgs(id).filter(
        m =>
            !m.by ||
            !S.blocked.includes(m.by)
    );
    let prev = '';
    const rows = L
        .map(
            m => {
                if (m.sys) {
                    prev = '';
                    return `<div class="sys">${esc(m.x)}</div>`;
                }
                const me = m.by == 'me';
                const first = m.by != prev;
                const where =
                    (m.type == 'location' || m.type == 'photo-location') && locUrl(m.loc)
                        ? `<a
                                class="mlink"
                                href="${locUrl(m.loc)}"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                ${I('map-pin', '14px')} Open in Maps
                            </a>`
                        : '';
                prev = m.by;
                return `
                    <div class="m ${me ? 'mo' : ''}">
                        ${
                            me
                                ? ''
                                : (
                                    first
                                        ? av(m.by, 30)
                                        : '<span class="avs"></span>'
                                )
                        }
                        <div class="mb">
                            ${
                                !me && first
                                    ? `<small class="mn">${esc(usr(m.by).name)}</small>`
                                    : ''
                            }
                            ${
                                m.type == 'photo' || m.type == 'photo-location'
                                    ? `
                                        <button
                                            class="bub"
                                            data-a="react"
                                            data-k="${id}"
                                            data-v="${msgs(id).indexOf(m)}"
                                        >
                                            <img
                                                src="${esc(m.src)}"
                                                alt="Photo shared in chat"
                                                style="display:block;max-width:min(240px,100%);height:auto;border-radius:12px"
                                            >
                                            ${
                                                m.type == 'photo-location' && m.loc
                                                    ? `
                                                        <span
                                                            style="display:block;margin-top:6px"
                                                        >
                                                            📍 Location shared
                                                        </span>
                                                    `
                                                    : ''
                                            }
                                        </button>
                                    `
                                    : m.type == 'location'
                                        ? `
                                            <button
                                                class="bub"
                                                data-a="react"
                                                data-k="${id}"
                                                data-v="${msgs(id).indexOf(m)}"
                                            >
                                                📍 Location shared
                                            </button>
                                        `
                                        : `
                                            <button
                                                class="bub"
                                                data-a="react"
                                                data-k="${id}"
                                                data-v="${msgs(id).indexOf(m)}"
                                            >
                                                ${esc(m.x)}
                                            </button>
                                        `
                            }
                            ${where}
                            <small class="mt">${m.t || ''}</small>
                            ${
                                m.r
                                    ? `<span class="rx">${m.r}</span>`
                                    : ''
                            }
                        </div>
                    </div>
                `;
            }
        )
        .join('');
    const d = (O.chat.draft || '').trim();
    return `
        <section
            class="gpanel"
            aria-label="${esc(p.title)} chat"
        >
            <header class="ghd">
                <a
                    class="iconbtn gback"
                    href="#/groups"
                    aria-label="Back to groups"
                >
                    ${I('arrow-left', '22px')}
                </a>
                ${gAvatar(p, '42px')}
                <div class="gtx">
                    <b>${esc(p.title)}</b>
                    <span class="mut">${planCtx(p)}</span>
                </div>
                <button
                    class="iconbtn"
                    data-a="gopts"
                    data-v="${id}"
                    aria-label="Group options"
                >
                    ${I('ellipsis-vertical', '22px')}
                </button>
            </header>
            ${joinRequestBar(p)}
            <div
                class="gmsgs"
                aria-live="polite"
            >
                ${rows}
                <p class="sys">
                    ${L.length ? 'Tap a message to react' : 'No messages yet. Say hi 👋'}
                </p>
            </div>
            <div class="comp">
                <button
                    class="iconbtn"
                    data-a="attachments"
                    data-v="${id}"
                    aria-label="Add attachment"
                >
                    ${I('paperclip', '18px')}
                </button>
                <input
                    type="text"
                    id="mi"
                    data-in="chat.draft"
                    value="${esc(O.chat.draft || '')}"
                    maxlength="${chatMaxLen()}"
                    placeholder="Message your squad"
                    aria-label="Message"
                >
                <button
                    id="sendbtn"
                    class="btn pink sm"
                    data-a="send"
                    data-v="${id}"
                    aria-label="Send message"
                    ${d ? '' : 'disabled'}
                >
                    ${I('send', '18px')}
                </button>
            </div>
        </section>
    `;
}
function groupOptions(id) {
    const p = pl(id);
    const host = p.creator == 'me';
    const R = (
        i,
        l,
        at
    ) =>
        `<button class="li" ${at}>
            ${I(i)}
            <b style="flex:1;text-align:left">
                ${l}
            </b>
            ${I('chevron-right')}
        </button>`;
    return `
        <h2 style="margin-top:0">
            ${esc(p.title)}
        </h2>
        ${R(
            'map-pinned',
            'View plan',
            `data-a="goPlan" data-v="${id}"`
        )}
        ${R(
            'users-round',
            'View members',
            `data-a="members" data-v="${id}"`
        )}
        ${R(
            'info',
            'Group info',
            `data-a="ginfo" data-v="${id}"`
        )}
        ${
            p.status == 'open'
                ? R(
                    'arrow-right',
                    'Next stop',
                    `data-a="nextSheet" data-v="${id}"`
                )
                : ''
        }
        ${R(
            'flag',
            'Report plan',
            `data-a="report" data-k="plan" data-v="${id}"`
        )}
        ${
            host || p.status != 'open'
                ? ''
                : R(
                    'log-out',
                    'Leave group',
                    `data-a="ask" data-do="leave" data-v="${id}"`
                )
        }
    `;
}
const planMapLink = p => p && p.locSource === 'openstreetmap-nominatim' && p.locPlace && p.locLat != null && p.locLng != null && Number.isFinite(Number(p.locLat)) && Number.isFinite(Number(p.locLng))
    ? `<p><a class="mlink" target="_blank" rel="noopener noreferrer" href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(p.locLat)}&mlon=${encodeURIComponent(p.locLng)}#map=17/${encodeURIComponent(p.locLat)}/${encodeURIComponent(p.locLng)}">${I('map-pin', '14px')} Open selected meeting place on map</a><span class="mut" style="display:block;font-size:.8rem;margin-top:4px">${esc(p.locPlace)}</span></p>`
    : '';

/* Group Info (accepted member view): the simpler, important-details-only sheet.
   No host-only controls. Opened as a modal, so closing it returns to the conversation. */
function groupInfo(id) {
    const p = pl(id);
    return `
        <h2 style="margin-top:0">
            Group info
        </h2>
        <div
            class="row"
            style="margin-bottom:12px"
        >
            ${gAvatar(p, '52px')}
            <div>
                <b>${esc(p.title)}</b>
                <br>
                <span class="mut">
                    ${planCtx(p)}
                </span>
            </div>
        </div>
        <p>
            ${esc(p.desc)}
        </p>
        ${planMapLink(p)}
        <p class="mut">
            📍 ${esc(p.loc)} (approximate)
            · Hosted by ${esc(usr(p.creator).name)}
            ${
                p.who != 'Everyone'
                    ? ' · ' + p.who
                    : ''
            }
        </p>
        <div
            class="stack"
            style="margin:8px 0"
        >
            ${p.members
                .map(m => av(m, 38))
                .join('')}
        </div>
        <p class="mut">
            ${p.members.length} / ${p.max} people
        </p>
    `;
}
/* Group Info (host view): group details only. Attendance scanning stays on the host-only Scanner button on the Groups card. */
function groupInfoHost(id) {
    const p = pl(id);
    const open = p.status == 'open';
    return `
        <h2 style="margin-top:0">
            Group info
        </h2>
        <div
            class="row"
            style="margin-bottom:12px"
        >
            ${gAvatar(p, '52px')}
            <div>
                <b>${esc(p.title)}</b>
                <br>
                <span class="mut">
                    ${planCtx(p)} · 👑 You're hosting
                </span>
            </div>
        </div>
        <p>
            ${esc(p.desc)}
        </p>
        ${planMapLink(p)}
        <p class="mut">
            📍 ${esc(p.loc)} (approximate)
            · ${esc(p.when == 'LIVE NOW' || p.live ? 'Live now' : p.when)}
            · ${esc(p.status == 'ended' ? 'Wrapped ✅' : p.status == 'cancelled' ? 'Cancelled' : 'Open')}
            ${
                p.who != 'Everyone'
                    ? ' · ' + p.who
                    : ''
            }
        </p>
        <div
            class="stack"
            style="margin:8px 0"
        >
            ${p.members
                .map(m => av(m, 38))
                .join('')}
        </div>
        <p class="mut">
            ${p.members.length} / ${p.max} people
        </p>

        <p class="mut" style="margin-top:12px;font-size:.85rem">Use the Scanner on your Groups card to check members in by scanning their personal QR.</p>
    `;
}