const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (v, m) => { if (!v) throw new Error(m); };
const picker = read('src/js/utils/location-picker.js');
const create = read('src/js/pages/create.js');
const outside = read('src/js/pages/outside.js');
const actions = read('src/js/app/actions.js');
const geo = read('src/js/utils/geo.js');
const locations = read('src/js/data/locations.js');
const onboarding = read('src/js/components/onboarding/steps.js');
const admin = read('src/js/admin/admin.js');
const home = read('src/js/pages/home.js');
const html = read('index.html');
assert(html.includes('src/js/utils/location-picker.js'), 'Location picker must be loaded in the app');
assert(picker.includes('https://nominatim.openstreetmap.org/search') && picker.includes('countrycodes=in'), 'Custom locations must use India-restricted online map results');
assert(picker.includes('normalizeGeocodedPlace') && picker.includes("source: 'openstreetmap-nominatim'"), 'A custom place must be normalized and marked as map-verified');
assert(picker.includes('rememberLocation') && picker.includes('Recently selected'), 'Recent verified locations should be offered again after onboarding');
assert(picker.includes('normalizeGeocodedCity') && picker.includes("['city', 'town', 'municipality'].includes(type)"), 'Onboarding/profile default location must accept city-level results only');
assert(picker.includes('const recents = isCitySelection ? [] : getLocationRecents()'), 'Local place suggestions must not appear in city selection');
assert(picker.includes('suggestedTermsForCity') && locations.includes('Piplani Ground') && locations.includes('LNCT College') && locations.includes('Lal Parade Ground'), 'Local suggestions should include familiar places after onboarding');
assert(picker.includes('Suggested near you in') && picker.includes('distanceKm(S.geo'), 'Nearby suggestions should sort seeded places by approximate distance when location is available');
assert(picker.includes('Suggestions must apply immediately. Never open the search sheet from a suggestion tap.'), 'Tapping a suggested place must select it directly, not open map search');
assert(outside.includes('location-area-panel'), 'Still Outside Your area should use the single unified location panel');
assert(picker.includes('placeMatchesCity(item.row, r, city)') && picker.includes('const sameCity = (left, right)'), 'Custom place results must be validated against the selected city while allowing common city aliases');
assert(picker.includes("['delhi', 'new delhi', 'nct of delhi', 'national capital territory of delhi']") && picker.includes('New Delhi, Delhi, India'), 'Delhi landmarks should be searchable when map data labels the area as New Delhi');
assert(picker.includes('return []') && !picker.includes("['College', 'Market', 'Park', 'Shopping mall', 'Ground', 'Landmark']"), 'Unknown cities must not show generic categories as place suggestions');
assert(!outside.includes("You're still out?") && !outside.includes("Yeah, I'm staying"), 'Still Outside must skip the obsolete extra confirmation screen');
assert(read('src/styles/pages.css').includes('.location-custom-search .btn.pink') && read('src/styles/pages.css').includes('background:var(--pur)') && read('src/styles/pages.css').includes('color:inherit'), 'Location action should use the purple design token with a high-contrast white icon');
assert(picker.includes("const isCitySelection = p.target === 'ob.city' || p.target === 'ed.city'"), 'Onboarding/profile city search must still allow choosing a new city');
assert(picker.includes('Use my live location') && picker.includes('LOCATION_REVERSE_ENDPOINT'), 'Onboarding live location should be reverse-geocoded to a city');
assert(picker.includes('locationChoose') && picker.includes('Typing alone will not') === false, 'Location selection requires a returned map result');
assert(create.includes('data-a="locationPicker" data-v="W.loc"'), 'Plan creation must expose custom map search');
assert(outside.includes('data-a="locationPicker" data-v="os.loc"'), 'Nearby discovery must expose custom map search');
assert(actions.includes("w.locSource === 'openstreetmap-nominatim'") && actions.includes("o.locSource === 'openstreetmap-nominatim'"), 'Plan posting must validate selected map coordinates');
assert(actions.includes('locationRecent(e)') && actions.includes('locationTerm(e)'), 'Recent and city suggestion buttons must be wired');
assert(geo.includes('reverseLocation') && geo.includes('S.discoveryCity = resolved.city'), 'Live location must update city-based discovery nationwide');
assert(locations.includes("const isCity = n => typeof n === 'string' && n.trim().length >= 2"), 'City validation must not be limited to a Bhopal allowlist');
assert(onboarding.includes('data-a="locationPicker" data-v="ob.city"') && onboarding.includes('Nearby places and local suggestions become available after you finish onboarding'), 'Onboarding city must be selected separately from local places');
assert(!read('src/js/components/profile/EditProfileSheet.js').includes('data-a="geoPick" data-k="ed.city"'), 'Profile edit should change the city only, not set an approximate local area');
assert(admin.includes('data-search-event-location') && admin.includes('locationSource!==\'openstreetmap-nominatim\''), 'Admin Events must require a map-selected location');
assert(home.includes("e.status === 'published'") && home.includes('Upcoming events near you') && home.includes('const selectedCity = normCity(viewCity())'), 'Home Event suggestions must show published events with normalized city matching');
assert(geo.includes('Use your live location to see nearby plans. Only an approximate area is used for discovery.'), 'Location help copy must remain concise');
assert(read('src/js/pages/profile.js').includes('Show this QR to your meetup host to check in.') && !read('src/js/pages/profile.js').includes('Cross-device scanning needs a deployed'), 'Profile QR must use concise user-facing copy');
assert(!read('src/js/components/squads/AttendanceSheet.js').includes('see README, QR attendance'), 'Attendance UI must not show README/backend implementation notes');

