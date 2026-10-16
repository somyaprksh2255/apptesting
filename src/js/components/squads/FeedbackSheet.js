/* Meetup feedback (stars + tags + optional comment) and, after it, optional anonymous reviews of individual squadmates:
   step 1 pick only the people you want to review (never everyone), step 2 rate just those (stars required, tags and comment optional) */

const FB_ERR = {
    rating: 'Pick a star rating first.',
    save: 'We couldn\'t save your feedback. Your answers are kept, so you can try again.',
    ineligible: 'Feedback isn\'t open for this plan.',
    duplicate: 'You already sent feedback for this plan.'
};

/* opens the meetup feedback form if this person may still leave it; returns whether it opened */
function fbStart(id) {
    const p = pl(id);

    if (!fbEligible(p)) {
        toast('Feedback isn\'t open for this plan.');
        return false;
    }

    if (fbFind(p, 'meetup')) {
        toast('You already sent feedback for this plan.');
        return false;
    }

    O.fm = {
        id: p.id,
        rating: 0,
        tags: [],
        comment: '',
        busy: false,
        error: '',
        done: false
    };
    fbMeetupSheet(p.id);

    return true;
}

/* "How was it?" cards for plans the person can still give feedback on (home) */
function fbPrompts() {
    return fbPending()
        .slice(0, 2)
        .map(
            p => `<div class="card" style="margin:14px 0">
                <b>How was ${esc(p.title)}?</b>
                <p class="mut" style="margin:4px 0 10px">Quick and anonymous. It helps squads stay safe and fun.</p>
                <div class="row">
                    <button class="btn pink sm" data-a="fbOpen" data-v="${p.id}">Give feedback</button>
                    <button class="btn ghost sm" data-a="fbLater" data-v="${p.id}">Later</button>
                </div>
            </div>`
        )
        .join('');
}

/* the feedback area of an ended plan's page: what to do next, or the anonymous totals */
function fbPanel(p) {
    if (p.status != 'ended') {
        const why = fbLockReason(p);

        return why && p.status == 'open'
            ? `<p class="mut" style="margin:10px 0 0">🔒 ${esc(why)}</p>`
            : '';
    }

    let h = '';

    if (!fbEligible(p) && fbLockReason(p))
        h += `<p class="mut" style="margin:10px 0 0">🔒 ${esc(fbLockReason(p))}</p>`;

    if (fbEligible(p)) {
        const my = fbMine(p);

        if (!my.meetup)
            h += `<button class="btn wide" style="margin-top:8px" data-a="fbOpen" data-v="${p.id}">How was it?</button>`;
        else {
            h += `<p class="mut" style="margin:10px 0 0">Feedback sent ✅ Your rating: ${my.meetup.rating} ★. Thank you!</p>`;

            if (my.total)
                h += my.people
                    ? `<p class="mut" style="margin:4px 0 0">Member reviews: ${my.people} of ${my.total} sent (optional).</p>`
                    : '<p class="mut" style="margin:4px 0 0">Member reviews are optional. You skipped them for now.</p>';

            if (fbUnreviewed(p).length)
                h += `<button class="btn ghost wide" style="margin-top:8px" data-a="fbPeople" data-v="${p.id}">${my.people ? 'Review more members (optional)' : 'Rate members (optional)'}</button>`;
        }
    }

    const t = (fbEligible(p) || isHost(p)) && fbSummary(p);

    if (t)
        h += `<div class="card" style="margin-top:12px">
            <b>Squad feedback</b>
            <p class="mut" style="margin:4px 0 8px">${t.avg} / 5 from ${t.n} anonymous responses</p>
            <div class="row">${t.tags.map(x => `<span class="pill">${I(FI[x[0]] || 'sparkles')} ${esc(x[0])} · ${x[1]}</span>`).join('')}</div>
        </div>`;

    return h;
}

