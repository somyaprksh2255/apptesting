const unOk = (v, cur) =>
    !/^[a-z0-9_]{3,20}$/.test(v || '')
        ? 'bad'
        : v != cur && S.users.some(u => u.username == v)
            ? 'taken'
            : 'ok';

const unMsg = (v, cur) => {
    const r = unOk(v, cur);

    return !v
        ? ''
        : r == 'ok'
            ? '✅ @' + v + ' is available'
            : r == 'taken'
                ? '❌ Already taken'
                : '3–20 letters, numbers or _';
};

const hostOk = w =>
    !(w == 'Girls only' && S.me.gender != 'Girl') &&
    !(w == 'Boys only' && S.me.gender != 'Boy');