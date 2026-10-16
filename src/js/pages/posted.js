function posted(id) {
    const p = pl(id);

    return `
        <main style="max-width:560px;text-align:center">
            <span class="sticker">
                ${p.live ? '🔴 LIVE NOW' : '🔥'}
            </span>

            <h1>Plan's live 🔥</h1>

            <p class="mut">
                Now let's get the squad together.
            </p>

            <div style="text-align:left">
                ${card(p)}
            </div>

            <p style="margin-top:20px">
                <a class="btn pink" href="#/gc/${id}">
                    Open the GC
                </a>
            </p>
        </main>
    `;
}