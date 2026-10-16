const trust = u => {
    const r = relOf(u);

    const t = r.joined + r.hosted;

    return r.completed >= 3 &&
        r.cancel <= Math.max(1, t * .1)
        ? '<span class="pill" style="background:var(--lime);color:#17131F">✅ Reliable</span>'
        : '<span class="pill">🌱 New here</span>';
};

/* individual reputation: plain average of star ratings people gave this person, with the real count.
   Never a zero for unrated people, never a penalty; meetup ratings are not part of it. */
const fbs = u => {
    const f = fbAgg(u);

    if (!f.n)
        return '<p class="mut">Not rated yet 🌱 That\'s normal, and says nothing about anyone.</p>';

    if (f.n < FB_MIN_SHOWN)
        return `<p class="mut">Not enough ratings to show yet (${FB_MIN_SHOWN}+ keeps reviews anonymous) 🌱</p>`;

    const t = Object.entries(f.tags)
        .sort(
            (a, b) => b[1] - a[1]
        )
        .slice(0, 3);

    return `
        <p style="margin:0 0 6px">
            <b aria-label="${f.avg} out of 5 stars from ${f.n} ratings">${f.avg} ★ · ${f.n} ratings</b>
        </p>

        ${t.length
            ? `<div class="row">
                ${t
                    .map(
                        x =>
                            `<span class="pill">
                                ${I(FI[x[0]] || 'sparkles')} ${esc(x[0])} · ${x[1]}
                            </span>`
                    )
                    .join('')}
            </div>`
            : ''}

        <p class="mut">Anonymous reviews from people they met on plans</p>
    `;
};
