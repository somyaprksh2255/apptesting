/* "Garba -> Chai -> Food -> Pandal hop": follows plan.from links so a squad's night reads as one route. */

function nightRoute(p) {
    const back = [];
    const fwd = [];

    let c = p;
    let g = 0;

    while (c && c.from && g++ < 6) {
        c = pl(c.from);

        if (c)
            back.unshift(c);
    }

    c = p;
    g = 0;

    while (g++ < 6) {
        const n = S.plans.find(
            x => x.from == c.id
        );

        if (!n)
            break;

        fwd.push(n);
        c = n;
    }

    const ch = [
        ...back,
        p,
        ...fwd
    ];

    if (ch.length < 2)
        return '';

    return `
        <div class="route">
            <b>Tonight's route</b>

            <div class="rt">
                ${ch
                    .map(
                        (x, i) =>
                            `
                                ${
                                    i
                                        ? `<span class="ra">
                                            ${I('arrow-right', '16px')}
                                        </span>`
                                        : ''
                                }

                                <a
                                    class="rs ${x.id == p.id ? 'now' : ''}"
                                    href="#/plan/${x.id}"
                                    ${x.id == p.id ? ' aria-current="step"' : ''}
                                >
                                    <span class="ri">
                                        ${T[x.type][0]}
                                    </span>

                                    <span>
                                        ${esc(T[x.type][1])}
                                    </span>
                                </a>
                            `
                    )
                    .join('')}
            </div>
        </div>
    `;
}