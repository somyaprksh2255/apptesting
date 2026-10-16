function blockedUsersSummary() {
    const count = Array.isArray(S.blocked) ? S.blocked.length : 0;
    return `<button type="button" class="blocked-users-trigger" data-a="blockedList" aria-label="View ${count} blocked users">
        <span class="blocked-users-trigger__copy"><b>Blocked users</b><small>${count === 1 ? '1 person blocked' : `${count} people blocked`}</small></span>
        <span class="blocked-users-trigger__count">${count}</span>
        <span class="blocked-users-trigger__chevron">${I('chevron-right', '1.1em')}</span>
    </button>`;
}

function blockedUsersOverlay() {
    const ids = Array.isArray(S.blocked) ? S.blocked : [];
    return `<div class="blocked-users-dialog">
        <div class="row sp" style="align-items:flex-start"><div><p class="location-picker__eyebrow">PRIVACY & SAFETY</p><h2 style="margin:0 0 5px">Blocked users</h2><p class="mut" style="margin:0">${ids.length} ${ids.length === 1 ? 'person' : 'people'} won't appear in your discovery feed.</p></div><button class="iconbtn" data-a="close" aria-label="Close blocked users">${I('x')}</button></div>
        ${ids.length ? `<div class="blocked-users-dialog__list">${ids.map(id => {
            const u = usr(id) || {};
            const name = u.name || 'Blocked user';
            const detail = [u.username ? '@' + u.username : '', u.city || '', (u.interests || []).slice(0, 3).join(' · ')].filter(Boolean).map(esc).join(' · ');
            return `<article class="blocked-user-detail">${av(id, 48)}<div class="blocked-user-detail__copy"><b>${esc(name)}</b><small>${detail || 'This person is blocked from your Squado experience.'}</small><small class="blocked-user-detail__id">${esc(String(id).slice(0, 8))}${String(id).length > 8 ? '…' : ''}</small></div><button class="btn sm ghost" data-a="unblock" data-v="${esc(id)}">Unblock</button></article>`;
        }).join('')}</div>` : `<div class="blocked-users-empty-state"><span>${I('shield-check', '2em')}</span><b>No blocked users</b><p class="mut">People you block will appear here, and you can unblock them anytime.</p></div>`}
        <p class="mut" style="font-size:.78rem;margin:14px 0 0">Unblocking lets this person appear in discovery again. It doesn't automatically rejoin either of you to a plan.</p>
    </div>`;
}

