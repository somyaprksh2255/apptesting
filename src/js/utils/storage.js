/* Supabase Storage helpers (classic <script>, bare globals — NOT an ES module).
   Buckets: 'avatars' (public) for profile pictures, 'chat-media' (private) for chat attachments.
   In CONFIGURED mode a failed upload REJECTS/THROWS so the caller can show a toast + retry; it never silently
   returns a local dataURL. The dataURL fallback belongs to the UNCONFIGURED callers in app/actions.js. No secret
   lives here: uploads use the publishable key via the shared Supabase client, and signed URLs for private media
   are minted by the Express server (which alone holds the service-role key). */

const STORAGE_BUCKETS = ['avatars', 'chat-media'];

/* a filesystem-safe name fragment; keeps letters/digits/dot/dash/underscore only */
function sanitizeName(name) {
    return String(name || 'file')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(-64) || 'file';
}

/* extension + a timestamp/random prefix so two uploads never collide */
function storageKeyFor(prefix, ext) {
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);

    return prefix + stamp + '-' + rand + '.' + (ext || 'bin');
}

/* decode a `data:` URL into a Blob; pass through an existing Blob/File unchanged */
function toBlob(input) {
    if (input instanceof Blob)
        return { blob: input, contentType: input.type || 'application/octet-stream' };

    const str = String(input || '');
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(str);

    if (!m)
        throw new Error('Unsupported upload source');

    const contentType = m[1] || 'application/octet-stream';
    const isB64 = !!m[2];
    const data = isB64 ? atob(m[3]) : decodeURIComponent(m[3]);
    const bytes = new Uint8Array(data.length);

    for (let i = 0; i < data.length; i++)
        bytes[i] = data.charCodeAt(i);

    return { blob: new Blob([bytes], { type: contentType }), contentType };
}

/* '' if the blob is acceptable, otherwise a message — reuses the SQUADO_CONFIG image limits (same as media.js) */
function validateUpload(blob) {
    const cfg = (typeof window !== 'undefined' && window.SQUADO_CONFIG) || {};
    const types = cfg.imageTypes || ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const max = (+cfg.maxImageMB || 10) * 1024 * 1024;
    const type = String((blob && blob.type) || '').toLowerCase();

    if (!type || !types.includes(type))
        return 'Unsupported image type';

    if (blob.size === 0)
        return 'That file looks empty';

    if (Number.isFinite(blob.size) && blob.size > max)
        return 'That image is too large';

    return '';
}

/* MIME -> file extension for the stored object name */
function extFor(contentType) {
    return ({
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'image/heic': 'heic',
        'image/heif': 'heif'
    })[String(contentType || '').toLowerCase()] || 'bin';
}

/* the signed-in person's Supabase id, used to namespace stored objects */
async function currentUid() {
    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;

    if (!client)
        throw new Error('Not configured');

    const res = await client.auth.getSession();
    const session = res && res.data && res.data.session;
    const uid = session && session.user && session.user.id;

    if (!uid)
        throw new Error('Not signed in');

    return uid;
}

/* Upload a profile picture to the PUBLIC avatars bucket and return its public URL. Accepts a data: URL
   (from utils/photo.js) or a Blob/File. REJECTS on any failure — the caller handles the toast + retry. */
async function uploadAvatar(dataUrlOrFile) {
    const bucket = 'avatars';

    if (STORAGE_BUCKETS.indexOf(bucket) < 0)
        throw new Error('Unknown bucket');

    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;

    if (!client)
        throw new Error('Not configured');

    const { blob, contentType } = toBlob(dataUrlOrFile);
    const why = validateUpload(blob);

    if (why)
        throw new Error(why);

    const uid = await currentUid();
    const safeName = sanitizeName('avatar.' + extFor(contentType));
    const objectPath = uid + '/' + storageKeyFor('', extFor(contentType)) + '-' + safeName;

    const up = await client.storage.from(bucket).upload(objectPath, blob, { contentType });

    if (up.error)
        throw up.error;

    const pub = client.storage.from(bucket).getPublicUrl(objectPath);
    const url = pub && pub.data && pub.data.publicUrl;

    if (!url)
        throw new Error('Could not resolve public URL');

    return url;
}

/* Upload a chat attachment to the PRIVATE chat-media bucket. Returns { url, path }: url is a freshly signed URL
   for immediate display, path is the durable object key stored on the message as mpath (re-signed on reopen).
   REJECTS on any failure. `media` is the O.media object (data: URL in media.src). */
async function uploadChatMedia(planId, media) {
    const bucket = 'chat-media';

    if (STORAGE_BUCKETS.indexOf(bucket) < 0)
        throw new Error('Unknown bucket');

    const client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;

    if (!client)
        throw new Error('Not configured');

    const source = media && (media.src || media.file || media);
    const { blob, contentType } = toBlob(source);
    const why = validateUpload(blob);

    if (why)
        throw new Error(why);

    const uid = await currentUid();
    const safePlan = sanitizeName(String(planId || 'plan'));
    const objectPath = safePlan + '/' + uid + '/' + storageKeyFor('', extFor(contentType));

    const up = await client.storage.from(bucket).upload(objectPath, blob, { contentType });

    if (up.error)
        throw up.error;

    const url = await signChatMedia(objectPath);

    return { url, path: objectPath };
}

/* Mint a fresh signed URL for a private chat-media object via the Express server (which holds the service-role
   key). The current Supabase access token authorizes the request. REJECTS on any failure. */
async function signChatMedia(path) {
    const cfg = (typeof window !== 'undefined' && window.SQUADO_CONFIG) || {};
    const base = cfg.apiBaseUrl || '';
    const token = typeof supabaseAccessToken === 'function' ? await supabaseAccessToken() : '';

    const res = await fetch(base + '/api/storage/chat/sign', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({ path })
    });

    if (!res.ok)
        throw new Error('Could not sign media URL');

    const body = await res.json();
    const url = body && body.url;

    if (!url)
        throw new Error('Could not sign media URL');

    return url;
}
