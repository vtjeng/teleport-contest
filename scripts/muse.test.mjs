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
    COULD_SEE,
    M_SEEN_ACID,
    M_SEEN_MAGR,
    M_SEEN_REFL,
    M_SEEN_SLEEP,
    ROOM,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    can_blow,
    cures_stoning,
    find_offensive,
    mcould_eat_tin,
    searches_for_item,
    select_fresh_monster_item_action,
    select_misc_action,
} from '../js/muse.js';
import { mksobj } from '../js/obj.js';
import { UnsupportedSimpleMonsterActionError }
    from '../js/unported_monster_actions.js';
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
    PM_JACKAL,
    PM_NURSE,
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
    EXPENSIVE_CAMERA,
    FIRE_HORN,
    FOOD_RATION,
    FROST_HORN,
    GLOB_OF_GREEN_SLIME,
    LARGE_BOX,
    LONG_SWORD,
    POT_ACID,
    POT_BLINDNESS,
    POT_CONFUSION,
    POT_PARALYSIS,
    POT_SLEEPING,
    POT_HEALING,
    POT_GAIN_LEVEL,
    POT_INVISIBILITY,
    POT_POLYMORPH,
    POT_SPEED,
    SCR_EARTH,
    SCR_FIRE,
    SCR_SCARE_MONSTER,
    TIN,
    TIN_OPENER,
    UNICORN_HORN,
    WAN_COLD,
    WAN_DEATH,
    WAN_DIGGING,
    WAN_FIRE,
    WAN_LIGHTNING,
    WAN_MAGIC_MISSILE,
    WAN_MAKE_INVISIBLE,
    WAN_POLYMORPH,
    WAN_SLEEP,
    WAN_SPEED_MONSTER,
    WAN_STRIKING,
    WAN_TELEPORTATION,
    WAN_UNDEAD_TURNING,
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

// ---- muse.c find_offensive() ----

// A live Valkyrie in the lit starting room. find_offensive() reads
// in_your_sanctuary(), monnear() and lined_up(), which all need a real map
// and hero, so this half of the file cannot use makeState()'s bare catalogs.
const OFFENSIVE_DATETIME = '20260214031500';
const OFFENSIVE_RC = [
    'OPTIONS=name:Lich,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,time',
    '',
].join('\n');

async function offensiveHero() {
    await runSegment({
        seed: 7710044,
        datetime: OFFENSIVE_DATETIME,
        nethackrc: OFFENSIVE_RC,
        moves: '',
    });
    return game;
}

// An attacker beside the hero, believing the hero is where the hero is, and
// carrying whatever the case hands it.
function offensiveMonster(state, pmidx, minvent = null, overrides = {}) {
    return newMonster({
        data: state.mons[pmidx],
        m_id: 7100,
        mx: state.u.ux + 1,
        my: state.u.uy,
        mux: state.u.ux,
        muy: state.u.uy,
        mcansee: true,
        minvent,
        ...overrides,
    });
}

function offensiveEnv(state) {
    return {
        state,
        unsupported: (reason) => {
            throw new UnsupportedSimpleMonsterActionError(reason);
        },
        random: { rn2: (bound) => assert.fail(`unexpected rn2(${bound})`) },
    };
}

function carried(state, otyp, overrides = {}) {
    const obj = mksobj(otyp, false, false, { state });
    obj.nobj = null;
    Object.assign(obj, overrides);
    return obj;
}

