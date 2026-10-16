function notifyLinkedPlanMembers(event, message, cancelPlans = false) {
    const linked = S.plans.filter(p => p.event === event.id && p.status === 'open');
    linked.forEach(p => {
        const recipients = [...new Set([...(p.members || []), ...(p.reqs || []).map(r => r.u)])];
        recipients.forEach(uid => {
            if (!uid || uid === 'me' && S.me.guest) return;
            notify(uid, {
                type: 'plan',
                ic: cancelPlans ? 'calendar-x' : 'calendar-clock',
                c: 'gold',
                t: cancelPlans ? 'Plan cancelled with its Event' : 'Linked Event updated',
                b: `${event.title} · ${message}`,
                planId: p.id,
                eventId: event.id
            });
        });
        if (cancelPlans) {
            p.status = 'cancelled';
            p.cancelReason = 'parent_event_cancelled';
            p.cancelledAt = Date.now();
        }
    });
}

function saveEvent(publish) {
    if (!canManageEvents()) return toast('Only authorized Squado admins can manage Events.');
    const f = O.E;
    const missing = !f.title.trim() ? 'title' : !f.info.trim() ? 'description' : !f.date ? 'start date' : !f.endDate ? 'end date' : !f.startTime ? 'start time' : !f.endTime ? 'end time' : !f.loc.trim() ? 'area / locality' : !f.venue.trim() ? 'venue / meeting point' : !f.host.trim() ? 'organizer' : '';
    if (publish && missing) return toast('Please add the Event ' + missing + '.');
    if (publish && (f.endDate < f.date || (f.endDate === f.date && f.endTime <= f.startTime))) return toast('Event end date/time must be after its start date/time.');
    if (publish && f.date < new Date().toISOString().slice(0,10)) return toast('Choose today or a future date.');
    if (f.capacity && (!Number.isInteger(Number(f.capacity)) || Number(f.capacity) < 1 || Number(f.capacity) > 100000)) return toast('Enter a valid Event capacity.');
    const now = Date.now();
    const record = {
        id: f.id || ('ev-' + now.toString(36) + Math.random().toString(36).slice(2,7)),
        emoji: ({garba:'💃',pandal:'🪔',bhandara:'🍛',city:'🗺️',custom:'🎟️'})[f.category] || '🎟️',
        tag: f.category || 'custom',
        category: f.category || 'custom',
        title: f.title.trim(),
        info: f.info.trim(),
        dateISO: f.date,
        endDateISO: f.endDate,
        endDate: f.endDate ? new Date(f.endDate + 'T00:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}) : '',
        date: f.date ? new Date(f.date + 'T00:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}) : '',
        dateLabel: f.date ? new Date(f.date + 'T00:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}) : '',
        startTime: f.startTime,
        endTime: f.endTime,
        when: f.startTime && f.endTime ? f.startTime + '–' + f.endTime : (f.startTime || f.endTime || ''),
        loc: f.loc.trim(),
        venue: f.venue.trim(),
        ageGroup: f.ageGroup.trim(),
        capacity: f.capacity ? Number(f.capacity) : null,
        visibility: f.visibility || 'public',
        host: f.host.trim(),
        status: publish ? 'published' : 'draft',
        createdBy: S.me.email || S.me.sub || 'admin',
        updatedAt: now,
        createdAt: f.id ? (S.events.find(x => x.id === f.id)?.createdAt || now) : now
    };
    const i = S.events.findIndex(x => x.id === record.id);
    const previous = i >= 0 ? S.events[i] : null;
    if (i >= 0) S.events[i] = record; else S.events.unshift(record);
    if (publish && previous && previous.status === 'published' &&
        (previous.dateISO !== record.dateISO || previous.endDateISO !== record.endDateISO || previous.startTime !== record.startTime ||
         previous.endTime !== record.endTime || previous.loc !== record.loc || previous.venue !== record.venue)) {
        notifyLinkedPlanMembers(record, `Schedule or location changed to ${record.dateLabel} · ${record.when} · ${record.loc}.`);
    }
    save();
    O.E = { id:'', title:'', category:'garba', info:'', date:'', endDate:'', startTime:'', endTime:'', loc:'', venue:'', ageGroup:'', capacity:'', visibility:'public', host:'', status:'draft' };
    O.createMode = 'choose';
    toast(publish ? 'Event published.' : 'Draft saved.');
    goHash(publish ? '#/event/' + record.id : '#/create');
}

const A = {
    set(e) {
        queueMicrotask(() => O.editing && editSheet());
        const [t, k] = path(e.dataset.k);
        const previousValue = t[k];
        if (e.dataset.k === 'W.loc' && e.dataset.v !== previousValue) { O.W.locLat = null; O.W.locLng = null; O.W.locSource = ''; O.W.locPlace = ''; }
        if (e.dataset.k === 'os.loc' && e.dataset.v !== previousValue) { O.os.locLat = null; O.os.locLng = null; O.os.areaLat = null; O.os.areaLng = null; O.os.locSource = ''; O.os.locPlace = ''; }
        t[k] = e.dataset.v;
        if (e.dataset.k == 'W.size')
            O.W.size = +e.dataset.v;
        if (e.dataset.k == 'W.who' && e.dataset.v === 'Everyone')
            O.W.mode = '';
    },
    osset(e) {
        const [t, k] = path(e.dataset.k);
        const previousValue = t[k];
        if (e.dataset.k === 'os.loc' && e.dataset.v !== previousValue) { O.os.locLat = null; O.os.locLng = null; O.os.areaLat = null; O.os.areaLng = null; O.os.locSource = ''; O.os.locPlace = ''; }
        t[k] = k == 'size' ? +e.dataset.v : e.dataset.v;
        if (O.os.step > 0 && O.os.step < 4 && !(k == 'move' && t[k] == '✨ Custom'))
            O.os.step++;
    },
    osnext() {
        if (!(O.os.cname || '').trim())
            return toast('Name your thing first');
        O.os.step = 2;
    },
    tog(e) {
        queueMicrotask(() => O.editing && editSheet());
        const [t, k] = path(e.dataset.k);
        const a = t[k], v = e.dataset.v, i = a.indexOf(v);
        i < 0 ? a.push(v) : a.splice(i, 1);
        if (e.dataset.k == 'me.interests')
            save();
    },
    obNext() {
        const o = O.ob;
        if (!obOk())
            return;
        if (o.step == 5) {
            finishOb();
            return;
        }
        o.step++;
        o.an = 1;
        saveObProgress();
    },
    obCancel() {
        S.in = true;
    },
    obPrev() {
        O.ob.step--;
        O.ob.an = 1;
        saveObProgress();
    },
    osn() {
        O.os.step = 1;
    },
    /* Still Outside — Find people: show live + nearby spontaneous plans inside the outside flow */
    osFind() {
        O.os.find = 1;
        goHash('#/outside');
    },
    /* Still Outside — Make a plan: enter the creation wizard (never the find view) */
    osMake() {
        O.os.find = 0;
        O.os.step = 1;
        goHash('#/outside');
    },
    geo() {
        locate(n => {
            if (!S.in && n) {
                O.ob.city = O.ob.city || O.detectedCity || cityOfLoc(n);
                O.ob.locOk = 1;
            }
        });
    },
    geoOff() {
        S.geo = null;
        S.area = null;
        save();
        toast('Location off');
    },
    geoPick(e) {
        useLiveLocationForPicker(e.dataset.k || 'W.loc');
    },
    locationRecent(e) { chooseRecentLocation(e); },
    locationQuick(e) { chooseQuickLocation(e); },
    locationTerm(e) { chooseLocationTerm(e); },
    locationPicker(e) {
        openVerifiedLocationPicker(e.dataset.v || 'W.loc');
    },
    locationSearch() {
        searchVerifiedLocations();
    },
    locationChoose(e) {
        chooseVerifiedLocation(e);
    },
    home() {
        toast('Get home safe 🫡');
    },
    async post() {
        const w = O.W;
        let miss = !w.type ? 'what we\'re doing' : w.type == 'custom' && !(w.custom || '').trim() ? 'a name for it' : !w.loc ? 'where' : !w.when ? 'when' : !w.size ? 'squad size' : '';
        if (miss) return toast('Pick ' + miss + ' first');
        const verifiedCustom = w.locSource === 'openstreetmap-nominatim' && w.locLat != null && w.locLng != null && Number.isFinite(Number(w.locLat)) && Number.isFinite(Number(w.locLng)) && isCity(w.locCity || S.me.city);
        const knownLocality = !!LC[w.loc] && cityOfLoc(w.loc) === S.me.city;
        const linkedEvent = w.event && S.events.find(e => e.id == w.event && e.status === 'published');
        const eventDefaultLocation = !!linkedEvent && [linkedEvent.venue, linkedEvent.loc].filter(Boolean).includes(w.loc);
        if ((!verifiedCustom && !knownLocality && !eventDefaultLocation) || !isCity(S.me.city))
            return toast(isCity(S.me.city) ? 'Choose a verified place from the map' : 'Choose your city from a map result first');
        const who = w.who || 'Everyone';
        if (!hostOk(who)) return toast(who + ' plans need a matching profile gender');
        if (!capacityOk(Number(w.size))) return toast('Pick a squad size between ' + squadMin() + ' and ' + squadMax());
        let when = w.when;
        if (when == 'Custom') { const t = (w.time || '21:00').split(':'), H = +t[0]; when = (H % 12 || 12) + ':' + t[1] + ' ' + (H >= 12 ? 'PM' : 'AM'); }
        const live = when == 'Now', id = newPlanId();
        const ev = w.event && S.events.find(e => e.id == w.event && e.status === 'published');
        const cr = (w.carry || []).filter(c => !S.blocked.includes(c)).slice(0, w.size - 1);
        const planDay = linkedEvent && w.day && /^\d{4}-\d{2}-\d{2}$/.test(w.day)
            ? new Date(w.day + 'T00:00:00').toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' })
            : (w.day || 'Today');
        const plan = {
            id, creator: 'me', type: w.type, custom: w.type == 'custom' ? w.custom.trim() : null,
            title: ev ? `Anyone going to ${ev.title}?` : {
                garba: 'Garba gang, assemble', pandal: 'Pandal hop, no plans', bhandara: 'Anyone wanna go to this Bhandara?',
                food: 'Food run?', chai: 'Chai & yap?', photo: 'Photo walk, pics first', shopping: 'Shopping spree?',
                city: 'City explore', outside: 'Still out, still down', custom: (w.custom || '').trim()
            }[w.type],
            desc: w.desc.trim() || 'No plans, just vibes.', vibe: w.vibe, loc: w.loc,
            locLat: w.locLat != null && Number.isFinite(Number(w.locLat)) ? Number(w.locLat) : (LC[w.loc] ? LC[w.loc][0] : null),
            locLng: w.locLng != null && Number.isFinite(Number(w.locLng)) ? Number(w.locLng) : (LC[w.loc] ? LC[w.loc][1] : null),
            locSource: w.locSource || (LC[w.loc] ? 'supported-locality' : ''), locPlace: w.locPlace || '',
            city: w.locCity || cityOfLoc(w.loc) || S.me.city, when: live ? 'LIVE NOW' : when, live,
            max: Number(w.size), members: ['me', ...cr], who, reqs: [], status: 'open', day: planDay,
            auto: who !== 'Everyone' && w.mode == 'Auto-accept', from: w.from || null, event: w.event || null,
            spot: 'Pin goes to the squad in the group chat', created: Date.now()
        };
        try {
            const saved = await publishSharedPlan(plan);
            S.plans = (S.plans || []).filter(p => p.id !== id);
            S.plans.unshift(saved);
        } catch (e) {
            console.error('[plans] publish failed:', { stage: e && e.code, databaseCode: e && e.cause && e.cause.code, databaseMessage: e && e.cause && e.cause.message, details: e && e.cause && e.cause.details });
            const databaseCode = e && e.cause && e.cause.code;
            const databaseMessage = String(e && e.cause && e.cause.message || '');
            const msg = (databaseCode === '42703' || databaseCode === 'PGRST204' || /column .* does not exist|Could not find the .* column/i.test(databaseMessage))
                ? 'Squado database is missing required plan fields. An admin needs to apply the latest Supabase migrations.'
                : databaseCode === '42501' || /row-level security|permission denied/i.test(databaseMessage)
                ? 'Squado database permissions blocked publishing. Please sign in again; if it continues, contact an admin.'
                : databaseCode === '23503'
                ? 'Your account or linked Event is not synced yet. Refresh and try again.'
                : e && e.code === 'plan_host_membership_failed'
                ? 'Plan could not be completed because group membership setup failed. Please contact an admin.'
                : e && e.code === 'supabase_not_configured' ? 'Squado backend is not configured. This plan was not published.'
                : e && e.code === 'authentication_required' ? 'Sign in again before publishing a plan.'
                : e && e.code === 'profile_sync_failed' ? 'Could not save your profile to Squado. Please retry.'
                : e && e.code === 'plan_invalid' ? 'Some plan details are invalid. Check the location and squad size.'
                : 'Could not publish this plan to Squado. Check your connection and try again.';
            return toast(msg);
        }
        S.me.rel.hosted++;
        if (cr.length) sys(id, 'Squad carried over from the last stop 🔁');
        O.W = { type: '', vibe: [], loc: '', locLat: null, locLng: null, locSource: '', locPlace: '', when: '', size: 0, desc: '' };
        save(); confetti(); goHash('#/posted/' + id);
    },
    async postOut() {
        const o = O.os, mv = o.move.replace(/^\S+ /, ''), lb = mv == 'Custom' ? o.cname.trim() : mv, id = newPlanId(), who = o.who || 'Everyone';
        if (!capacityOk(Number(o.size))) return toast('Pick a squad size between ' + squadMin() + ' and ' + squadMax());
        const verifiedCustom = o.locSource === 'openstreetmap-nominatim' && o.locLat != null && o.locLng != null && Number.isFinite(Number(o.locLat)) && Number.isFinite(Number(o.locLng)) && isCity(o.locCity || S.me.city);
        const knownLocality = !!LC[o.loc] && cityOfLoc(o.loc) === S.me.city;
        if ((!verifiedCustom && !knownLocality) || !isCity(S.me.city))
            return toast(isCity(S.me.city) ? 'Choose a verified place from the map' : 'Choose your city from a map result first');
        if (!hostOk(who)) return toast(who + ' plans need a matching profile gender');
        const plan = {
            id, creator: 'me', type: 'outside', custom: 'Still out · ' + lb,
            title: ({ Chai: 'Chai & yap?', Food: 'Food run?', Garba: 'Anyone still dancing?', 'Pandal Hopping': 'Pandal hop, right now?', Photos: 'Photo walk, right now?', Walk: 'Walk & talk?', Explore: 'Let\'s explore' })[mv] || lb,
            desc: o.desc.trim() || 'Friends left. I\'m not done.', vibe: ['🫠 No plans, just vibes'], loc: o.loc,
            locLat: o.locLat != null && Number.isFinite(Number(o.locLat)) ? Number(o.locLat) : (LC[o.loc] ? LC[o.loc][0] : null),
            locLng: o.locLng != null && Number.isFinite(Number(o.locLng)) ? Number(o.locLng) : (LC[o.loc] ? LC[o.loc][1] : null),
            locSource: o.locSource || (LC[o.loc] ? 'supported-locality' : ''), locPlace: o.locPlace || '',
            city: o.locCity || cityOfLoc(o.loc) || S.me.city, when: 'LIVE NOW', live: true, max: Number(o.size),
            members: ['me'], who, reqs: [], status: 'open', day: o.day || 'Today', auto: false,
            event: null, spot: 'Pin goes to the squad in the group chat', created: Date.now()
        };
        try {
            const saved = await publishSharedPlan(plan);
            S.plans = (S.plans || []).filter(p => p.id !== id);
            S.plans.unshift(saved);
        } catch (e) {
            console.error('[plans] Still Outside publish failed:', e && e.code || e);
            const msg = e && e.code === 'supabase_not_configured' ? 'Squado backend is not configured. This plan was not published.'
                : e && e.code === 'authentication_required' ? 'Sign in again before publishing a plan.'
                : e && e.code === 'profile_sync_failed' ? 'Could not save your profile to Squado. Please retry.'
                : 'Could not publish this plan to Squado. Check your connection and try again.';
            return toast(msg);
        }
        S.me.rel.hosted++;
        O.os = { step: 0, move: '', size: 0, loc: '', locLat: null, locLng: null, locSource: '', locPlace: '', areaLat: null, areaLng: null, desc: '', cname: '' };
        save(); confetti(); goHash('#/posted/' + id);
    },
    join(e) {
        const p = pl(e.dataset.v), g = S.me.gender;
        if (!p)
            return toast('This plan is no longer available.');
        if ((p.who == 'Girls only' && g != 'Girl') || (p.who == 'Boys only' && g != 'Boy'))
            return toast('This one\'s ' + p.who.toLowerCase() + ' 🫶');
        modal(`\<h2 style="margin-top:0">Ask to join the squad 👀\</h2>\<p>\<b>${esc(p.title)}\</b>\<br>\<span class="mut">${esc(p.loc)} · ${p.live ? 'Live now' : p.when} · ${p.members.length} / ${p.max} people${p.who != 'Everyone' ? ' · ' + p.who : ''}\</span>\</p>\<p class="mut">${esc(usr(p.creator).name)} checks your profile, then accepts or passes.\</p>\<button class="btn pink wide" data-a="cjoin" data-v="${p.id}">Send request\</button>\<p style="text-align:center">\<button class="btn ghost sm" data-a="close">Nvm\</button>\</p>`);
    },
    cjoin(e) {
        const p = pl(e.dataset.v);
        const c = joinCheck(p);
        if (c != 'ok') {
            modal('');
            if (c == 'auth' || c == 'onboarding' || c == 'member')
                return;
            return toast(JOIN_MSG[c] ? JOIN_MSG[c](p) : 'This plan is no longer available.');
        }
        const r = memRequest(p, 'me');
        if (!r.ok) {
            modal('');
            return toast(JOIN_MSG[r.why] ? JOIN_MSG[r.why](p) : 'This plan is no longer available.');
        }
        if (r.state == 'accepted') {
            S.me.rel.joined++;
            sys(p.id, `${S.me.name} joined the squad 👋`);
            notify(p.creator, {
                type: 'member',
                ic: 'user-plus',
                c: 'green',
                t: `${S.me.name} joined your squad`,
                b: p.title,
                planId: p.id,
                userId: 'me'
            });
            save();
            confetti();
            return modal(`<div class="authst"><span class="okc">${I('check', '26px')}</span><h2>You're in 🎉</h2><p class="mut">This host auto-accepts. The GC is unlocked.</p></div><a class="btn pink wide" href="#/gc/${p.id}" data-a="close">Enter the GC</a>`);
        }
        notify(p.creator, {
            type: 'join_request',
            ic: 'user-plus',
            c: 'pink',
            t: `${S.me.name} wants to join your squad`,
            b: `${p.title} · tap to review`,
            planId: p.id,
            userId: 'me'
        });
        save();
        modal(`<h2 style="margin-top:0">Request sent ⏳</h2><p class="mut">You're not in yet. The host decides after seeing your profile.</p><button class="btn pink wide" data-a="close">Cool</button>`);
    },
    unreq(e) {
        const p = pl(e.dataset.v);
        if (!p || membership(p, 'me') != 'pending')
            return toast('That request is no longer there.');
        if (!memCancelRequest(p, 'me').ok)
            return toast('That request is no longer there.');
        resolveJoinNotifs(p.id, 'me');
        save();
    },
    accept(e) {
        const parts = (e.dataset.v || '').split('|');
        const p = pl(e.dataset.k || parts[0]);
        const u = e.dataset.k ? e.dataset.v : parts[1];
        if (!p || !idOk(u))
            return toast('This join request is no longer available.');
        const r = memApprove(p, u, 'me');
        if (!r.ok)
            return toast({
                admin: 'Only the host can approve requests.',
                closed: 'This plan is no longer open.',
                removed: 'This person was removed from the squad.',
                blocked: 'You blocked this person. Unblock them in Settings first.',
                full: 'Squad full 🔥 Free up a spot to approve this request.'
            }[r.why] || 'This join request is no longer available.');
        if (usr(u).rel)
            usr(u).rel.joined++;
        sys(p.id, `${usr(u).name} joined the squad 👋`);
        resolveJoinNotifs(p.id, u);
        notify(u, {
            type: 'join-approved',
            ic: 'party-popper',
            c: 'green',
            t: 'You\'re in!',
            b: `${S.me.name} accepted you for ${p.title}`,
            planId: p.id,
            userId: 'me'
        });
        if (p.members.length >= p.max) {
            sys(p.id, 'Squad full 🔥');
            confetti();
        }
        save();
        modal('');
        toast(usr(u).name + ' is in 🫡');
        render();
    },
    reject(e) {
        const parts = (e.dataset.v || '').split('|');
        const p = pl(e.dataset.k || parts[0]);
        const u = e.dataset.k ? e.dataset.v : parts[1];
        if (!p || !idOk(u))
            return toast('This join request is no longer available.');
        const r = memReject(p, u, 'me');
        if (!r.ok)
            return toast({
                admin: 'Only the host can decline requests.',
                closed: 'This plan is no longer open.'
            }[r.why] || 'This join request is no longer available.');
        resolveJoinNotifs(p.id, u);
        /* silent by design: the requester is not notified; they only see their own request status on the plan page */
        save();
        modal('');
        toast('Passed 🫶');
        render();
    },
    createPlanMode() {
        O.createMode = 'plan';
        render();
    },
    createEventMode() {
        if (!canManageEvents()) return toast('Only authorized Squado admins can create Events.');
        O.E = { id:'', title:'', category:'garba', info:'', date:'', endDate:'', startTime:'', endTime:'', loc:'', venue:'', ageGroup:'', capacity:'', visibility:'public', host:'', status:'draft' };
        O.createMode = 'event';
        render();
    },
    createChooser() {
        O.createMode = 'choose';
        render();
    },
    eventAdminInfo() {
        toast('Event creation is currently restricted to authorized Squado admins.');
    },
    eventEdit(e) {
        if (!canManageEvents()) return toast('Admin access required.');
        const ev = S.events.find(x => x.id === e.dataset.v);
        if (!ev) return toast('Event not found.');
        O.E = { id:ev.id, title:ev.title||'', category:ev.tag||'garba', info:ev.info||'', date:ev.dateISO||ev.date||'', endDate:ev.endDateISO||ev.endDate||ev.dateISO||ev.date||'', startTime:ev.startTime||'', endTime:ev.endTime||'', loc:ev.loc||'', venue:ev.venue||'', ageGroup:ev.ageGroup||'', capacity:ev.capacity||'', visibility:ev.visibility||'public', host:ev.host||'', status:ev.status||'published' };
        O.createMode = 'event';
        goHash('#/create');
    },
    eventDraft() { return saveEvent(false); },
    eventPublish() { return saveEvent(true); },
    eventCancel(e) {
        if (!canManageEvents()) return toast('Admin access required.');
        const ev = S.events.find(x => x.id === e.dataset.v);
        if (!ev) return toast('Event not found.');
        ev.status = 'cancelled';
        ev.cancelledAt = Date.now();
        notifyLinkedPlanMembers(ev, 'The parent Event was cancelled.', true);
        save();
        toast('Event cancelled.');
        render();
    },
    evPlan(e) {
        const ev = S.events.find(x => x.id == e.dataset.v && x.status === 'published');
        if (!ev) return toast('This Event is no longer available.');
        O.createMode = 'plan';
        O.W = {
            type: ev.tag || ev.category || 'garba',
            vibe: [],
            loc: ev.venue || ev.loc || '',
            when: 'Custom',
            time: ev.startTime || '19:00',
            size: 0,
            desc: `A Plan for ${ev.title}`,
            event: ev.id,
            day: ev.dateISO || 'Today',
            eventDate: ev.dateISO || ev.date || '',
            eventStartTime: ev.startTime || ''
        };
        goHash('#/create');
    },
    drop(e) {
        O.W.carry = O.W.carry.filter(c => c != e.dataset.v);
    },
    nextSheet(e) {
        const id = e.dataset.v;
        modal(`\<h2 style="margin-top:0">Next stop ➜\</h2>\<p class="mut">Keep the squad together. What's next?\</p>\<div class="opt">${['garba', 'chai', 'food', 'pandal', 'city', 'photo', 'bhandara', 'custom'].map(k => `\<button class="chip" data-a="nextGo" data-k="${id}" data-v="${k}">${T[k][0]} ${T[k][1]}\</button>`).join('')}\</div>`);
    },
    nextGo(e) {
        const p = pl(e.dataset.k), ty = e.dataset.v;
        O.W = {
            type: ty,
            vibe: [],
            loc: p.loc,
            when: 'Now',
            size: p.max,
            desc: '',
            carry: p.members.filter(m => m != 'me'),
            from: p.id
        };
        sys(p.id, `Next stop: ${T[ty][1]}`);
        save();
        modal('');
        goHash('#/create');
    },
    /* Permanent removal from THIS squad only: not a platform ban, no other squad is touched. The person keeps their
       history (messages, attendance, ratings stay as records) but loses access, and cannot ask to join this squad again. */
    remove(e) {
        const p = pl(e.dataset.k), m = e.dataset.v;
        if (!p || !idOk(m))
            return toast('That person isn\'t in this squad.');
        const r = memRemove(p, m, 'me');
        if (!r.ok)
            return toast({
                admin: 'Only the host can remove people.',
                host: 'The host can\'t be removed.'
            }[r.why] || 'That person isn\'t in this squad.');
        resolveJoinNotifs(p.id, m);
        sys(p.id, `${usr(m).name} was removed by the host`);
        notify(m, {
            type: 'removed',
            ic: 'user-minus',
            c: 'red',
            t: 'You were removed from a squad',
            b: p.title,
            planId: p.id,
            userId: 'me'
        });
        save();
        modal('');
        toast('Removed');
    },
    cancel(e) {
        const p = pl(e.dataset.v);
        if (!p || !isAdmin(p))
            return toast('Only the host can cancel this plan.');
        p.status = 'cancelled';
        S.me.rel.cancel++;
        sys(p.id, 'Plan cancelled by the host');
        p.members.filter(m => m != 'me').forEach(m => notify(m, {
            type: 'plan',
            ic: 'circle-x',
            c: 'red',
            t: 'Plan cancelled',
            b: `${S.me.name} cancelled ${p.title}`,
            planId: p.id,
            userId: 'me'
        }));
        save();
        modal('');
        toast('Plan cancelled');
        goHash('#/groups');
    },
    /* host confirms the meetup happened and ended. Host-only: the host's confirmation alone completes it (no attendee
       quorum), as long as no verified attendee has an open dispute. This never fabricates attendance records. */
    end(e) {
        const p = pl(e.dataset.v);
        const r = compHost(p);

        if (r == 'forbidden' || r == 'state')
            return;

        if (r == 'save')
            return toast('We couldn\'t save that. Please try again.');

        if (r == 'completed') {
            attFinish(p);
            confetti();
            fbEligible(p) ? fbStart(p.id) : modal('');
        }
        else {
            /* host-only completion: compHost returns 'completed' or 'disputed' (never 'pending').
               A verified attendee's open dispute keeps it open until they withdraw it. */
            modal('');
            toast('A verified attendee disputes this. It stays open.');
        }

        render();
    },
    fbOpen(e) {
        fbStart(e.dataset.v);
    },
    fbStar(e) {
        if (!O.fm || O.fm.busy)
            return;
        O.fm.rating = +e.dataset.v;
        O.fm.error = '';
        fbMeetupSheet(O.fm.id);
    },
    fbTag(e) {
        if (!O.fm || O.fm.busy)
            return;
        const t = e.dataset.v, i = O.fm.tags.indexOf(t);
        i < 0 ? O.fm.tags.push(t) : O.fm.tags.splice(i, 1);
        fbMeetupSheet(O.fm.id);
    },
    fbSubmit() {
        const f = O.fm;
        if (!f || f.busy || f.done)
            return;
        if (!f.rating) {
            f.error = FB_ERR.rating;
            return fbMeetupSheet(f.id);
        }
        f.busy = true;
        f.error = '';
        fbMeetupSheet(f.id);
        /* let the "Sending…" state paint before the work runs */
        setTimeout(async () => {
            const r = await fbSaveMeetup(pl(f.id), f);
            const open = O.fm === f && O.tok == f.tok;
            f.busy = false;
            if (r == 'ok') {
                f.done = true;
                delete S.fbLater[f.id];
                save();
            }
            else
                f.error = FB_ERR[r] || FB_ERR.save;
            if (open)
                fbMeetupSheet(f.id);
            else if (r == 'ok')
                toast('Thanks, feedback sent');
            render();
        }, 0);
    },
    fbLater(e) {
        S.fbLater[e.dataset.v] = Date.now() + 864e5;
        save();
        O.fm = null;
        modal('');
        toast('No problem, we\'ll ask again tomorrow');
        render();
    },
    fbPeople(e) {
        const p = pl(e.dataset.v);
        if (!fbEligible(p) || !fbUnreviewed(p).length)
            return toast('Nothing left to review for this plan.');
        O.fb = null;
        fbSheet(p.id);
    },
    /* step 1: choose (or un-choose) a person to review */
    fbPick(e) {
        const F = O.fb, m = e.dataset.v;
        if (!F || F.id != e.dataset.k || F.busy)
            return;
        const i = F.sel.indexOf(m);
        i < 0 ? F.sel.push(m) : F.sel.splice(i, 1);
        F.error = '';
        fbPickSheet(pl(F.id));
    },
    fbCont(e) {
        const F = O.fb;
        if (!F || F.id != e.dataset.v || F.busy)
            return;
        if (!F.sel.length) {
            F.error = FB_PERR.empty;
            return fbPickSheet(pl(F.id));
        }
        F.error = '';
        fbRateSheet(pl(F.id));
    },
    fbBack(e) {
        const F = O.fb;
        if (!F || F.busy)
            return;
        F.error = '';
        fbPickSheet(pl(F.id));
    },
    fbPStar(e) {
        const F = O.fb;
        if (!F || F.busy)
            return;
        const [id, m] = e.dataset.k.split('|');
        if (F.id != id || !F.sel.includes(m))
            return;
        F.d[m] = F.d[m] || { r: 0, t: [], c: '' };
        F.d[m].r = +e.dataset.v;
        F.error = '';
        fbRateSheet(pl(id));
    },
    fbTog(e) {
        const F = O.fb;
        if (!F || F.busy)
            return;
        const [id, m] = e.dataset.k.split('|'),
            x = F.d[m] = F.d[m] || { r: 0, t: [], c: '' },
            v = e.dataset.v,
            i = x.t.indexOf(v);
        i < 0 ? x.t.push(v) : x.t.splice(i, 1);
        fbRateSheet(pl(id));
    },
    fbSend(e) {
        const F = O.fb, p = pl(e.dataset.v);
        if (!F || F.busy || F.id != p.id)
            return;
        /* only the people still picked are sent */
        const d = {};
        F.sel.forEach(m => d[m] = F.d[m]);
        F.busy = true;
        F.error = '';
        fbRateSheet(p);
        /* let the "Sending…" state paint before the work runs */
        setTimeout(async () => {
            const r = await fbSavePeople(p, d);
            const open = O.fb === F && O.tok == F.tok;
            F.busy = false;
            if (r == 'ok') {
                O.fb = null;
                if (open)
                    modal('');
                toast('Thanks 🫶 Anonymous, totals only');
            }
            else {
                F.error = FB_PERR[r] || FB_PERR.save;
                if (open)
                    fbRateSheet(p);
            }
            render();
        }, 0);
    },
    edit() {
        const m = S.me;
        O.ed = {
            name: m.name,
            username: m.username,
            bio: m.bio || '',
            gender: m.gender,
            city: m.city,
            cityState: m.cityState || '',
            age: m.ageRange || '',
            photo: m.photo || '',
            interests: [...m.interests]
        };
        editSheet();
    },
    async saveEd() {
        const e = O.ed, u = (e.username || '').toLowerCase();
        /* validate synchronously BEFORE setting any flag or awaiting, so a failed check never leaves a pending state */
        if (!e.name.trim())
            return toast('Name can\'t be empty');
        if (unOk(u, S.me.username) != 'ok')
            return toast('Pick a free username');
        if (!isCity(e.city))
            return toast('Choose your city from a verified map result');

        const configured = typeof supabaseConfigured === 'function' && supabaseConfigured();
        let photoVal = e.photo;

        /* a fresh pick is a data: URL and must be uploaded; an existing http(s) URL is kept as-is */
        if (configured && typeof e.photo === 'string' && /^data:/.test(e.photo)) {
            /* set the pending flag SYNCHRONOUSLY before the first await: the click dispatcher renders right
               after saveEd returns (saveEd is NOT in the events.js exclusion list), painting the pending Save */
            O.ed.uploading = true;

            try {
                photoVal = await uploadAvatar(e.photo);
            }
            catch (x) {
                O.ed.uploading = false;
                render();
                return toast('Couldn\'t upload your photo — try again');
            }
        }

        O.ed.uploading = false;
        Object.assign(S.me, {
            name: e.name.trim(),
            username: u,
            bio: e.bio.trim(),
            gender: e.gender,
            ageRange: e.age,
            city: e.city,
            cityState: e.cityState || '',
            photo: photoVal,
            interests: e.interests
        });
        if (e.city) S.discoveryCity = e.city;
        save();
        modal('');
        render();
        toast('Profile updated ✨');
    },
    close() {
        modal('');
    },
    attachments(e) {
        O.media = null;
        modal(mediaSheet(e.dataset.v));
    },
    send(id) {
        const i = $('#mi'),
            x = (i && i.value || O.chat.draft || '').trim().slice(0, chatMaxLen());
        if (!x || !idOk(id) || !groupAccess(pl(id)))
            return;
        O.chat.draft = '';
        msgs(id).push({
            by: 'me',
            x,
            t: hm()
        });
        save();
        render();
        scrollTo(0, 1e6);
        const mi = $('#mi');
        mi && mi.focus();
        const o = pl(id).members.filter(m => m != 'me' && !S.blocked.includes(m) && !usr(m).real);
        const sid = O.sess;
        if (o.length)
            setTimeout(() => {
                /* the sample reply belongs to the session that sent the message: never into a signed-out or different account */
                if (O.sess !== sid || !groupAccess(pl(id)))
                    return;
                const by = o[Math.random() * o.length | 0];
                msgs(id).push({
                    by,
                    x: ['I\'m down 🕺', 'omw 😭', 'Where exactly?', 'Full send 🔥', 'Save me a spot!'][Math.random() * 5 | 0],
                    t: hm()
                });
                save();
                if (location.hash == '#/gc/' + id) {
                    render();
                    scrollTo(0, 1e6);
                }
                else {
                    unreadBump(id);
                    save();
                    render();
                }
            }, 1300);
    },
    async sendMedia(e) {
        const id = e.dataset.k;
        const m = O.media;
        const p = pl(id);
        if (!m || m.id != id || !p || !groupAccess(p))
            return;
        const message = {
            by: 'me',
            type: m.type == 'photo' && m.loc ? 'photo-location' : m.type,
            t: hm()
        };
        const configured = typeof supabaseConfigured === 'function' && supabaseConfigured();

        /* configured: upload the attachment to the private bucket BEFORE posting; store the signed URL + durable
           path. On failure nothing is pushed, so the sheet stays open for a retry. Unconfigured: keep the dataURL. */
        if (configured && m.src && /^data:/.test(m.src)) {
            let up;

            try {
                up = await uploadChatMedia(id, m);
            }
            catch (x) {
                return toast('Couldn\'t send the photo — try again');
            }

            message.src = up.url;
            message.mpath = up.path;
        }
        else if (m.src)
            message.src = m.src;

        if (m.loc)
            message.loc = m.loc;
        msgs(id).push(message);
        O.media = null;
        save();
        modal('');
        render();
        scrollTo(0, 1e6);
    },
    /* re-mint signed URLs for private chat media when a squad chat is (re)opened: signed URLs expire, mpath is durable */
    async refreshChatMedia(planId) {
        if (!(typeof supabaseConfigured === 'function' && supabaseConfigured()))
            return;
        const list = msgs(planId);
        if (!list)
            return;
        for (const m of list) {
            if (!m || !m.mpath)
                continue;
            try {
                m.src = await signChatMedia(m.mpath);
            }
            catch (x) {
                /* leave the existing src untouched on a per-message failure */
            }
        }
        render();
    },
    react(e) {
        if (!groupAccess(pl(e.dataset.k)))
            return;
        const m = msgs(e.dataset.k)[+e.dataset.v],
            c = ['🔥', '🕺', '😭', ''];
        if (!m || m.sys)
            return;
        const i = c.indexOf(m.r || '');
        m.r = c[(i + 1) % 4];
        save();
        render();
    },
    members(e) {
        const p = pl(e.dataset.v);
        if (!groupAccess(p))
            return toast('Only squad members can see the squad.');
        const h = isAdmin(p);
        modal(`<h2 style="margin-top:0">The squad ${p.members.length} / ${p.max}</h2>${p.members.map(m => `<div class="li">${av(m, 36)}<b style="flex:1">${esc(usr(m).name)}${m == p.creator ? ' 👑' : ''}${S.blocked.includes(m) ? ' <span class="mut">· blocked</span>' : ''}</b>${m != 'me' && !S.blocked.includes(m) ? `<button class="btn ghost sm" data-a="user" data-v="${m}">View</button><button class="btn ghost sm" data-a="report" data-k="user" data-v="${m}" data-plan="${p.id}">${I('flag')} Report</button>` : ''}</div>`).join('')}<div class="row">${h ? '' : `<button class="btn ghost sm" data-a="ask" data-do="leave" data-v="${p.id}">${I('log-out')} Leave squad</button>`}<button class="btn ghost sm" data-a="report" data-k="plan" data-v="${p.id}">${I('flag')} Report plan</button>${h && p.status == 'open' ? `<button class="btn sm" data-a="ask" data-do="end" data-v="${p.id}">Confirm it ended</button><button class="btn ghost sm" data-a="ask" data-do="cancel" data-v="${p.id}">${I('circle-x')} Cancel plan</button>` : ''}</div>`);
    },
    /* Voluntary departure: recorded as p.left (they may ask to join again, like anyone new); never as removal. */
    leave(e) {
        const p = pl(e.dataset.v);
        if (!p || !groupAccess(p))
            return toast('You\'re not in this squad.');
        if (isAdmin(p))
            return toast('Hosts can\'t leave their own plan. Cancel it instead.');
        const r = memLeave(p, 'me');
        if (!r.ok)
            return toast('You\'re not in this squad.');
        /* leaving by choice is not a cancellation: the reliability counter (rel.cancel) is for hosts cancelling a plan */
        sys(p.id, `${S.me.name} left. Bro escaped 💀`);
        notify(p.creator, {
            type: 'member',
            ic: 'user-minus',
            c: 'pink',
            t: `${S.me.name} left your squad`,
            b: p.title,
            planId: p.id,
            userId: 'me'
        });
        save();
        modal('');
        toast('You escaped successfully 💀');
        goHash('#/groups');
    },
    user(e) {
        if (!canViewProfile(e.dataset.v))
            return toast('That profile isn\'t available.');
        modal(profileSheet(e.dataset.v));
    },
    async block(e) {
        const id = e.dataset.v;
        if (!idOk(id) || id == 'me' || !S.users.some(u => u.id == id || u.sub == id))
            return toast('That person isn\'t available.');
        if (S.blocked.includes(id)) return toast('This person is already blocked.');
        try {
            let blockId = id;
            if (typeof supabaseConfigured === 'function' && supabaseConfigured() && !S.me.guest) {
                const savedBlock = await setSharedBlock(id, true);
                if (savedBlock && savedBlock.targetUid) blockId = savedBlock.targetUid;
            }
            if (!S.blocked.includes(blockId)) S.blocked.push(blockId);
            save(); modal(''); toast(usr(id).name + ' blocked'); render();
        } catch (err) {
            console.warn('[blocks] save failed:', err && err.code || err);
            toast('Could not save this block to your account. Check your connection and try again.');
        }
    },
    async unblock(e) {
        const id = e.dataset.v;
        try {
            if (typeof supabaseConfigured === 'function' && supabaseConfigured() && !S.me.guest)
                await setSharedBlock(id, false);
            S.blocked = S.blocked.filter(b => b != id);
            save();
            if (document.querySelector('#modal .blocked-users-dialog')) modal(blockedUsersOverlay());
            else render();
        } catch (err) {
            console.warn('[blocks] remove failed:', err && err.code || err);
            toast('Could not update your block list. Please try again.');
        }
    },
    blockedList() {
        modal(blockedUsersOverlay());
    },
    report(e) {
        const kind = e.dataset.k || 'plan';
        const targetId = e.dataset.v || '';
        if (kind === 'user' && (!targetId || targetId === 'me' || !S.users.some(u => u.id === targetId)))
            return toast('That person is not available to report.');
        O.rep = {
            k: kind,
            id: targetId,
            planId: e.dataset.plan || (kind === 'plan' ? targetId : ''),
            targetUserId: kind === 'user' ? targetId : '',
            targetName: kind === 'user' ? usr(targetId).name : '',
            reporterId: S.acct || S.me.id || 'me',
            reporterName: S.me.name || 'Squado user'
        };
        const label = kind === 'user' ? `user ${esc(usr(targetId).name)}` : kind === 'plan' ? 'Plan' : esc(kind);
        modal(`<h2 style="margin-top:0">Report ${label}</h2><p class="mut">Reports are reviewed by the Squado safety team. Only share details relevant to the incident.</p>${['Fake or spam', 'Made me uncomfortable', 'Inappropriate', 'Unsafe plan or place', 'Underage or lying about age', 'Harassment or bullying', 'Something else'].map((r, i) => `<label class="r"><input type="radio" name="rr" value="${r}" ${i ? '' : 'checked'}>${r}</label>`).join('')}<label class="field-label" for="reportDetails">Additional details (optional)</label><textarea id="reportDetails" rows="3" maxlength="1000" placeholder="What happened? Include relevant context, not passwords or private information."></textarea><button class="btn pink wide" data-a="submitRep">Send report</button>`);
    },
    async submitRep() {
        const selected = document.querySelector('input[name=rr]:checked');
        const x = O.rep;
        if (!x || !selected) return toast('Choose a report reason first.');
        const details = (document.querySelector('#reportDetails')?.value || '').trim();
        const cfg = window.SQUADO_CONFIG || {};
        const apiBase = String(cfg.apiBaseUrl || '').replace(/\/$/, '');
        if (apiBase && typeof supabaseConfigured === 'function' && supabaseConfigured()) {
            const accessToken = await supabaseAccessToken();
            if (!accessToken) return toast('Please sign in again before submitting a report.');
            const targetRecord = x.k === 'user' ? S.users.find(u => u.id === x.targetUserId) : null;
            const targetUid = targetRecord && targetRecord.sub && /^[0-9a-f-]{36}$/i.test(targetRecord.sub) ? targetRecord.sub : null;
            try {
                const response = await fetch(apiBase + '/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken }, body: JSON.stringify({ target_type: x.k === 'plan' ? 'plan' : x.k === 'user' ? 'user' : 'other', target_uid: targetUid, target_reference: x.targetUserId || x.id || '', target_label: x.targetName || (x.k === 'plan' ? ((S.plans.find(p => p.id === x.id) || {}).title || x.id) : x.k), plan_id: x.planId || null, reason: selected.value, details }) });
                if (!response.ok) throw new Error('report_api_failed');
                modal('');
                toast('Report submitted to the Squado safety team.');
                return;
            } catch (_) {
                return toast('Report could not reach Squado safety. Please try again when your connection is available.');
            }
        }
        const reportId = 'rep-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        S.reports = S.reports || [];
        S.reports.unshift({
            reportId,
            ...x,
            r: selected.value,
            details: details.slice(0, 1000),
            status: 'new',
            at: Date.now(),
            updatedAt: Date.now()
        });
        if (x.k == 'plan') {
            const targetPlan = S.plans.find(p => p.id === x.id);
            if (targetPlan) targetPlan.review = true;
        }
        save();
        modal('');
        toast('Report saved on this device only. It will not reach the admin team until the backend is configured.');
        render();
    },
    adminReports() {
        if (!canManageEvents()) return toast('Admin access required.');
        const reports = [...(S.reports || [])].sort((a,b) => (b.at || 0) - (a.at || 0));
        modal(`<h2 style="margin-top:0">Safety report inbox</h2><p class="mut">Reports recorded on this device. For shared, multi-admin moderation, reports must be stored by the backend.</p>${reports.length ? reports.map(r => {
            const target = r.k === 'user' ? `User: ${esc(r.targetName || usr(r.targetUserId).name || r.targetUserId || 'Unknown')}` : r.k === 'plan' ? `Plan: ${esc((S.plans.find(p => p.id === r.id) || {}).title || r.id || 'Unknown')}` : esc(r.k || 'Report');
            const status = r.status || 'new';
            return `<article class="card" style="margin:10px 0"><div class="row" style="justify-content:space-between;align-items:flex-start"><b>${target}</b><span class="pill">${esc(status.toUpperCase())}</span></div><p style="margin:8px 0"><b>Reason:</b> ${esc(r.r || 'Not specified')}</p>${r.details ? `<p style="white-space:pre-wrap">${esc(r.details)}</p>` : '<p class="mut">No additional details provided.</p>'}<p class="mut" style="font-size:.82rem">Reported by ${esc(r.reporterName || 'User')} · Account: ${esc(r.reporterId || 'not available')} · ${new Date(r.at || Date.now()).toLocaleString()}${r.planId ? ` · Group/Plan ${esc(r.planId)}` : ''}</p>${r.targetUserId ? `<p class="mut" style="font-size:.82rem">Target account ID: ${esc(r.targetUserId)}</p>` : ''}<div class="row"><button class="btn ghost sm" data-a="reportStatus" data-v="${esc(r.reportId || '')}" data-status="reviewing">Mark reviewing</button><button class="btn pink sm" data-a="reportStatus" data-v="${esc(r.reportId || '')}" data-status="reviewed">Mark reviewed</button></div></article>`;
        }).join('') : '<p class="mut">No reports have been submitted on this device.</p>'}<button class="btn ghost wide" data-a="close">Close inbox</button>`);
    },
    reportStatus(e) {
        if (!canManageEvents()) return toast('Admin access required.');
        const report = (S.reports || []).find(r => r.reportId === e.dataset.v);
        if (!report) return toast('Report not found.');
        report.status = ['new','reviewing','reviewed'].includes(e.dataset.status) ? e.dataset.status : 'reviewing';
        report.updatedAt = Date.now();
        report.reviewedBy = S.me.email || S.me.sub || 'admin';
        save();
        this.adminReports();
    },
    notif() {
        S.notif = !S.notif;
        save();
    },
    theme() {
        const d = document.documentElement,
            t = d.dataset.theme == 'dark' ? 'light' : 'dark';
        d.dataset.theme = t;
        try {
            localStorage.setItem('squado-theme', t);
        }
        catch (e) { }
    },
    logout() {
        signOutUser();
    }
};
Object.assign(A, attActions);
/* ---- frontend-only extensions (confirmations, notifications, loading states) ---- */
A.ask = e => {
    if (!hasOwn(CONF, e.dataset.do))
        return;
    O.confirm = {
        do: e.dataset.do,
        k: e.dataset.k,
        v: e.dataset.v
    };
    confirmSheet();
};
A.confirmed = () => {
    const c = O.confirm;
    modal('');
    O.confirm = null;
    if (!c || !hasOwn(CONF, c.do))
        return;
    const sid = O.sess;
    setTimeout(() => O.sess === sid && A[c.do]({
        dataset: {
            k: c.k,
            v: c.v
        }
    }), 120);
};
A.notifs = () => {
    modal(notifSheet());
    myNotifs().forEach(n => n.u = 0);
    save();
};
A.notifGo = e => {
    const n = myNotifs().find(x => x.id == e.dataset.v);
    const r = n ? notifView(n).route : '';
    modal('');
    if (!r)
        return toast('That one is no longer available.');
    if (location.hash == r)
        render();
    else
        goHash(r);
};
{
    const _c = A.cjoin;
    A.cjoin = e => {
        modal(`\<div class="authst">\<span class="spin">\</span>\<h2>Sending your request…\</h2>\<p class="mut">Letting the host know\</p>\</div>`);
        setTimeout(() => _c(e), 700);
    };
}
{
    const _p = A.post;
    A.post = e => {
        if (O.posting)
            return;
        const m = postMissing();
        if (m)
            return toast('Pick ' + m + ' first');
        O.posting = true;
        render();
        setTimeout(() => {
            O.posting = false;
            _p(e);
        }, 650);
    };
}
A.gopts = e => modal(groupOptions(e.dataset.v));
/* Group Info is role-aware:
     host           -> groupInfoHost: important details + host-only attendance scanner entry point
     accepted member-> groupInfo: the simpler, important-details-only sheet (restored)
   Both are modal sheets, so closing them returns the host/member to the same conversation.
   The 'ginfo' guard (RULES: ['group','v']) already blocks pending/rejected/left/removed/guests. */
A.ginfo = e => {
    const p = idOk(e.dataset.v) ? pl(e.dataset.v) : null;

    if (!p)
        return;

    modal(isAdmin(p) ? groupInfoHost(p.id) : groupInfo(p.id));
};
A.goPlan = e => {
    modal('');
    if (idOk(e.dataset.v))
        goHash('#/plan/' + e.dataset.v);
};
A.goBack = () => {
    let trail = [];
    try { trail = JSON.parse(sessionStorage.getItem('squado-route-trail-v1') || '[]'); } catch (e) { }
    const current = location.hash || '#/home';
    if (!Array.isArray(trail)) trail = [];
    const idx = trail.lastIndexOf(current);
    const previous = idx > 0 ? trail[idx - 1] : (trail.length > 1 ? trail[trail.length - 2] : '');
    if (previous && /^#\//.test(previous) && previous !== current) {
        /* Navigate to the known in-app predecessor; do not trust unrelated browser history entries. */
        trail = trail.slice(0, Math.max(1, idx));
        try { sessionStorage.setItem('squado-route-trail-v1', JSON.stringify(trail)); } catch (e) { }
        goHash(previous);
        return;
    }
    if (typeof history.back == 'function' && history.length > 1) history.back();
    else goHash('#/home');
};
A.reviewRequest = e => reviewRequest(e);
A.openMediaCamera = e => openMediaCamera(e);
A.capturePhoto = e => capturePhoto(e);
A.mediaRetry = e => mediaRetry(e);
A.attachLocation = e => attachLocation(e);
A.openMediaLocation = e => openMediaLocation(e);
A.detachLocation = e => detachLocation(e);