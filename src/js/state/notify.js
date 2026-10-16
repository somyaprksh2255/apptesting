/* Notifications are addressed to one person: n.to ('me' = the signed-in user, otherwise a person id).
   Record: { id, to, type, planId?, eventId?, userId?, ic, c, t, b, at, u }
     type    join_request | join-approved | message | plan | event | member | removed
               (a rejected request is deliberately never notified)
     planId  the squad/plan it is about    eventId  the event it is about
     userId  the other person involved     u        1 while unread
   The destination is never stored: notifRoute() derives it from planId / eventId, so a
   notification always opens the right place even after the plan changes. */

const notify = (to, o) => {
    /* rejected join requests are silent: nobody is ever notified that they were passed on */
    if (SILENT_NOTIF.includes(o.type))
        return;

    S.notifs.unshift({
        id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6),
        to,
        u: 1,
        at: Date.now(),
        ...o
    });
};

const myNotifs = () =>
    tier() == 'guest'
        ? []
        : (S.notifs || []).filter(n => n.to == 'me' && !SILENT_NOTIF.includes(n.type));

const notifAgo = n => {
    if (!n.at)
        return n.w || '';

    const m = Math.max(0, Math.floor((Date.now() - n.at) / 6e4));

    return m < 1
        ? 'now'
        : m < 60
            ? m + 'm'
            : m < 1440
                ? Math.floor(m / 60) + 'h'
                : Math.floor(m / 1440) + 'd';
};

const notifRoute = n => {
    const p = n.planId && pl(n.planId);
    const e = n.eventId && S.events.find(x => x.id == n.eventId);

    if (n.type == 'event' && e)
        return '#/event/' + e.id;

    if (p) {
        /* a squad chat is only ever the destination for someone who may open it (accepted member / host) */
        const inChat = groupAccess(p);

        /* plan updates and removals go to the plan page; everything else
           (join requests for hosts, approvals, messages, membership) goes to the squad chat */
        return n.type == 'plan' || n.type == 'removed' || !inChat
            ? '#/plan/' + p.id
            : '#/gc/' + p.id;
    }

    return '';
};

/* the host's "wants to join" notification is done once the request is accepted, rejected or withdrawn */
const resolveJoinNotifs = (planId, userId) => {
    S.notifs = S.notifs.filter(
        n =>
            !(
                n.type == 'join_request' &&
                n.planId == planId &&
                n.userId == userId
            )
    );
};
