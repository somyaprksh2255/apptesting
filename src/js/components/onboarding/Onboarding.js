/* Onboarding screen: progress + current step + back/next */

const obOk = () => {
    const o = O.ob;
    const s = o.step;

    return s == 0
        ? !!o.name.trim()
        : s == 1
            ? unOk(o.username, '') == 'ok' &&
              O.unRemote != 'taken' &&
              (!(window.FB && FB.on) || O.unRemote == 'ok')
            : s == 2
                ? isCity(o.city)
                : s == 3
                    ? !!o.gender
                    : s == 4
                        ? !!o.age
                        : true;
};

function signup() {
    const o = O.ob;
    const s = o.step;
    const an = o.an;

    o.an = 0;

    const b = ONB_STEPS[s](o);

    return `
        <main>
            <a
                class="back"
                href="#/home"
                data-a="obCancel"
            >
                ${S.me.guest ? '← Back to browsing' : 'Sign out'}
            </a>

            <div
                class="prog"
                role="progressbar"
                aria-label="Setup progress"
                aria-valuemin="1"
                aria-valuemax="6"
                aria-valuenow="${s + 1}"
            >
                <i style="width:${(s + 1) / 6 * 100}%"></i>
            </div>

            <p
                class="mut"
                style="font-size:.85rem;margin:8px 0 18px"
            >
                Step ${s + 1} of 6${s == 5 ? ' · optional' : ''}
            </p>

            <div
                class="step ${an ? 'in' : ''}"
                style="max-width:560px"
            >
                ${b}

                <div
                    class="row"
                    style="margin-top:22px"
                >
                    ${
                        s
                            ? `
                                <button
                                    class="btn ghost"
                                    data-a="obPrev"
                                >
                                    Back
                                </button>
                            `
                            : ''
                    }

                    <button
                        class="btn pink"
                        data-a="obNext"
                        ${obOk() ? '' : 'disabled'}
                    >
                        ${
                            s == 5
                                ? (
                                    o.interests.length
                                        ? 'Let\'s go'
                                        : 'Skip for now'
                                )
                                : 'Next'
                        }
                    </button>
                </div>
            </div>
        </main>
    `;
}