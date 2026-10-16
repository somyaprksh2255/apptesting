/* Chat attachments: Camera, Location, Cancel.
   Camera and location are requested only after the person taps that option, and nothing is sent until they
   confirm on a preview. A photo carries a location only if they tap "Attach my current location".
   The pending attachment lives in O.media; O.tok (bumped by every modal() change) makes a late camera /
   location answer from a sheet that was already closed do nothing. */

const locUrl = l =>
    l && Number.isFinite(l.lat) && Number.isFinite(l.lng)
        ? `https://www.google.com/maps?q=${l.lat},${l.lng}`
        : '';

const locText = l =>
    Number.isFinite(l.lat) && Number.isFinite(l.lng)
        ? `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`
        : '';

const mediaWait = (title, note) => `
    <div class="authst">
        <span class="spin"></span>
        <h2>${title}</h2>
        <p class="mut">${note}</p>
    </div>
    <button
        class="btn ghost"
        style="width:100%;margin-top:8px"
        data-a="close"
    >
        Cancel
    </button>
`;

function mediaSheet(id) {
    return `
        <h2 style="margin-top:0">
            Share something
        </h2>
        <div
            style="
                display:grid;
                grid-template-columns:repeat(2,minmax(0,1fr));
                gap:10px;
                margin-top:16px
            "
        >
            <button
                class="card"
                style="border:0;cursor:pointer;text-align:center"
                data-a="openMediaCamera"
                data-v="${id}"
            >
                <span style="font-size:28px">📷</span>
                <br>
                <b>Camera</b>
            </button>
            <button
                class="card"
                style="border:0;cursor:pointer;text-align:center"
                data-a="openMediaLocation"
                data-v="${id}"
            >
                <span style="font-size:28px">📍</span>
                <br>
                <b>Location</b>
            </button>
        </div>
        <button
            class="btn ghost"
            style="width:100%;margin-top:14px"
            data-a="close"
        >
            Cancel
        </button>
    `;
}

/* shown when the camera or location can't be used: says why, and offers Try again */
function mediaProblem(id, what, why) {
    const T = {
        camera: {
            denied: [
                'Camera access is blocked',
                'Squado can\'t use your camera yet. Allow camera access for this site in your browser\'s address bar or settings, then tap Try again.'
            ],
            unavailable: [
                'No camera available',
                'We couldn\'t find a camera available to Squado on this device.'
            ],
            error: [
                'Couldn\'t open the camera',
                'Something went wrong starting the camera. Close other apps that might be using it and try again.'
            ]
        },
        location: {
            denied: [
                'Location access is blocked',
                'Allow location access for this site in your browser settings, then tap Try again. Nothing is shared unless you confirm it.'
            ],
            unavailable: [
                'Location isn\'t available here',
                'This browser or device can\'t share a location right now.'
            ],
            timeout: [
                'Taking too long to find you',
                'Move somewhere with a better signal and try again.'
            ],
            error: [
                'Couldn\'t get your location',
                'Something went wrong. Try again in a moment.'
            ]
        }
    };
    const m = T[what][why] || T[what].error;

    return `
        <h2 style="margin-top:0">
            ${m[0]}
        </h2>
        <p class="mut">
            ${m[1]}
        </p>
        <button
            class="btn pink"
            style="width:100%;margin-top:6px"
            data-a="${what == 'camera' ? 'mediaRetry' : 'openMediaLocation'}"
            data-v="${id}"
        >
            Try again
        </button>
        <button
            class="btn ghost"
            style="width:100%;margin-top:8px"
            data-a="close"
        >
            Cancel
        </button>
    `;
}

function openMediaCamera(e) {
    mediaCameraStream(e.dataset.v);
}

function mediaCameraStream(id) {
    modal(mediaWait('Opening camera…', 'Allow camera access when your browser asks.'));

    const tok = O.tok;

    mediaCamera(
        stream => {
            if (O.tok != tok)
                return stream.getTracks().forEach(t => t.stop());

            modal(`
                <h2 style="margin-top:0">
                    Take a photo
                </h2>
                <div
                    style="
                        width:100%;
                        aspect-ratio:4/3;
                        background:#000;
                        border-radius:16px;
                        overflow:hidden;
                    "
                >
                    <video
                        autoplay
                        playsinline
                        muted
                        style="width:100%;height:100%;object-fit:cover"
                    ></video>
                </div>
                <button
                    class="btn pink"
                    style="width:100%;margin-top:14px"
                    data-a="capturePhoto"
                    data-v="${id}"
                >
                    Take photo
                </button>
                <button
                    class="btn ghost"
                    style="width:100%;margin-top:8px"
                    data-a="close"
                >
                    Cancel
                </button>
            `);

            const sheet = $('#modal');
            const video = sheet.querySelector('video');

            sheet._cameraStream = stream;

            if (video) {
                video.srcObject = stream;

                if (video.play)
                    video.play().catch(() => { });
            }
        },
        why => {
            if (O.tok == tok)
                modal(mediaProblem(id, 'camera', why));
        }
    );
}