test('find_offensive declines above the loop for each guard C names',
    async () => {
    const state = await offensiveHero();
    const env = offensiveEnv(state);
    // muse.c:1428-1430. A peaceful, animal, mindless or handless attacker
    // never gets as far as its pack, so an offensive item in it is ignored.
    // A wand of striking sits in the half no reflection skips, so it is
    // selected whatever the attacker's distance.
    const wand = carried(state, WAN_STRIKING, { spe: 3 });
    const gnome = offensiveMonster(state, PM_GNOME, wand);
    // The gnome itself passes every guard and is refused for the wand.
    assert.throws(() => find_offensive(gnome, env),
        (error) => error.reason === 'monster offensive item use');

    gnome.mpeaceful = true;
    assert.equal(find_offensive(gnome, env), false);
    gnome.mpeaceful = false;

    const jackal = offensiveMonster(state, PM_JACKAL, wand);
    assert.equal(find_offensive(jackal, env), false); // is_animal()
    const golem = offensiveMonster(state, PM_STONE_GOLEM, wand);
    assert.equal(find_offensive(golem, env), false); // mindless()

    // muse.c:1431. A swallowed hero ends it before the sanctuary test.
    state.u.uswallow = 1;
    assert.equal(find_offensive(gnome, env), false);
    state.u.uswallow = 0;

    // muse.c:1439. lined_up() is the last guard, and an attacker that
    // believes the hero is on its own square is never lined up.
    gnome.mux = gnome.mx;
    gnome.muy = gnome.my;
    assert.equal(find_offensive(gnome, env), false);
});

test('find_offensive skips the reflectable half for an adjacent attacker',
    async () => {
    const state = await offensiveHero();
    const env = offensiveEnv(state);
    // muse.c:1443-1444. reflection_skip is TRUE for any attacker standing
    // next to where it thinks the hero is, which kills the wand-and-horn
    // half outright: a wand of magic missile in hand selects nothing.
    const wand = carried(state, WAN_MAGIC_MISSILE, { spe: 3 });
    const adjacent = offensiveMonster(state, PM_GNOME, wand);
    assert.equal(find_offensive(adjacent, env), false);

    // Three squares out the same attacker with the same wand reaches that
    // half and is refused. lined_up() sits above the loop, so the row it
    // fires along has to be open and the attacker's own square in view.
    for (let x = state.u.ux; x <= state.u.ux + 3; ++x) {
        const location = state.level.at(x, state.u.uy);
        location.typ = ROOM;
        location.flags = 0;
        location.doormask = 0;
        location.wall_info = 0;
    }
    state.viz_array[state.u.uy][state.u.ux + 3] |= COULD_SEE;
    const distant = offensiveMonster(state, PM_GNOME, wand, {
        mx: state.u.ux + 3,
    });
    assert.throws(() => find_offensive(distant, env),
        (error) => error.reason === 'monster offensive item use');

    // Having watched the hero reflect a ray sets the same skip at any
    // distance, and the wand is the only offensive item it holds.
    distant.seen_resistance = M_SEEN_REFL;
    assert.equal(find_offensive(distant, env), false);
});

test('find_offensive reads the conditions C attaches to each item',
    async () => {
    const state = await offensiveHero();
    const env = offensiveEnv(state);
    const gnome = offensiveMonster(state, PM_GNOME);

    // muse.c:1497-1502. A wand of striking needs a charge and an unreflected
    // hero; either failing leaves the pack inert.
    gnome.minvent = carried(state, WAN_STRIKING, { spe: 0 });
    assert.equal(find_offensive(gnome, env), false);
    gnome.minvent = carried(state, WAN_STRIKING, { spe: 2 });
    assert.throws(() => find_offensive(gnome, env),
        (error) => error.reason === 'monster offensive item use');
    gnome.seen_resistance = M_SEEN_MAGR;
    assert.equal(find_offensive(gnome, env), false);
    gnome.seen_resistance = 0;

    // muse.c:1522-1526. A potion of blindness is useless to a gazer, which
    // is the one condition that reads the attacker's own species.
    gnome.minvent = carried(state, POT_BLINDNESS);
    assert.throws(() => find_offensive(gnome, env),
        (error) => error.reason === 'monster offensive item use');
    const eye = offensiveMonster(state, PM_FLOATING_EYE, gnome.minvent);
    assert.equal(find_offensive(eye, env), false);

    // muse.c:1517-1521. A paralysis potion is skipped while the hero is
    // already helpless.
    gnome.minvent = carried(state, POT_PARALYSIS);
    assert.throws(() => find_offensive(gnome, env),
        (error) => error.reason === 'monster offensive item use');
    state.multi = -2;
    assert.equal(find_offensive(gnome, env), false);
    state.multi = 0;

    // An ordinary carried item is not offensive at all, which is what makes
    // the FALSE answer the common one.
    gnome.minvent = carried(state, DAGGER);
    assert.equal(find_offensive(gnome, env), false);
});

