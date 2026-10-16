/* Device access for chat attachments. Nothing here runs until the person taps the matching option,
   and every failure is reported to the caller so the sheet can show a retry / instructions state. */

/* Automatically resize and compress chat photos before they enter the app's storage.
   Target a modest payload without asking the sender to choose a size or quality. */
function mediaShrink(src, w, h) {
    const maxEdge = 960;
    const k = Math.min(1, maxEdge / Math.max(w, h, 1));
    const c = document.createElement('canvas');

    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));

    const x = c.getContext('2d', { alpha: false });
    x.fillStyle = '#fff';
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(src, 0, 0, c.width, c.height);

    let quality = .72;
    let output = c.toDataURL('image/jpeg', quality);
    const targetBytes = 360 * 1024;
    while (output.length * .75 > targetBytes && quality > .48) {
        quality = Math.max(.48, quality - .08);
        output = c.toDataURL('image/jpeg', quality);
    }
    if (output.length * .75 > targetBytes && Math.max(c.width, c.height) > 640) {
        const scale = 640 / Math.max(c.width, c.height);
        const smaller = document.createElement('canvas');
        smaller.width = Math.max(1, Math.round(c.width * scale));
        smaller.height = Math.max(1, Math.round(c.height * scale));
        smaller.getContext('2d', { alpha: false }).drawImage(c, 0, 0, smaller.width, smaller.height);
        output = smaller.toDataURL('image/jpeg', .52);
    }
    return output;
}

/* '' if the file may be used, otherwise the message to show. Checked before the file is even read. */
function mediaValidate(file) {
    const cfg = window.SQUADO_CONFIG || {};
    const types = cfg.imageTypes || ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const max = (+cfg.maxImageMB || 10) * 1024 * 1024;

    if (!file || typeof file.type != 'string' || !types.includes(file.type.toLowerCase()))
        return 'That file type isn\'t supported. Choose a JPG, PNG, WebP or GIF image.';

    /* a real File always reports its size; only an explicit 0 or an over-limit size is refused */
    if (file.size === 0)
        return 'That file looks empty. Try another image.';

    if (Number.isFinite(file.size) && file.size > max)
        return 'That image is too large (max ' + Math.round(max / 1048576) + ' MB). Try a smaller one.';

    return '';
}

function mediaPhoto(file, cb) {
    const why = mediaValidate(file);

    if (why)
        return toast(why);

    const bad = () => toast('Couldn\'t load that image. Try another one.');
    const r = new FileReader();

    r.onload = () => {
        const i = new Image();

        i.onload = () => cb && cb(mediaShrink(i, i.naturalWidth || i.width, i.naturalHeight || i.height));
        i.onerror = bad;
        i.src = r.result;
    };
    r.onerror = bad;
    r.readAsDataURL(file);
}

/* onFail(kind): 'denied' | 'unavailable' | 'error' */
function mediaCamera(onStream, onFail) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
        return onFail && onFail('unavailable');

    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: 'environment'
        },
        audio: false
    })
        .then(stream => onStream && onStream(stream))
        .catch(e =>
            onFail &&
            onFail(
                e && (e.name == 'NotAllowedError' || e.name == 'PermissionDeniedError' || e.name == 'SecurityError')
                    ? 'denied'
                    : e && (e.name == 'NotFoundError' || e.name == 'DevicesNotFoundError')
                        ? 'unavailable'
                        : 'error'
            )
        );
}

/* onFail(kind): 'denied' | 'unavailable' | 'timeout' | 'error' */
function mediaLocation(onLoc, onFail) {
    if (!navigator.geolocation)
        return onFail && onFail('unavailable');

    navigator.geolocation.getCurrentPosition(
        p => onLoc && onLoc({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            acc: Math.round(p.coords.accuracy || 0)
        }),
        e =>
            onFail &&
            onFail(
                e && e.code == 1
                    ? 'denied'
                    : e && e.code == 3
                        ? 'timeout'
                        : 'error'
            ),
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}
