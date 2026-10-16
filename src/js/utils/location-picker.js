/* Nationwide place search via OpenStreetMap Nominatim. Free text is never accepted as a
   location until the user chooses a returned map result. Use politely: no autocomplete,
   throttle searches, cache recent selections locally, and attribute OpenStreetMap. */
const LOCATION_SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const LOCATION_REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const LOCATION_SEARCH_ATTRIBUTION = 'Location data © OpenStreetMap contributors';
const LOCATION_RECENTS_KEY = 'squado.locationRecents.v1';
let lastLocationSearchAt = 0;
const locationUiIcon = (name, size, fallback = '') => typeof I === 'function' ? I(name, size) : fallback;

const distanceKm = (a, b) => {
    const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    const q = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(Math.min(1, q)));
};
const addressCity = address => String(address.city || address.town || address.municipality || address.village || address.county || address.state_district || '').trim();
const addressArea = (a, city) => String(a.neighbourhood || a.suburb || a.quarter || a.city_district || a.residential || a.hamlet || a.village || a.town || a.city || city || '').trim();
const isIndiaResult = row => {
    const a = row && row.address || {};
    return String(a.country_code || '').toLowerCase() === 'in' || String(a.country || '').toLowerCase() === 'india';
};
const normalizeGeocodedPlace = row => {
    const lat = Number(row && row.lat), lng = Number(row && row.lon), a = row && row.address || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !isIndiaResult(row)) return null;
    const city = addressCity(a);
    const state = String(a.state || '').trim();
    const area = addressArea(a, city);
    const displayName = String(row.display_name || '').trim();
    if (!city || !displayName || !area) return null;
    return { label: area.toLowerCase() === city.toLowerCase() ? city : `${area}, ${city}`, displayName, city, state,
        lat, lng, source: 'openstreetmap-nominatim', osmType: String(row.type || ''), osmId: String(row.osm_id || '') };
};
const citySearchKey = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/* Small Damerau-Levenshtein distance catches common transpositions such as Dehli → Delhi. */
const cityEditDistance = (left, right) => {
    const a = citySearchKey(left), b = citySearchKey(right);
    if (!a || !b) return Math.max(a.length, b.length);
    const d = Array.from({ length: a.length + 1 }, (_, i) => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) d[i][0] = i;
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
    }
    return d[a.length][b.length];
};
const cityNameMatchesQuery = (name, requested) => {
    const n = citySearchKey(name), q = citySearchKey(requested);
    if (!n || !q) return false;
    if (n === q || n.startsWith(q) || q.startsWith(n)) return true;
    const maxDistance = Math.max(n.length, q.length) <= 5 ? 1 : 2;
    return cityEditDistance(n, q) <= maxDistance;
};
/* Delhi is indexed by OpenStreetMap as both Delhi and New Delhi depending on
   the feature/address level. Treat those labels as the same selected city. */
const cityAliases = name => {
    const key = citySearchKey(name);
    if (['delhi', 'new delhi', 'nct of delhi', 'national capital territory of delhi'].includes(key))
        return ['delhi', 'new delhi', 'nct of delhi', 'national capital territory of delhi'];
    if (['gurgaon', 'gurugram'].includes(key)) return ['gurgaon', 'gurugram'];
    if (['bangalore', 'bengaluru'].includes(key)) return ['bangalore', 'bengaluru'];
    if (['bombay', 'mumbai'].includes(key)) return ['bombay', 'mumbai'];
    if (['madras', 'chennai'].includes(key)) return ['madras', 'chennai'];
    if (['calcutta', 'kolkata'].includes(key)) return ['calcutta', 'kolkata'];
    return [key];
};
const sameCity = (left, right) => {
    const a = cityAliases(left), b = cityAliases(right);
    return a.some(x => b.includes(x));
};
const placeMatchesCity = (row, place, selectedCity) => {
    if (!selectedCity) return true;
    const a = row && row.address || {};
    const fields = [place && place.city, a.city, a.town, a.municipality, a.city_district,
        a.state_district, a.county, a.suburb, a.borough, a.state].filter(Boolean);
    return fields.some(value => sameCity(value, selectedCity));
};
/* Default location accepts city/town/municipality results only. Search providers can
   index major cities such as Delhi as administrative boundaries, so accept a boundary
   only when its own name closely matches the requested city (including small typos). */
