/* Single source of truth for navigation: mobile bottom bar and desktop sidebar render the same items */

const NAV = [
    {
        h: 'home',
        l: 'Home',
        i: 'house'
    },
    {
        h: 'explore',
        l: 'Discover',
        i: 'compass'
    },
    {
        h: 'create',
        l: 'Create',
        i: 'plus'
    },
    {
        h: 'groups',
        l: 'Groups',
        i: 'messages-square'
    },
    {
        h: 'me',
        l: 'Profile',
        i: 'user-round'
    }
];

const NAVMAP = {
    plan: 'explore',
    event: 'explore',
    posted: 'groups',
    gc: 'groups',
    outside: 'create',
    settings: 'me'
};