function capturePhoto(e) {
    const id = e.dataset.v;
    const sheet = $('#modal');
    const video = sheet && sheet.querySelector('video');

    if (!video || !video.videoWidth)
        return toast('The camera is still starting. Try again in a second.');

    O.media = {
        id,
        type: 'photo',
        src: mediaShrink(video, video.videoWidth, video.videoHeight),
        loc: null,
        from: 'camera'
    };

    /* opening the preview closes the camera sheet, which stops the stream */
    mediaPreview();
}

function mediaRetry(e) {
    mediaCameraStream(e.dataset.v);
}

function mediaPreview() {
    const m = O.media;

    if (!m || m.type != 'photo')
        return modal('');

    const cam = m.from == 'camera';

    modal(`
        <h2 style="margin-top:0">
            Preview
        </h2>
        <div
            style="
                width:100%;
                aspect-ratio:4/3;
                background:#000;
                border-radius:16px;
                overflow:hidden;
            "
        >
            <img
                src="${esc(m.src)}"
                style="width:100%;height:100%;object-fit:contain"
                alt="Photo preview"
            >
        </div>
        <div
            style="
                display:flex;
                gap:8px;
                margin-top:14px
            "
        >
            <button
                class="btn ghost"
                style="flex:1"
                data-a="mediaRetry"
                data-v="${m.id}"
            >
                Retake
            </button>
            <button
                class="btn pink"
                style="flex:1"
                data-a="sendMedia"
                data-k="${m.id}"
            >
                Send
            </button>
        </div>
        ${
            m.loc
                ? `
                    <p class="mut" style="margin:10px 0 0;text-align:center">
                        📍 Your current location (${locText(m.loc)}) will be sent with this photo.
                    </p>
                    <button
                        class="btn ghost"
                        style="width:100%;margin-top:8px"
                        data-a="detachLocation"
                        data-v="${m.id}"
                    >
                        Remove location
                    </button>
                `
                : `
                    <button
                        class="btn ghost"
                        style="width:100%;margin-top:10px"
                        data-a="attachLocation"
                        data-v="${m.id}"
                    >
                        📍 Attach my current location
                    </button>
                `
        }
        <button
            class="btn ghost"
            style="width:100%;margin-top:8px"
            data-a="close"
        >
            Cancel
        </button>
    `);
}

function attachLocation() {
    if (!O.media || O.media.type != 'photo')
        return;

    const tok = O.tok;
    const note = {
        denied: 'Location blocked. Allow it in your browser settings and try again.',
        unavailable: 'Location isn\'t available here.',
        timeout: 'Couldn\'t find you in time. Try again.',
        error: 'Couldn\'t get your location. Try again.'
    };

    toast('Getting your current location... 📍');

    mediaLocation(
        loc => {
            if (O.tok != tok || !O.media)
                return;

            O.media.loc = loc;
            mediaPreview();
        },
        why => {
            if (O.tok == tok)
                toast(note[why] || note.error);
        }
    );
}

function detachLocation() {
    if (O.media) {
        O.media.loc = null;
        mediaPreview();
    }
}

function openMediaLocation(e) {
    const id = e.dataset.v;

    modal(mediaWait('Getting your location…', 'Allow location access when your browser asks.'));

    const tok = O.tok;

    mediaLocation(
        loc => {
            if (O.tok != tok)
                return;

            O.media = {
                id,
                type: 'location',
                loc
            };
            locationPreview();
        },
        why => {
            if (O.tok == tok)
                modal(mediaProblem(id, 'location', why));
        }
    );
}

function locationPreview() {
    const m = O.media;

    if (!m || m.type != 'location')
        return modal('');

    modal(`
        <h2 style="margin-top:0">
            Share location
        </h2>
        <div
            class="card"
            style="text-align:center;padding:24px 16px"
        >
            <div style="font-size:42px">
                📍
            </div>
            <b>Current location ready</b>
            <p class="mut" style="margin:6px 0 0">
                ${locText(m.loc)}${m.loc.acc ? ` · about ${m.loc.acc} m` : ''}
            </p>
            <a
                class="mlink"
                href="${locUrl(m.loc)}"
                target="_blank"
                rel="noopener noreferrer"
            >
                Check it in Maps
            </a>
            <p class="mut" style="margin:10px 0 0">
                Your exact location will be sent to this squad chat.
            </p>
        </div>
        <button
            class="btn pink"
            style="width:100%;margin-top:14px"
            data-a="sendMedia"
            data-k="${m.id}"
        >
            Share location
        </button>
        <button
            class="btn ghost"
            style="width:100%;margin-top:8px"
            data-a="close"
        >
            Cancel
        </button>
    `);
}