const normalizeGeocodedCity = (row, requestedName = '') => {
    const a = row && row.address || {};
    const type = String(row && row.type || '').toLowerCase();
    const cls = String(row && row.class || '').toLowerCase();
    const lat = Number(row && row.lat), lng = Number(row && row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !isIndiaResult(row)) return null;
    const addressPlace = String(a.city || a.town || a.municipality || '').trim();
    const resultName = String(row && (row.name || row.namedetails && row.namedetails.name) || '').trim();
    const displayFirst = String(row && row.display_name || '').split(',')[0].trim();
    const requested = String(requestedName || '').trim();
    const cityLevelType = ['city', 'town', 'municipality'].includes(type) && (cls === 'place' || cls === 'boundary' || !cls);
    const candidates = [resultName, addressPlace, displayFirst].filter(Boolean);
    const matchedCandidate = candidates.find(name => cityNameMatchesQuery(name, requested));
    const administrativeCity = ['boundary', 'place'].includes(cls) && ['administrative', 'city', 'town'].includes(type) && Boolean(matchedCandidate);
    const city = cityLevelType ? (addressPlace || resultName || displayFirst) : (administrativeCity ? matchedCandidate : '');
    const state = String(a.state || '').trim();
    if (!city || !state) return null;
    return { label: city, displayName: [city, state, 'India'].filter(Boolean).join(', '), city, state,
        lat, lng, source: 'openstreetmap-nominatim', osmType: type, osmId: String(row.osm_id || '') };
};
const normalizePhotonCity = (feature, requestedName = '') => {
    const p = feature && feature.properties || {}, coords = feature && feature.geometry && feature.geometry.coordinates || [];
    const lat = Number(coords[1]), lng = Number(coords[0]);
    const type = String(p.type || p.osm_value || '').toLowerCase();
    const name = String(p.name || p.city || '').trim();
    const countryCode = String(p.countrycode || '').toLowerCase();
    const state = String(p.state || p.county || '').trim();
    if (countryCode !== 'in' || !name || !state || !Number.isFinite(lat) || !Number.isFinite(lng) ||
        Math.abs(lat) > 90 || Math.abs(lng) > 180 || !['city', 'town', 'municipality', 'administrative'].includes(type) ||
        (type === 'administrative' && !cityNameMatchesQuery(name, requestedName))) return null;
    return { label: name, displayName: [name, state, 'India'].join(', '), city: name, state, lat, lng,
        source: 'openstreetmap-nominatim', osmType: type, osmId: String(p.osm_id || '') };
};

const getLocationRecents = () => {
    try { const v = JSON.parse(localStorage.getItem(LOCATION_RECENTS_KEY) || '[]'); return Array.isArray(v) ? v.filter(x => x && x.source === 'openstreetmap-nominatim' && Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lng))).slice(0, 6) : []; }
    catch (_) { return []; }
};
const rememberLocation = place => {
    try {
        const all = [place, ...getLocationRecents().filter(x => !(x.lat === place.lat && x.lng === place.lng))].slice(0, 8);
        localStorage.setItem(LOCATION_RECENTS_KEY, JSON.stringify(all));
    } catch (_) { /* Private browsing/storage-disabled: picker still works. */ }
};
const currentCityContext = () => { const target = O.locPicker && O.locPicker.target; if (target === 'ob.city') return String((O.ob && O.ob.city) || O.detectedCity || '').trim(); if (target === 'ed.city') return String((O.ed && O.ed.city) || S.me.city || O.detectedCity || '').trim(); return String((S.me && S.me.city) || S.discoveryCity || O.detectedCity || '').trim(); };
const suggestedTermsForCity = city => {
    const known = cityByName(city);
    if (known) {
        const names = Object.keys(known.localities);
        if (Array.isArray(S.geo) && S.geo.length === 2 && String(S.discoveryCity || '').toLowerCase() === String(city || '').toLowerCase()) {
            return names.sort((a, b) => distanceKm(S.geo, known.localities[a]) - distanceKm(S.geo, known.localities[b])).slice(0, 6);
        }
        return names.slice(0, 6);
    }
    /* Never present generic categories as if they were actual nearby places.
       Cities without a bundled directory can use recent selections or map search. */
    return [];
};

/* Compact place suggestions used directly in Create and Still Outside. Suggestions are
   always scoped to the profile city; GPS only changes ordering when it belongs to that city. */
