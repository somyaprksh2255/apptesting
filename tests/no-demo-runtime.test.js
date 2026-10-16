const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const files = [
  'src/js/data/users.js','src/js/data/plans.js','src/js/data/events.js',
  'src/js/data/notifications.js','src/js/data/chats.js'
];
for (const file of files) {
  const s = read(file);
  assert(!/\b(?:Aditi|Aarav Demo|Navratri Garba Night|Old City Pandal Walk|p1|u1)\b/.test(s), `Synthetic fixture found in ${file}`);
}
assert(!exists('src/js/demo'), 'Runtime demo fixture directory still exists');
assert(!exists('scripts/demo'), 'Demo seed/setup scripts still exist');
assert(!exists('supabase/seed'), 'Demo seed SQL still exists');
assert(!exists('src/js/state/mockSim.js'), 'Mock activity simulator still exists');
const eventPage = read('src/js/pages/event.js');
const eventCard = read('src/js/components/events/eventCard.js');
assert(!/I'm Going|Who's going|people are going|data-a="going"/.test(eventPage + eventCard), 'Event-level attendance UI still exists');
assert(!/Attendance is managed at the Plan\/Group level/i.test(eventPage), 'Event page Plans & Groups placeholder must not include the attendance sentence');
const store = read('src/js/state/store.js');
assert(/plans:\s*\[\]/.test(store) && /events:\s*\[\]/.test(store), 'Fresh state must start without seeded plans/events');
console.log('No-demo runtime checks passed.');
