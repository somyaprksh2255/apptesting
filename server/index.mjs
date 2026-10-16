/* server/index.mjs — Squado backend (Express, ESM, Node >=18). Design §5.2, §6, §7.1, §8.
 *
 * Responsibilities (server-side authorization only — the browser performs auth and
 * public reads directly against Supabase):
 *   - GET  /api/status            -> { configured: boolean }   (NEVER key values)
 *   - GET  /api/config            -> ONLY public config         (NEVER secrets)
 *   - JWT middleware              -> verifies the Supabase access token against the
 *                                     project JWKS (jose: createRemoteJWKSet + jwtVerify),
 *                                     checks exp/iss/aud, sets req.uid = payload.sub
 *   - POST /api/storage/chat/sign -> JWT + server-side membership check, returns a 1h
 *                                     signed URL for the private chat-media bucket
 *   - POST /api/storage/chat      -> optional server-mediated upload (multer), same
 *                                     JWT + membership authorization, MIME/size/path limits
 *
 * Security controls: env-driven CORS allowlist (never '*' with credentials); fixed
 * bucket allowlist; MIME/size/extension/path validation on uploads; request-body size
 * limit; rate limiting on upload endpoints; generic error responses with NO stack traces
 * or provider error objects; an actionable, names-only startup error when required env
 * vars are missing.
 *
 * No secret value appears in this file. Secrets live only in the server's environment.
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import {
    getServerSupabase,
    serverSupabaseConfigured,
    signChatMedia,
    isPlanMember,
    CHAT_MEDIA_BUCKET,
    SIGNED_URL_TTL_SECONDS
} from './supabase.mjs';
import { recordCheckIn } from './attendance.mjs';
import { mountAdminRoutes } from './admin.mjs';

dotenv.config();

/* ------------------------------------------------------------------ *
 * Configuration & constants
 * ------------------------------------------------------------------ */

const PORT = Number(process.env.PORT) || 8787;

/* Buckets this server is willing to operate on — a fixed allowlist. */
const BUCKET_ALLOWLIST = ['avatars', CHAT_MEDIA_BUCKET];

/* Upload limits mirror the frontend config (src/js/config.js). */
const MAX_IMAGE_MB = Number(process.env.MAX_IMAGE_MB) || 10;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
const IMAGE_TYPES = [
    'image/jpeg', 'image/png', 'image/webp',
    'image/gif', 'image/heic', 'image/heif'
];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];

/* JSON body size limit — these endpoints only carry small JSON payloads. */
const JSON_BODY_LIMIT = '16kb';

/* CORS allowlist: comma-separated EXACT origins from env, defaulting to the two local
 * dev origins. Never '*' with credentials. */
