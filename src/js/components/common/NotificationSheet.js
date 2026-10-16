/* The notification overlay: the signed-in person's notifications, newest first.
   Each row opens the place it is about (see notifRoute in state/notify.js). */
function notifSheet() {
    /* each preview is checked against what this person may see right now (state/access.js notifView) */
    const L = myNotifs().slice(0, 50).map(n => ({ ...n, ...notifView(n) }));

    return `
        <h2 style="margin-top:0">
            Notifications
        </h2>
        ${
            L.length
                ? L
                    .map(
                        n =>
                            `
                                <button
                                    class="li"
                                    data-a="notifGo"
                                    data-v="${esc(n.id)}"
                                >
                                    <span
                                        class="nic"
                                        style="background:var(--ic-${esc(n.c || 'pink')})"
                                    >
                                        ${I(n.ic || 'bell', '18px')}
                                    </span>
                                    <div
                                        style="flex:1;min-width:0;text-align:left"
                                    >
                                        <b>
                                            ${esc(n.t)}
                                        </b>
                                        ${
                                            n.u
                                                ? ' <i class="dotb inl"></i>'
                                                : ''
                                        }
                                        <br>
                                        <span
                                            class="mut"
                                            style="font-size:.85rem"
                                        >
                                            ${esc(n.b || '')} · ${notifAgo(n)}
                                        </span>
                                        ${
                                            n.type == 'join_request'
                                                ? `
                                                    <br>
                                                    <span
                                                        class="btn pink sm"
                                                        style="margin-top:8px"
                                                    >
                                                        Review request
                                                    </span>
                                                `
                                                : ''
                                        }
                                    </div>
                                </button>
                            `
                    )
                    .join('')
                : '<p class="mut">You\'re all caught up 🎉</p>'
        }
        <button
            class="btn ghost"
            style="width:100%;margin-top:14px"
            data-a="close"
        >
            Close
        </button>
    `;
}