(async () => {
  const bhopalRow = { lat:'23.2674', lon:'77.5005', display_name:'Piplani Ground, Bhopal, Madhya Pradesh, India', type:'ground', osm_id:101, address:{neighbourhood:'Piplani Ground',city:'Bhopal',state:'Madhya Pradesh',country:'India',country_code:'in'} };
  const indoreRow = { lat:'22.7196', lon:'75.8577', display_name:'Indore, Madhya Pradesh, India', class:'place', type:'city', osm_id:202, address:{city:'Indore',state:'Madhya Pradesh',country:'India',country_code:'in'} };
  const makeContext = (target, row) => {
    const ctx = {
      CITY_DATA:[{name:'Bhopal',center:[23.2599,77.4126],radiusKm:40,localities:{}}], cityByName:()=>null, isCity:n=>typeof n==='string'&&n.trim().length>=2,
      O:{locPicker:{target,query:'Piplani Ground',results:[],loading:false,error:''},W:{loc:'',locLat:null,locLng:null,locSource:'',locPlace:''},ob:{city:'',locOk:0},ed:{city:''},os:{loc:'',locLat:null,locLng:null,locSource:'',locPlace:'',areaLat:null,areaLng:null,step:3}},
      S:{me:{city:'Bhopal',guest:false},geo:null,area:null,discoveryCity:'Bhopal'},
      esc:s=>String(s??''),modal:()=>{},toast:()=>{},render:()=>{},save:()=>{},document:{querySelector:()=>null},localStorage:{getItem:()=> '[]',setItem:()=>{}},
      path:k=>{const a=k.split('.');let t=ctx.O;for(const x of a.slice(0,-1))t=t[x];return[t,a[a.length-1]];},
      fetch:async url=>({ok:true,json:async()=>String(url).includes('/reverse')?row:[row]}),URLSearchParams,Date,Number,Math,String,encodeURIComponent,console,navigator:{geolocation:{getCurrentPosition:()=>{}}}
    }; return ctx;
  };
  const ctx = makeContext('W.loc', bhopalRow);
  vm.runInNewContext(picker + `\n(async()=>{const valid=normalizeGeocodedPlace(${JSON.stringify(bhopalRow)});if(!valid||valid.label!=='Piplani Ground, Bhopal')throw Error('Bhopal place failed normalization');const invalid=normalizeGeocodedPlace({lat:'40',lon:'-70',display_name:'Somewhere',address:{city:'Somewhere',country:'United States',country_code:'us'}});if(invalid!==null)throw Error('non-India result was accepted');await searchVerifiedLocations();if(!O.locPicker.results.length)throw Error('mock search returned no results');chooseVerifiedLocation({dataset:{v:'0'}});if(O.W.loc!=='Piplani Ground, Bhopal'||O.W.locSource!=='openstreetmap-nominatim'||O.W.locCity!=='Bhopal'||O.W.locLat==null)throw Error('Plan selection did not save verified coordinates');})().catch(e=>{throw e});`,ctx);
  const ctx2 = makeContext('ob.city', indoreRow);
  vm.runInNewContext(picker + `\n(async()=>{O.locPicker.results=[normalizeGeocodedCity(${JSON.stringify(indoreRow)})];chooseVerifiedLocation({dataset:{v:'0'}});if(O.ob.city!=='Indore'||O.ob.cityState!=='Madhya Pradesh')throw Error('Onboarding city selection failed for non-Bhopal city');if(!isCity(O.ob.city))throw Error('nationwide city validation rejected Indore');})().catch(e=>{throw e});`,ctx2);
  const delhiBoundary = { lat:'28.6139', lon:'77.2090', display_name:'Delhi, National Capital Territory of Delhi, India', name:'Delhi', class:'boundary', type:'administrative', osm_id:303, address:{state:'Delhi',country:'India',country_code:'in'} };
  const ctxCitySearch = makeContext('ed.city', delhiBoundary);
  vm.runInNewContext(picker + `\n(()=>{const delhi=normalizeGeocodedCity(${JSON.stringify(delhiBoundary)},'Delhi');if(!delhi||delhi.city!=='Delhi')throw Error('Delhi administrative city result was rejected');const typo=normalizeGeocodedCity(${JSON.stringify(delhiBoundary)},'Dehli');if(!typo||typo.city!=='Delhi')throw Error('Common city-name typo was not tolerated');const photon=normalizePhotonCity({geometry:{coordinates:[77.2090,28.6139]},properties:{name:'Delhi',state:'Delhi',countrycode:'in',type:'city'}},'Dehli');if(!photon||photon.city!=='Delhi')throw Error('India Photon city fallback normalization failed');})()`,ctxCitySearch);
  const ctx3 = makeContext('os.loc', null);
  ctx3.O.os.find = 1; ctx3.O.os.step = 0;
  ctx3.O.quickLocationItems = [{kind:'directory',name:'MP Nagar',coords:[23.235,77.434],city:'Bhopal',state:'Madhya Pradesh',target:'os.loc'}];
  let searchCalls = 0, modalCalls = 0, renderCalls = 0;
  ctx3.searchVerifiedLocations = () => { searchCalls++; };
  ctx3.modal = content => { if (content) modalCalls++; };
  ctx3.render = () => { renderCalls++; };
  vm.runInNewContext(picker + `\nchooseQuickLocation({dataset:{v:'0'}});`, ctx3);
  if (ctx3.O.os.loc !== 'MP Nagar' || ctx3.O.os.locCity !== 'Bhopal') throw new Error('Quick suggestion did not immediately select the local place');
  if (ctx3.O.os.find !== 1 || ctx3.O.os.step !== 0) throw new Error('Choosing a location in Find mode incorrectly switched the workflow');
  if (searchCalls || modalCalls) throw new Error('Quick suggestion unexpectedly opened map search/modal');
  if (!renderCalls) throw new Error('Quick suggestion did not refresh nearby results');
  const rajivChowk = { lat:'28.6328', lon:'77.2197', display_name:'Rajiv Chowk, New Delhi, Delhi, India', name:'Rajiv Chowk', type:'station', osm_id:909, address:{suburb:'Rajiv Chowk',city:'New Delhi',state:'Delhi',country:'India',country_code:'in'} };
  const ctxDelhi = makeContext('W.loc', rajivChowk);
  ctxDelhi.S.me.city = 'Delhi';
  ctxDelhi.O.locPicker.query = 'Rajiv Chowk';
  vm.runInNewContext(picker + `\n(async()=>{await searchVerifiedLocations();if(!O.locPicker.results.length)throw Error('Rajiv Chowk was rejected for selected city Delhi');if(O.locPicker.results[0].city!=='Delhi')throw Error('Delhi alias was not normalized to the selected default city');})().catch(e=>{throw e});`, ctxDelhi);
  await new Promise(resolve=>setTimeout(resolve,10));
  console.log('Location workflow checks passed: city-only default location, Delhi/New Delhi landmark aliases, no generic category suggestions, obsolete Still Outside screen removal, India-only map result validation, and selected coordinates.');
})().catch(e=>{console.error(e);process.exitCode=1;});
