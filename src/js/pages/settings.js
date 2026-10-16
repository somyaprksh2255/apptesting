function settings() {
    return `
        <main style="max-width:600px">
            <a class="back" href="#" data-a="goBack">
                ← Back
            </a>

            <h1>Settings</h1>

            <h2>Community guidelines</h2>

            <ul class="mut">
                <li>Be kind. No harassment, ever.</li>
                <li>Meet in public, busy places. Tell someone where you're going.</li>
                <li>Squado is 16+. No sharing exact live location publicly.</li>
                <li>Report anything off. Reported plans go under review.</li>
            </ul>

            <h2>Preferences</h2>

            <button class="chip" aria-pressed="${S.notif}" data-a="notif">
                🔔 Plan notifications
            </button>

            <button
                class="chip"
                style="margin-left:8px"
                aria-pressed="${geoOn()}"
                data-a="${geoOn() ? 'geoOff' : 'geo'}"
            >
                📍 Location
            </button>

            <button
                class="chip"
                style="margin-left:8px"
                data-a="theme"
            >
                🌗 Switch theme
            </button>

            <h2>Privacy &amp; safety</h2>

            ${blockedUsersSummary()}

            <p style="margin-top:12px">
                <button class="btn ghost" data-a="logout">
                    ${I('log-out')} Log out
                </button>
            </p>
        </main>
    `;
}