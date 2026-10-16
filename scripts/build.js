// Verifies the project (syntax + every referenced file exists) and copies a deployable static site to dist/.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="((?:src|assets)\/[^"]+)"/g)].map(m => m[1]);
const exists = r => fs.existsSync(path.join(root, r)) || fs.existsSync(path.join(root, 'public', r));
const missing = refs.filter(r => !exists(r));
if (missing.length) {
    console.error('Missing files referenced by index.html:', missing);
    process.exit(1);
}
const js = refs.filter(r => r.endsWith('.js'));
js.forEach(f => cp.execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'inherit' }));
const used = new Set(refs);
used.add('src/js/admin/admin.js'); // loaded by the standalone admin.html entry point
const all = [];
(function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : all.push(path.relative(root, p).split(path.sep).join('/')); }); })(path.join(root, 'src'));
const unused = all.filter(f => !used.has(f));
if (unused.length)
    console.warn('Not referenced by index.html:', unused);
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));
if (fs.existsSync(path.join(root, 'admin.html'))) fs.copyFileSync(path.join(root, 'admin.html'), path.join(dist, 'admin.html'));
cp.execFileSync(process.execPath, ['--check', path.join(root, 'src/js/admin/admin.js')], { stdio: 'inherit' });
cp.execFileSync(process.execPath, ['--check', path.join(root, 'server/admin.mjs')], { stdio: 'inherit' });
fs.cpSync(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
// Prevent GitHub Pages/Jekyll from rewriting or excluding static app assets.
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
console.log(`Build OK: ${js.length} scripts checked, ${refs.length} references resolved -> dist/`);
