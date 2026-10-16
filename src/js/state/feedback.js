/* Feedback & reviews. Two kinds of record live in S.feedback (persisted, per device, like all app data):
     meetup  { id, kind:'meetup', planId, by, rating 1-5, tags[], comment, at }   one per person per plan
     person  { id, kind:'person', planId, by, to, rating 1-5, tags[], comment, at }   one per reviewer, plan and reviewed person
             (records written by the previous version have no rating/comment but an `again` answer; they are kept, and
              contribute tags only, never to the star average)
   Eligibility: the plan is confirmed completed (status 'ended': organizer confirmed + attendee confirmations, never cancelled plans)
     AND the person has verified attendance (QR check-in or organizer-marked present, not disputed, see state/attendance.js).
     Joining, being accepted or being listed as a member is not attendance. Checked again inside every save function below.
   Reviews are anonymous: the reviewer is stored so duplicates / self-reviews can be refused, but is never shown to anyone.
   Comments are never shown to other people; others only see totals once 3+ responses exist.
   This is browser-local data: it is not server-enforced authorization. */

const FB_COMMENT_MAX = 500;
const FB_PCOMMENT_MAX = 300;
/* an average is only shown once this many people rated someone: reviews are anonymous, so 1-2 ratings would identify the reviewer */
const FB_MIN_SHOWN = 3;

/* only people with VERIFIED attendance (state/attendance.js): a valid QR check-in, or marked present by the organizer, and not disputed */
const fbRoster = p =>
    p ? p.members.filter(m => attPresent(p, m)) : [];

const fbEligible = (p, who = 'me') =>
    !!p &&
    !S.me.guest &&
    p.status == 'ended' &&
    fbRoster(p).length > 1 &&
    fbRoster(p).includes(who);

const fbFind = (p, kind, to) =>
    S.feedback.find(
        f =>
            f.planId == p.id &&
            f.by == 'me' &&
            f.kind == kind &&
            (kind == 'meetup' || f.to == to)
    );

/* the people the signed-in person may review: other eligible participants, never themselves */
const fbTargets = p => fbRoster(p).filter(m => m != 'me');

const fbUnreviewed = p => fbTargets(p).filter(m => !fbFind(p, 'person', m));

const fbLaterOn = p => (S.fbLater[p.id] || 0) > Date.now();

const fbPending = () =>
    S.me.guest
        ? []
        : S.plans.filter(
            p =>
                fbEligible(p) &&
                !fbFind(p, 'meetup') &&
                !fbLaterOn(p)
        );

const fbId = () => 'f' + Date.now() + Math.random().toString(36).slice(2, 6);

/* returns 'ok' | 'ineligible' | 'duplicate' | 'rating' | 'save' */
async function fbSaveMeetup(p, d) {
    if (!fbEligible(p))
        return 'ineligible';

    if (fbFind(p, 'meetup'))
        return 'duplicate';

    const rating = Math.round(+d.rating);

    if (!(rating >= 1 && rating <= 5))
        return 'rating';

    const rec = {
        id: fbId(),
        kind: 'meetup',
        planId: p.id,
        by: 'me',
        rating,
        tags: [...new Set((d.tags || []).filter(t => MF.includes(t)))],
        comment: String(d.comment || '').trim().slice(0, FB_COMMENT_MAX),
        at: Date.now()
    };

    try { await submitSharedFeedback(p, 'meetup', { rating, tags: rec.tags, comment: rec.comment }); }
    catch (e) { return e && e.code === 'duplicate' ? 'duplicate' : e && e.code === 'ineligible' ? 'ineligible' : 'save'; }

    S.feedback.push(rec);

    if (!save()) {
        S.feedback = S.feedback.filter(f => f !== rec);
        return 'save';
    }

    return 'ok';
}

/* d = { personId: { r: 1-5, t:[tags], c:'comment' } } holds only the people the reviewer chose.
   Returns 'ok' | 'ineligible' | 'empty' | 'rating' | 'duplicate' | 'save'.
   All-or-nothing: if any chosen person has an invalid rating nothing is stored. */
