import assert from 'node:assert/strict';
import test from 'node:test';

import {
    HOLE,
    MFAST,
    OBJ_FLOOR,
    POLY_TRAP,
    TELEP_TRAP,
    W_ARMG,
    W_WEP,
} from '../js/const.js';
import {
    COLNO,
    COULD_SEE,
    IN_SIGHT,
    M_SEEN_ACID,
    M_SEEN_MAGR,
    M_SEEN_REFL,
    M_SEEN_SLEEP,
    ROOM,
    ROWNO,
    STONE,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    can_blow,
    cures_stoning,
    find_offensive,
    find_defensive,
    hero_behind_chokepoint,
    linedup_chk_corpse,
    mon_has_friends,
    mon_likes_objpile_at,
    use_offensive,
    mcould_eat_tin,
    searches_for_item,
    select_fresh_monster_item_action,
    find_misc,
} from '../js/muse.js';
import { mksobj, place_object, remove_object } from '../js/obj.js';
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
    PM_GOBLIN,
    PM_HUMAN,
    PM_JACKAL,
    PM_NURSE,
    PM_SOLDIER,
    PM_KI_RIN,
    PM_LIZARD,
    PM_STONE_GOLEM,
    PM_WATER_ELEMENTAL,
    S_EEL,
    monst_globals_init,
} from '../js/monsters.js';
import { m_at, newMonster, place_monster, remove_monster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import { messageAt } from '../js/startup_a11y.js';
import {
    AMULET_OF_GUARDING,
    AMULET_OF_LIFE_SAVING,
    BAG_OF_HOLDING,
    BUGLE,
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
    ORCISH_DAGGER,
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

test('find_defensive selects healing for a wounded hostile', () => {
    const state = makeSelectionState();
    const potion = makeObject(state, POT_HEALING);
    const monster = makeMonster(state, PM_GOBLIN, {
        // One of eight hit points is below the source's one-fifth threshold.
        mhp: 1,
        mhpmax: 8,
        minvent: potion,
        mux: state.u.ux,
        muy: state.u.uy,
    });

    assert.deepEqual(find_defensive(monster, false, { state }), {
        kind: 'healing',
        object: potion,
    });
    assert.equal(
        select_fresh_monster_item_action(monster, { state })?.kind,
        'healing',
    );
});

test('find_defensive gives a hole precedence over a teleport trap', () => {
    const state = makeSelectionState();
    state.u.uz = { dnum: 0, dlevel: 2 };
    // Five levels make the second level eligible for falling through.
    state.dungeons = [{
        num_dunlevs: 5,
        flags: { hellish: false },
    }];
    state.level.flags = { hardfloor: false };
    // The teleport trap appears earlier in the source's 3-by-3 scan. The
    // later hole must replace it and stop the scan.
    state.level.traps = [
        { tx: 9, ty: 9, ttyp: TELEP_TRAP },
        { tx: 10, ty: 9, ttyp: HOLE },
    ];
    const monster = makeMonster(state, PM_GOBLIN, {
        mhp: 1,
        mhpmax: 8,
        mux: state.u.ux,
        muy: state.u.uy,
    });

    assert.equal(
        find_defensive(monster, false, { state })?.kind,
        'trapdoor',
    );
});

test('find_defensive selects a bugle before carried healing', () => {
    const state = makeSelectionState();
    const potion = makeObject(state, POT_HEALING);
    const bugle = makeObject(state, BUGLE, { nobj: potion });
    const monster = makeMonster(state, PM_SOLDIER, {
        mhp: 1,
        mhpmax: 8,
        minvent: bugle,
        mux: state.u.ux,
        muy: state.u.uy,
    });
    // One adjacent helpless mercenary is enough for muse.c's bugle gate.
    state.level.monsters[9][10] = makeMonster(state, PM_SOLDIER, {
        mx: 9,
        my: 10,
        mcanmove: false,
    });

    assert.deepEqual(find_defensive(monster, false, { state }), {
        kind: 'bugle',
        object: bugle,
    });
});

test('find_defensive with tryescape skips the distance and health gates', () => {
    const state = makeSelectionState();
    const potion = makeObject(state, POT_HEALING);
    const monster = makeMonster(state, PM_GOBLIN, {
        // Full health: the heal-threshold block (muse.c:543-556) answers
        // FALSE for dochug()'s find_defensive(mtmp, FALSE), but it is inside
        // `if (!tryescape)`, so m_move()'s find_defensive(mtmp, TRUE) for a
        // monster with no move (monmove.c:1927) scans the inventory instead.
        mhp: 8,
        mhpmax: 8,
        minvent: potion,
        // Twenty squares east: dist2 of 400 fails the `> 25` gate at
        // muse.c:454, which the same flag guards.
        mux: state.u.ux + 20,
        muy: state.u.uy,
    });
    // The potion is the only item, so the rn2(3) at muse.c:659 never fires.
    const env = {
        state,
        random: { rn2: (bound) => assert.fail(`unexpected rn2(${bound})`) },
    };

    assert.equal(find_defensive(monster, false, env), null);
    assert.deepEqual(find_defensive(monster, true, env), {
        kind: 'healing',
        object: potion,
    });
    // The peaceful branch (muse.c:558-563) is inside the same block.
    monster.mpeaceful = true;
    assert.deepEqual(find_defensive(monster, true, env), {
        kind: 'healing',
        object: potion,
    });
});

test('find_defensive zaps undead turning at a cockatrice-corpse wielder', () => {
    const state = makeSelectionState();
    const wand = makeObject(state, WAN_UNDEAD_TURNING);
    // Full health: muse.c:526-540 fires "even if 'mtmp' isn't wounded".
    const monster = makeMonster(state, PM_GOBLIN, {
        mhp: 8,
        mhpmax: 8,
        minvent: wand,
        mux: state.u.ux,
        muy: state.u.uy,
    });
    // lined_up() (mthrowu.c) wants the monster's square in the hero's line of
    // sight; adjacent and in view, it answers without a boulder walk or rn2().
    state.viz_array = Array.from({ length: ROWNO },
        () => new Array(COLNO).fill(0));
    state.viz_array[monster.my][monster.mx] |= COULD_SEE;
    const env = {
        state,
        random: { rn2: (bound) => assert.fail(`unexpected rn2(${bound})`) },
    };

    // A lizard corpse does not petrify, so the branch does not apply and the
    // full-health gate answers FALSE.
    state.uwep = makeObject(state, CORPSE, { corpsenm: PM_LIZARD });
    assert.equal(find_defensive(monster, false, env), null);

    state.uwep = makeObject(state, CORPSE, { corpsenm: PM_COCKATRICE });
    assert.deepEqual(find_defensive(monster, false, env), {
        kind: 'undead turning wand',
        object: wand,
    });
    // An empty wand is passed over (muse.c:534).
    wand.spe = 0;
    assert.equal(find_defensive(monster, false, env), null);
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
                find_misc(monster, {
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
        find_misc(monster, { state })?.kind,
        'polymorph trap',
    );

    state.level.traps = [];
    monster.minvent = makeObject(state, LARGE_BOX);
    const bounds = [];
    assert.equal(
        find_misc(monster, {
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

test('a wounded ordinary hostile with an inert weapon selects no item action',
    () => {
        const state = makeSelectionState();
        const monster = makeMonster(state, PM_GOBLIN, {
            cham: -1,
            // Three of four hit points reaches find_defensive(FALSE)'s wounded
            // search while staying below its level-1 healing threshold.
            mhp: 3,
            mhpmax: 4,
            minvent: makeObject(state, ORCISH_DAGGER),
            mspeed: 0,
            mux: state.u.ux,
            muy: state.u.uy,
        });
        const random = {
            rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
        };

        assert.equal(find_defensive(monster, false, { state, random }), null);
        assert.equal(
            select_fresh_monster_item_action(monster, { state, random }),
            null,
        );
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
    // The gnome itself passes every guard and selects the wand.
    assert.equal(find_offensive(gnome, env), true);

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
    assert.equal(find_offensive(gnome, env), true);
    gnome.seen_resistance = M_SEEN_MAGR;
    assert.equal(find_offensive(gnome, env), false);
    gnome.seen_resistance = 0;

    // muse.c:1522-1526. A potion of blindness is useless to a gazer, which
    // is the one condition that reads the attacker's own species.
    gnome.minvent = carried(state, POT_BLINDNESS);
    assert.equal(find_offensive(gnome, env), true);
    const eye = offensiveMonster(state, PM_FLOATING_EYE, gnome.minvent);
    assert.equal(find_offensive(eye, env), false);

    // muse.c:1517-1521. A paralysis potion is skipped while the hero is
    // already helpless.
    gnome.minvent = carried(state, POT_PARALYSIS);
    assert.equal(find_offensive(gnome, env), true);
    state.multi = -2;
    assert.equal(find_offensive(gnome, env), false);
    state.multi = 0;

    // An ordinary carried item is not offensive at all, which is what makes
    // the FALSE answer the common one.
    gnome.minvent = carried(state, DAGGER);
    assert.equal(find_offensive(gnome, env), false);
});

// muse.c:1272-1290 numbers the MUSE_* action codes. Only the five throwable
// potions can be selected; the values are read from the C #defines rather than
// from the port, so a renumbering there fails here.
const MUSE_WAN_STRIKING = 7;
const MUSE_POT_PARALYSIS = 9;
const MUSE_POT_BLINDNESS = 10;
const MUSE_POT_CONFUSION = 11;
const MUSE_POT_ACID = 14;
const MUSE_WAN_TELEPORTATION = 15;
const MUSE_POT_SLEEPING = 16;
const MUSE_WAN_UNDEAD_TURNING = 20;

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
    // muse.c:1497-1499 -- m_use_undead_turning() selects only when the hero
    // carries a corpse or one lies in a direct line; default test state has
    // neither, so the arm does not select and does not refuse.
    { name: 'wand of undead turning', otyp: WAN_UNDEAD_TURNING, spe: 1,
        refuses: false },
    { name: 'spent wand of undead turning', otyp: WAN_UNDEAD_TURNING, spe: 0,
        refuses: false },
    // muse.c:1500-1505
    { name: 'wand of striking', otyp: WAN_STRIKING, spe: 1,
        selects: MUSE_WAN_STRIKING },
    // muse.c:1506-1516 -- wand of teleportation selects when the hero is on
    // stairs (stairway_at() is truthy at the Valkyrie start position), the
    // hero lacks Teleport_control, and the level permits teleporting.
    { name: 'wand of teleportation', otyp: WAN_TELEPORTATION, spe: 1,
        selects: MUSE_WAN_TELEPORTATION },
    { name: 'spent wand of teleportation', otyp: WAN_TELEPORTATION, spe: 0,
        refuses: false },
    // muse.c:1517-1521
    { name: 'potion of paralysis', otyp: POT_PARALYSIS,
        selects: MUSE_POT_PARALYSIS },
    // muse.c:1522-1526
    { name: 'potion of blindness', otyp: POT_BLINDNESS,
        selects: MUSE_POT_BLINDNESS },
    // muse.c:1527-1531
    { name: 'potion of confusion', otyp: POT_CONFUSION,
        selects: MUSE_POT_CONFUSION },
    // muse.c:1532-1537
    { name: 'potion of sleeping', otyp: POT_SLEEPING,
        selects: MUSE_POT_SLEEPING },
    { name: 'potion of sleeping against a sleep-resistant hero',
        otyp: POT_SLEEPING, monster: { seen_resistance: M_SEEN_SLEEP },
        refuses: false },
    // muse.c:1538-1543
    { name: 'potion of acid', otyp: POT_ACID, selects: MUSE_POT_ACID },
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
        const refuses = arm.selects === undefined && (arm.refuses ?? true);
        if (arm.selects !== undefined) {
            assert.equal(find_offensive(gnome, env), true, arm.name);
            assert.equal(state.m_offense.has_offense, arm.selects, arm.name);
            assert.equal(state.m_offense.offensive, item, arm.name);
        } else if (refuses) {
            assert.throws(() => find_offensive(gnome, env),
                (error) => error.reason === 'monster offensive item use',
                arm.name);
        } else {
            assert.equal(find_offensive(gnome, env), false, arm.name);
            assert.equal(state.m_offense, null, arm.name);
        }
        state.multi = 0;
    }
});

// muse.c's `nomore(x)` skip is `if (gm.m.has_offense == x) continue;`, so an
// arm can only be displaced by an arm that sits later in the loop body. The
// three cases below are the whole behavior: a later arm wins, an earlier arm
// is skipped over, and a repeat of the same type keeps the first object.
test('find_offensive lets a later arm displace an earlier one and no other',
    async () => {
    const state = await offensiveHero();
    const env = offensiveEnv(state);
    const pack = (...types) => {
        const objects = types.map((otyp) => carried(state, otyp));
        for (let i = 0; i < objects.length - 1; ++i)
            objects[i].nobj = objects[i + 1];
        return objects;
    };

    // nomore(MUSE_POT_CONFUSION) precedes the acid arm, so the confusion
    // choice made for the first potion skips the acid arm for the second.
    let objects = pack(POT_ACID, POT_CONFUSION);
    assert.equal(find_offensive(offensiveMonster(state, PM_GNOME, objects[0]),
        env), true);
    assert.equal(state.m_offense.has_offense, MUSE_POT_CONFUSION);
    assert.equal(state.m_offense.offensive, objects[1]);

    objects = pack(POT_CONFUSION, POT_ACID);
    assert.equal(find_offensive(offensiveMonster(state, PM_GNOME, objects[0]),
        env), true);
    assert.equal(state.m_offense.has_offense, MUSE_POT_CONFUSION);
    assert.equal(state.m_offense.offensive, objects[0]);

    objects = pack(POT_CONFUSION, POT_CONFUSION);
    assert.equal(find_offensive(offensiveMonster(state, PM_GNOME, objects[0]),
        env), true);
    assert.equal(state.m_offense.offensive, objects[0]);
});

// ---- muse.c use_offensive() ----

// A gnome carrying a potion of sleeping, three squares east of the hero along
// a cleared, visible row, so that the launch direction and the range distmin()
// computes are both nontrivial.
function hurlingGnome(state) {
    const potion = carried(state, POT_SLEEPING);
    const gnome = offensiveMonster(state, PM_GNOME, potion, {
        mx: state.u.ux + 3,
        my: state.u.uy,
    });
    for (let x = state.u.ux; x <= gnome.mx; ++x) {
        const location = state.level.at(x, state.u.uy);
        location.typ = ROOM;
        location.flags = 0;
        location.doormask = 0;
        location.wall_info = 0;
        // IN_SIGHT as well as COULD_SEE: use_offensive() announces the throw
        // only for a thrower on a square the hero can actually see.
        state.viz_array[state.u.uy][x] |= COULD_SEE | IN_SIGHT;
    }
    return { gnome, potion };
}

test('use_offensive hurls the selected potion along the line to the hero',
    async () => {
    const state = await offensiveHero();
    const { gnome, potion } = hurlingGnome(state);
    const messages = [];
    const thrown = [];
    const env = {
        ...offensiveEnv(state),
        message: async (text) => { messages.push(text); },
        monsterName: () => 'The gnome',
        throwMissile: async (...args) => { thrown.push(args); },
    };

    assert.equal(find_offensive(gnome, env), true);
    assert.equal(await use_offensive(gnome, env), 2);

    // muse.c:2015-2019. A visible thrower observes the object -- which is what
    // lets doname() print its description -- and announces the throw.
    assert.equal(potion.dknown, true);
    // Seed 7710044 shuffles "dark" onto the potion of sleeping. The
    // description rather than the type is the point: doname() prints it only
    // for a dknown object, so an announcement reading "a potion" would mean
    // observe_object() had not run.
    assert.deepEqual(messages, ['The gnome hurls a dark potion!']);
    // muse.c:2020-2022: launch point, unit direction, distmin() range, object.
    assert.equal(thrown.length, 1);
    assert.deepEqual(thrown[0].slice(0, 7), [
        gnome, gnome.mx, gnome.my, -1, 0, 3, potion,
    ]);
});

// muse.c:2018-2019 announces the throw with pline_mon(), which sets the
// message location to the thrower's square; pline.c:175-177 prefixes that
// location under the accessiblemsg option.
test('use_offensive locates the hurl line at the thrower under accessiblemsg',
    async () => {
    const state = await offensiveHero();
    state.a11y = { ...state.a11y, accessiblemsg: true };
    const { gnome } = hurlingGnome(state);
    const messages = [];
    const env = {
        ...offensiveEnv(state),
        message: async (text) => { messages.push(text); },
        monsterName: () => 'The gnome',
        throwMissile: async () => {},
    };

    assert.equal(find_offensive(gnome, env), true);
    assert.equal(await use_offensive(gnome, env), 2);

    const line = 'The gnome hurls a dark potion!';
    const located = messageAt(line, gnome.mx, gnome.my, state);
    // The prefix is real: messageAt() returns the bare line only when the
    // option is off.
    assert.notEqual(located, line);
    assert.deepEqual(messages, [located]);
});

test('use_offensive refuses every arm outside the hurled potion',
    async () => {
    const state = await offensiveHero();
    const env = offensiveEnv(state);
    // muse.c:1842-1847. A wand arm needs mzapwand() and buzz(); write the
    // selection find_offensive() would have made and check the switch stops.
    const wand = carried(state, WAN_DEATH, { spe: 3 });
    const gnome = offensiveMonster(state, PM_GNOME, wand);
    state.m_offense = {
        has_offense: 1 /* muse.c:1272 MUSE_WAN_DEATH */,
        offensive: wand,
    };
    await assert.rejects(() => use_offensive(gnome, env),
        (error) => error.reason === 'monster offensive item use');
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
        assert.equal(find_offensive(nurse, env), true, slot);
        state[slot] = null;
    }
    for (const slot of worn) state[slot] = saved[slot];

    // The same wand in a gnome's pack is selected whatever the hero wears,
    // so the guard is the nurse's damage type and not the empty slots.
    const gnome = offensiveMonster(state, PM_GNOME, wand);
    assert.equal(find_offensive(gnome, env), true);
});

// C ref: muse.c linedup_chk_corpse() (1294-1299). Returns true when a corpse
// is on the floor at the given position, false otherwise.
test('linedup_chk_corpse returns true only when a corpse is on the floor',
    async () => {
    const state = await offensiveHero();
    const x = state.u.ux + 2;
    const y = state.u.uy;
    // Clear the square and confirm no corpse.
    assert.equal(linedup_chk_corpse(x, y, state), false,
        'empty square has no corpse');
    // Place a corpse and confirm it is found.
    const corpse = mksobj(CORPSE, false, false, { state });
    place_object(corpse, x, y, state);
    assert.equal(linedup_chk_corpse(x, y, state), true,
        'square with a corpse returns true');
    // Remove the corpse and confirm false again.
    remove_object(corpse, state);
    assert.equal(linedup_chk_corpse(x, y, state), false,
        'square after corpse removal returns false');
});

// C ref: muse.c hero_behind_chokepoint() (1344-1368). The hero is behind a
// chokepoint when both flanking squares of the step from hero toward monster
// are inaccessible (walls, out-of-bounds, or closed doors).
test('hero_behind_chokepoint detects a corridor one step from the hero',
    async () => {
    const state = await offensiveHero();
    const ux = state.u.ux;
    const uy = state.u.uy;
    // Monster is due east, hero at (ux, uy), so the step from hero toward
    // monster is (ux+1, uy). The two flanking squares are (ux+1, uy-1) and
    // (ux+1, uy+1). C ref: hero_behind_chokepoint() uses DIR_LEFT2/DIR_RIGHT2
    // to find these two squares offset from the direct path.

    // Make the direct path accessible but flanks walled off.
    const stepX = ux + 1, stepY = uy;
    state.level.at(stepX, stepY).typ = ROOM;
    state.level.at(stepX, stepY).doormask = 0;
    state.level.at(stepX, stepY - 1).typ = STONE;
    state.level.at(stepX, stepY + 1).typ = STONE;

    const mtmp = newMonster({
        data: state.mons[PM_GNOME],
        m_id: 9100,
        mx: ux + 3, my: uy,
        mux: ux, muy: uy,
    });
    assert.equal(hero_behind_chokepoint(mtmp, state), true,
        'both flanks walled off = chokepoint');

    // Open one flank: no longer a chokepoint.
    state.level.at(stepX, stepY - 1).typ = ROOM;
    state.level.at(stepX, stepY - 1).doormask = 0;
    assert.equal(hero_behind_chokepoint(mtmp, state), false,
        'one open flank = not a chokepoint');
});

// C ref: muse.c mon_has_friends() (1371-1392). Returns true when a hostile
// monster has at least one other hostile monster adjacent.
test('mon_has_friends detects an adjacent hostile companion', async () => {
    const state = await offensiveHero();
    const x = state.u.ux + 4;
    const y = state.u.uy;
    const mtmp = newMonster({
        data: state.mons[PM_GNOME],
        m_id: 9200,
        mx: x, my: y,
        mhp: 10, mhpmax: 10,
        mtame: false, mpeaceful: false,
    });
    place_monster(mtmp, x, y, state);

    // No adjacent friend yet.
    assert.equal(mon_has_friends(mtmp, state), false,
        'no adjacent friend');

    // Place a hostile friend adjacent.
    const friend = newMonster({
        data: state.mons[PM_GNOME],
        m_id: 9201,
        mx: x + 1, my: y,
        mhp: 10, mhpmax: 10,
        mtame: false, mpeaceful: false,
    });
    place_monster(friend, x + 1, y, state);
    assert.equal(mon_has_friends(mtmp, state), true,
        'adjacent hostile = has friends');

    // A peaceful neighbor does not count.
    friend.mpeaceful = true;
    assert.equal(mon_has_friends(mtmp, state), false,
        'adjacent peaceful = no friend');

    // A tame neighbor does not count.
    friend.mpeaceful = false;
    friend.mtame = true;
    assert.equal(mon_has_friends(mtmp, state), false,
        'adjacent tame = no friend');

    // A tame monster asking about its own friends always returns false.
    mtmp.mtame = true;
    friend.mtame = false;
    friend.mpeaceful = false;
    assert.equal(mon_has_friends(mtmp, state), false,
        'tame monster never has hostile friends');

    // Cleanup
    remove_monster(x, y, state);
    remove_monster(x + 1, y, state);
});

// C ref: muse.c mon_likes_objpile_at() (1395-1420). Returns true when the
// monster likes one of the top 3 items, or the pile has more than 3 stacks.
test('mon_likes_objpile_at checks the top 3 items and pile size', async () => {
    const state = await offensiveHero();
    const env = offensiveEnv(state);
    const x = state.u.ux + 5;
    const y = state.u.uy;

    const mtmp = newMonster({
        data: state.mons[PM_GNOME],
        m_id: 9300,
        mx: x + 1, my: y,
        mtame: false, mpeaceful: false,
    });

    // Empty square: false.
    assert.equal(mon_likes_objpile_at(mtmp, x, y, { state }), false,
        'empty square');

    // Place a single dagger (a gnome wants weapons). This is a desirable
    // item for a gnome since gnomes collect practical objects and daggers
    // are in WEAPON_CLASS.
    const dagger = mksobj(DAGGER, false, false, { state });
    place_object(dagger, x, y, state);
    assert.equal(mon_likes_objpile_at(mtmp, x, y, { state }), true,
        'single wanted item');
    remove_object(dagger, state);

    // A pile of 4+ stacks returns true regardless of individual item appeal
    // (C ref: muse.c:1416 "pile is larger than 3 stacks?").
    const objs = [];
    for (let i = 0; i < 4; i++) {
        // Food rations that a gnome might not prioritize individually,
        // but 4 stacks crosses the threshold.
        const obj = mksobj(FOOD_RATION, false, false, { state });
        place_object(obj, x, y, state);
        objs.push(obj);
    }
    assert.equal(mon_likes_objpile_at(mtmp, x, y, { state }), true,
        '4+ stacks always returns true');
    for (const obj of objs) remove_object(obj, state);
});
