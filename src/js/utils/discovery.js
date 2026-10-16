const myT = () =>
    ((S.me && S.me.interests) || [])
        .map(i => INT_T[i])
        .filter(Boolean);

const score = p =>
    (myT().includes(p.type) ? 3 : 0) +
    (p.live ? 2 : 0) +
    (d(p) == null ? 0 : Math.max(0, 3 - d(p))) +
    (!p.live &&
    mins(p.when) >= nowM() &&
    mins(p.when) - nowM() <= 120
        ? 1
        : 0);

function pings() {
    if (!S.notif || !S.me)
        return [];

    const o = [];

    const L = S.plans.filter(
        p =>
            p.status == 'open' &&
            p.creator != 'me' &&
            !p.members.includes('me') &&
            !S.blocked.includes(p.creator) &&
            d(p) != null &&
            d(p) <= 6
    );

    [...new Set(myT())].forEach(ty => {
        const m = L.filter(p => p.type == ty);

        if (!m.length)
            return;

        const n = m.reduce(
            (a, p) => a + p.members.length,
            0
        );

        o.push({
            id: m[0].id,
            x:
                m.length > 1 || n >= 3
                    ? `${n} people near you are looking for a ${T[ty][1]} squad.`
                    : ty == 'garba'
                        ? 'Someone\'s heading to Garba tonight 👀'
                        : `A new ${T[ty][1]} plan is happening near you.`
        });
    });

    return o.slice(0, 3);
}