function quickLocationSuggestions(target) {
    const city = String((S.me && S.me.city) || S.discoveryCity || '').trim();
    const cityKey = city.toLowerCase();
    const recent = getLocationRecents().filter(r => !city || String(r.city || '').toLowerCase() === cityKey);
    const known = cityByName(city);
    let terms = known ? Object.entries(known.localities).map(([name, coords]) => ({
        kind: 'directory', name, coords, city: known.name, state: known.state
    })) : [];
    const gpsIsInCity = Array.isArray(S.geo) && S.geo.length === 2 &&
        String(S.discoveryCity || '').toLowerCase() === cityKey;
    if (gpsIsInCity && known) terms.sort((a, b) => distanceKm(S.geo, a.coords) - distanceKm(S.geo, b.coords));
    const items = [
        ...recent.slice(0, 3).map(place => ({ kind: 'recent', place, name: place.label, sub: [place.city, place.state].filter(Boolean).join(', ') })),
        ...terms.filter(t => !recent.some(r => String(r.label || '').toLowerCase().startsWith(t.name.toLowerCase())))
            .slice(0, Math.max(0, 6 - Math.min(3, recent.length)))
            .map(t => ({ ...t, sub: `In ${city}` }))
    ].slice(0, 6);
    O.quickLocationItems = items.map(x => ({ ...x, target }));
    if (!items.length) return `<section class="location-suggestions location-suggestions--inline"><div class="location-suggestions__heading"><b>Nearby suggestions</b><small>${esc(city || 'Your selected city')}</small></div><p class="mut location-flow-hint">Your saved places will appear here. Use “Choose your area” to search for a place in this city.</p></section>`;
    return `<section class="location-suggestions location-suggestions--inline"><div class="location-suggestions__heading"><b>Nearby suggestions</b><small>${esc(city || 'Your selected city')}${gpsIsInCity ? ' · sorted near you' : ''}</small></div><div class="location-suggestion-list">${items.map((x, i) => `<button type="button" class="location-suggestion" data-a="locationQuick" data-v="${i}"><span>${locationUiIcon(x.kind === 'recent' ? 'history' : 'map-pin', '1.05em', x.kind === 'recent' ? '↺' : '⌖')}</span><span><b>${esc(x.name)}</b><small>${esc(x.sub || '')}</small></span></button>`).join('')}</div></section>`;
}
function chooseQuickLocation(e) {
    const item = O.quickLocationItems && O.quickLocationItems[Number(e.dataset.v)];
    if (!item) return toast('Please choose a location suggestion again.');
    if (item.kind === 'recent' && item.place) { applyVerifiedLocation(item.place, item.target); return; }
    if (item.kind === 'directory' && item.coords && item.city) {
        const place = {
            label: item.name, displayName: `${item.name}, ${item.city}, ${item.state}, India`,
            city: item.city, state: item.state, lat: Number(item.coords[0]), lng: Number(item.coords[1]),
            source: 'squado-city-directory'
        };
        applyVerifiedLocation(place, item.target);
        return;
    }
    /* Suggestions must apply immediately. Never open the search sheet from a suggestion tap. */
    toast('This suggestion is unavailable. Use “Choose your area” to search the map.');
}

