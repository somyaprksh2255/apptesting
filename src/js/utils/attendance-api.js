/* Host check-in backend call (classic <script>, bare global — NOT an ES module).
   Mirrors utils/storage.js signChatMedia() exactly: POSTs to the Express attendance endpoint with the HOST's
   current Supabase access token. The server runs all 8 authorization checks against trusted DB rows and owns the
   authoritative record; this client only sends { planId, scannedUid } and reads back a structured outcome.

   The fetch target is the RUNTIME concat `base + '/api/attendance/checkin'` (base = SQUADO_CONFIG.apiBaseUrl || '',
   so relative/same-origin when empty) — never a hardcoded absolute https literal, matching the signChatMedia shape.

   Returns the server body { ok, reason, uid?, name? } on a parseable response, or { ok:false, reason:'network' }
   when the response has no usable body. A thrown fetch (backend unreachable) is NOT caught here — the caller
   (scanHandle) wraps this in try/catch and maps a rejection to the same 'network' line. Never reports a fake
   success: S.attendance is written by the caller ONLY after a confirmed server checked_in/duplicate. */
async function hostCheckInRemote(planId, scannedUid) {
    const cfg = (typeof window !== 'undefined' && window.SQUADO_CONFIG) || {};
    const base = cfg.apiBaseUrl || '';
    const token = typeof supabaseAccessToken === 'function' ? await supabaseAccessToken() : '';

    const res = await fetch(base + '/api/attendance/checkin', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({ planId, scannedUid })
    });

    let body = null;

    try {
        body = await res.json();
    }
    catch (e) { /* non-JSON / empty body (e.g. !res.ok with no payload) */ }

    if (!body || typeof body.ok !== 'boolean')
        return { ok: false, reason: 'network' };

    return body;   /* { ok, reason, uid?, name? } */
}
