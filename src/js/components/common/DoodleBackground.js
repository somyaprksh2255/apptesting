/* SquadoDoodleBackground — wallpaper of many small hand-drawn, stroke-only, single-colour doodles.
   Custom doodle library (NOT the Lucide UI icons). Composition is generated once per viewport size from a seeded RNG
   (best-candidate scattering: organic, no grid), then left completely static. Fixed layer, never interactive. */

const SquadoDoodleBackground = (() => {
    const c = (x, y, r) =>
        `<circle cx="${x}" cy="${y}" r="${r}"/>`;

    const e = (x, y, a, b) =>
        `<ellipse cx="${x}" cy="${y}" rx="${a}" ry="${b}"/>`;

    const p = d =>
        `<path d="${d}"/>`;

    const V = {
        pin:
            p('M16 29C10 23 6 17 6 12C6 6 10 3 16 3C22 3 26 6 26 12C26 17 22 23 16 29z') +
            c(16, 12, 3.5),

        person:
            c(16, 9, 4.5) +
            p('M7 28C7 21 10 17 16 17C22 17 25 21 25 28'),

        two:
            c(10, 10, 3.6) +
            c(22, 11, 3.2) +
            p('M3 27C3 21 6 18 10 18C14 18 17 21 17 27M18 26C18 22 20 20 23 20C27 20 29 23 29 26'),

        three:
            c(8, 13, 3) +
            c(16, 8, 3.6) +
            c(24, 13, 3) +
            p('M2 28C2 22 5 19 8 19C11 19 13 22 13 25M10 28C10 20 12 17 16 17C20 17 22 20 22 28M19 25C19 22 21 19 24 19C27 19 30 22 30 28'),

        chat:
            p('M5 8C5 6 7 5 9 5H23C25 5 27 6 27 8V18C27 20 25 21 23 21H15L9 27V21C7 21 5 20 5 18zM11 11H21M11 15H17'),

        heart:
            p('M16 28C6 21 3 14 6 9C9 4 15 5 16 10C17 5 24 4 27 9C29 14 26 21 16 28z'),

        camera:
            p('M3 11H10L12 7H20L22 11H29V26H3z') +
            c(16, 18, 5.2) +
            p('M24 14H26'),

        phones:
            p('M6 22V18C6 11 10 6 16 6C22 6 26 11 26 18V22M4 20H9V28H4zM23 20H28V28H23z'),

        coffee:
            p('M5 12H22V21C22 25 19 28 14 28C9 28 5 25 5 21zM22 14H25C28 14 28 20 25 20H22M9 8C7 6 11 5 9 2M15 8C13 6 17 5 15 2'),

        fork:
            p('M8 3V12C8 14 9 15 11 15V29M5 3V10M11 3V10M23 3C19 7 19 14 23 17V29'),

        bowl:
            p('M3 14H29C29 22 23 28 16 28C9 28 3 22 3 14zM21 3L15 12M26 5L20 12'),

        bag:
            p('M6 11H26L27 28H5zM11 11V9C11 6 13 4 16 4C19 4 21 6 21 9V11'),

        ticket:
            p('M3 9H29V14C27 14 27 19 29 19V24H3V19C5 19 5 14 3 14zM21 9V12M21 15V17M21 20V24'),

        foot:
            p('M9 26C5 25 4 20 6 16C8 12 12 12 13 15C14 19 13 24 9 26zM22 19C18 18 17 13 19 9C21 5 25 5 26 8C27 12 26 17 22 19z'),

        note:
            p('M12 25V7L26 4V22M12 7L26 4') +
            e(8, 25, 4, 3.2) +
            e(22, 22, 4, 3.2),

        star:
            p('M16 3L20 12L29 13L22 19L24 28L16 23L8 28L10 19L3 13L12 12z'),

        spark:
            p('M16 3C17 11 20 14 28 16C20 18 17 21 16 29C15 21 12 18 4 16C12 14 15 11 16 3z'),

        sparks:
            p('M9 4V12M5 8H13M23 15V27M17 21H29M25 4V8M23 6H27'),

        cal:
            p('M4 8H28V28H4zM4 14H28M10 4V10M22 4V10M9 20H13M17 20H21'),

        clock:
            c(16, 16, 11.5) +
            p('M16 8V17L22 21'),

        check:
            p('M4 18L11 25L28 7M7 29C14 28 20 28 26 29'),

        list:
            p('M5 7L7 9L11 4M15 7H27M5 17L7 19L11 14M15 17H27M5 27L7 29L11 24M15 27H23'),

        curve:
            p('M4 25C8 12 17 8 25 15M19 9L26 15L17 18'),

        arrow:
            p('M3 19C10 16 17 17 26 16M20 9L27 16L20 23'),

        nav:
            p('M4 15L28 4L17 28L14 18z'),

        compass:
            c(16, 16, 12) +
            p('M21 11L18 19L11 21L14 13z'),

        map:
            p('M3 8L11 5L21 8L29 5V24L21 27L11 24L3 27zM11 5V24M21 8V27'),

        city:
            p('M6 29V8H18V29M18 29V15H26V29M2 29H30M9 12H11M13 12H15M9 17H11M13 17H15M9 22H11M13 22H15'),

        temple:
            p('M4 29H28M7 29V17H25V29M4 17L16 8L28 17M13 29V22H19V29M16 8V3L22 5L16 6'),

        dandiya:
            p('M6 27L25 5M27 27L8 5M11 22L14 25M22 22L19 25') +
            c(26, 4, 2) +
            c(7, 4, 2),

        loop:
            p('M26 16C26 22 21 27 15 27C9 27 5 22 5 16C5 10 10 5 16 5C19 5 21 6 23 8M22 3L24 9L18 9'),

        lights:
            p('M2 6C10 13 22 13 30 6M8 11V15M16 13V17M24 11V15') +
            c(8, 18, 2.2) +
            c(16, 20, 2.2) +
            c(24, 18, 2.2),

        smile:
            c(16, 16, 11.5) +
            p('M10 19C13 24 19 24 22 19M12 13H12.2M20 13H20.2'),

        wave:
            p('M9 18V9C9 6 13 6 13 9V15M13 15V6C13 3 17 3 17 6V15M17 15V8C17 5 21 5 21 8V17M21 17V13C21 10 25 10 25 13V21C25 26 21 29 16 29C12 29 9 26 7 22L4 17C3 14 7 13 8 15L10 18'),

        bike:
            c(8, 22, 5) +
            c(24, 22, 5) +
            p('M8 22L13 11H21L24 22M13 11L17 22M10 8H15'),

        scooter:
            c(7, 25, 3) +
            c(25, 25, 3) +
            p('M10 25H22M22 25L20 6H16M16 6H24'),

        pack:
            p('M8 12C8 7 11 4 16 4C21 4 24 7 24 12V27H8zM12 18H20V24H12zM8 15H4V24H8M12 10H20'),

        squig:
            p('M2 17C5 8 8 24 11 16C14 8 17 24 20 16C23 9 26 22 30 14'),

        motion:
            p('M5 10H17M2 16H23M7 22H19'),

        dots:
            c(6, 8, 1.2) +
            c(15, 5, 1) +
            c(25, 10, 1.2) +
            c(10, 19, 1) +
            c(21, 24, 1.2) +
            c(28, 28, 1),

        swirl:
            p('M7 23C2 12 12 6 19 11C25 16 21 25 14 23C9 21 10 15 15 16'),

        sign:
            p('M16 4V29M7 7H21L25 11L21 15H7zM25 19H11L7 23L11 27H25z'),

        route:
            p('M3 27C11 25 6 15 15 15C24 15 18 7 27 7" stroke-dasharray="1 4') +
            c(28, 6, 2.4),

        x:
            p('M9 9L18 18M18 9L9 18M22 20L27 25M27 20L22 25'),

        diya:
            p('M4 20H28C28 26 23 29 16 29C9 29 4 26 4 20zM16 19C12 15 13 10 16 6C19 10 20 15 16 19z'),

        rangoli:
            p('M16 5C20 9 20 12 16 16C12 12 12 9 16 5zM27 16C23 20 20 20 16 16C20 12 23 12 27 16zM16 27C12 23 12 20 16 16C20 20 20 23 16 27zM5 16C9 12 12 12 16 16C12 20 9 20 5 16z')
    };

    const NAMES = Object.keys(V);

    const W8 = {
        heart: 2,
        spark: 2,
        star: 2,
        dots: 2,
        sparks: 2,
        squig: 1.5,
        arrow: 1.5,
        curve: 1.5,
        x: 1.5,
        motion: 1.5
    };

    function rng(a) {
        return () => {
            a |= 0;
            a = a + 0x6D2B79F5 | 0;

            let t = Math.imul(
                a ^ a >>> 15,
                1 | a
            );

            t =
                t +
                Math.imul(
                    t ^ t >>> 7,
                    61 | t
                ) ^
                t;

            return (
                (t ^ t >>> 14) >>> 0
            ) / 4294967296;
        };
    }

    function layout(W, H) {
        const r = rng(
            2025 + W * 7 + H
        );

        const mob = W < 640;
        const cell = mob ? 52 : 58;
        const k = mob ? .9 : 1;
        const n = Math.round(
            W * H / (cell * cell)
        );

        const sizes = [];

        for (let i = 0; i < n; i++) {
            const x = r();

            sizes.push(
                k * (
                    x < .62
                        ? 16 + r() * 14
                        : x < .92
                            ? 30 + r() * 14
                            : 46 + r() * 20
                )
            );
        }

        sizes.sort(
            (a, b) => b - a
        );

        const bag = [];

        const pick = () => {
            if (!bag.length) {
                NAMES.forEach(m => {
                    for (
                        let j = 0;
                        j < (W8[m] || 1) * 2;
                        j++
                    ) {
                        bag.push(m);
                    }
                });

                for (
                    let j = bag.length - 1;
                    j > 0;
                    j--
                ) {
                    const q = Math.floor(
                        r() * (j + 1)
                    );

                    [
                        bag[j],
                        bag[q]
                    ] = [
                        bag[q],
                        bag[j]
                    ];
                }
            }

            return bag.pop();
        };

        const out = [];

        for (const s of sizes) {
            let best = null;
            let bd = -1;

            for (let t = 0; t < 8; t++) {
                const x =
                    -s * .15 +
                    r() * (W + s * .3);

                const y =
                    -s * .15 +
                    r() * (H + s * .3);

                let d = 1e9;

                for (const o of out) {
                    const dd =
                        Math.hypot(
                            x - o.x,
                            y - o.y
                        ) -
                        (s + o.s) / 2;

                    if (dd < d)
                        d = dd;
                }

                if (d > bd) {
                    bd = d;
                    best = {
                        x,
                        y
                    };
                }
            }

            if (bd < 5)
                continue;

            out.push({
                n: pick(),
                x: best.x,
                y: best.y,
                s,
                r: (r() - .5) * 26,
                f: r() < .4,
                o: .5 + r() * .5
            });
        }

        return out;
    }

    const SK =
        'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

    const R = v =>
        Math.round(v * 10) / 10;

    function svg(W, H) {
        return `
            <svg
                viewBox="0 0 ${W} ${H}"
                preserveAspectRatio="xMinYMin slice"
                ${SK}
            >
                ${layout(W, H)
                    .map(d => {
                        const h = d.s / 2;

                        const t = d.f
                            ? `translate(${R(d.x)} ${R(d.y)}) rotate(${R(d.r)}) scale(-1 1) translate(${-R(d.x)} ${-R(d.y)})`
                            : `rotate(${R(d.r)} ${R(d.x)} ${R(d.y)})`;

                        return `
                            <use
                                href="#dd-${d.n}"
                                x="${R(d.x - h)}"
                                y="${R(d.y - h)}"
                                width="${R(d.s)}"
                                height="${R(d.s)}"
                                opacity="${Math.round(d.o * 100) / 100}"
                                transform="${t}"
                            />
                        `;
                    })
                    .join('')}
            </svg>
        `;
    }

    const symbols = () =>
        `
            <svg
                width="0"
                height="0"
                style="position:absolute"
                aria-hidden="true"
            >
                <defs>
                    ${NAMES
                        .map(
                            k =>
                                `<symbol
                                    id="dd-${k}"
                                    viewBox="0 0 32 32"
                                >
                                    ${V[k].replace(
                                        /<(path|circle|ellipse)/g,
                                        '<$1 vector-effect="non-scaling-stroke"'
                                    )}
                                </symbol>`
                        )
                        .join('')}
                </defs>
            </svg>
        `;

    const size = () => {
        const w =
            document.documentElement.clientWidth ||
            innerWidth;

        const h = Math.max(
            innerHeight,
            w < 900
                ? (screen.height || 0)
                : 0
        );

        return [
            w,
            h
        ];
    };

    function mount() {
        if (
            typeof document == 'undefined' ||
            !document.body ||
            !document.body.insertBefore
        )
            return;

        const el =
            document.createElement('div');

        el.id = 'doodle';
        el.setAttribute(
            'aria-hidden',
            'true'
        );

        let [w, h] = size();

        const draw = () => {
            el.innerHTML =
                symbols() +
                svg(w, h);
        };

        draw();

        document.body.insertBefore(
            el,
            document.body.firstChild
        );

        let tm;

        addEventListener(
            'resize',
            () => {
                clearTimeout(tm);

                tm = setTimeout(
                    () => {
                        const [
                            nw,
                            nh
                        ] = size();

                        if (
                            Math.abs(nw - w) > 40 ||
                            (nw > nh) != (w > h)
                        ) {
                            w = nw;
                            h = nh;

                            draw();
                        }
                    },
                    250
                );
            }
        );
    }

    mount();

    return {
        layout,
        svg,
        symbols,
        V
    };
})();