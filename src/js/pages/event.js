/* Events are organized occasions. Attendance is never tracked at Event level; check-in belongs to Plans/Groups. */
function eventPage(id) {
  if (!idOk(id)) return fallbackPage('invalid');
  const e = S.events.find(x => x.id == id && (x.status === 'published' || canManageEvents()));
  if (!e || e.status === 'cancelled') return fallbackPage('event');
  const admin = canManageEvents();
  const plans = S.plans.filter(p => p.event === id && p.status === 'open' && !S.blocked.includes(p.creator));
  const dateRange = (e.endDateISO && e.endDateISO !== e.dateISO) ? `${e.dateLabel || e.date} – ${e.endDate || e.endDateISO}` : (e.dateLabel || e.date);
  const when = [dateRange, e.when].filter(Boolean).join(' · ');
  const place = e.visibility === 'area' && !admin ? e.loc : [e.venue, e.loc].filter(Boolean).join(' · ');
  return `
    <main class="wrap">
      <a class="back" href="#" data-a="goBack">← Back to Discover</a>
      <div class="dt">
        <div>
          <article class="card ev big">
            <div class="row">
              <span class="tag" style="background:var(--org);color:#fff">${I('ticket')} EVENT</span>
              <span class="pill">${esc(e.status === 'draft' ? 'Draft' : e.dateLabel || e.date || 'Date to be announced')}</span>
            </div>
            <h1 style="margin-top:12px">${esc(e.title)}</h1>
            <div class="meta" style="font-size:1rem">
              <span>🕘 ${esc(when || 'Time to be announced')}</span>
              <span>📍 ${esc(place || 'Location to be announced')}</span>
              ${e.ageGroup ? `<span>👥 ${esc(e.ageGroup)}</span>` : ''}
            </div>
            ${e.capacity ? `<p class="mut">Event capacity: ${esc(String(e.capacity))}</p>` : ''}
            <div class="tear"></div>
            <p>${esc(e.info || '')}</p>
            <p class="mut">Organized by ${esc(e.host || 'Squado organizers')}.</p>
            ${e.status === 'cancelled' ? `<p class="tag">Cancelled</p>` : ''}
            ${admin ? `<div class="row" style="margin-top:16px;flex-wrap:wrap">
              <button class="btn ghost" data-a="eventEdit" data-v="${e.id}">${I('pencil')} Edit Event</button>
              ${e.status === 'published' ? `<button class="btn ghost" data-a="eventCancel" data-v="${e.id}">Cancel Event</button>` : ''}
            </div>` : ''}
          </article>
          <div class="row sp" style="margin-top:24px;align-items:center">
            <div><h2 style="margin:0">Plans &amp; Groups for this Event</h2><p class="mut">Join an existing meetup or create a smaller plan around this occasion.</p></div>
          </div>
          <div class="event-plan-cta">
            <button class="btn primary wide" data-a="evPlan" data-v="${esc(e.id)}">${I('plus')} Create a plan for this Event</button>
          </div>
          ${plans.length ? `<div class="grid">${plans.map(card).join('')}</div>` : `<div class="empty"><h3>No Plans yet</h3><p class="mut">Be the first to create a smaller meetup around this Event.</p></div>`}
        </div>
      </div>
    </main>`;
}
