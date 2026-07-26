import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MFAST,
    OBJ_FLOOR,
    POLY_TRAP,
    W_ARMG,
    W_WEP,
} from '../js/const.js';
import {
    can_blow,
    cures_stoning,
    mcould_eat_tin,
    searches_for_item,
    select_fresh_monster_item_action,
    select_misc_action,
} from '../js/muse.js';
import {
    M1_ANIMAL,
    M1_BREATHLESS,
    M1_MINDLESS,
    M1_NOHEAD,
    PM_COCKATRICE,
    PM_FIRE_ELEMENTAL,
    PM_FLOATING_EYE,
    PM_GHOST,
    PM_GNOME,
    PM_HUMAN,
    PM_KI_RIN,
    PM_LIZARD,
    PM_STONE_GOLEM,
    PM_WATER_ELEMENTAL,
    S_EEL,
    monst_globals_init,
} from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import {
    AMULET_OF_GUARDING,
    AMULET_OF_LIFE_SAVING,
    BAG_OF_HOLDING,
    CORPSE,
    DAGGER,
    EGG,
    FIRE_HORN,
    FOOD_RATION,
    GLOB_OF_GREEN_SLIME,
    LARGE_BOX,
    LONG_SWORD,
    POT_ACID,
    POT_BLINDNESS,
    POT_HEALING,
    POT_GAIN_LEVEL,
    POT_INVISIBILITY,
    POT_POLYMORPH,
    POT_SPEED,
    SCR_FIRE,
    SCR_SCARE_MONSTER,
    TIN,
    TIN_OPENER,
    UNICORN_HORN,
    WAN_DIGGING,
    WAN_MAGIC_MISSILE,
    WAN_MAKE_INVISIBLE,
    WAN_POLYMORPH,
    WAN_SPEED_MONSTER,
    objects_globals_init,
} from '../js/objects.js';

const AT_GAZE = 15;
const MS_BUZZ = 10;
const MS_SILENT = 0;

function makeState() {
    const state = {};
    monst_globals_init(state);
    objects_globals_init(state);
    return state;
}

function makeMonster(state, pmidx = PM_HUMAN, overrides = {}) {
    return newMonster({
        data: state.mons[pmidx],
        mnum: pmidx,
        mx: 10,
        my: 10,
        mcansee: true,
        ...overrides,
    });
}

function makeObject(state, otyp, overrides = {}) {
    return newObject({
        otyp,
        oclass: state.objects[otyp].oc_class,
        owt: state.objects[otyp].oc_weight,
        quan: 1,
        spe: 1,
        ...overrides,
    });
}

function makeSelectionState() {
    const state = makeState();
    state.u = {
        ulevel: 1,
        uprops: [],
        uswallow: false,
        ustuck: null,
        ux: 11,
        uy: 10,
    };
    state.level = {
        at: () => ({ typ: 16 }),
        monsters: Array.from({ length: 80 }, () => Array(21).fill(null)),
        objects: Array.from({ length: 80 }, () => Array(21).fill(null)),
        traps: [],
    };
    return state;
}

test('fresh monster item selection admits inert inventory at full health',
    () => {
        const state = makeSelectionState();
        const monster = makeMonster(state, PM_HUMAN, {
            cham: -1,
            mhp: 8,
            mhpmax: 8,
            minvent: makeObject(state, POT_HEALING),
            mspeed: 0,
            mux: state.u.ux,
            muy: state.u.uy,
        });
        assert.equal(
            select_fresh_monster_item_action(monster, {
                state,
                random: {
                    rn2: (bound) =>
                        assert.fail(`unexpected rn2(${bound})`),
                },
            }),
            null,
        );

        monster.minvent = makeObject(state, POT_SPEED);
        assert.equal(
            select_fresh_monster_item_action(monster, { state })?.kind,
            'speed potion',
        );
    });

test('find_misc selection covers initial miscellaneous item families',
    () => {
        const state = makeSelectionState();
        const cases = [
            [POT_GAIN_LEVEL, 'gain level'],
            [WAN_MAKE_INVISIBLE, 'make invisible'],
            [POT_INVISIBILITY, 'invisibility'],
            [WAN_SPEED_MONSTER, 'speed wand'],
            [POT_SPEED, 'speed potion'],
            [WAN_POLYMORPH, 'polymorph wand'],
            [POT_POLYMORPH, 'polymorph potion'],
        ];
        for (const [otyp, kind] of cases) {
            const monster = makeMonster(state, PM_HUMAN, {
                cham: -1,
                minvent: makeObject(state, otyp),
                mspeed: 0,
                mux: state.u.ux,
                muy: state.u.uy,
            });
            assert.equal(
                select_misc_action(monster, {
                    state,
                    random: {
                        rn2: (bound) =>
                            assert.fail(`unexpected rn2(${bound})`),
                    },
                })?.kind,
                kind,
                kind,
            );
        }
    });