const CORS_ALLOWLIST = String(process.env.CORS_ALLOWLIST || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

/* Required env vars for full operation (names only; values never logged). */
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_JWKS_URL'];

/* ------------------------------------------------------------------ *
 * Startup env validation — actionable, NAMES ONLY, never values
 * ------------------------------------------------------------------ */

function missingEnvVars() {
    return REQUIRED_ENV.filter(name => {
        if (name === 'SUPABASE_SECRET_KEY') {
            /* Accept the SUPABASE_SERVICE_ROLE_KEY alias as satisfying the secret. */
            return !process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY;
        }
        return !process.env[name];
    });
}

/* True iff /api/status should report configured:true (design §7.1). */
function statusConfigured() {
    return (
        Boolean(process.env.SUPABASE_URL) &&
        Boolean(process.env.SUPABASE_PUBLISHABLE_KEY) &&
        serverSupabaseConfigured()
    );
}

/* ------------------------------------------------------------------ *
 * JWKS / JWT verification (jose)
 * ------------------------------------------------------------------ */

let _jwks = null;
function getJwks() {
    if (_jwks) return _jwks;
    const jwksUrl = process.env.SUPABASE_JWKS_URL;
    if (!jwksUrl) throw new Error('missing SUPABASE_JWKS_URL');
    _jwks = createRemoteJWKSet(new URL(jwksUrl));
    return _jwks;
}

/* Express middleware: require a valid Supabase access token. Sets req.uid on success. */
async function requireAuth(req, res, next) {
    try {
        const header = String(req.headers.authorization || '');
        const match = header.match(/^Bearer\s+(.+)$/i);
        if (!match) return res.status(401).json({ error: 'unauthorized' });

        const token = match[1].trim();
        const issuer = process.env.SUPABASE_URL
            ? new URL('/auth/v1', process.env.SUPABASE_URL).toString()
            : undefined;

        const { payload } = await jwtVerify(token, getJwks(), {
            /* Supabase access tokens use audience 'authenticated'. */
            audience: 'authenticated',
            ...(issuer ? { issuer } : {})
        });

        if (!payload || !payload.sub) return res.status(401).json({ error: 'unauthorized' });
        req.uid = String(payload.sub);
        req.authEmail = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
        /* Suspensions are enforced by the API, not just represented in the admin UI.
         * Admin routes are exempt so an authorized moderator can still restore access. */
        if (!String(req.path || '').startsWith('/api/admin/')) {
            try {
                const { data: restriction, error: restrictionError } = await getServerSupabase()
                    .from('squado_account_restrictions').select('status,expires_at').eq('user_id', req.uid).maybeSingle();
                if (restrictionError) return res.status(503).json({ error: 'access_status_unavailable' });
                if (restriction && restriction.status === 'suspended' && (!restriction.expires_at || new Date(restriction.expires_at).getTime() > Date.now()))
                    return res.status(403).json({ error: 'account_suspended' });
            } catch (restrictionErr) {
                console.error('[auth] restriction lookup failed:', restrictionErr && restrictionErr.message ? restrictionErr.message : 'error');
                return res.status(503).json({ error: 'access_status_unavailable' });
            }
        }
        return next();
    } catch (err) {
        /* Log server-side only; never echo the token or provider internals. */
        console.warn('[auth] token verification failed:', err && err.code ? err.code : 'verify_error');
        return res.status(401).json({ error: 'unauthorized' });
    }
}

/* ------------------------------------------------------------------ *
 * Path validation for the private chat-media bucket
 * ------------------------------------------------------------------ *
 * Object layout (design §5.4): chat-media/{planId}/{uid}/{file}
 * The validated `path` is WITHIN the bucket, i.e. "{planId}/{uid}/{file}".
 */

function parseChatMediaPath(rawPath) {
    if (typeof rawPath !== 'string') return null;
    const path = rawPath.trim();
    if (!path || path.length > 512) return null;

    /* No absolute paths, no traversal, no backslashes, no leading/doubled slashes. */
    if (path.startsWith('/') || path.includes('..') || path.includes('\\') || path.includes('//')) return null;

    /* Allow a conservative character set only. */
    if (!/^[A-Za-z0-9._/-]+$/.test(path)) return null;

    const segments = path.split('/');
    if (segments.length < 3) return null;
    if (segments.some(s => s.length === 0)) return null;

    const planId = segments[0];
    const uid = segments[1];
    const file = segments[segments.length - 1];

    if (!planId || !uid || !file) return null;

    const dot = file.lastIndexOf('.');
    if (dot <= 0 || dot === file.length - 1) return null;
    const ext = file.slice(dot + 1).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext)) return null;

    return { planId, uid, file, ext };
}

/* ------------------------------------------------------------------ *
 * Rate limiting (lightweight, dependency-free) for upload endpoints
 * ------------------------------------------------------------------ */

function createRateLimiter({ windowMs, max }) {
    const hits = new Map();
    return function rateLimit(req, res, next) {
        const key = (req.uid || req.ip || 'anon') + '';
        const now = Date.now();
        const entry = hits.get(key);
        if (!entry || now > entry.reset) {
            hits.set(key, { count: 1, reset: now + windowMs });
            return next();
        }
        entry.count += 1;
        if (entry.count > max) return res.status(429).json({ error: 'rate_limited' });
        return next();
    };
}

const uploadRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 30 });

/* Dedicated limiter for the attendance check-in route. The host may scan a line of
 * attendees quickly, so the ceiling is higher than the upload limiter's 30 (design §3.1). */
const checkinRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 60 });

/* Body-validation shapes for the attendance route (design §3.2). Validated BEFORE any DB
 * call; the handler reads ONLY planId and scannedUid and takes hostUid from the token. */
const CHECKIN_PLAN_RE = /^[A-Za-z0-9._-]{1,64}$/;
const CHECKIN_UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/* Map a recordCheckIn result reason to the HTTP status (design §3.2). */
const CHECKIN_STATUS = {
    checked_in: 200,
    duplicate: 200,
    forbidden: 403,
    notmember: 403,
    noplan: 409,
    state: 409,
    self: 409,
    disputed: 409,
    unknown: 404,
    bad_request: 400
};

/* ------------------------------------------------------------------ *
 * App
 * ------------------------------------------------------------------ */

export function createApp() {
    const app = express();
    app.disable('x-powered-by');

    app.use(cors({
        origin(origin, cb) {
            /* Allow same-origin / non-browser requests (no Origin header). */
            if (!origin) return cb(null, true);
            if (CORS_ALLOWLIST.includes(origin)) return cb(null, true);
            return cb(null, false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Authorization', 'Content-Type']
    }));

    app.use(express.json({ limit: JSON_BODY_LIMIT }));

    /* --- Public, secret-free endpoints --- */

    app.get('/api/status', (req, res) => {
        res.json({ configured: statusConfigured() });
    });

    app.get('/api/config', (req, res) => {
        /* ONLY public values. Never a secret. Empty strings when unset. */
        res.json({
            supabaseUrl: process.env.SUPABASE_URL || '',
            publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
            googleClientId: process.env.GOOGLE_CLIENT_ID || ''
        });
    });

    /* Admin Console + shared Events/report storage. Every admin endpoint checks a trusted role row. */
    mountAdminRoutes(app, requireAuth);

    /* --- Protected: mint a signed URL for a chat-media object --- */

    app.post('/api/storage/chat/sign', requireAuth, async (req, res) => {
        const parsed = parseChatMediaPath(req.body && req.body.path);
        if (!parsed) return res.status(400).json({ error: 'bad_request' });

        try {
            const member = await isPlanMember(parsed.planId, req.uid);
            if (!member) return res.status(403).json({ error: 'forbidden' });

            const url = await signChatMedia(`${parsed.planId}/${parsed.uid}/${parsed.file}`);
            return res.json({ url });
        } catch (err) {
            console.error('[sign] failed:', err && err.message ? err.message : 'error');
            return res.status(502).json({ error: 'sign_failed' });
        }
    });

    /* --- Protected: record a host-scan attendance check-in (design §3) --- */

    app.post('/api/attendance/checkin', requireAuth, checkinRateLimit, async (req, res) => {
        /* Validate the body BEFORE any DB call. Read ONLY planId and scannedUid; hostUid is
         * the verified token subject, NEVER from the body (whitelist-by-construction). */
        const planId = req.body && req.body.planId;
        const scannedUid = req.body && req.body.scannedUid;
        if (
            typeof planId !== 'string' || !CHECKIN_PLAN_RE.test(planId) ||
            typeof scannedUid !== 'string' || !CHECKIN_UUID_RE.test(scannedUid)
        ) {
            return res.status(400).json({ ok: false, reason: 'bad_request' });
        }

        const hostUid = req.uid;

        try {
            const r = await recordCheckIn({ hostUid, planId, scannedUid });
            const status = CHECKIN_STATUS[r.reason] || 409;
            return res.status(status).json(r);
        } catch (err) {
            /* Names/codes only — never a stack or provider object (matches index.mjs). */
            console.error('[checkin] failed:', err && err.message ? err.message : 'error');
            return res.status(502).json({ ok: false, reason: 'server_error' });
        }
    });

    /* --- Optional: server-mediated chat-media upload --- */

    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: MAX_IMAGE_BYTES, files: 1 }
    });

    app.post(
        '/api/storage/chat',
        requireAuth,
        uploadRateLimit,
        (req, res, next) => {
            upload.single('file')(req, res, err => {
                if (err) {
                    console.warn('[upload] rejected:', err && err.code ? err.code : 'upload_error');
                    return res.status(400).json({ error: 'bad_request' });
                }
                return next();
            });
        },
        async (req, res) => {
            const file = req.file;
            const planId = req.body && typeof req.body.planId === 'string' ? req.body.planId.trim() : '';

            if (!file || !planId || !/^[A-Za-z0-9._-]+$/.test(planId)) {
                return res.status(400).json({ error: 'bad_request' });
            }
            if (!IMAGE_TYPES.includes(file.mimetype)) {
                return res.status(400).json({ error: 'bad_request' });
            }
            if (file.size > MAX_IMAGE_BYTES) {
                return res.status(400).json({ error: 'bad_request' });
            }

            const ext = (file.mimetype.split('/')[1] || '').toLowerCase();
            if (!IMAGE_EXTENSIONS.includes(ext)) {
                return res.status(400).json({ error: 'bad_request' });
            }

            try {
                const member = await isPlanMember(planId, req.uid);
                if (!member) return res.status(403).json({ error: 'forbidden' });

                /* Server-generated object path — never trust a client-supplied path. */
                const objectPath = `${planId}/${req.uid}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

                const client = getServerSupabase();
                const { error: upErr } = await client
                    .storage
                    .from(CHAT_MEDIA_BUCKET)
                    .upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: false });

                if (upErr) {
                    console.error('[upload] storage error:', upErr.message || 'error');
                    return res.status(502).json({ error: 'upload_failed' });
                }

                const url = await signChatMedia(objectPath);
                return res.json({ url, path: objectPath });
            } catch (err) {
                console.error('[upload] failed:', err && err.message ? err.message : 'error');
                return res.status(502).json({ error: 'upload_failed' });
            }
        }
    );

    /* --- Generic fallthroughs (no stack traces to clients) --- */

    app.use((req, res) => res.status(404).json({ error: 'not_found' }));

    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        console.error('[error]', err && err.message ? err.message : 'error');
        if (res.headersSent) return;
        res.status(500).json({ error: 'server_error' });
    });

    return app;
}

/* ------------------------------------------------------------------ *
 * Startup
 * ------------------------------------------------------------------ */

function start() {
    const missing = missingEnvVars();
    if (missing.length) {
        /* Actionable, names only — never values. The server does not start. */
        console.error(
            'Cannot start Squado backend: missing required environment variable(s): ' +
            missing.join(', ') + '. ' +
            'Set them in the server environment (see .env.example and SETUP_AUTH_STORAGE.md). ' +
            'Note: SUPABASE_SECRET_KEY may instead be provided as SUPABASE_SERVICE_ROLE_KEY.'
        );
        process.exit(1);
        return;
    }

    const app = createApp();
    app.listen(PORT, () => {
        console.log(`Squado backend listening on port ${PORT}`);
        console.log(`CORS allowlist: ${CORS_ALLOWLIST.join(', ')}`);
        console.log(`Signed-URL TTL: ${SIGNED_URL_TTL_SECONDS}s; bucket allowlist: ${BUCKET_ALLOWLIST.join(', ')}`);
    });
}

/* Run only when executed directly (not when imported for tests). Compare resolved
 * file URLs so this works on both POSIX and Windows paths. */
function isMainModule() {
    const entry = process.argv[1];
    if (!entry) return false;
    try {
        return import.meta.url === pathToFileURL(entry).href;
    } catch {
        return false;
    }
}

if (isMainModule()) {
    start();
}
