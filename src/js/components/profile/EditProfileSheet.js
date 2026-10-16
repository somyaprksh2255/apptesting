function editSheet() {
    const e = O.ed;
    const q = $('#modal .sheet');
    const y = q ? q.scrollTop : 0;

    modal(
        `<h2 style="margin-top:0">Edit profile</h2>

        <div class="row">
            ${
                e.photo
                    ? `
                        <img
                            class="av"
                            alt=""
                            src="${e.photo}"
                            style="width:64px;height:64px;object-fit:cover"
                        >
                    `
                    : `
                        <span
                            class="av"
                            style="width:64px;height:64px;background:var(--pink);font-size:26px"
                        >
                            ${esc((e.name || '?')[0])}
                        </span>
                    `
            }

            <label class="btn ghost sm">
                Change pic
                <input
                    type="file"
                    accept="image/*"
                    hidden
                    data-photo="ed"
                >
            </label>
        </div>

        <p>
            <b>Name</b>
        </p>

        <input
            type="text"
            data-in="ed.name"
            value="${esc(e.name)}"
            maxlength="24"
            aria-label="Name"
        >

        <p>
            <b>Username</b>
        </p>

        <input
            type="text"
            data-in="ed.username"
            value="${esc(e.username)}"
            maxlength="20"
            autocapitalize="none"
            aria-label="Username"
        >

        <small
            id="un"
            class="mut"
        >
            ${unMsg(e.username, S.me.username)}
        </small>

        <p>
            <b>Bio</b>
        </p>

        <textarea
            rows="2"
            maxlength="120"
            data-in="ed.bio"
            aria-label="Bio"
        >${esc(e.bio)}</textarea>

        <p>
            <b>Gender</b>
        </p>

        ${chips(
            [
                'Girl',
                'Boy',
                'Other',
                'Prefer not to say'
            ],
            'ed.gender',
            e.gender
        )}

        <p>
            <b>Age group</b>
        </p>

        ${chips(
            AGES,
            'ed.age',
            e.age
        )}

        <p><b>Default location</b></p>
        <div class="location-city-card">
          <div><span class="location-city-card__eyebrow">YOUR CITY</span><b>${esc(e.city || 'Choose your city')}</b>${e.cityState ? `<small>${esc(e.cityState)}</small>` : ''}</div>
          <div class="location-city-card__actions"><button class="btn pink sm" data-a="locationPicker" data-v="ed.city">Change city</button></div>
        </div>

        <p>
            <b>Interests</b>
        </p>

        ${chips(
            INT,
            'ed.interests',
            e.interests,
            1
        )}

        <p style="margin-top:16px">
            <button
                class="btn pink wide"
                data-a="saveEd"
                ${e.uploading ? 'disabled style="opacity:.6;cursor:default"' : ''}
            >
                ${e.uploading ? 'Uploading…' : 'Save'}
            </button>
        </p>`
    );

    O.editing = 1;

    const n = $('#modal .sheet');

    if (n)
        n.scrollTop = y;
}