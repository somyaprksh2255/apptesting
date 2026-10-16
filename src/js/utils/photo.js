function photo(f, cb) {
    const r = new FileReader();

    r.onload = () => {
        const i = new Image();

        i.onload = () => {
            const c = document.createElement('canvas');

            c.width = c.height = 200;

            const z = Math.min(i.width, i.height);

            c.getContext('2d').drawImage(
                i,
                (i.width - z) / 2,
                (i.height - z) / 2,
                z,
                z,
                0,
                0,
                200,
                200
            );

            cb(c.toDataURL('image/jpeg', .8));
        };

        i.src = r.result;
    };

    r.readAsDataURL(f);
}