test('find_misc preserves trap precedence and inert-container RNG', () => {
    const state = makeSelectionState();
    const monster = makeMonster(state, PM_HUMAN, {
        cham: -1,
        mspeed: 0,
        mux: state.u.ux,
        muy: state.u.uy,
    });
    state.level.monsters[monster.mx][monster.my] = monster;
    state.level.traps.push({
        tx: monster.mx,
        ty: monster.my,
        ttyp: POLY_TRAP,
    });
    assert.equal(
        select_misc_action(monster, { state })?.kind,
        'polymorph trap',
    );

    state.level.traps = [];
    monster.minvent = makeObject(state, LARGE_BOX);
    const bounds = [];
    assert.equal(
        select_misc_action(monster, {
            state,
            random: {
                rn2: (bound) => {
                    bounds.push(bound);
                    return 1;
                },
            },
        }),
        null,
    );
    assert.deepEqual(bounds, [5]);
});

test('can_blow preserves the silent-or-buzzing anatomy conjunction', () => {
    const state = makeState();
    const human = makeMonster(state);

    assert.equal(can_blow(human), true);
    for (const mutation of [
        (species) => { species.mflags1 |= M1_BREATHLESS; },
        (species) => { species.mflags1 |= M1_NOHEAD; },
        (species) => { species.mlet = S_EEL; },
        (species) => { species.msize = 0; },
    ]) {
        const species = { ...human.data, msound: MS_SILENT };
        mutation(species);
        assert.equal(can_blow({ ...human, data: species }), false);
        assert.equal(
            can_blow({ ...human, data: { ...species, msound: 1 } }),
            true,
        );
    }

    const buzzingBreathless = {
        ...human.data,
        mflags1: human.data.mflags1 | M1_BREATHLESS,
        msound: MS_BUZZ,
    };
    assert.equal(can_blow({ ...human, data: buzzingBreathless }), false);
});

test('cures_stoning recognizes acid, slimeproof slime, and safe corpses',
    () => {
        const state = makeState();
        const human = makeMonster(state);
        const fireElemental = makeMonster(state, PM_FIRE_ELEMENTAL);

        assert.equal(
            cures_stoning(human, makeObject(state, POT_ACID), false, state),
            true,
        );
        assert.equal(
            cures_stoning(
                human,
                makeObject(state, GLOB_OF_GREEN_SLIME),
                false,
                state,
            ),
            false,
        );
        assert.equal(
            cures_stoning(
                fireElemental,
                makeObject(state, GLOB_OF_GREEN_SLIME),
                false,
                state,
            ),
            true,
        );
        assert.equal(
            cures_stoning(
                human,
                makeObject(state, CORPSE, { corpsenm: PM_LIZARD }),
                false,
                state,
            ),
            true,
        );
        assert.equal(
            cures_stoning(
                human,
                makeObject(state, CORPSE, {
                    corpsenm: PM_WATER_ELEMENTAL,
                }),
                false,
                state,
            ),
            false,
        );
    });

test('mcould_eat_tin uses any opener unless a welded weapon blocks it', () => {
    const state = makeState();
    const human = makeMonster(state);
    assert.equal(mcould_eat_tin(human, state), false);

    human.minvent = makeObject(state, TIN_OPENER);
    assert.equal(mcould_eat_tin(human, state), true);

    human.minvent = makeObject(state, DAGGER);
    assert.equal(mcould_eat_tin(human, state), true);

    const opener = makeObject(state, TIN_OPENER);
    const weldedSword = makeObject(state, LONG_SWORD, {
        cursed: true,
        nobj: opener,
        owornmask: W_WEP,
    });
    human.minvent = weldedSword;
    human.mw = weldedSword;
    assert.equal(mcould_eat_tin(human, state), false);

    const animal = makeMonster(state, PM_HUMAN, {
        data: {
            ...state.mons[PM_HUMAN],
            mflags1: state.mons[PM_HUMAN].mflags1 | M1_ANIMAL,
        },
        minvent: opener,
    });
    assert.equal(mcould_eat_tin(animal, state), false);
});

test('searches_for_item rejects animals, mindless monsters, and ghosts',
    () => {
        const state = makeState();
        const speed = makeObject(state, POT_SPEED);
        assert.equal(searches_for_item(makeMonster(state), speed, state), true);

        const rejected = [
            {
                ...state.mons[PM_HUMAN],
                mflags1: state.mons[PM_HUMAN].mflags1 | M1_ANIMAL,
            },
            {
                ...state.mons[PM_HUMAN],
                mflags1: state.mons[PM_HUMAN].mflags1 | M1_MINDLESS,
            },
            state.mons[PM_GHOST],
        ];
        for (const data of rejected) {
            assert.equal(
                searches_for_item(makeMonster(state, PM_HUMAN, {
                    data,
                }), speed, state),
                false,
            );
        }
    });