// One row per arm of find_offensive()'s inventory loop, in source order, each
// naming the muse.c line it stands for. `reflected` puts the attacker three
// squares out so that the wand-and-horn half above `reflection_skip` runs;
// every other row is adjacent, where C skips it.
//
// The two control rows are the point of the table: an ordinary dagger that
// satisfies every *condition* an arm attaches to its object type, without
// being any of those types. C leaves it alone, so an arm that stopped reading
// the type would be visible here and nowhere else.
const OFFENSIVE_ARMS = [
    // muse.c:1449-1453
    { name: 'wand of death', otyp: WAN_DEATH, spe: 1, distant: true },
    { name: 'spent wand of death', otyp: WAN_DEATH, spe: 0, distant: true,
        refuses: false },
    { name: 'seen-resistant wand of death', otyp: WAN_DEATH, spe: 1,
        distant: true, monster: { seen_resistance: M_SEEN_MAGR },
        refuses: false },
    // muse.c:1455-1459
    { name: 'wand of sleep', otyp: WAN_SLEEP, spe: 1, distant: true },
    { name: 'spent wand of sleep', otyp: WAN_SLEEP, spe: 0, distant: true,
        refuses: false },
    { name: 'wand of sleep at a helpless hero', otyp: WAN_SLEEP, spe: 1,
        distant: true, multi: -1, refuses: false },
    // muse.c:1461-1465
    { name: 'wand of fire', otyp: WAN_FIRE, spe: 1, distant: true },
    { name: 'spent wand of fire', otyp: WAN_FIRE, spe: 0, distant: true,
        refuses: false },
    // muse.c:1467-1471
    { name: 'fire horn', otyp: FIRE_HORN, spe: 1, distant: true },
    { name: 'spent fire horn', otyp: FIRE_HORN, spe: 0, distant: true,
        refuses: false },
    // muse.c:1473-1477
    { name: 'wand of cold', otyp: WAN_COLD, spe: 1, distant: true },
    { name: 'spent wand of cold', otyp: WAN_COLD, spe: 0, distant: true,
        refuses: false },
    // muse.c:1479-1483
    { name: 'frost horn', otyp: FROST_HORN, spe: 1, distant: true },
    { name: 'spent frost horn', otyp: FROST_HORN, spe: 0, distant: true,
        refuses: false },
    // muse.c:1485-1489
    { name: 'wand of lightning', otyp: WAN_LIGHTNING, spe: 1, distant: true },
    { name: 'spent wand of lightning', otyp: WAN_LIGHTNING, spe: 0, distant: true,
        refuses: false },
    // muse.c:1491-1495
    { name: 'wand of magic missile', otyp: WAN_MAGIC_MISSILE, spe: 1,
        distant: true },
    { name: 'spent wand of magic missile', otyp: WAN_MAGIC_MISSILE, spe: 0, distant: true,
        refuses: false },
    // The whole half above is skipped for an adjacent attacker.
    { name: 'wand of magic missile up close', otyp: WAN_MAGIC_MISSILE, spe: 1,
        refuses: false },
    // muse.c:1497-1499
    { name: 'wand of undead turning', otyp: WAN_UNDEAD_TURNING, spe: 1 },
    { name: 'spent wand of undead turning', otyp: WAN_UNDEAD_TURNING, spe: 0,
        refuses: false },
    // muse.c:1500-1505
    { name: 'wand of striking', otyp: WAN_STRIKING, spe: 1 },
    // muse.c:1506-1516
    { name: 'wand of teleportation', otyp: WAN_TELEPORTATION, spe: 1 },
    { name: 'spent wand of teleportation', otyp: WAN_TELEPORTATION, spe: 0,
        refuses: false },
    // muse.c:1517-1521
    { name: 'potion of paralysis', otyp: POT_PARALYSIS },
    // muse.c:1522-1526
    { name: 'potion of blindness', otyp: POT_BLINDNESS },
    // muse.c:1527-1531
    { name: 'potion of confusion', otyp: POT_CONFUSION },
    // muse.c:1532-1537
    { name: 'potion of sleeping', otyp: POT_SLEEPING },
    { name: 'potion of sleeping against a sleep-resistant hero',
        otyp: POT_SLEEPING, monster: { seen_resistance: M_SEEN_SLEEP },
        refuses: false },
    // muse.c:1538-1543
    { name: 'potion of acid', otyp: POT_ACID },
    { name: 'potion of acid against an acid-resistant hero', otyp: POT_ACID,
        monster: { seen_resistance: M_SEEN_ACID }, refuses: false },
    // muse.c:1548-1560
    { name: 'scroll of earth', otyp: SCR_EARTH },
    // muse.c:1561-1568
    { name: 'expensive camera', otyp: EXPENSIVE_CAMERA, spe: 1 },
    { name: 'spent expensive camera', otyp: EXPENSIVE_CAMERA, spe: 0,
        refuses: false },
    // The controls.
    { name: 'enchanted dagger up close', otyp: DAGGER, spe: 3,
        refuses: false },
    { name: 'enchanted dagger at range', otyp: DAGGER, spe: 3, distant: true,
        refuses: false },
];

