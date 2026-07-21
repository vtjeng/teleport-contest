// Object-name data shared by source owners which call objnam.c helpers.
// C ref: objnam.c Japanese_items[].

import {
    BROADSWORD,
    FLAIL,
    FOOD_RATION,
    GLAIVE,
    HELMET,
    KNIFE,
    LEATHER_GLOVES,
    LOCK_PICK,
    MAGIC_HARP,
    PLATE_MAIL,
    POT_BOOZE,
    SHORT_SWORD,
    WOODEN_HARP,
} from './objects.js';

export const JAPANESE_ITEMS = Object.freeze([
    Object.freeze({ otyp: SHORT_SWORD, name: 'wakizashi' }),
    Object.freeze({ otyp: BROADSWORD, name: 'ninja-to' }),
    Object.freeze({ otyp: FLAIL, name: 'nunchaku' }),
    Object.freeze({ otyp: GLAIVE, name: 'naginata' }),
    Object.freeze({ otyp: LOCK_PICK, name: 'osaku' }),
    Object.freeze({ otyp: WOODEN_HARP, name: 'koto' }),
    Object.freeze({ otyp: MAGIC_HARP, name: 'magic koto' }),
    Object.freeze({ otyp: KNIFE, name: 'shito' }),
    Object.freeze({ otyp: PLATE_MAIL, name: 'tanko' }),
    Object.freeze({ otyp: HELMET, name: 'kabuto' }),
    Object.freeze({ otyp: LEATHER_GLOVES, name: 'yugake' }),
    Object.freeze({ otyp: FOOD_RATION, name: 'gunyoki' }),
    Object.freeze({ otyp: POT_BOOZE, name: 'sake' }),
]);

export const JAPANESE_ITEM_NAMES = new Map(
    JAPANESE_ITEMS.map(({ otyp, name }) => [otyp, name]),
);
export const JAPANESE_ITEM_TYPES = new Set(
    JAPANESE_ITEMS.map(({ otyp }) => otyp),
);
