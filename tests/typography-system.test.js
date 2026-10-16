import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/styles/typography.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
for (const token of ['--font-primary', '--type-h1', '--type-h2', '--type-h3', '--type-h4', '--type-body', '--type-label', '--type-caption', '--line-body', '--tracking-h1']) {
  assert.ok(css.includes(token), `Missing typography token: ${token}`);
}
assert.match(css, /--font-primary:\s*'Poppins'/, 'Poppins must remain the primary font');
assert.match(app, /src\/styles\/typography\.css/, 'Main app must load the shared typography system');
assert.match(admin, /src\/styles\/typography\.css/, 'Admin must load the shared typography system');
assert.match(css, /@media\s*\(max-width:\s*767px\)/, 'Responsive mobile type scale must exist');
console.log('Typography system checks passed.');
