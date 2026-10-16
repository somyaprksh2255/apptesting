/* Attendance UI: organizer panel, QR sheet, check-in page (opened by a phone camera link), in-app scanner. Logic lives in state/attendance.js. */

const ATT_MSG = {
    checked_in: ['You\'re checked in ✅', 'Your attendance is recorded. Thanks for coming!'],
    duplicate: ['Already checked in', 'You were already checked in for this meetup. Nothing was added twice.'],
    disputed: ['Sent to the host', 'The host marked you as not attending, so this was recorded as a dispute for them to resolve.'],
    auth: ['Sign in to check in', 'Check-in is tied to your Squado account.'],
    noplan: ['Meetup not found', 'This meetup could not be found. Check the group and try again.'],
    cancelled: ['This meetup was cancelled', 'There\'s nothing to check in to.'],
    ended: ['This meetup is already wrapped up', 'Check-in is closed. If you were there, ask the host to mark you present.'],
    nosession: ['Check-in isn\'t open', 'The host hasn\'t started check-in for this meetup.'],
    invalid: ['That code isn\'t valid', 'This QR code doesn\'t match an open check-in. Ask the host to show it again.'],
    revoked: ['That code was replaced', 'The host created a newer code. Scan the latest one.'],
    closed: ['Check-in is closed', 'The host closed check-in. If you were there, use "I was there" or ask the host to mark you present.'],
    expired: ['That code has expired', 'Ask the host for a new code.'],
    notmember: ['You\'re not in this squad', 'Only accepted squad members can check in. Ask to join first.'],
    method: ['Couldn\'t check in', 'Unknown check-in method.'],
    save: ['Couldn\'t save your check-in', 'Your device storage didn\'t accept it. Nothing was recorded. Try again.']
};

const attMsg = c => ATT_MSG[c] || ATT_MSG.invalid;

const ATT_STATUS = a =>
    !a ? '⏳ Not checked in yet'
        : a.dispute ? '⚠️ Disputed'
            : a.status == 'present' ? '✅ Checked in'
                : a.status == 'claimed' ? '🙋 Says they attended'
                    : '🚫 Marked absent';

/* why feedback is still locked, for a member of the plan (null when it is open to them) */
function fbLockReason(p) {
    if (!p || !p.members.includes('me') || S.me.guest)
        return null;

    if (p.status == 'cancelled')
        return 'This plan was cancelled, so there\'s no feedback.';

    const a = attGet(p, 'me');

    if (p.status != 'ended') {
        const l = lifeState(p);

        return l == 'disputed' ? 'Feedback is locked: the meetup\'s completion is disputed.'
            : l == 'completion_pending' ? 'Feedback opens once the meetup is confirmed completed (waiting for confirmations).'
                : 'Feedback opens after the host confirms the meetup ended, for people whose attendance was verified.';
    }

    if (fbEligible(p))
        return null;

    return !a ? 'Feedback is for people whose attendance was verified. Scan the meetup QR code, or ask the host to mark you present.'
        : a.dispute ? 'Your attendance is disputed, so feedback stays locked until the host resolves it.'
            : a.status == 'claimed' ? 'Waiting for the host to verify that you attended. Feedback stays locked until then.'
                : a.status == 'absent' ? 'The host marked you as not attending. If that\'s wrong, tap "I was there".'
                    : 'Feedback isn\'t open for this plan.';
}