function fbMeetupSheet(id) {
    const p = pl(id);
    const f = O.fm;

    if (f.done) {
        modal(
            `<div class="authst">
                <span class="okc">${I('check', '26px')}</span>
                <h2>Thanks, feedback sent</h2>
                <p class="mut">It's anonymous. Nobody sees your answers, only totals once 3+ people have answered.</p>
            </div>
            ${
                fbUnreviewed(p).length
                    ? `<h3 style="margin:14px 0 4px">Anyone you'd like to review?</h3>
                        <p class="mut" style="margin:0 0 10px">Share a quick rating for people you interacted with. You don't need to rate everyone.</p>
                        <button class="btn pink wide" data-a="fbPeople" data-v="${id}">Rate members</button>
                        <p style="text-align:center">
                            <button class="btn ghost sm" data-a="close">Skip for now</button>
                        </p>`
                    : `<p style="text-align:center">
                            <button class="btn ghost sm" data-a="close">Done</button>
                        </p>`
            }`
        );
    }
    else {
        modal(
            `<h2 style="margin-top:0">How was ${esc(p.title)}?</h2>
            <p class="mut">Anonymous. Only totals are ever shown, and only once 3+ people have answered.</p>

            <p style="margin:14px 0 6px"><b>Overall experience</b></p>
            <div class="stars" role="radiogroup" aria-label="Overall experience">
                ${[1, 2, 3, 4, 5]
                    .map(
                        n => `<button
                            class="star"
                            role="radio"
                            aria-checked="${f.rating == n}"
                            aria-pressed="${f.rating >= n}"
                            aria-label="${n} star${n > 1 ? 's' : ''}"
                            data-a="fbStar"
                            data-v="${n}"
                            ${f.busy ? 'disabled' : ''}
                        >${I('star', '30px')}</button>`
                    )
                    .join('')}
            </div>

            <p style="margin:14px 0 6px"><b>What stood out?</b> <span class="mut">(pick any)</span></p>
            <div class="chips">
                ${MF
                    .map(
                        t => `<button
                            class="chip"
                            style="padding:6px 12px"
                            aria-pressed="${f.tags.includes(t)}"
                            data-a="fbTag"
                            data-v="${t}"
                            ${f.busy ? 'disabled' : ''}
                        >${I(FI[t])} ${t}</button>`
                    )
                    .join('')}
            </div>

            <p style="margin:14px 0 6px"><b>Anything else?</b> <span class="mut">(optional)</span></p>
            <textarea
                rows="3"
                maxlength="${FB_COMMENT_MAX}"
                data-in="fm.comment"
                aria-label="Written feedback (optional)"
                placeholder="What went well, what could be better?"
                ${f.busy ? 'disabled' : ''}
            >${esc(f.comment)}</textarea>
            <p class="mut" style="margin:4px 0 0;font-size:.8rem">Only you can see this comment. Please keep it kind and about the plan, not a person.</p>

            ${f.error ? `<p role="alert" style="color:var(--ic-red);margin:10px 0 0"><b>${esc(f.error)}</b></p>` : ''}

            <button
                class="btn pink wide ${f.busy ? 'loading' : ''}"
                style="margin-top:14px"
                data-a="fbSubmit"
                ${f.busy ? 'disabled' : ''}
            >${f.busy ? 'Sending…' : f.error && f.error.startsWith('We couldn') ? 'Try again' : 'Send feedback'}</button>

            <p style="text-align:center">
                <button class="btn ghost sm" data-a="fbLater" data-v="${id}" ${f.busy ? 'disabled' : ''}>Later</button>
            </p>`
        );
    }

    /* remember which sheet this is, so a late answer doesn't reopen a sheet the person closed */
    f.tok = O.tok;
}

const FB_PERR = {
    rating: 'Give each person you picked a star rating, or un-pick them.',
    save: 'We couldn\'t save your reviews. Your answers are kept, so you can try again.',
    ineligible: 'Reviews aren\'t open for this plan.',
    duplicate: 'You already reviewed these people.',
    empty: 'Pick at least one person first.'
};

/* entry: step 1 (choose people) */
function fbSheet(id) {
    const p = pl(id);

    if (!O.fb || O.fb.id != id)
        O.fb = { id, step: 'pick', sel: [], d: {}, busy: false, error: '' };

    O.fb.step == 'rate' && O.fb.sel.length
        ? fbRateSheet(p)
        : fbPickSheet(p);
}

