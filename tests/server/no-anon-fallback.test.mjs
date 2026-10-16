/* P0.4 — assert the server NEVER substitutes the public publishable/anon key for the
 * privileged (service-role / secret) key.
 *
 * This test is dependency-free (plain Node assertions), lives under tests/server/ and is NOT
 * part of the e2e load order (it must never change the e2e pass/fail counts). It uses only
 * DUMMY PLACEHOLDER env values — never a real key — and exits non-zero on any failed assertion.
 *
 * Run: node tests/server/no-anon-fallback.test.mjs
 */

/* Arrange: only a publishable/anon-style var is set; the secret (and its alias) are unset.
 * The value is an obvious dummy placeholder, not a real key. Set BEFORE importing the module
 * so the module reads this environment. */
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.SUPABASE_URL = 'https://example.test';
process.env.SUPABASE_PUBLISHABLE_KEY = 'dummy-publishable-not-a-real-key';

const {
    getServerSecretKey,
    serverSupabaseConfigured,
    getServerSupabase
} = await import('../../server/supabase.mjs');

let bad = 0;
const t = (name, cond) => {
    if (cond) { console.log('PASS ' + name); }
    else { bad++; console.log('FAIL ' + name); }
};

/* The secret resolver must NOT fall back to the publishable/anon key. */
t('getServerSecretKey() returns empty when no secret/alias is set (no anon fallback)',
    getServerSecretKey() === '');

/* The publishable key value must never leak into the resolved secret. */
t('getServerSecretKey() never returns the publishable key value',
    getServerSecretKey() !== process.env.SUPABASE_PUBLISHABLE_KEY);

/* Configured must be false without a secret, even though a URL + publishable key are present. */
t('serverSupabaseConfigured() is false without a secret key',
    serverSupabaseConfigured() === false);

/* The privileged client must THROW rather than degrade to the anon key. */
let threw = false;
let message = '';
try {
    getServerSupabase();
} catch (err) {
    threw = true;
    message = err && err.message ? String(err.message) : '';
}
t('getServerSupabase() throws when no secret key is configured (never degrades to anon)', threw);

/* The thrown message must be names-only — it must not echo any env value. */
t('the thrown error message carries no secret/publishable value (names only)',
    threw &&
    message.length > 0 &&
    !message.includes(process.env.SUPABASE_PUBLISHABLE_KEY) &&
    !message.includes('https://example.test'));

console.log('RESULT: ' + (bad ? 'FAILED (' + bad + ')' : 'all passed'));
process.exit(bad ? 1 : 0);
