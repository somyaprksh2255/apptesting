/* One person's profile sheet. Used for any "View" / "Profile" button and, in review mode, for a join request:
   pass { planId } and the host sees who is asking plus Accept / Reject right under their name. */
function profileSheet(id, req) {
    const u = usr(id);
    const r = relOf(u);
    const p = req && pl(req.planId);
    const review =
        !!p &&
        isHost(p) &&
        p.status == 'open' &&
        p.reqs.some(x => x.u == id);
    const full = review && p.members.length >= p.max;

    return `
        ${
            review
                ? `
                    <p class="mut" style="margin:0 0 10px">
                        Wants to join <b>${esc(p.title)}</b>
                    </p>
                `
                : ''
        }
        <div class="row">
            ${av(id, 64)}
            <div>
                <h2 style="margin:0">${esc(u.name)}</h2>
                <span class="mut">
                    @${esc(u.username || '')} · ${esc(u.gender || '')} · 📍 ${esc(u.city)}
                </span>
            </div>
        </div>
        ${
            review
                ? `
                    ${
                        full
                            ? '<p class="mut" style="margin:10px 0 0">This squad is full. Free up a spot to accept.</p>'
                            : ''
                    }
                    <div
                        style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 0"
                    >
                        <button
                            class="btn ghost"
                            data-a="reject"
                            data-k="${p.id}"
                            data-v="${id}"
                        >
                            Reject
                        </button>
                        <button
                            class="btn pink"
                            data-a="accept"
                            data-k="${p.id}"
                            data-v="${id}"
                            ${full ? 'disabled' : ''}
                        >
                            Accept
                        </button>
                    </div>
                `
                : ''
        }
        <p style="margin:12px 0">
            ${esc(u.bio || 'No bio yet.')}
        </p>
        <p>
            ${(u.interests || []).map(lbl).join(' · ')}
        </p>
        <div class="row">
            ${trust(u)}
        </div>
        <p class="mut" style="margin:8px 0">
            Hosted ${r.hosted} · Joined ${r.joined} · Attended ${r.attended}
        </p>
        <h3>Squad feedback</h3>
        ${fbs(u)}
        ${
            id != 'me'
                ? `
                    <div class="row" style="margin-top:12px">
                        <button
                            class="btn ghost sm"
                            data-a="report"
                            data-k="user"
                            data-v="${id}"
                        >
                            ${I('flag')} Report user
                        </button>
                        <button
                            class="btn ghost sm"
                            data-a="ask"
                            data-do="block"
                            data-v="${id}"
                        >
                            ${I('ban')} Block
                        </button>
                    </div>
                `
                : ''
        }
    `;
}