function fbPickSheet(p) {
    const id = p.id;
    const o = fbUnreviewed(p);
    const F = O.fb;

    /* keep only people who can still be reviewed */
    F.sel = F.sel.filter(m => o.includes(m));
    F.step = 'pick';

    modal(
        `<h2 style="margin-top:0">Anyone you'd like to review?</h2>
        <p class="mut">
            Share a quick rating for people you interacted with. You don't need to rate everyone.
            Anonymous: nobody sees who said what, only totals once enough people have answered.
        </p>
        ${
            o.length
                ? `<div class="opt" role="group" aria-label="People you could review">
                    ${o.map(m => `
                        <button
                            class="chip"
                            style="display:flex;align-items:center;gap:10px;min-height:48px"
                            aria-pressed="${F.sel.includes(m)}"
                            data-a="fbPick"
                            data-k="${id}"
                            data-v="${m}"
                        >${av(m, 32)} <span>${esc(usr(m).name)}</span></button>`).join('')}
                </div>
                ${F.error ? `<p role="alert" style="color:var(--ic-red);margin:10px 0 0"><b>${esc(F.error)}</b></p>` : ''}
                <button
                    class="btn pink wide ${F.sel.length ? '' : 'off'}"
                    style="margin-top:14px"
                    data-a="fbCont"
                    data-v="${id}"
                    ${F.sel.length ? '' : 'disabled'}
                >${F.sel.length ? `Continue with ${F.sel.length}` : 'Pick who to rate'}</button>`
                : '<p class="mut">There\'s nobody left to review from this plan.</p>'
        }
        <p style="text-align:center">
            <button class="btn ghost sm" data-a="close">${o.length ? 'Skip for now' : 'Close'}</button>
        </p>`
    );

    F.tok = O.tok;
}

/* step 2: only the people picked; everything typed is kept while moving back and forth or after a failed save */
function fbRateSheet(p) {
    const id = p.id;
    const F = O.fb;

    F.step = 'rate';

    modal(
        `<h2 style="margin-top:0">Rate who you picked</h2>
        <p class="mut">A star rating is needed for each person. Tags and a note are optional.</p>
        ${F.sel.map(m => {
            const x = F.d[m] = F.d[m] || { r: 0, t: [], c: '' };
            const nm = esc(usr(m).name);

            return `<div class="card" style="margin:0 0 12px">
                <div class="row">${av(m, 32)} <b>${nm}</b></div>
                <div class="stars" role="radiogroup" aria-label="Rating for ${nm}">
                    ${[1, 2, 3, 4, 5].map(n => `<button
                        class="star"
                        role="radio"
                        aria-checked="${x.r == n}"
                        aria-pressed="${x.r >= n}"
                        aria-label="${n} star${n > 1 ? 's' : ''} for ${nm}"
                        data-a="fbPStar"
                        data-k="${id}|${m}"
                        data-v="${n}"
                        ${F.busy ? 'disabled' : ''}
                    >${I('star', '28px')}</button>`).join('')}
                </div>
                <div class="chips" style="margin:6px 0">
                    ${FT.map(t => `<button
                        class="chip"
                        style="padding:4px 10px;font-size:.8rem"
                        aria-pressed="${x.t.includes(t)}"
                        data-a="fbTog"
                        data-k="${id}|${m}"
                        data-v="${t}"
                        ${F.busy ? 'disabled' : ''}
                    >${I(FI[t] || 'sparkles')} ${t}</button>`).join('')}
                </div>
                <textarea
                    rows="2"
                    maxlength="${FB_PCOMMENT_MAX}"
                    data-in="fb.d.${m}.c"
                    aria-label="Optional note about ${nm}"
                    placeholder="Optional note. Kind and specific, please."
                    ${F.busy ? 'disabled' : ''}
                >${esc(x.c)}</textarea>
            </div>`;
        }).join('')}
        <p class="mut" style="margin:0 0 8px;font-size:.8rem">Notes are only stored, never shown to anyone. Something worrying? Use Report instead of a rating.</p>
        ${F.error ? `<p role="alert" style="color:var(--ic-red);margin:10px 0 0"><b>${esc(F.error)}</b></p>` : ''}
        <button
            class="btn pink wide ${F.busy ? 'loading' : ''}"
            data-a="fbSend"
            data-v="${id}"
            ${F.busy ? 'disabled' : ''}
        >${F.busy ? 'Sending…' : F.error && F.error.startsWith('We couldn') ? 'Try again' : 'Send reviews'}</button>
        <p style="text-align:center">
            <button class="btn ghost sm" data-a="fbBack" data-v="${id}" ${F.busy ? 'disabled' : ''}>Back</button>
            <button class="btn ghost sm" data-a="close" ${F.busy ? 'disabled' : ''}>Skip for now</button>
        </p>`
    );

    F.tok = O.tok;
}
