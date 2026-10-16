const msgs = id => {
    if (!S.msgs[id]) {
        const p = pl(id);

        S.msgs[id] = [
            {
                sys: 1,
                x: `${usr(p.creator).name} started the plan 🪩`
            },
            {
                by: p.creator,
                x: 'Pull up whenever. I\'ll share the exact spot here 📍'
            }
        ];
    }

    return S.msgs[id];
};

const sys = (id, x) =>
    msgs(id).push({
        sys: 1,
        x
    });