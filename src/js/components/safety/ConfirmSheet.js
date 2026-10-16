/* Destructive actions always ask first (leave / cancel / remove / block). */

const CONF = {
    leave: {
        t: 'Leave this squad?',
        b: 'You can ask to join again later if there\'s room.',
        c: 'Leave squad',
        i: 'log-out'
    },

    cancel: {
        t: 'Cancel this plan?',
        b: 'Everyone in the squad is told. This can\'t be undone.',
        c: 'Cancel plan',
        i: 'circle-x'
    },

    remove: {
        t: 'Remove from squad?',
        b: 'They\'ll be told, lose access to this squad and can\'t ask to join it again. It doesn\'t affect any other squad.',
        c: 'Remove',
        i: 'user-minus'
    },

    block: {
        t: 'Block this person?',
        b: 'You won\'t see each other\'s plans or messages.',
        c: 'Block',
        i: 'ban'
    },

    /* host completes the meetup. Reuses A.end (compHost); completion does not auto-submit feedback. */
    end: {
        t: 'Has this plan been completed?',
        b: 'Confirm that the meetup has taken place. Completing the plan will move the group into the feedback process.',
        c: 'Complete plan',
        i: 'check'
    }
};

function confirmSheet() {
    const c = O.confirm;
    const x = CONF[c.do];

    modal(
        `<div class="authst">
            <span class="okc bad">
                ${I(x.i, '26px')}
            </span>

            <h2>${x.t}</h2>

            <p class="mut">
                ${x.b}
            </p>
        </div>

        <button
            class="btn wide danger"
            data-a="confirmed"
        >
            ${x.c}
        </button>

        <p style="text-align:center">
            <button
                class="btn ghost sm"
                data-a="close"
            >
                Keep it
            </button>
        </p>`
    );
}