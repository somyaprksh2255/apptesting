function outside() {
    const o = O.os;
    const s = o.step;

    /* "Nearby" discovery radius for Still Outside (km). Matches the existing
       "Already happening nearby" behaviour in step 4 so both use one value.
       The user's position is still kept to a rough ~1 km area for privacy. */
    const NEARBY_KM = 8;

    const M = [
        '☕ Chai',
        '🍕 Food',
        '💃 Garba',
        '🪔 Pandal Hopping',
        '📸 Photos',
        '🚶 Walk',
        '🧭 Explore',
        '✨ Custom'
    ];

    const os = c => c.replace(
        /data-a="set"/g,
        'data-a="osset"'
    );

    /* Find People mode: spontaneous plans that are live now AND nearby,
       shown inside the Still Outside flow using the existing plan card + join flow.
       Reuses vis() (open, visible, in-city plans), d() (approx distance), and card().

       Radius note: the privacy model already rounds the user's position to a rough
       ~1 km area (see geoBar / locate()), so coordinates are never exact. The nearby
       *discovery* radius here matches the app's existing "Already happening nearby"
       convention used below in step 4 (NEARBY_KM) so that genuinely live plans in the
       user's area actually surface. A 1 km discovery radius was too tight for the
       locality geography (localities sit 2–8 km apart), which made live plans fail to
       render from most areas even though they exist. */
    if (o.find) {
        /* Reference point for "nearby": the user's rough GPS area if location is on,
           otherwise the area they picked manually from the chips (LC[o.loc]).
           Supporting both means manual area selection works even without GPS, which
           is the documented fallback. Coordinates are never shown on public cards. */
        const ref = ['openstreetmap-nominatim', 'squado-city-directory'].includes(o.locSource) && o.areaLat != null && o.areaLng != null && Number.isFinite(Number(o.areaLat)) && Number.isFinite(Number(o.areaLng))
            ? [Number(o.areaLat), Number(o.areaLng)]
            : (geoOn() ? S.geo : (o.loc && LC[o.loc] ? LC[o.loc] : null));

        /* distance from the chosen reference to a plan's locality (km), or null if unknown.
           Uses the same Haversine helper (hv) and locality map (LC) as d(). */
        const refDist = p => {
            const target = planCoords(p);
            return ref && target
                ? Math.max(.1, Math.round(hv(ref, target) * 10) / 10)
                : null;
        };

        const nearby = ref
            ? vis()
                .filter(
                    p =>
                        p.live &&                       /* genuinely live/spontaneous */
                        p.status == 'open' &&           /* not cancelled or completed */
                        !p.members.includes('me') &&    /* not already in it */
                        p.members.length < p.max &&     /* not full */
                        refDist(p) != null &&           /* a real, known distance */
                        refDist(p) <= NEARBY_KM         /* within the nearby radius */
                )
                .sort((a, b) => (refDist(a) ?? 1e9) - (refDist(b) ?? 1e9))
            : [];

        /* Location / area selector — rendered ONCE, at the TOP of the section, before results.
           GPS button (rough ~1 km area, privacy-safe) + the existing manual area chips.
           Changing the area fires osset -> re-render -> results refresh for the new area. */
        const selector = `
            <section class="card location-area-panel" style="margin:0 0 14px">
                <b>Your area</b>
                <p class="mut location-area-panel__intro">
                    ${geoOn()
                        ? 'Showing plans near ' + esc(S.area || 'you') + '.'
                        : ref
                            ? 'Showing plans near ' + esc(o.loc) + '.'
                            : 'Use your location, or choose an area, to see who is live nearby.'}
                    Only an approximate area is used for discovery.
                </p>
                <button class="btn sm pink" data-a="geoPick" data-k="os.loc">${I("map-pin", "1em")} Use my location</button>
                ${quickLocationSuggestions('os.loc')}
                <div class="location-custom-search"><div><b>${I("search", "1em")} Choose your area</b><small>Search for a place in ${esc(S.me.city || 'your selected city')}.</small></div><button class="btn pink sm" data-a="locationPicker" data-v="os.loc">${I("map-pinned", "1em")} Search map</button></div>
                ${o.locSource === 'openstreetmap-nominatim' || o.locSource === 'squado-city-directory' ? `<div class="location-selected"><span class="location-selected__pin">${I("map-pin", "1.1em")}</span><div><b>${esc(o.loc)}</b><small>${esc([o.locCity || S.me.city, o.locState].filter(Boolean).join(', '))}</small></div><button class="btn ghost sm" data-a="locationPicker" data-v="os.loc">Change</button></div>` : ''}
            </section>
        `;

        /* Results below the selector. */
        let results;

        if (!ref) {
            results = `<p class="mut">Live plans near you show here once your location or area is set.</p>`;
        }
        else {
            results = nearby.length
                ? `<div class="grid">${nearby.map(card).join('')}</div>`
                : `<div class="empty">
                        <h3>No one nearby is live right now.</h3>
                        <p class="mut">Make a plan and get your squad out.</p>
                        <button class="btn" data-a="osMake">Make a plan</button>
                    </div>`;
        }

        return `
            <main class="wrap">
              <div class="two">
                <!-- LEFT (sticky on desktop): heading + area selector -->
                <div>
                    <a class="back" href="#" data-a="goBack">
                        ← Back
                    </a>

                    <h1>Who's still out nearby?</h1>

                    <p class="mut">
                        Live plans near you right now. Pull up.
                    </p>

                    ${selector}
                </div>
                <!-- RIGHT: live-plan results -->
                <div>
                    ${results}
                </div>
              </div>
            </main>
        `;
    }

    let b = '';

    /* Skip the obsolete extra confirmation screen. A fresh Still Outside flow
       starts directly at the activity choices. */
    if (!s || s == 1)
        b = `
            <h1>What's the move?</h1>
            ${os(chips(M, 'os.move', o.move))}
            ${
                o.move == '✨ Custom'
                    ? `
                        <input
                            type="text"
                            style="margin-top:12px"
                            maxlength="24"
                            data-in="os.cname"
                            value="${esc(o.cname || '')}"
                            placeholder="What are we doing?"
                            aria-label="Custom"
                        >
                        <p>
                            <button class="btn pink" data-a="osnext">
                                Next
                            </button>
                        </p>
                    `
                    : ''
            }
        `;

    if (s == 2)
        b = `
            <h1>Who's down?</h1>
            <p class="mut">Max squad size</p>
            ${os(
                chips(
                    ['2', '3', '4', '5', '6'],
                    'os.size',
                    String(o.size)
                )
            )}
        `;

    if (s == 3)
        b = `
            <h1>Where are you meeting?</h1>
            <p class="mut">Choose a nearby suggestion or search for a place in your default city.</p>
            <div class="location-flow-card location-flow-card--outside">
                <button class="btn pink sm" data-a="geoPick" data-k="os.loc">${I("map-pin", "1em")} Use my location</button>
                ${quickLocationSuggestions('os.loc')}
                <div class="location-custom-search"><div><b>${I("search", "1em")} Choose your area</b><small>Search for a place in ${esc(S.me.city || 'your selected city')}.</small></div><button class="btn pink sm" data-a="locationPicker" data-v="os.loc">${I("map-pinned", "1em")} Search map</button></div>
                ${o.locSource === 'openstreetmap-nominatim' ? `<div class="location-selected"><span class="location-selected__pin">${I("map-pin", "1.1em")}</span><div><b>${esc(o.loc)}</b><small>${esc([o.locCity || S.me.city, o.locState].filter(Boolean).join(', '))}</small></div><button class="btn ghost sm" data-a="locationPicker" data-v="os.loc">Change</button></div>` : ''}
            </div>
            <p class="mut" style="margin-top:10px">
                Shown as an area only.
            </p>
        `;

    if (s == 4) {
        const mv = o.move.replace(/^\S+ /, '');
        const ty = MT[mv];

        const mt = vis()
            .filter(
                p =>
                    !p.members.includes('me') &&
                    p.members.length < p.max &&
                    (p.type == ty || p.type == 'outside') &&
                    d(p) != null &&
                    d(p) <= NEARBY_KM
            )
            .sort(
                (a, b) =>
                    b.live - a.live ||
                    byDist(a, b)
            )
            .slice(0, 2);

        b = `
            <h1>Post it.</h1>

            <p class="mut">
                ${esc(mv == 'Custom' ? o.cname : mv)}
                · up to ${o.size}
                · ${esc(o.loc)}
            </p>

            ${
                mt.length
                    ? `
                        <h2>Already happening nearby 👀</h2>
                        <div class="grid">
                            ${mt.map(card).join('')}
                        </div>
                        <h2>Or start your own squad</h2>
                    `
                    : ''
            }

            <input
                type="text"
                maxlength="120"
                data-in="os.desc"
                value="${esc(o.desc)}"
                placeholder="Friends left. I'm not done."
                aria-label="Note"
            >

            <p>
                <b>Who can join?</b>
            </p>

            ${chips(
                ['Everyone', 'Girls only', 'Boys only'],
                'os.who',
                o.who || 'Everyone'
            )}

            <p style="margin-top:16px">
                <button class="btn pink wide" data-a="postOut">
                    🔴 Go live
                </button>
            </p>
        `;
    }

    /* The Make-a-plan wizard is a focused multi-step FORM, so it uses a single
       readable centered column — matching its sibling form page create.js
       (max-width:680px). The browse-style "Find people" view above uses the
       two-column .two layout like Home/Discover; forms stay single-column. */
    return `
        <main style="max-width:680px">
            <a class="back" href="#" data-a="goBack">
                ← Back
            </a>
            ${b}
        </main>
    `;
}