function profile() {
    const m = S.me;
    const r = relOf(m);

    /* ── Personal QR: one stable, reusable identity QR for the signed-in account.
          It encodes ONLY the server-recognized stable identity, S.me.sub ('#/user/<S.me.sub>') — never email, name,
          access token or any private field — and is independent of any plan or session, so it is the same across
          reopens, sign-out/sign-in, browsers and devices. The host reads it with the in-app Scanner (on their group
          card) to check this person in; the backend resolves the sub to the authoritative profile.

          S.me.sub is set at sign-in (createAccount -> rec.sub = who.sub). On the Supabase-OAuth path it is a real
          Supabase user.id UUID (the only path that can ever resolve to a live server check-in); on the GIS/harness
          fallback it is a cosmetic g-* Google subject that renders a stable QR but never resolves server-side. Either
          way it is NOT a secret and NOT identity proof — see the HONESTY note below.

          Payload rule:
            - a valid https appBaseUrl is set -> absolute '<base>#/user/<sub>' (works cross-device with the backend)
            - otherwise                       -> relative  '#/user/<sub>'       (the in-app scanner decodes it same-origin)
          Either way the QR is rendered for a signed-in real account; only a guest / missing sub shows copy instead.

          HONESTY: reading this QR on a device is NOT secure server-side identity proof — a copied QR can be replayed.
          A permanent QR identifies the account; it does not prove the presenter owns it. The trust anchor is the
          HOST's authenticated session (verified server-side); the host vouches for the attendee by scanning. Opening
          it with a phone's camera app is not a supported shortcut (there is no '#/user' page; it lands on not-found).
          Real cross-device check-in needs a deployed https appBaseUrl AND the backend — see README, "QR attendance". ── */
    function profileQrSection() {
        const sub = (S.me && S.me.sub) || '';
        let qrHtml;

        if (S.me.guest || !sub) {
            qrHtml = `<p class="mut" style="font-size:.85rem">Sign in to get your personal QR code.</p>`;
        } else {
            const base = String((window.SQUADO_CONFIG || {}).appBaseUrl || '').trim();
            let prefix = '';

            if (base) {
                try {
                    const u = new URL(base);

                    if (u.protocol === 'https:' && u.hostname.includes('.'))
                        prefix = u.toString().replace(/\/$/, '');
                } catch (e) { }
            }

            const payload = prefix + '#/user/' + encodeURIComponent(sub);
            let svg = '';

            try {
                const q = qrcode(0, 'M');

                q.addData(payload);
                q.make();
                svg = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
            } catch (e) { }

            qrHtml = svg
                ? `<div role="img" aria-label="Your personal QR code" style="background:#fff;padding:10px;border-radius:16px;max-width:200px">${svg}</div>
                   <p class="mut" style="font-size:.8rem;margin:8px 0 0">Show this QR to your meetup host to check in.</p>`
                : `<p class="mut" style="font-size:.85rem">QR library loading… (needs an internet connection for the CDN script)</p>`;
        }

        return `
            <div class="card" style="margin:18px 0 0">
                <b>Personal QR code</b>
                <p class="mut" style="margin:4px 0 10px;font-size:.9rem">
                    Your reusable check-in identity. Show it to the meetup host.
                </p>
                ${qrHtml}
            </div>
        `;
    }

    return `
        <main class="wrap">
          <div class="two">
            <!-- LEFT column (sticky on desktop): identity summary + personal QR -->
            <div>

            <!-- ── A. PROFILE HEADER ── -->
            <div class="row">
                ${av('me', 72)}

                <div>
                    <h1 style="margin:0">
                        ${esc(m.name)}
                    </h1>

                    <span class="mut">
                        @${esc(m.username)} · ${esc(m.gender)}${m.ageRange ? ' · ' + esc(m.ageRange) : ''} · 📍 ${esc(m.city)}
                    </span>

                    <br>

                    ${trust(m)}
                </div>
            </div>

            ${m.bio
                ? `<p style="margin:12px 0">${esc(m.bio)}</p>`
                : '<p class="mut" style="margin:12px 0">No bio yet.</p>'
            }

            <!-- Interests: show ONLY the user's selected interests (read-only pills).
                 The full selectable list lives in Edit Profile (EditProfileSheet). -->
            ${m.interests && m.interests.length
                ? `<div class="row" style="margin-bottom:14px">${m.interests.map(i => `<span class="pill">${lbl(i)}</span>`).join('')}</div>`
                : `<p class="mut" style="margin:0 0 14px">No interests yet — add a few in Edit profile for plans that match you 👀</p>`
            }

            <div class="row">
                <button class="btn sm" data-a="edit">
                    Edit profile
                </button>
            </div>

            <!-- ── B. PERSONAL QR ── -->
            ${profileQrSection()}

            </div>
            <!-- RIGHT column: reliability, settings, log out -->
            <div>

            <!-- ── C. RELIABILITY OVERVIEW ── -->
            <div class="card" style="margin:18px 0 0">
                <b>Reliability</b>

                <div class="row" style="margin:10px 0 14px;gap:12px">
                    <div style="text-align:center;flex:1">
                        <b style="font-size:1.6rem">${r.hosted}</b>
                        <br><span class="mut" style="font-size:.8rem">hosted</span>
                    </div>
                    <div style="text-align:center;flex:1">
                        <b style="font-size:1.6rem">${r.joined}</b>
                        <br><span class="mut" style="font-size:.8rem">joined</span>
                    </div>
                    <div style="text-align:center;flex:1">
                        <b style="font-size:1.6rem">${r.attended !== undefined ? r.attended : r.completed}</b>
                        <br><span class="mut" style="font-size:.8rem">attended</span>
                    </div>
                </div>

                <h3 style="margin:0 0 8px;font-size:1rem">Squad feedback</h3>

                ${fbs(m)}
            </div>

            <!-- ── D. SETTINGS ── -->
            <div class="card" style="margin:18px 0 0">
                <b>Settings</b>

                <!-- Appearance -->
                <h3 style="font-size:.9rem;margin:14px 0 8px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em">Appearance</h3>

                <button class="chip" data-a="theme">
                    🌗 Switch theme
                </button>

                <!-- Notifications -->
                <h3 style="font-size:.9rem;margin:14px 0 8px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em">Notifications</h3>

                <button class="chip" aria-pressed="${S.notif}" data-a="notif">
                    🔔 Plan notifications
                </button>

                <!-- Privacy & Safety -->
                <h3 style="font-size:.9rem;margin:14px 0 8px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em">Privacy &amp; Safety</h3>

                <button class="chip" aria-pressed="${geoOn()}" data-a="${geoOn() ? 'geoOff' : 'geo'}">
                    📍 Location
                </button>

                <div style="margin-top:14px">
                    ${blockedUsersSummary()}
                </div>

            </div>

            <!-- ── E. LOG OUT ── -->
            <p style="margin:20px 0 8px">
                <button class="btn ghost" data-a="logout">
                    ${I('log-out')} Log out
                </button>
            </p>

            </div>
          </div>
        </main>
    `;
}