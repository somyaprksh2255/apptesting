/* Auth UI: prompt, loading, and honest diagnostics (real Google sign-in lives in app/auth.js; nothing here simulates a login) */

function authGate(t) {
    const cid = gClientId ? gClientId() : '';
    const googleAvailable = !!(cid && location.protocol !== 'file:');

    modal(
        `<h2 style="margin-top:0">
            ${t || 'Want to join the squad?'}
        </h2>

        <p class="mut">
            One tap. No passwords.
        </p>

        ${googleAvailable
            ? `<button
                class="btn wide gbtn"
                data-a="gGoogle"
            >
                <img
                    src="assets/google-g.svg"
                    alt=""
                    width="18"
                    height="18"
                >
                Continue with Google
            </button>`
            : `<button
                class="btn wide gbtn"
                data-a="gGoogle"
                style="opacity:.45;cursor:default"
                disabled
                title="Google sign-in not configured"
            >
                <img
                    src="assets/google-g.svg"
                    alt=""
                    width="18"
                    height="18"
                >
                Continue with Google
            </button>
            <p class="mut" style="font-size:.75rem;margin:4px 0 6px;text-align:center">
                Google sign-in isn't configured yet.
            </p>`
        }

        <p style="text-align:center;margin-top:6px">
            <button
                class="btn ghost sm"
                data-a="close"
            >
                Not now
            </button>
        </p>`
    );
}

/* loading state: only ever shows the step that is actually running */
const authLoading = m =>
    `<div class="authst" role="status">
        <span class="spin"></span>

        <h2>
            ${m}
        </h2>

        <p class="mut">
            Just a sec
        </p>
    </div>`;

const AUTH_PROBLEMS = {
    config: ['Google sign-in isn\'t set up', 'This copy of Squado has no Google client ID yet, so signing in is unavailable. The site owner needs to add one (see update-readme.txt).', 0],
    badclient: ['Google client ID looks wrong', 'It should end in .apps.googleusercontent.com (copy it from Google Cloud Console > APIs & Services > Credentials > your Web application client). Nothing was sent to Google.', 0],
    file: ['Open Squado from a web address', 'Google sign-in doesn\'t work from a file:// page. Serve the project (for example VS Code Live Preview or npm run dev) and open the http://127.0.0.1 address.', 0],
    network: ['Couldn\'t reach Google', 'Check your connection and try again.', 1],
    cancelled: ['Sign-in cancelled', 'The Google window was closed before sign-in finished. Try again whenever you\'re ready.', 1],
    blocked: ['Pop-up blocked', 'The Google sign-in window couldn\'t open. Allow pop-ups for this site and try again. In an embedded preview (for example inside an editor) open this page in a normal browser tab instead.', 1],
    unverified: ['Email not verified', 'Google says the email on this account isn\'t verified. Verify it with Google, then try again.', 1],
    lookup: ['Couldn\'t check your profile', 'We couldn\'t read your saved profile. Nothing was created or changed. Try again.', 1],
    save: ['Couldn\'t save your profile', 'Your device storage didn\'t accept the change. Free some space and try again; no duplicate profile was created.', 1],
    failed: ['Couldn\'t sign you in', 'Google sign-in didn\'t complete. Try again.', 1]
};

/* what to tell a developer when Google's own window shows an error page (we only see "closed") */
const originNote = () =>
    location.origin && location.origin != 'null'
        ? `<p class="mut" style="font-size:.8rem">If Google's window showed an error such as <b>origin_mismatch</b> or <b>invalid_client</b>, add <b>${esc(location.origin)}</b> (no path, no query) to the OAuth client's Authorized JavaScript origins and check that the client ID is for a Web application.</p>`
        : '';

const devSetup = bad =>
    isLocalDev()
        ? `<p class="mut" style="font-size:.8rem;margin:10px 0 4px">
                Local testing (${esc(location.origin || location.hostname)}): paste your Web client ID. It is saved on this origin only, outside the project files.
            </p>
            ${devClientId() ? '<p class="mut" style="font-size:.8rem;margin:0 0 4px">A saved ID is present but not valid.</p>' : ''}
            <input type="text" data-in="dev.cid" value="${esc(bad || '')}" placeholder="123456789-abc.apps.googleusercontent.com" aria-label="Google OAuth client ID" autocomplete="off" spellcheck="false">
            <div class="row" style="margin-top:8px">
                <button class="btn pink sm" data-a="gDevSave">Save ID</button>
                ${devClientId() ? '<button class="btn ghost sm" data-a="gDevClear">Remove saved ID</button>' : ''}
            </div>`
        : '';

const authProblem = (code, extra) => {
    const m = AUTH_PROBLEMS[code] || AUTH_PROBLEMS.failed;
    const note = ['cancelled', 'failed', 'blocked'].includes(code)
        ? originNote()
        : code == 'config' || code == 'badclient'
            ? (location.origin && location.origin != 'null'
                ? `<p class="mut" style="font-size:.8rem">Origin to authorize in Google Cloud: <b>${esc(location.origin)}</b></p>`
                : '') + devSetup(extra)
            : '';

    return `<div class="authst">
        <span class="okc bad">
            ${I('x', '26px')}
        </span>

        <h2>
            ${m[0]}
        </h2>

        <p class="mut">
            ${m[1]}
        </p>
        ${note}
    </div>

    ${
        m[2]
            ? `<button
                class="btn pink wide"
                data-a="gGoogle"
            >
                Try again
            </button>`
            : ''
    }

    <p style="text-align:center">
        <button
            class="btn ghost sm"
            data-a="close"
        >
            Not now
        </button>
    </p>`;
};

/* profiles made before accounts were tied to Google: the signed-in Google user may link one, once */
const authLink = () =>
    `<h2 style="margin-top:0">
        Link an existing profile?
    </h2>

    <p class="mut">
        These profiles were saved on this device before Google sign-in. Link one to your Google account, or start fresh.
    </p>

    ${legacyAccounts()
        .map(
            u =>
                `<button
                    class="li"
                    data-a="linkAcct"
                    data-v="${u.id}"
                >
                    ${av(u.id, 40)}

                    <div style="flex:1;text-align:left">
                        <b>${esc(u.name)}</b>
                        <br>
                        <span class="mut">@${esc(u.username)}</span>
                    </div>

                    ${I('chevron-right')}
                </button>`
        )
        .join('')}

    <button
        class="btn pink wide"
        data-a="newGoogleAcct"
    >
        Create a new profile
    </button>

    <p style="text-align:center">
        <button
            class="btn ghost sm"
            data-a="close"
        >
            Not now
        </button>
    </p>`;
