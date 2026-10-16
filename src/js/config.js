/* Public runtime configuration.
   googleClientId: the OAuth 2.0 *Web application* client ID from Google Cloud Console (APIs & Services > Credentials).
   A client ID is public by design (it is not a secret). While it is empty, "Continue with Google" shows a
   "not set up" message: no sign-in is simulated. Add your deployed site's origin to the client's
   "Authorized JavaScript origins". See README "Google sign-in setup" and update-readme.txt (UPDATE 5). Local origin used in testing: http://127.0.0.1:3000 */
window.SQUADO_CONFIG = {
    /* --- PUBLIC-by-design authentication/backend config (design §7.5) ---
       Every value in this object is safe to ship in the browser bundle. The Supabase project URL,
       the Supabase *publishable/anon* key and the Google OAuth *client ID* are public identifiers —
       Row Level Security and server-side token validation protect the data, not the secrecy of these
       strings. apiBaseUrl is the Express backend origin ('' = same-origin / backend disabled).
       NEVER place a server-only secret here: the Supabase SECRET (service-role) key, the Google OAuth
       client SECRET, and the database password must live only in the server's .env and must never
       appear in this file, any frontend source, or any committed file. */
    supabaseUrl: '',
    supabasePublishableKey: '',
    apiBaseUrl: '',
    googleClientId: '',

    /* The real, deployed https address of this app, used inside meetup QR codes so a phone's camera opens Squado in its browser.
       GitHub Pages example: 'https://your-user.github.io/your-repo/'  (include the repository path; no #, no localhost).
       While empty, QR codes are NOT generated (nothing is guessed). */
    appBaseUrl: '',

    /* hours a check-in code stays valid after the organizer starts it (they can close or replace it earlier) */
    checkInHours: 6,

    /* NOTE: completion is host-only — the host's confirmation alone completes a meetup (an open dispute from a
       verified attendee still blocks it). This value no longer gates completion; it is kept because README/copy
       reference it and compNeed/compHave are still defined. */
    completionConfirmations: 1,

    /* days a Google-confirmed sign-in stays valid on this device before the person is asked to sign in again */
    sessionDays: 30,

    /* squad capacity limits (the Create screen offers 2 to 8) */
    minSquad: 2,
    maxSquad: 8,

    /* chat: longest text message, largest attachment and the image types accepted (frontend limits, not security) */
    chatMaxLen: 300,
    maxImageMB: 10,
    imageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
};
