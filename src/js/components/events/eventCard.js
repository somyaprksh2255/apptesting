const evCard = e => `
    <article class="card ev">
      <a class="cl" href="#/event/${e.id}" aria-label="${esc(e.title)}"></a>
      <div class="row">
        <span class="tag" style="background:var(--org);color:#fff">${e.emoji || '🎟️'} EVENT</span>
        <span class="pill">${esc(e.dateLabel || e.date || 'Date to be announced')}</span>
      </div>
      <h3>${esc(e.title)}</h3>
      <div class="meta">
        <span>🕘 ${esc(e.when || 'Time to be announced')}</span>
        <span>📍 ${esc(e.loc || 'Location to be announced')}</span>
      </div>
      <div class="tear"></div>
      <p class="mut">${esc(e.info || '')}</p>
      <a class="btn ghost sm" href="#/event/${e.id}">View event ${I('arrow-right')}</a>
    </article>`;