test('find_offensive selects on the object type and its own conditions',
    async () => {
    const state = await offensiveHero();
    const env = offensiveEnv(state);
    // lined_up() sits above the loop, so the row a distant attacker fires
    // along has to be open and its own square in view.
    for (let x = state.u.ux; x <= state.u.ux + 3; ++x) {
        const location = state.level.at(x, state.u.uy);
        location.typ = ROOM;
        location.flags = 0;
        location.doormask = 0;
        location.wall_info = 0;
    }
    state.viz_array[state.u.uy][state.u.ux + 3] |= COULD_SEE;

    for (const arm of OFFENSIVE_ARMS) {
        const item = carried(state, arm.otyp,
            arm.spe === undefined ? {} : { spe: arm.spe });
        const gnome = offensiveMonster(state, PM_GNOME, item, {
            mx: state.u.ux + (arm.distant ? 3 : 1),
            ...(arm.monster ?? {}),
        });
        state.multi = arm.multi ?? 0;
        const refuses = arm.refuses ?? true;
        if (refuses) {
            assert.throws(() => find_offensive(gnome, env),
                (error) => error.reason === 'monster offensive item use',
                arm.name);
        } else {
            assert.equal(find_offensive(gnome, env), false, arm.name);
        }
        state.multi = 0;
    }
});

test('find_offensive declines for a nurse beside an unarmed, unarmored hero',
    async () => {
    // muse.c:1434-1438. AD_HEAL plus a hero with nothing wielded and nothing
    // worn is the one guard that reads the hero's own gear.
    const state = await offensiveHero();
    const env = offensiveEnv(state);
    const wand = carried(state, WAN_STRIKING, { spe: 2 });
    const nurse = offensiveMonster(state, PM_NURSE, wand);
    const worn = ['uwep', 'uarmu', 'uarm', 'uarmh', 'uarms', 'uarmg',
        'uarmc', 'uarmf'];
    const saved = Object.fromEntries(worn.map((slot) => [slot, state[slot]]));
    for (const slot of worn) state[slot] = null;
    assert.equal(find_offensive(nurse, env), false);

    // Any one of the eight slots being filled sends the nurse on to the loop,
    // which is what makes this a conjunction rather than a species test.
    for (const slot of worn) {
        state[slot] = { otyp: DAGGER };
        assert.throws(() => find_offensive(nurse, env),
            (error) => error.reason === 'monster offensive item use', slot);
        state[slot] = null;
    }
    for (const slot of worn) state[slot] = saved[slot];

    // The same wand in a gnome's pack is selected whatever the hero wears,
    // so the guard is the nurse's damage type and not the empty slots.
    const gnome = offensiveMonster(state, PM_GNOME, wand);
    assert.throws(() => find_offensive(gnome, env),
        (error) => error.reason === 'monster offensive item use');
});