function locationPickerSheet() {
    const p = O.locPicker || { query: '', results: [], loading: false, error: '', target: 'W.loc' };
    const city = currentCityContext();
    const isCitySelection = p.target === 'ob.city' || p.target === 'ed.city';
    const results = (p.results || []).map((r, i) => `
        <article class="location-result">
          <div class="location-result__copy"><b>${esc(isCitySelection ? r.city : r.label)}</b><p class="mut">${esc(isCitySelection ? [r.state, 'India'].filter(Boolean).join(', ') : r.displayName)}</p><small>${esc(isCitySelection ? 'City' : [r.city, r.state].filter(Boolean).join(', '))} · Map result</small></div>
          <div class="location-result__actions"><button class="btn pink sm" data-a="locationChoose" data-v="${i}">${isCitySelection ? 'Select city' : 'Use this place'}</button>${isCitySelection ? '' : `<a class="btn ghost sm" target="_blank" rel="noopener noreferrer" href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(r.lat)}&mlon=${encodeURIComponent(r.lng)}#map=16/${encodeURIComponent(r.lat)}/${encodeURIComponent(r.lng)}">View map</a>`}</div>
        </article>`).join('');
    const recents = isCitySelection ? [] : getLocationRecents().filter(r => !city || String(r.city || '').toLowerCase() === city.toLowerCase());
    const recentHtml = recents.length ? `<section class="location-suggestions"><b>Recently selected</b><div class="location-suggestion-list">${recents.map((r,i)=>`<button class="location-suggestion" data-a="locationRecent" data-v="${i}"><span>${locationUiIcon('history', '1.05em', '↺')}</span><span><b>${esc(r.label)}</b><small>${esc([r.city,r.state].filter(Boolean).join(', '))}</small></span></button>`).join('')}</div></section>` : '';
    const terms = isCitySelection ? [] : suggestedTermsForCity(city);
    const termsHtml = terms.length ? `<section class="location-suggestions"><b>${city ? (Array.isArray(S.geo) && String(S.discoveryCity || '').toLowerCase() === city.toLowerCase() ? `Suggested near you in ${esc(city)}` : `Suggested places in ${esc(city)}`) : 'Choose a city first'}</b><div class="location-suggestion-list">${terms.map(t=>`<button class="location-suggestion" data-a="locationTerm" data-v="${esc(t)}"><span>${locationUiIcon('search', '1.05em', '⌕')}</span><span><b>${esc(t)}</b><small>Search these places</small></span></button>`).join('')}</div></section>` : '';
    return `
      <div class="location-picker">
        <div class="location-picker__header"><span class="location-picker__eyebrow">LOCATION</span><h2>${isCitySelection ? 'Choose your city' : 'Find your place'}</h2><p class="mut">${isCitySelection ? 'Search and select a city in India. Local areas and landmarks are not accepted here.' : `Choose a nearby suggestion or search for a place in ${esc(city || 'your selected city')}.`}</p></div>
        <form data-a="locationSearchForm" onsubmit="return false" class="location-search-form">
          <label for="location-query" class="field-label">${isCitySelection ? 'City name' : 'Place, landmark or locality'}</label>
          <div class="location-search-control"><span class="location-search-icon" aria-hidden="true">${locationUiIcon("search", "1.05em", "⌕")}</span><input id="location-query" class="location-query-input" type="search" data-in="locPicker.query" value="${esc(p.query || '')}" placeholder="${esc(isCitySelection ? 'Search city name' : `Search places in ${city || 'your city'}`)}" autocomplete="off" maxlength="120"><button class="location-search-submit" type="button" data-a="locationSearch" ${p.loading ? 'disabled' : ''} aria-label="Search map">${p.loading ? '…' : 'Search'}</button></div>
          <p class="location-search-hint">${isCitySelection ? 'Only city names are saved as your default location.' : 'Search text is not saved as a location until you select a map result.'}</p>
        </form>
        <div class="location-search-actions"><button class="btn ghost sm" data-a="geoPick" data-k="${esc(p.target || 'W.loc')}">${locationUiIcon("map-pin", "1em", "⌖")} Use my live location</button><button class="btn ghost sm" data-a="close">Cancel</button></div>
        ${p.error ? `<p role="alert" class="location-error">${esc(p.error)}</p>` : ''}
        ${p.loading ? '<p class="mut location-loading">Checking real map results…</p>' : ''}
        ${results ? `<section class="location-results"><b class="location-section-title">Map results</b>${results}</section>` : ''}
        ${!p.loading && !results ? `${recentHtml}${termsHtml}<p class="mut location-attribution">${LOCATION_SEARCH_ATTRIBUTION}</p>` : ''}
        ${results ? `<p class="mut location-attribution">${LOCATION_SEARCH_ATTRIBUTION}</p>` : ''}
      </div>`;
}
function openVerifiedLocationPicker(target) {
    O.locPicker = { target: target || 'W.loc', query: '', results: [], loading: false, error: '' };
    modal(locationPickerSheet());
    const input = document.querySelector('#location-query'); if (input) input.focus();
}
async function searchVerifiedLocations() {
    const p = O.locPicker; if (!p) return;
    const raw = String(p.query || '').trim();
    if (raw.length < 2) { p.error = 'Enter at least 2 characters to search the map.'; p.results = []; modal(locationPickerSheet()); return; }
    const wait = 1050 - (Date.now() - lastLocationSearchAt);
    if (wait > 0) { p.error = 'Please wait a moment before searching again.'; modal(locationPickerSheet()); return; }
    lastLocationSearchAt = Date.now(); p.loading = true; p.error = ''; p.results = []; modal(locationPickerSheet());
    try {
        const city = currentCityContext();
        const isCitySelection = p.target === 'ob.city' || p.target === 'ed.city';
        /* Every query explicitly uses countrycodes=in so city and place results stay in India. */
        const request = async (q, options = {}) => {
            const params = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '15', dedupe: '1', countrycodes: 'in' });
            if (options.structured) { params.set('city', q); params.set('country', 'India'); }
            else { params.set('q', q); if (options.featuretype) params.set('featuretype', options.featuretype); }
            const response = await fetch(LOCATION_SEARCH_ENDPOINT + '?' + params.toString(), { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error('The map service is temporarily unavailable. Please try again.');
            return response.json();
        };
        /* City search is nationwide and intentionally tolerant of Nominatim's different
           indexing patterns for Indian cities. Try general, city-feature, then structured search. */
        let rows;
        if (isCitySelection) {
            const batches = [];
            const first = await request(`${raw}, India`);
            batches.push(Array.isArray(first) ? first : []);
            if (!batches[0].some(row => normalizeGeocodedCity(row, raw))) {
                const second = await request(raw, { featuretype: 'city' });
                batches.push(Array.isArray(second) ? second : []);
            }
            if (!batches.some(batch => batch.some(row => normalizeGeocodedCity(row, raw)))) {
                const third = await request(raw, { structured: true });
                batches.push(Array.isArray(third) ? third : []);
            }
            rows = batches.flat();
            /* Nominatim sometimes misses valid Indian cities or common misspellings. Use
               Photon as a secondary OSM-backed search, then still require an India city result. */
            if (!rows.some(row => normalizeGeocodedCity(row, raw))) {
                const photonUrl = 'https://photon.komoot.io/api/?' + new URLSearchParams({ q: raw + ', India', lang: 'en', limit: '15' }).toString();
                const photonResponse = await fetch(photonUrl, { headers: { Accept: 'application/json' } });
                if (photonResponse.ok) {
                    const photonData = await photonResponse.json();
                    const photonRows = (photonData && Array.isArray(photonData.features) ? photonData.features : [])
                        .map(feature => normalizePhotonCity(feature, raw)).filter(Boolean)
                        .map(place => ({ lat: String(place.lat), lon: String(place.lng), display_name: place.displayName,
                            name: place.city, class: 'place', type: 'city', osm_id: place.osmId,
                            address: { city: place.city, state: place.state, country: 'India', country_code: 'in' } }));
                    rows = rows.concat(photonRows);
                }
            }
        } else {
            rows = await request(city ? `${raw}, ${city}, India` : `${raw}, India`);
            const hasInCityResult = list => (Array.isArray(list) ? list : []).some(row => {
                const place = normalizeGeocodedPlace(row);
                return place && placeMatchesCity(row, place, city);
            });
            /* Delhi-area landmarks are frequently indexed under New Delhi, and some
               city aliases differ from the profile label. Retry the common aliases
               before displaying an empty result. */
            if (!hasInCityResult(rows) && sameCity(city, 'Delhi')) {
                /* One retry only (Nominatim's public service is rate-limited). */
                const extra = await request(`${raw}, New Delhi, Delhi, India`);
                rows = [...(Array.isArray(rows) ? rows : []), ...(Array.isArray(extra) ? extra : [])];
            }
        }
        const seen = new Set();
        p.results = (Array.isArray(rows) ? rows : []).map(row => ({
            row, place: isCitySelection ? normalizeGeocodedCity(row, raw) : normalizeGeocodedPlace(row)
        })).filter(item => item.place).filter(item => {
            const r = item.place;
            /* City onboarding/profile accepts only city-level results. For local
               places, validate the actual result address against the selected city,
               with known Indian city-name aliases (e.g. Delhi/New Delhi). */
            if (!isCitySelection && city) {
                if (!placeMatchesCity(item.row, r, city)) return false;
                if (sameCity(r.city, city)) r.city = city;
            }
            const key = `${Number(r.lat).toFixed(5)},${Number(r.lng).toFixed(5)}:${r.label.toLowerCase()}`;
            if (seen.has(key)) return false; seen.add(key); return true;
        }).map(item => item.place).slice(0, 8);
        if (!p.results.length) p.error = isCitySelection ? 'No city results found. Try the city name in English, for example “Raipur” or “Indore”.' : `No matching places found${city ? ` in ${city}` : ''}. Try a nearby landmark, college, market or locality.`;
    } catch (e) { p.error = e && e.message ? e.message : 'Could not reach the online map. Check your connection and try again.'; }
    p.loading = false; modal(locationPickerSheet());
}
function chooseVerifiedLocation(e) {
    const p = O.locPicker, place = p && p.results && p.results[Number(e.dataset.v)];
    if (!place || place.source !== 'openstreetmap-nominatim' || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return toast('Select a place from the results first.');
    applyVerifiedLocation(place, p.target || 'W.loc');
}
function chooseRecentLocation(e) {
    const place = getLocationRecents()[Number(e.dataset.v)];
    if (!place) return toast('That recent place is no longer available. Search the map again.');
    applyVerifiedLocation(place, (O.locPicker && O.locPicker.target) || 'W.loc');
}
function applyVerifiedLocation(place, target) {
    const isCitySelection = target === 'ob.city' || target === 'ed.city';
    if (!isCitySelection) rememberLocation(place);
    if (isCitySelection) {
        const [state, field] = path(target); state[field] = place.city;
        if (target === 'ob.city') { O.ob.locOk = 0; O.ob.cityState = place.state; }
        if (target === 'ed.city') O.ed.cityState = place.state;
    } else {
        const [state, field] = path(target);
        state[field] = place.label; state[field + 'Lat'] = place.lat; state[field + 'Lng'] = place.lng;
        state[field + 'Source'] = place.source; state[field + 'Place'] = place.displayName;
        state[field + 'City'] = place.city; state[field + 'State'] = place.state;
        if (target === 'os.loc') { O.os.areaLat = Math.round(place.lat * 100) / 100; O.os.areaLng = Math.round(place.lng * 100) / 100; if (!O.os.find && O.os.step === 3) O.os.step = 4; S.discoveryCity = place.city; S.area = place.label; }
        if (target === 'W.loc') { O.W.locLat = place.lat; O.W.locLng = place.lng; O.W.locSource = place.source; O.W.locPlace = place.displayName; O.W.locCity = place.city; O.W.locState = place.state; }
    }
    O.locPicker = null;
    if (target === 'ed.city') {
        /* Keep the profile editor open. City selection is a draft until the user presses Save. */
        editSheet();
        toast(`City selected: ${place.city}. Press Save to apply it.`);
        return;
    }
    modal(''); save(); toast('Map location selected 📍'); render();
}
async function useLiveLocationForPicker(target) {
    if (!navigator.geolocation) return toast('Location is unavailable here. Search for a place instead.');
    toast('Finding your city…');
    navigator.geolocation.getCurrentPosition(async pos => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        try {
            const url = LOCATION_REVERSE_ENDPOINT + '?format=jsonv2&addressdetails=1&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lng);
            const res = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error('Reverse geocoding failed');
            const row = await res.json(), place = normalizeGeocodedPlace(row);
            if (!place) throw new Error('Could not identify an Indian city from your location');
            if (target === 'ob.city' || target === 'ed.city') {
                const [state, field] = path(target); state[field] = place.city;
                if (target === 'ob.city') { O.ob.locOk = 1; O.ob.cityState = place.state; }
                if (target === 'ed.city') { O.ed.cityState = place.state; }
                else S.discoveryCity = place.city;
            } else {
                const [state, field] = path(target); state[field] = place.label;
                state[field + 'Lat'] = lat; state[field + 'Lng'] = lng; state[field + 'Source'] = place.source;
                state[field + 'Place'] = place.displayName; state[field + 'City'] = place.city; state[field + 'State'] = place.state;
                S.geo = [Math.round(lat * 100) / 100, Math.round(lng * 100) / 100]; S.area = place.label;
                if (target === 'os.loc') { O.os.areaLat = S.geo[0]; O.os.areaLng = S.geo[1]; if (!O.os.find && O.os.step === 3) O.os.step = 4; S.discoveryCity = place.city; }
                if (target === 'W.loc') { O.W.locLat = lat; O.W.locLng = lng; O.W.locSource = place.source; O.W.locPlace = place.displayName; O.W.locCity = place.city; O.W.locState = place.state; }
            }
            O.detectedCity = place.city; O.locPicker = null;
            if (target === 'ed.city') {
                editSheet();
                toast(`City selected: ${place.city}. Press Save to apply it.`);
                return;
            }
            modal(''); save(); toast(`Location set to ${place.city} 📍`); render();
        } catch (_) { toast('Could not verify your city from the map. Search and select a place instead.'); }
    }, err => toast(err.code === 1 ? 'Allow location access or search for a place.' : 'Could not get your live location.'), { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
}
function chooseLocationTerm(e) {
    if (!O.locPicker) return;
    O.locPicker.query = String(e.dataset.v || ''); O.locPicker.results = []; O.locPicker.error = '';
    searchVerifiedLocations();
}
