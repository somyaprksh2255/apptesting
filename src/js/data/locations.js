/* Known seed locations for friendly first-run suggestions. Custom places and cities are
   resolved from OpenStreetMap at selection time; this list is not a nationwide allowlist. */
const CITY_DATA = [
    {
        id: 'bhopal', name: 'Bhopal', state: 'Madhya Pradesh', center: [23.2599, 77.4126], radiusKm: 40,
        localities: {
            'MP Nagar': [23.235, 77.434], 'New Market': [23.2335, 77.401],
            'Arera Colony': [23.215, 77.434], '10 No. Market': [23.237, 77.429],
            'Piplani Ground': [23.2674, 77.5005], 'Lal Parade Ground': [23.2478, 77.4146],
            'LNCT College': [23.2038, 77.4998], 'Shahpura Lake': [23.198, 77.435],
            'DB Mall': [23.2335, 77.433], 'Bittan Market': [23.216, 77.435]
        }
    }
];

const CITIES = CITY_DATA.map(c => c.name);
const cityByName = n => CITY_DATA.find(c => String(c.name).toLowerCase() === String(n || '').toLowerCase()) || null;
/* Nationwide mode: any non-empty city name selected from a map result is valid. */
const isCity = n => typeof n === 'string' && n.trim().length >= 2;
const cityLabel = n => { const c = cityByName(n); return c ? `${c.name}, ${c.state}` : n || ''; };
const localitiesOf = n => { const c = cityByName(n); return c ? Object.keys(c.localities) : []; };
const cityOfLoc = l => { const c = CITY_DATA.find(x => Object.prototype.hasOwnProperty.call(x.localities, l)); return c ? c.name : null; };
const LC = Object.assign({}, ...CITY_DATA.map(c => c.localities));