async function fbSavePeople(p, d) {
    if (!fbEligible(p))
        return 'ineligible';

    const ok = fbTargets(p);
    const recs = [];
    let dup = 0;
    let bad = 0;
    let chosen = 0;

    Object.entries(d || {}).forEach(([m, x]) => {
        /* self-reviews and non-participants are never accepted */
        if (m == 'me' || !ok.includes(m) || !x)
            return;

        chosen++;

        if (fbFind(p, 'person', m)) {
            dup++;
            return;
        }

        const rating = Math.round(+x.r);

        if (!(rating >= 1 && rating <= 5)) {
            bad++;
            return;
        }

        recs.push({
            id: fbId(),
            kind: 'person',
            planId: p.id,
            by: 'me',
            to: m,
            rating,
            tags: [...new Set((x.t || []).filter(t => FT.includes(t)))],
            comment: String(x.c || '').trim().slice(0, FB_PCOMMENT_MAX),
            at: Date.now()
        });
    });

    if (bad)
        return 'rating';

    if (!recs.length)
        return dup ? 'duplicate' : 'empty';

    for (const rec of recs) {
        const target = (S.users || []).find(u => u.id === rec.to || u.sub === rec.to);
        try { await submitSharedFeedback(p, 'person', { rating: rec.rating, tags: rec.tags, comment: rec.comment }, target && (target.id || target.sub)); }
        catch (e) { return e && e.code === 'duplicate' ? 'duplicate' : e && e.code === 'ineligible' ? 'ineligible' : 'save'; }
    }

    S.feedback.push(...recs);

    if (!save()) {
        S.feedback = S.feedback.filter(f => !recs.includes(f));
        return 'save';
    }

    return 'ok';
}

/* a person's reputation, computed only from stored reviews (no sample or starting totals):
     n    = number of star ratings someone gave them      avg = their plain mean (one decimal), null when n == 0
     tags = how often each tag was picked (including tags from older tag-only reviews)
   Meetup ratings are a different dataset and never enter this. People who were not rated get no number at all. */
function fbAgg(u) {
    const shared = S.trustSummaries && S.trustSummaries[u.sub || u.id];
    if (shared && Number(shared.n) >= 3) return { n: Number(shared.n), avg: shared.avg == null ? null : Number(shared.avg), tags: shared.tags || {} };
    const R = S.feedback.filter(f => f.kind == 'person' && f.to == u.id);
    const rated = R.filter(f => f.rating >= 1 && f.rating <= 5);
    const tags = {};

    R.forEach(f => (f.tags || []).forEach(t => tags[t] = (tags[t] || 0) + 1));

    return {
        n: rated.length,
        avg: rated.length
            ? Math.round(rated.reduce((a, f) => a + f.rating, 0) / rated.length * 10) / 10
            : null,
        tags
    };
}

/* what the signed-in person has already sent for a plan, for status lines */
function fbMine(p) {
    return {
        meetup: fbFind(p, 'meetup') || null,
        people: fbTargets(p).filter(m => fbFind(p, 'person', m)).length,
        total: fbTargets(p).length
    };
}

/* overall meetup totals for a plan: only once 3+ people answered, never any comment or reviewer */
function fbSummary(p) {
    if (S.feedbackSummaries && Object.prototype.hasOwnProperty.call(S.feedbackSummaries, p.id)) return S.feedbackSummaries[p.id] || null;
    const R = S.feedback.filter(f => f.kind == 'meetup' && f.planId == p.id);

    if (R.length < 3)
        return null;

    const tags = {};

    R.forEach(f => f.tags.forEach(t => tags[t] = (tags[t] || 0) + 1));

    return {
        n: R.length,
        avg: Math.round(R.reduce((a, f) => a + f.rating, 0) / R.length * 10) / 10,
        tags: Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 3)
    };
}
