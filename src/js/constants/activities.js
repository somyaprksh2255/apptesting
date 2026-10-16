/* Activities & interests (T = plan types; icons come from utils/icons.js) */

const T = {
    garba: ['💃', 'Garba', '#FF2E7E'],
    pandal: ['🪔', 'Pandal Hopping', '#FF7A1A'],
    bhandara: ['🍛', 'Bhandara', '#FFC21A'],
    food: ['🍕', 'Food', '#C6F432'],
    chai: ['☕', 'Chai', '#C6F432'],
    photo: ['📸', 'Photo Walk', '#2F7BFF'],
    shopping: ['🛍️', 'Shopping', '#FF2E7E'],
    city: ['🏙️', 'City Explore', '#2F7BFF'],
    outside: ['🫠', 'Still Outside', '#6B3CFF'],
    custom: ['✨', 'Custom', '#6B3CFF'],
    random: ['🎉', 'Random Hangout', '#2F7BFF']
};

Object.keys(T).forEach(
    k =>
        Object.defineProperty(
            T[k],
            0,
            {
                get: () => I(TI[k], '1em')
            }
        )
);

const INT = [
    '💃 Garba',
    '🪔 Pandal hopping',
    '☕ Chai',
    '🍕 Food',
    '📸 Photos',
    '🍛 Bhandara',
    '🛍️ Shopping',
    '🚶 Exploring',
    '🎶 Music',
    '🎬 Movies',
    '⚽ Sports',
    '🎮 Gaming'
];

const AGES = [
    '18–20',
    '21–24',
    '25–29',
    '30+'
];

const INT_T = {
    '💃 Garba': 'garba',
    '🪔 Pandal hopping': 'pandal',
    '☕ Chai': 'chai',
    '🍕 Food': 'food',
    '📸 Photos': 'photo',
    '🍛 Bhandara': 'bhandara',
    '🛍️ Shopping': 'shopping',
    '🚶 Exploring': 'city'
};

const MT = {
    Chai: 'chai',
    Food: 'food',
    Garba: 'garba',
    'Pandal Hopping': 'pandal',
    Photos: 'photo',
    Walk: 'city',
    Explore: 'city',
    Custom: 'custom'
};