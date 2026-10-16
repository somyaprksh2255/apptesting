const mins = w => {
    if (w == 'LIVE NOW')
        return 0;

    const m = /(\d+):(\d+) (AM|PM)/.exec(w);

    return m
        ? (+m[1] % 12 + (m[3] == 'PM' ? 12 : 0)) * 60 + +m[2]
        : 999;
};

const nowM = () => {
    const t = new Date();

    return t.getHours() * 60 + t.getMinutes();
};

const hm = () =>
    new Date().toLocaleTimeString(
        [],
        {
            hour: '2-digit',
            minute: '2-digit'
        }
    );