/* Completion block on the plan page. Attendance check-ins are handled by the host Scanner on the Groups card. */
function attPanel(p) {
    if (p.status == 'cancelled' || S.me.guest || !p.members.includes('me'))
        return '';

    const host = isHost(p);
    const l = lifeState(p);
    const open = p.status == 'open';
    const a = attGet(p, 'me');
    let h = '';

    /* Attendance is managed from the Groups card's host Scanner, which scans a member's personal QR.
       Do not duplicate attendance controls, meetup QR generation, or manual present/absent marking on this detail page.
       Keep completion confirmation here because it is a separate workflow. */

    /* completion: separate from attendance */
    if (open) {
        h += `<div class="card" style="margin:10px 0 0">
            <b>Meetup status: ${({ scheduled: 'Scheduled', awaiting_completion: 'Awaiting completion', completion_pending: 'Waiting for confirmations', disputed: 'Disputed' })[l] || l}</b>`;

        if (host) {
            if (!p.completion)
                h += `<p class="mut" style="margin:6px 0 8px">Confirm only once the meetup really happened and ended. Checking people in does not complete it.</p>
                    <button class="btn sm" data-a="ask" data-do="end" data-v="${p.id}">Confirm it ended</button>`;
            else
                h += `<p class="mut" style="margin:6px 0 0">${l == 'disputed'
                    ? 'A verified attendee disputes this. It stays open until they withdraw their dispute.'
                    : 'You confirmed this meetup ended. Feedback is open to verified attendees.'}</p>`;
        }
        else if (p.completion) {
            const me = p.completion;
            const mine = me.confirms.includes('me');
            const disp = me.disputes.some(d => d.u == 'me');

            h += `<p class="mut" style="margin:6px 0 8px">The host says this meetup happened and ended.</p>`;

            if (a && ['present', 'claimed'].includes(a.status))
                h += `<div class="row">
                    ${mine || disp ? '' : `<button class="btn pink sm" data-a="compOk" data-v="${p.id}" ${attPresent(p, 'me') ? '' : 'disabled'}>Yes, it happened</button>
                        <button class="btn ghost sm" data-a="compNo" data-v="${p.id}">That's not right</button>`}
                    ${mine ? '<span class="mut">You confirmed ✅</span>' : ''}
                    ${disp ? `<span class="mut">You disputed this</span> <button class="btn ghost sm" data-a="compUndo" data-v="${p.id}">Withdraw</button>` : ''}
                </div>`;
        }
        else
            h += '<p class="mut" style="margin:6px 0 0">The host confirms when the meetup has ended.</p>';

        h += '</div>';
    }

    return h;
}

/* Meetup QR generation was removed from the plan detail screen. The supported attendance flow is the host Scanner
   on the Groups card, which scans a member's personal QR. The check-in route below remains for compatibility with
   previously issued meetup links; no new meetup QR codes are generated from this UI. */

/* ---- check-in page: what a scanned link opens ---- */

function checkinPage(id, token) {
    const p = pl(id);
    const back = '<a class="back" href="#" data-a="goBack">← Home</a>';
    const done = O.ci && O.ci.id == id && O.ci.res;
    let body;

    if (done) {
        const m = attMsg(O.ci.res);
        const ok = ['checked_in', 'duplicate', 'disputed'].includes(O.ci.res);

        body = `<span class="okc ${ok ? '' : 'bad'}">${I(ok ? 'check' : 'x', '26px')}</span>
            <h2>${m[0]}</h2><p class="mut">${m[1]}</p>
            ${p ? `<a class="btn pink wide" href="#/plan/${esc(p.id)}">Open the meetup</a>` : ''}`;
    }
    else if (S.me.guest) {
        body = `<h2>${p ? 'Check in to ' + esc(p.title) : 'Check in'}</h2>
            <p class="mut">Sign in to check in. You'll come straight back here.</p>
            <button class="btn pink wide" data-a="checkinSignIn">Sign in to check in</button>`;
    }
    else {
        const c = attCheck(p, token);

        if (c != 'ok') {
            const m = attMsg(c);

            body = `<span class="okc bad">${I('x', '26px')}</span><h2>${m[0]}</h2><p class="mut">${m[1]}</p>
                ${p && c == 'notmember' ? `<a class="btn pink wide" href="#/plan/${esc(p.id)}">View the plan</a>` : ''}`;
        }
        else
            body = `<h2>Check in to ${esc(p.title)}?</h2>
                <p class="mut">Opening this link doesn't count as attendance. Tap below to confirm you're here.</p>
                <button class="btn pink wide ${O.scan.busy ? 'loading' : ''}" data-a="checkinGo" data-k="${esc(p.id)}|${esc(token)}" ${O.scan.busy ? 'disabled' : ''}>Check me in</button>`;
    }

    return `<main class="wrap" style="max-width:520px">${back}<div class="authst" style="margin-top:16px">${body}</div></main>`;
}

/* ---- in-app scanner ---- */

/* Decode a scanned/pasted link. ONE parser, one decode point, so "never a fake success" lives in one place.
   Returns a tagged union:
     { kind:'checkin', id, token }   our own meetup check-in link  '#/checkin/<plan>/<32 hex>'
     { kind:'user', uid }            an attendee's personal identity QR  '#/user/<accountId>'
     null                            anything else */
function attParse(text) {
    const s = String(text || '').trim();

    const c = /#\/checkin\/([\w.~%-]+)\/([0-9a-f]{32})\s*$/i.exec(s);

    if (c)
        return { kind: 'checkin', id: decodeURIComponent(c[1]), token: c[2].toLowerCase() };

    const u = /#\/user\/([A-Za-z0-9_%.~-]+)\s*$/.exec(s);

    if (u) {
        let uid;

        try {
            uid = decodeURIComponent(u[1]);
        }
        catch (e) {
            return null;
        }

        return idOk(uid) ? { kind: 'user', uid } : null;
    }

    return null;
}

const SCAN_ERR = {
    unsupported: 'This browser can\'t open the camera here. Use your phone\'s camera app to scan the QR code (it opens Squado), or paste the link below.',
    denied: 'Camera permission was denied. Allow it in your browser settings, or scan with your phone\'s camera app, or paste the link below.',
    nocam: 'No camera was found on this device. Paste the check-in link below instead.',
    camfail: 'The camera couldn\'t start. Paste the check-in link below instead.',
    nodecoder: 'This browser has no QR reader available right now (it needs an internet connection for one small library). Paste the link below instead.'
};

const scanSheet = (note, err) => `<h2 style="margin-top:0">Scan to check in</h2>
    <p class="mut">${note || 'Point the camera at the meetup\'s QR code.'}</p>
    ${err ? `<p role="alert" style="color:var(--ic-red)"><b>${esc(err)}</b></p>` : '<video id="scanv" playsinline muted style="width:100%;max-height:320px;border-radius:16px;background:#000"></video>'}
    <p class="mut" style="margin:12px 0 4px;font-size:.85rem">No camera? Paste the check-in link:</p>
    <input type="text" data-in="scan.code" value="${esc(O.scan.code)}" placeholder="https://…/#/checkin/…" aria-label="Check-in link" autocomplete="off">
    <div class="row" style="margin-top:8px">
        <button class="btn pink sm" data-a="scanManual">Use link</button>
        <button class="btn ghost sm" data-a="close">Close</button>
    </div>`;

const scanResult = c => {
    const m = attMsg(c);
    const ok = ['checked_in', 'duplicate', 'disputed'].includes(c);

    return `<div class="authst"><span class="okc ${ok ? '' : 'bad'}">${I(ok ? 'check' : 'x', '26px')}</span><h2>${m[0]}</h2><p class="mut">${m[1]}</p></div>
        <p style="text-align:center"><button class="btn ghost sm" data-a="close">Close</button></p>`;
};

/* ---- host scanner: the host scans an attendee's personal QR to check them in to THIS plan ----
   The host sheet keeps the camera LIVE after each scan (the host points at the next member's QR), so scan
   results are written into the #hostscanmsg live region and NEVER through modal() — modal() stops the camera. */

const HOST_SCAN_MSG = {
    checked_in: ['Checked in ✅', 'is now marked present. Point the camera at the next member\'s QR.'],
    duplicate: ['Already checked in', 'This member was already marked present. Nothing was added twice.'],
    self: ['That\'s your own QR', 'As the host you\'re already counted. Scan a member\'s personal QR instead.'],
    unknown: ['That QR doesn\'t match anyone', 'It isn\'t a Squado personal QR for someone this device knows. On this device only accounts that signed in here can be matched (there\'s no server to check against).'],
    notmember: ['Not an accepted member', 'They\'re not an accepted member of this squad, so they can\'t be checked in. Accept their join request first.'],
    state: ['This plan isn\'t open for check-in', 'Check-in only works while the plan is open (not cancelled or ended).'],
    forbidden: ['Only the host can scan people in', 'You\'re not the host of this plan.'],
    noplan: ['Meetup not found', 'This plan isn\'t available in this browser.'],
    auth: ['Sign in first', 'Scanning people in is tied to your Squado account.'],
    save: ['Couldn\'t save', 'Your device storage didn\'t accept it. Nothing was recorded. Try again.'],
    badid: ['That isn\'t a personal QR', 'Point the camera at a member\'s personal QR code (from their Profile), not a meetup check-in code.'],
    unauthorized: ['Please sign in again', 'Your session expired or isn\'t valid. Sign in again, then reopen the Scanner.'],
    disputed: ['Marked as a dispute', 'There\'s an open dispute on this member\'s attendance. Resolve it from the plan page; a re-scan won\'t override it.'],
    network: ['Couldn\'t reach the server', 'Attendance was NOT recorded. Check your connection and the backend, then scan again.']
};

/* server reason code (from hostCheckInRemote / the endpoint) -> HOST_SCAN_MSG key.
   bad_request/badid -> badid; unauthorized -> unauthorized; disputed -> disputed; a thrown fetch, a !res.ok with no
   body, and server_error/rate_limited all normalize to the 'network' line. Anything unmapped falls back to badid. */
const REASON_KEY = {
    checked_in: 'checked_in', duplicate: 'duplicate', self: 'self',
    unknown: 'unknown', notmember: 'notmember', state: 'state',
    noplan: 'noplan', forbidden: 'forbidden', bad_request: 'badid', badid: 'badid',
    unauthorized: 'unauthorized', disputed: 'disputed',
    server_error: 'network', rate_limited: 'network', network: 'network'
};

/* inner HTML for #hostscanmsg (NOT a modal). Success styling only for checked_in; greets with the SERVER-provided
   name (the scanned UUID will not resolve through the local usr() lookup), falling back to a generic line. */
function hostScanLine(code, uid, name) {
    const key = REASON_KEY[code] || 'badid';
    const m = HOST_SCAN_MSG[key];
    const ok = key === 'checked_in';
    const who = ok && name ? esc(name) + ' ' : '';

    return `<span class="okc ${ok ? '' : 'bad'}">${I(ok ? 'check' : 'x', '22px')}</span>
        <b>${m[0]}</b>
        <p class="mut" style="margin:4px 0 0">${who}${m[1]}</p>`;
}

/* the host scanner sheet. Mounts the <video> AND a persistent #hostscanmsg live region; it must NOT emit a
   'Scan again' (scanOpen) control, because scanOpen would clear O.scan.hostPlan and drop out of the host flow. */
function hostScanSheet(host, note, err) {
    const p = pl(host);

    return `<h2 style="margin-top:0">Scan a member's QR</h2>
        <p class="mut">${note || 'Point the camera at the attendee\'s personal QR code.'}</p>
        ${p ? `<p class="mut" style="font-size:.85rem;margin:0 0 8px">Checking people in to <b>${esc(p.title)}</b>.</p>` : ''}
        ${err
            ? `<p role="alert" style="color:var(--ic-red)"><b>${esc(err)}</b></p>`
            : '<video id="scanv" playsinline muted style="width:100%;max-height:320px;border-radius:16px;background:#000"></video>'}
        <div id="hostscanmsg" class="authst" role="status" aria-live="polite" style="margin-top:10px"></div>
        <p class="mut" style="margin:12px 0 4px;font-size:.85rem">No camera? Paste the member's personal QR link:</p>
        <input type="text" data-in="scan.code" value="${esc(O.scan.code)}" placeholder="…/#/user/…" aria-label="Member QR link" autocomplete="off">
        <div class="row" style="margin-top:8px">
            <button class="btn pink sm" data-a="scanManual">Use link</button>
            <button class="btn ghost sm" data-a="close">Close</button>
        </div>`;
}

/* the member self-checkin scanner AND the host scanner both decode here; O.scan.hostPlan decides the path.
   async: the HOST path awaits the backend (hostCheckInRemote) — the server owns the authoritative record and runs
   all 8 checks. S.attendance is written ONLY after a confirmed server checked_in/duplicate (never a fake success). */
async function scanHandle(text) {
    const x = attParse(text);
    const host = O.scan.hostPlan;

    if (host) {
        /* HOST path: route through the backend, write the result line into #hostscanmsg, keep the camera live
           (no modal() — modal() stops the camera, breaking consecutive scans). */
        const n = $('#hostscanmsg');

        if (!x || x.kind != 'user') {
            if (n)
                n.innerHTML = UI(hostScanLine('badid'));

            return;   /* malformed/unrelated QR: no network call */
        }

        /* set busy synchronously BEFORE the first await so a re-entrant decode is suppressed */
        if (O.scan.busy)
            return;

        O.scan.busy = true;

        if (n)
            n.innerHTML = UI('<p class="mut" style="margin:0">Checking…</p>');

        try {
            const r = await hostCheckInRemote(host, x.uid);

            if (r.reason === 'network' || r.reason === 'server_error' || r.reason === 'rate_limited') {
                /* backend/DB failure: show the error, write NOTHING to S.attendance */
                if (n)
                    n.innerHTML = UI(hostScanLine('network'));
            }
            else {
                if (n)
                    n.innerHTML = UI(hostScanLine(r.reason, r.uid, r.name));

                /* mirror into the display cache ONLY on a confirmed server success */
                if (r.ok && (r.reason === 'checked_in' || r.reason === 'duplicate')) {
                    const localId = localIdForSub(r.uid);

                    if (localId)
                        attCacheMark(host, localId);
                    else if (n)
                        /* this device never signed that account in: server success stands, cache can't key the row */
                        n.innerHTML += UI('<p class="mut" style="margin:4px 0 0;font-size:.8rem">Counts may be stale until refresh.</p>');
                }
            }

            render();   /* refreshes #app counts only; modal()/#modal/camera untouched */
        }
        catch (e) {
            /* a thrown fetch (backend unreachable) maps to the network line; nothing recorded */
            if (n)
                n.innerHTML = UI(hostScanLine('network'));
        }
        finally {
            O.scan.busy = false;
        }

        return;
    }

    /* MEMBER self-checkin path (unchanged): only our own check-in link counts */
    if (O.scan.busy)
        return;

    if (!x || x.kind != 'checkin') {
        modal(scanSheet('', ''));
        return modal(scanResult('invalid'));
    }

    O.scan.busy = true;

    try {
        const c = attCheckIn(x.id, x.token, 'in_app_scanner');

        modal(scanResult(c));
        render();
    }
    finally {
        O.scan.busy = false;
    }
}

const attActions = {
    attClaim(e) {
        const r = attClaim(pl(e.dataset.v));

        toast(({ ok: 'Sent. The host will verify it.', duplicate: 'Already sent', notmember: 'You\'re not in this squad', save: 'Couldn\'t save. Try again.' })[r] || 'Couldn\'t send');
        render();
    },
    compOk(e) { attCompAct(e, 'confirm'); },
    compNo(e) { attCompAct(e, 'dispute'); },
    compUndo(e) { attCompAct(e, 'withdraw'); },
    checkinSignIn() {
        requireAuth({ hash: location.hash }, () => render(), 'Sign in to check in');
    },
    checkinGo(e) {
        if (O.scan.busy)
            return;

        const [id, token] = String(e.dataset.k).split('|');

        O.scan.busy = true;
        render();

        /* link / phone-camera route: method native_camera; same attCheckIn() as the in-app scanner */
        const c = attCheckIn(id, token, 'native_camera');

        O.scan.busy = false;
        O.ci = { id, res: c };
        render();
    },
    /* host opener: scans an ATTENDEE's personal QR to check THEM in to this plan (guarded by RULES.hostScan) */
    async hostScan(e) {
        O.scan = { code: '', busy: false, hostPlan: e.dataset.v };
        await scanStart();
    },
    async scanManual() {
        return scanHandle(O.scan.code);
    }
};

/* bring up the camera + decode loop. O.scan.hostPlan picks the sheet (host vs member) and the handler branch.
   Used by hostScan (host) to scan an attendee personal QR. */
async function scanStart() {
    const host = O.scan.hostPlan;
    const sheet = (note, err) => hostScanSheet(host, note, err);

    modal(sheet('Starting the camera…'));

    const tok = O.tok;
    const nav = typeof navigator != 'undefined' ? navigator : null;

    if (!nav || !nav.mediaDevices || !nav.mediaDevices.getUserMedia)
        return modal(sheet('', SCAN_ERR.unsupported));

    const hasDetector = typeof BarcodeDetector != 'undefined';

    if (!hasDetector && typeof jsQR == 'undefined')
        return modal(sheet('', SCAN_ERR.nodecoder));

    let stream;

    try {
        stream = await nav.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    }
    catch (x) {
        const n = x && x.name;

        return O.tok == tok && modal(sheet('', SCAN_ERR[n == 'NotAllowedError' || n == 'SecurityError' ? 'denied' : n == 'NotFoundError' || n == 'OverconstrainedError' ? 'nocam' : 'camfail']));
    }

    /* the sheet was closed while the permission prompt was open: release the camera right away */
    if (O.tok != tok) {
        stream.getTracks().forEach(t => t.stop());
        return;
    }

    const m = $('#modal');
    const v = m.querySelector('#scanv');

    m._cameraStream = stream;   /* modal() stops it on every close / sheet change */

    if (!v)
        return;

    v.srcObject = stream;

    try {
        await v.play();
    }
    catch (x) { }

    const det = hasDetector ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
    const cv = document.createElement('canvas');

    const tick = async () => {
        if (O.tok != tok)
            return;

        let text = '';

        try {
            if (det) {
                const r = await det.detect(v);

                text = r && r[0] ? r[0].rawValue : '';
            }
            else if (v.videoWidth) {
                cv.width = v.videoWidth;
                cv.height = v.videoHeight;

                const cx = cv.getContext('2d');

                cx.drawImage(v, 0, 0);

                const d = cx.getImageData(0, 0, cv.width, cv.height);
                const r = jsQR(d.data, d.width, d.height);

                text = r ? r.data : '';
            }
        }
        catch (x) { }

        if (O.tok != tok)
            return;

        if (text) {
            /* skip decoding a result while a check-in is in flight; scanHandle's own busy-gate also guards re-entry */
            if (!O.scan.busy)
                scanHandle(text);   /* async; fire-and-forget here — correctness rests on the busy flag */

            /* host scanner stays live for the next member (keep polling even while busy); member scanner stops */
            if (O.scan.hostPlan && O.tok == tok)
                return setTimeout(tick, 250);

            return;
        }

        setTimeout(tick, 250);
    };

    tick();
}

function attCompAct(e, act) {
    const p = pl(e.dataset.v);
    const r = compMember(p, act);

    if (['forbidden', 'state', 'auth', 'save'].includes(r))
        return toast(r == 'save' ? 'Couldn\'t save. Try again.' : 'That isn\'t available right now.');

    if (r == 'completed')
        attFinish(p);
    else
        toast(r == 'disputed' ? 'Noted. The meetup stays open until this is resolved.' : act == 'confirm' ? 'Thanks for confirming' : 'Updated');

    render();
}

/* once a plan is completed: tell verified attendees feedback is open (once per person and plan) */
function attFinish(p) {
    p.members.filter(m => m != 'me' && attPresent(p, m)).forEach(m => {
        if (!S.notifs.some(n => n.to == m && n.planId == p.id && n.key == 'fb'))
            notify(m, { type: 'plan', ic: 'star', c: 'gold', t: `How was ${p.title}?`, b: 'Share quick, anonymous feedback', planId: p.id, userId: 'me', key: 'fb' });
    });

    if (!(p.sysDone))
        sys(p.id, 'Plan wrapped ✅');

    p.sysDone = 1;
    save();
    toast('Meetup confirmed completed 🎉');
}

/* once the organizer confirms: ask verified attendees to confirm (once per person and plan) */
function attAskConfirm(p) {
    compVerifiers(p).forEach(m => {
        if (!S.notifs.some(n => n.to == m && n.planId == p.id && n.key == 'comp'))
            notify(m, { type: 'plan', ic: 'check', c: 'gold', t: `Did ${p.title} happen?`, b: 'The host says it ended. Please confirm.', planId: p.id, userId: 'me', key: 'comp' });
    });

    save();
}
