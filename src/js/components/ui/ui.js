const empty = (
    t,
    s,
    c,
    h
) =>
    `<div class="empty">
        <h3>${t}</h3>
        <p class="mut">${s}</p>
        <a class="btn" href="${h}">${c}</a>
    </div>`;

const loader = m =>
    `<p class="mut">
        <b>${m}</b>
    </p>
    <div class="sk"></div>
    <div class="sk"></div>`;

const chips = (
    arr,
    k,
    cur,
    multi
) =>
    `<div class="chips">
        ${arr
            .map(
                a =>
                    `<button
                        class="chip"
                        aria-pressed="${multi ? cur.includes(a) : cur == a}"
                        data-a="${multi ? 'tog' : 'set'}"
                        data-k="${k}"
                        data-v="${esc(a)}"
                    >
                        ${lbl(a)}
                    </button>`
            )
            .join('')}
    </div>`;