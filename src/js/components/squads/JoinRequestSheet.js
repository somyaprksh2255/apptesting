/* Host review of one pending join request: the requester's profile with Accept / Reject.
   Reuses the shared profile sheet instead of a separate look-alike. */
function joinRequestSheet(planId, userId) {
    return profileSheet(userId, { planId });
}

function reviewRequest(e) {
    const p = pl(e.dataset.k);
    const userId = e.dataset.v;

    if (!p || !pendingReqs(p).some(r => r.u == userId))
        return toast('This join request is no longer available.');

    modal(joinRequestSheet(p.id, userId));
}

/* The strip at the top of the squad chat: only the host sees it, and only while requests are pending.
   Requesters are pending, not members, so they never appear in the member list. */
function joinRequestBar(p) {
    const L = pendingReqs(p);

    if (!L.length)
        return '';

    return `
        <div
            class="jrq"
            role="region"
            aria-label="Join requests"
        >
            ${L
                .map(
                    r => `
                        <div class="jrr">
                            ${av(r.u, 34)}
                            <span class="jrt">
                                <b>${esc(usr(r.u).name)}</b>
                                wants to join the squad
                            </span>
                            <button
                                class="btn pink sm"
                                data-a="reviewRequest"
                                data-k="${p.id}"
                                data-v="${r.u}"
                            >
                                Review request
                            </button>
                        </div>
                    `
                )
                .join('')}
        </div>
    `;
}
