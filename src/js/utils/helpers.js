const path = k => {
    const p = k.split('.');
    const o = p[0] == 'me' ? S : O;

    let t = o;

    if (p[0] == 'me')
        t = S;

    p.slice(0, -1).forEach(
        x => t = t[x]
    );

    return [
        t,
        p[p.length - 1]
    ];
};

const goHash = h => {
    location.hash = h;
};