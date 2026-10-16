/* server/supabase.mjs — privileged, SERVER-ONLY Supabase client (design §5.2, §7.1).
 *
 * This module owns the single privileged Supabase client. It is created ONCE
 * (a module-level singleton) using the SECRET (service-role) key only. The secret
 * key must NEVER reach the browser, a log, or a committed file.
 *
 * Hard rules enforced here:
 *   - The client uses process.env.SUPABASE_SECRET_KEY, falling back ONLY to the
 *     SUPABASE_SERVICE_ROLE_KEY alias — NEVER a silent fallback to the publishable
 *     or anon key. If no secret key is present, getServerSupabase() throws.
 *   - No ensureBucket()/auto-create/auto-public of any kind. The bucket is expected
 *     to already exist; at most we read from it to mint signed URLs.
 *   - No provider error objects or stack traces are returned to callers; errors are
 *     normalized to generic Error instances (callers log server-side, respond generically).
 */

import { createClient } from '@supabase/supabase-js';

/* The private bucket that holds chat attachments. */
export const CHAT_MEDIA_BUCKET = 'chat-media';

/* Signed-URL lifetime for private chat media: 1 hour. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

/* The server secret key is read from SUPABASE_SECRET_KEY, with SUPABASE_SERVICE_ROLE_KEY
 * accepted only as an alias. There is NO fallback to the publishable/anon key. */
export function getServerSecretKey() {
    return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

/* True when the server has everything it needs for privileged Supabase operations. */
export function serverSupabaseConfigured() {
    return Boolean(process.env.SUPABASE_URL) && Boolean(getServerSecretKey());
}

let _client = null;

/* Returns the privileged Supabase client singleton. Throws a generic Error (no secret
 * value, no provider internals) if the required server configuration is absent. */
export function getServerSupabase() {
    if (_client) return _client;

    const url = process.env.SUPABASE_URL;
    const secret = getServerSecretKey();

    if (!url || !secret) {
        /* Names only — never values. */
        throw new Error('Supabase server client not configured: missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    }

    _client = createClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    return _client;
}

/* Mint a short-lived (1h) signed URL for an object in the private chat-media bucket.
 * `path` is the object path WITHIN the bucket (never includes the bucket name).
 * Returns the signed URL string. Throws a generic Error on failure — the caller logs
 * details server-side and responds with a generic status code. */
export async function signChatMedia(path) {
    const client = getServerSupabase();
    const { data, error } = await client
        .storage
        .from(CHAT_MEDIA_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (error || !data || !data.signedUrl) {
        /* Do not surface the provider error object to the caller. */
        throw new Error('sign_failed');
    }
    return data.signedUrl;
}

/* Server-side membership authorization: true iff `uid` is a state='member' row for
 * `planId`. Mirrors the frontend groupAccess()/membership() rule (design §7.7, §11.2).
 * Throws a generic Error on a lookup failure so the caller can respond generically. */
export async function isPlanMember(planId, uid) {
    const client = getServerSupabase();
    const { data, error } = await client
        .from('memberships')
        .select('user_id')
        .eq('plan_id', planId)
        .eq('user_id', uid)
        .eq('state', 'member')
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new Error('membership_lookup_failed');
    }
    return Boolean(data);
}
