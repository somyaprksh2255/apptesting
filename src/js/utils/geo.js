const hv = (a, b) => {
    const r = Math.PI / 180, x = (b[0] - a[0]) * r, y = (b[1] - a[1]) * r;
    const q = Math.sin(x / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(y / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(Math.min(1, q)));
};

/* Nearby mode is coordinate-based nationwide; the profile city is only the fallback. */
const near = () => S.area || null;
const geoOn = () => Array.isArray(S.geo) && S.geo.length === 2 && S.geo.every(Number.isFinite);
const planCoords = p => p && p.locLat != null && p.locLng != null && Number.isFinite(Number(p.locLat)) && Number.isFinite(Number(p.locLng))
    ? [Number(p.locLat), Number(p.locLng)] : (p && LC[p.loc] ? LC[p.loc] : null);
const d = p => { const target = planCoords(p); return geoOn() && target ? Math.max(.1, Math.round(hv(S.geo, target) * 10) / 10) : null; };
const byDist = (a, b) => (d(a) ?? 1e9) - (d(b) ?? 1e9);
const kmTxt = p => d(p) == null ? '' : ` · ~${d(p)} km`;

async function reverseLocation(lat, lng) {
    const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lng);
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('map unavailable');
    const row = await response.json(), a = row.address || {};
    const city = String(a.city || a.town || a.municipality || a.village || a.county || a.state_district || '').trim();
    const area = String(a.neighbourhood || a.suburb || a.quarter || a.city_district || a.residential || a.hamlet || a.village || a.town || a.city || city).trim();
    if (String(a.country_code || '').toLowerCase() !== 'in' || !city || !area) throw new Error('city not resolved');
    return { city, area, state: String(a.state || '').trim(), label: area.toLowerCase() === city.toLowerCase() ? city : `${area}, ${city}`, displayName: String(row.display_name || '') };
}

function locate(cb) {
    if (!navigator.geolocation) return toast('Location isn\'t available here. Search for a place instead.');
    toast('Finding your nearby area… 📍');
    navigator.geolocation.getCurrentPosition(async pos => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        try {
            const resolved = await reverseLocation(lat, lng);
            S.geo = [Math.round(lat * 100) / 100, Math.round(lng * 100) / 100];
            S.area = resolved.label; S.discoveryCity = resolved.city;
            O.detectedCity = resolved.city;
            if (!S.me.guest && S.me.onboarded === false && O.ob) { O.ob.city = resolved.city; O.ob.cityState = resolved.state; O.ob.locOk = 1; }
            save(); toast(`Showing plans near ${resolved.city} 📍`); cb && cb(resolved.label); render();
        } catch (_) { toast('Could not identify your city from the map. Search for a place instead.'); }
    }, e => toast(e.code === 1 ? 'Location blocked. Allow it in your browser, or search for a place.' : 'Couldn\'t get location. Search for a place instead.'), { timeout: 12000, maximumAge: 300000, enableHighAccuracy: false });
}

const cityNotice = () => '';
const geoBar = () => cityNotice() + (geoOn()
    ? `<p class="mut" style="margin:12px 0">📍 Plans sorted near ${esc(S.area || 'you')} · rough area only <button class="chip" style="padding:2px 10px" data-a="geoOff">Turn off</button></p>`
    : `<div class="card" style="margin:14px 0"><b>Want plans near you?</b><p class="mut" style="margin:4px 0 10px">Use your live location to see nearby plans. Only an approximate area is used for discovery.</p><button class="btn sm pink" data-a="geo">📍 Use my location</button></div>`);