test('searches_for_item preserves invisibility, speed, and gaze gates',
    () => {
        const state = makeState();
        const human = makeMonster(state);
        const invisible = makeObject(state, POT_INVISIBILITY);
        assert.equal(searches_for_item(human, invisible, state), true);
        assert.equal(
            searches_for_item({ ...human, minvis: true }, invisible, state),
            false,
        );

        const gazer = {
            ...human,
            data: {
                ...human.data,
                mattk: [
                    { aatyp: AT_GAZE },
                ],
            },
        };
        assert.equal(searches_for_item(gazer, invisible, state), false);
        assert.equal(
            searches_for_item(
                gazer,
                makeObject(state, POT_BLINDNESS),
                state,
            ),
            false,
        );

        const speed = makeObject(state, POT_SPEED);
        assert.equal(
            searches_for_item({ ...human, mspeed: MFAST }, speed, state),
            false,
        );
    });

test('searches_for_item follows wand charge and capability branches', () => {
    const state = makeState();
    const human = makeMonster(state);
    assert.equal(
        searches_for_item(
            human,
            makeObject(state, WAN_MAGIC_MISSILE),
            state,
        ),
        true,
    );
    assert.equal(
        searches_for_item(
            human,
            makeObject(state, WAN_MAGIC_MISSILE, { spe: 0 }),
            state,
        ),
        false,
    );
    assert.equal(
        searches_for_item(
            makeMonster(state, PM_FLOATING_EYE),
            makeObject(state, WAN_DIGGING),
            state,
        ),
        false,
    );
    assert.equal(
        searches_for_item(
            human,
            makeObject(state, WAN_POLYMORPH),
            state,
        ),
        human.data.difficulty < 6,
    );
});

test('searches_for_item covers potion, scroll, and amulet families', () => {
    const state = makeState();
    const human = makeMonster(state);
    for (const otyp of [
        POT_HEALING,
        SCR_FIRE,
        AMULET_OF_GUARDING,
    ]) {
        assert.equal(
            searches_for_item(human, makeObject(state, otyp), state),
            true,
        );
    }
    assert.equal(
        searches_for_item(
            makeMonster(state, PM_STONE_GOLEM),
            makeObject(state, AMULET_OF_LIFE_SAVING),
            state,
        ),
        false,
    );
    assert.equal(
        searches_for_item(human, makeObject(state, FOOD_RATION), state),
        false,
    );
});

test('searches_for_item applies horn, container, and unicorn rules', () => {
    const state = makeState();
    const human = makeMonster(state);
    assert.equal(
        searches_for_item(human, makeObject(state, FIRE_HORN), state),
        true,
    );
    assert.equal(
        searches_for_item(
            human,
            makeObject(state, FIRE_HORN, { spe: 0 }),
            state,
        ),
        false,
    );
    assert.equal(
        searches_for_item(human, makeObject(state, LARGE_BOX), state),
        true,
    );
    assert.equal(
        searches_for_item(
            human,
            makeObject(state, LARGE_BOX, { olocked: true }),
            state,
        ),
        false,
    );
    assert.equal(
        searches_for_item(
            human,
            makeObject(state, BAG_OF_HOLDING, { cursed: true }),
            state,
        ),
        false,
    );
    assert.equal(
        searches_for_item(
            makeMonster(state, PM_KI_RIN),
            makeObject(state, UNICORN_HORN),
            state,
        ),
        false,
    );
});

test('searches_for_item recognizes petrifying and curative food', () => {
    const state = makeState();
    const human = makeMonster(state);
    const cockatriceCorpse = makeObject(state, CORPSE, {
        corpsenm: PM_COCKATRICE,
    });
    assert.equal(
        searches_for_item(human, cockatriceCorpse, state),
        false,
    );
    assert.equal(
        searches_for_item(
            { ...human, misc_worn_check: W_ARMG },
            cockatriceCorpse,
            state,
        ),
        true,
    );
    assert.equal(
        searches_for_item(
            human,
            makeObject(state, EGG, { corpsenm: PM_COCKATRICE }),
            state,
        ),
        true,
    );

    const opener = makeObject(state, TIN_OPENER);
    const lizardTin = makeObject(state, TIN, {
        corpsenm: PM_LIZARD,
    });
    assert.equal(
        searches_for_item(
            { ...human, minvent: opener },
            lizardTin,
            state,
        ),
        true,
    );
});

test('searches_for_item checks an own-square floor scare first', () => {
    const state = makeState();
    const monster = makeMonster(state, PM_GNOME);
    const object = makeObject(state, POT_SPEED, {
        ox: monster.mx,
        oy: monster.my,
        where: OBJ_FLOOR,
    });
    const scare = makeObject(state, SCR_SCARE_MONSTER, {
        ox: monster.mx,
        oy: monster.my,
        where: OBJ_FLOOR,
    });
    state.level = {
        at: () => null,
        objects: Array.from({ length: 80 }, () =>
            Array(21).fill(null)),
    };
    state.level.objects[monster.mx][monster.my] = scare;

    assert.equal(searches_for_item(monster, object, state), false);
});
