import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_CHA,
    ALL_TRAPS,
    ARROW_TRAP,
    FEMALE,
    G_EXTINCT,
    G_GENOD,
    MALE,
    NEUTRAL,
    NO_TRAP,
} from '../js/const.js';
import {
    _mondataInternals,
    amorphous,
    attacktype,
    attacktype_fordmg,
    big_to_little,
    bigmonst,
    can_teleport,
    can_be_hatched,
    dmgtype,
    dead_species,
    haseyes,
    hides_under,
    is_animal,
    is_clinger,
    is_covetous,
    is_demon,
    is_dlord,
    is_dprince,
    is_displacer,
    is_female,
    is_floater,
    is_flyer,
    is_giant,
    is_hider,
    is_human,
    is_golem,
    is_lord,
    is_male,
    is_minion,
    is_neuter,
    is_prince,
    is_rider,
    is_swimmer,
    is_undead,
    is_wanderer,
    is_were,
    likes_gems,
    likes_gold,
    likes_lava,
    likes_magic,
    likes_objs,
    little_to_big,
    mon_knows_traps,
    name_to_mon,
    name_to_monplus,
    needspick,
    noattacks,
    nohands,
    nonliving,
    notake,
    passes_bars,
    passes_walls,
    perceives,
    regenerates,
    resist_conflict,
    slithy,
    strongmonst,
    throws_rocks,
    tunnels,
    undead_to_corpse,
    unsolid,
    verysmall,
    webmaker,
    zombie_form,
} from '../js/mondata.js';
import * as M from '../js/monsters.js';
import { roles } from '../js/roles.js';

// Source callers use -1 when no monster-name gender has been selected yet.
const UNSPECIFIED_GENDER = -1;

const alternateNameCases = [
    ['grey dragon', M.PM_GRAY_DRAGON, NEUTRAL],
    ['baby grey dragon', M.PM_BABY_GRAY_DRAGON, NEUTRAL],
    ['grey unicorn', M.PM_GRAY_UNICORN, NEUTRAL],
    ['grey ooze', M.PM_GRAY_OOZE, NEUTRAL],
    ['gray-elf', M.PM_GREY_ELF, NEUTRAL],
    ['mindflayer', M.PM_MIND_FLAYER, NEUTRAL],
    ['master mindflayer', M.PM_MASTER_MIND_FLAYER, NEUTRAL],
    ['aligned priest', M.PM_ALIGNED_CLERIC, MALE],
    ['aligned priestess', M.PM_ALIGNED_CLERIC, FEMALE],
    ['high priest', M.PM_HIGH_CLERIC, MALE],
    ['high priestess', M.PM_HIGH_CLERIC, FEMALE],
    ['master of thief', M.PM_MASTER_OF_THIEVES, NEUTRAL],
    ['master thief', M.PM_MASTER_OF_THIEVES, NEUTRAL],
    ['master of assassin', M.PM_MASTER_ASSASSIN, NEUTRAL],
    ['master-lich', M.PM_MASTER_LICH, NEUTRAL],
    ['masterlich', M.PM_MASTER_LICH, NEUTRAL],
    ['invisible stalker', M.PM_STALKER, NEUTRAL],
    ['high-elf', M.PM_ELVEN_MONARCH, NEUTRAL],
    ['wood-elf', M.PM_WOODLAND_ELF, NEUTRAL],
    ['wood elf', M.PM_WOODLAND_ELF, NEUTRAL],
    ['woodland nymph', M.PM_WOOD_NYMPH, NEUTRAL],
    ['halfling', M.PM_HOBBIT, NEUTRAL],
    ['genie', M.PM_DJINNI, NEUTRAL],
    ['human wererat', M.PM_HUMAN_WERERAT, NEUTRAL],
    ['human werejackal', M.PM_HUMAN_WEREJACKAL, NEUTRAL],
    ['human werewolf', M.PM_HUMAN_WEREWOLF, NEUTRAL],
    ['rat wererat', M.PM_WERERAT, NEUTRAL],
    ['jackal werejackal', M.PM_WEREJACKAL, NEUTRAL],
    ['wolf werewolf', M.PM_WEREWOLF, NEUTRAL],
    ['ki rin', M.PM_KI_RIN, NEUTRAL],
    ['kirin', M.PM_KI_RIN, NEUTRAL],
    ['uruk hai', M.PM_URUK_HAI, NEUTRAL],
    ['orc captain', M.PM_ORC_CAPTAIN, NEUTRAL],
    ['woodland elf', M.PM_WOODLAND_ELF, NEUTRAL],
    ['green elf', M.PM_GREEN_ELF, NEUTRAL],
    ['grey elf', M.PM_GREY_ELF, NEUTRAL],
    ['gray elf', M.PM_GREY_ELF, NEUTRAL],
    ['elf lady', M.PM_ELF_NOBLE, FEMALE],
    ['elf lord', M.PM_ELF_NOBLE, MALE],
    ['elf noble', M.PM_ELF_NOBLE, NEUTRAL],
    ['olog hai', M.PM_OLOG_HAI, NEUTRAL],
    ['arch lich', M.PM_ARCH_LICH, NEUTRAL],
    ['archlich', M.PM_ARCH_LICH, NEUTRAL],
    ['incubi', M.PM_AMOROUS_DEMON, MALE],
    ['succubi', M.PM_AMOROUS_DEMON, FEMALE],
    ['violet fungi', M.PM_VIOLET_FUNGUS, NEUTRAL],
    ['homunculi', M.PM_HOMUNCULUS, NEUTRAL],
    ['baluchitheria', M.PM_BALUCHITHERIUM, NEUTRAL],
    ['lurkers above', M.PM_LURKER_ABOVE, NEUTRAL],
    ['cavemen', M.PM_CAVE_DWELLER, MALE],
    ['cavewomen', M.PM_CAVE_DWELLER, FEMALE],
    ['watchmen', M.PM_WATCHMAN, NEUTRAL],
    ['djinn', M.PM_DJINNI, NEUTRAL],
    ['mumakil', M.PM_MUMAK, NEUTRAL],
    ['erinyes', M.PM_ERINYS, NEUTRAL],
];

function monsterState(withVitals = false) {
    const state = {};
    M.monst_globals_init(state);
    if (withVitals) M.reset_mvitals(state);
    return state;
}

test('name_to_mon preserves canonical longest-match and plural rules', () => {
    const state = monsterState();

    assert.equal(name_to_mon('newt', { state }), M.PM_NEWT);
    assert.equal(name_to_mon('NEWT corpse', { state }), M.PM_NEWT);
    assert.equal(name_to_mon('newts', { state }), M.PM_NEWT);
    assert.equal(name_to_mon("newt's corpse", { state }), M.PM_NEWT);
    assert.equal(name_to_mon('newtish', { state }), M.NON_PM);

    // "ettin" prefixes "ettin zombie"; the longest source name wins.
    assert.equal(name_to_mon('ettin zombie corpse', { state }),
        M.PM_ETTIN_ZOMBIE);
    assert.equal(name_to_mon('ettin zombies', { state }),
        M.PM_ETTIN_ZOMBIE);

    assert.equal(name_to_mon('ponies', { state }), M.PM_PONY);
    assert.equal(name_to_mon('wolves', { state }), M.PM_WOLF);
    assert.equal(name_to_mon('energy vortices', { state }),
        M.PM_ENERGY_VORTEX);
    // mondata.c explicitly excludes "zombies" from the -ies rewrite.
    assert.equal(name_to_mon('zombies', { state }), M.NON_PM);

    assert.equal(name_to_mon('a newt', { state }), M.PM_NEWT);
    assert.equal(name_to_mon('an ettin', { state }), M.PM_ETTIN);
    assert.equal(name_to_mon('the newt corpse', { state }), M.PM_NEWT);
    // Article stripping is deliberately case-sensitive in the C source.
    assert.equal(name_to_mon('The newt', { state }), M.NON_PM);
});

test('name_to_monplus preserves remainder and canonical gender semantics', () => {
    const state = monsterState();

    assert.deepEqual(name_to_monplus('the ettin zombie corpse', { state }), {
        mnum: M.PM_ETTIN_ZOMBIE,
        remainder: ' corpse',
        gender: NEUTRAL,
    });
    assert.deepEqual(name_to_monplus('priest corpse', { state }), {
        mnum: M.PM_ALIGNED_CLERIC,
        remainder: ' corpse',
        gender: MALE,
    });
    assert.deepEqual(name_to_monplus('priestess corpse', { state }), {
        mnum: M.PM_ALIGNED_CLERIC,
        remainder: ' corpse',
        gender: FEMALE,
    });

    // A neutral pmname doesn't overwrite a caller's known male/female value.
    assert.equal(name_to_monplus('newt', {
        state,
        gender: FEMALE,
    }).gender, FEMALE);

    // Plural rewrites shorten the working copy, but C's pointer still uses
    // that revised match length as an offset into the original input.
    assert.equal(name_to_monplus('wolves', { state }).remainder, 'es');
    assert.equal(name_to_monplus('energy vortices', { state }).remainder,
        'es');
});

test('name_to_monplus covers every source alternate spelling in order', () => {
    const state = monsterState();
    const actualTable = _mondataInternals.alternateMonsterNames.map(
        ({ name, mnum, gender }) => [name, mnum, gender],
    );
    assert.deepEqual(actualTable, alternateNameCases);

    for (const [name, mnum, gender] of alternateNameCases) {
        const result = name_to_monplus(`${name} corpse`, {
            state,
            // Alternate rows overwrite even a previously selected gender.
            gender: MALE,
        });
        assert.deepEqual(result, {
            mnum,
            remainder: ' corpse',
            gender,
        }, name);
    }

    // Alternate entries require a complete word or possessive boundary.
    assert.equal(name_to_mon('grey dragonfruit', { state }), M.NON_PM);
});

test('name_to_monplus falls back to role titles without changing gender', () => {
    const state = monsterState();
    const archeologist = roles[0];
    const result = name_to_monplus('Digger corpse', {
        state,
        gender: FEMALE,
    });
    assert.deepEqual(result, {
        mnum: archeologist.mnum,
        remainder: ' corpse',
        gender: FEMALE,
    });

    // botl.c:title_to_mon() intentionally performs a raw prefix match.
    assert.deepEqual(name_to_monplus('Diggerish', { state }), {
        mnum: archeologist.mnum,
        remainder: 'ish',
        gender: UNSPECIFIED_GENDER,
    });
});

test('name_to_mon fails closed for malformed input and monster catalogs', () => {
    const state = monsterState();
    assert.deepEqual(name_to_monplus('', { state }), {
        mnum: M.NON_PM,
        remainder: null,
        gender: UNSPECIFIED_GENDER,
    });
    assert.throws(
        () => name_to_mon(null, { state }),
        /requires monster-name text/u,
    );
    assert.throws(
        () => name_to_mon('newt', { state: {} }),
        /requires monst_globals_init/u,
    );
    assert.throws(
        () => name_to_monplus('newt', { state, gender: 'female' }),
        /gender must be an integer/u,
    );

    const malformed = monsterState();
    malformed.mons[M.PM_NEWT].pmnames = null;
    assert.throws(
        () => name_to_mon('newt', { state: malformed }),
        /requires a complete monster catalog/u,
    );
});

test('growth map matches every active row in the pinned C table', () => {
    const { grownups } = _mondataInternals;
    // NetHack 5.0 has 67 active rows; the shimmering-dragon row is under
    // #if 0 and must not affect either lookup direction.
    assert.equal(grownups.length, 67);
    const digest = createHash('sha256')
        .update(JSON.stringify(grownups))
        .digest('hex');
    // This snapshot covers all ordered numeric pairs, including duplicate
    // adult forms whose first source occurrence controls reverse lookup.
    assert.equal(
        digest,
        '48981ea5db6edc3d9367f6e0639d4fc93cc6b4657796f8fa52b61f7a7b36c921',
    );
    for (const [little, big] of grownups)
        assert.equal(little_to_big(little), big);
    assert.equal(Object.isFrozen(grownups), true);
    assert.equal(Object.isFrozen(grownups[0]), true);
});

test('growth conversions take one step and preserve first reverse match', () => {
    assert.equal(little_to_big(M.PM_LITTLE_DOG), M.PM_DOG);
    assert.equal(little_to_big(M.PM_DOG), M.PM_LARGE_DOG);
    assert.equal(little_to_big(M.PM_LARGE_DOG), M.PM_LARGE_DOG);
    assert.equal(big_to_little(M.PM_LARGE_DOG), M.PM_DOG);
    assert.equal(big_to_little(M.PM_DOG), M.PM_LITTLE_DOG);

    // Four orcs share one adult form; C's ordered scan selects plain orc.
    assert.equal(big_to_little(M.PM_ORC_CAPTAIN), M.PM_ORC);
    // Four elves share one noble form; C's ordered scan selects plain elf.
    assert.equal(big_to_little(M.PM_ELF_NOBLE), M.PM_ELF);
    assert.equal(little_to_big(M.PM_NEWT), M.PM_NEWT);
    assert.equal(big_to_little(M.PM_NEWT), M.PM_NEWT);
    assert.equal(little_to_big(), M.NON_PM);
    assert.equal(big_to_little(), M.NON_PM);
});

test('zombie and mummy corpses use their living source species', () => {
    const mappings = [
        [M.PM_KOBOLD_ZOMBIE, M.PM_KOBOLD],
        [M.PM_KOBOLD_MUMMY, M.PM_KOBOLD],
        [M.PM_DWARF_ZOMBIE, M.PM_DWARF],
        [M.PM_DWARF_MUMMY, M.PM_DWARF],
        [M.PM_GNOME_ZOMBIE, M.PM_GNOME],
        [M.PM_GNOME_MUMMY, M.PM_GNOME],
        [M.PM_ORC_ZOMBIE, M.PM_ORC],
        [M.PM_ORC_MUMMY, M.PM_ORC],
        [M.PM_ELF_ZOMBIE, M.PM_ELF],
        [M.PM_ELF_MUMMY, M.PM_ELF],
        [M.PM_VAMPIRE, M.PM_HUMAN],
        [M.PM_VAMPIRE_LEADER, M.PM_HUMAN],
        [M.PM_HUMAN_ZOMBIE, M.PM_HUMAN],
        [M.PM_HUMAN_MUMMY, M.PM_HUMAN],
        [M.PM_GIANT_ZOMBIE, M.PM_GIANT],
        [M.PM_GIANT_MUMMY, M.PM_GIANT],
        [M.PM_ETTIN_ZOMBIE, M.PM_ETTIN],
        [M.PM_ETTIN_MUMMY, M.PM_ETTIN],
    ];
    for (const [undead, living] of mappings)
        assert.equal(undead_to_corpse(undead), living);
    assert.equal(undead_to_corpse(M.PM_NEWT), M.PM_NEWT);
    assert.equal(undead_to_corpse(), M.NON_PM);
});

test('zombie_form follows monster class and race flags', () => {
    const state = monsterState();
    const pm = (index) => state.mons[index];

    assert.equal(zombie_form(pm(M.PM_KOBOLD)), M.PM_KOBOLD_ZOMBIE);
    assert.equal(zombie_form(pm(M.PM_HILL_ORC)), M.PM_ORC_ZOMBIE);
    assert.equal(zombie_form(pm(M.PM_GIANT)), M.PM_GIANT_ZOMBIE);
    assert.equal(zombie_form(pm(M.PM_ETTIN)), M.PM_ETTIN_ZOMBIE);
    assert.equal(zombie_form(pm(M.PM_HUMAN)), M.PM_HUMAN_ZOMBIE);
    assert.equal(zombie_form(pm(M.PM_ELF)), M.PM_ELF_ZOMBIE);
    assert.equal(zombie_form(pm(M.PM_DWARF)), M.PM_DWARF_ZOMBIE);
    assert.equal(zombie_form(pm(M.PM_HOBBIT)), M.NON_PM);
    assert.equal(zombie_form(pm(M.PM_GNOME)), M.PM_GNOME_ZOMBIE);
    assert.equal(zombie_form(pm(M.PM_GHOUL)), M.NON_PM);
    assert.equal(zombie_form(pm(M.PM_SKELETON)), M.NON_PM);
    assert.equal(zombie_form(), M.NON_PM);

    // Kops share the human branch, but its elf test precedes the fallback.
    assert.equal(zombie_form({ mlet: M.S_KOP, mflags2: M.M2_ELF }),
        M.PM_ELF_ZOMBIE);
});

test('rider and fixed-gender predicates mirror permonst fields', () => {
    const state = monsterState();
    assert.equal(is_rider(state.mons[M.PM_DEATH]), true);
    assert.equal(is_rider(state.mons[M.PM_PESTILENCE]), true);
    assert.equal(is_rider(state.mons[M.PM_FAMINE]), true);
    assert.equal(is_rider(state.mons[M.PM_NEWT]), false);
    assert.equal(is_rider(), false);

    assert.equal(is_male({ mflags2: M.M2_MALE }), true);
    assert.equal(is_male({ mflags2: M.M2_FEMALE }), false);
    assert.equal(is_female({ mflags2: M.M2_FEMALE }), true);
    assert.equal(is_female({ mflags2: M.M2_NEUTER }), false);
    assert.equal(is_neuter({ mflags2: M.M2_NEUTER }), true);
    assert.equal(is_neuter({ mflags2: 0 }), false);
    assert.equal(is_male(), false);
    assert.equal(is_female(), false);
    assert.equal(is_neuter(), false);
});

test('can_be_hatched preserves BREEDER_EGG evaluation order', () => {
    const state = monsterState();
    const noDraw = { rn2() { assert.fail('unexpected rn2 call'); } };

    // Killer bees and gargoyles are special cases before lays_eggs().
    assert.equal(can_be_hatched(M.PM_KILLER_BEE,
        { state: {}, random: noDraw }), M.PM_KILLER_BEE);
    assert.equal(can_be_hatched(M.PM_GARGOYLE,
        { state: {}, random: noDraw }), M.PM_GARGOYLE);
    assert.equal(can_be_hatched(M.PM_JACKAL,
        { state, random: noDraw }), M.NON_PM);

    const bounds = [];
    const ordinary = {
        rn2(bound) {
            bounds.push(bound);
            return 1;
        },
    };
    // 77 is BREEDER_EGG's exact rarity. An ordinary egg-layer succeeds even
    // when that draw is nonzero, but it still consumes the draw first.
    assert.equal(can_be_hatched(M.PM_GIANT_ANT,
        { state, random: ordinary }), M.PM_GIANT_ANT);
    assert.deepEqual(bounds, [77]);

    assert.equal(can_be_hatched(M.PM_QUEEN_BEE, {
        state,
        random: { rn2: (bound) => (assert.equal(bound, 77), 0) },
    }), M.PM_QUEEN_BEE);
    assert.equal(can_be_hatched(M.PM_QUEEN_BEE, {
        state,
        random: { rn2: (bound) => (assert.equal(bound, 77), 1) },
    }), M.NON_PM);
    assert.equal(can_be_hatched(M.PM_WINGED_GARGOYLE, {
        state,
        random: { rn2: (bound) => (assert.equal(bound, 77), 1) },
    }), M.NON_PM);
});

test('can_be_hatched applies quest and growth substitutions before flags', () => {
    const state = monsterState();
    const calls = [];
    const random = {
        rn2(bound) {
            calls.push(bound);
            return 23;
        },
    };
    assert.equal(can_be_hatched(M.PM_SCORPIUS, { state, random }),
        M.PM_SCORPION);
    assert.equal(can_be_hatched(M.PM_BABY_CROCODILE, { state, random }),
        M.PM_CROCODILE);
    assert.deepEqual(calls, [77, 77]);

    assert.equal(can_be_hatched(undefined, { state: {}, random }), M.NON_PM);
    assert.equal(can_be_hatched(M.NUMMONS, { state: {}, random }), M.NON_PM);
    assert.throws(
        () => can_be_hatched(M.PM_GIANT_ANT, { state: {}, random }),
        /requires monst_globals_init/u,
    );
    assert.throws(
        () => can_be_hatched(M.PM_GIANT_ANT, { state, random: {} }),
        /requires rn2/u,
    );
});

test('dead_species checks genocide but ignores population extinction', () => {
    const state = monsterState(true);
    const baby = M.PM_BABY_CROCODILE;
    const adult = M.PM_CROCODILE;

    state.mvitals[baby].mvflags |= G_EXTINCT;
    state.mvitals[adult].mvflags |= G_EXTINCT;
    assert.equal(dead_species(adult, true, { state }), false);

    state.mvitals[baby].mvflags |= G_GENOD;
    assert.equal(dead_species(adult, true, { state }), true);
    // Non-egg callers check only the requested species, not its young form.
    assert.equal(dead_species(adult, false, { state }), false);

    state.mvitals[adult].mvflags |= G_GENOD;
    assert.equal(dead_species(adult, false, { state }), true);
});

test('dead_species uses the first reverse growth match and fails closed', () => {
    const state = monsterState(true);
    state.mvitals[M.PM_HILL_ORC].mvflags |= G_GENOD;
    assert.equal(dead_species(M.PM_ORC_CAPTAIN, true, { state }), false);
    state.mvitals[M.PM_ORC].mvflags |= G_GENOD;
    assert.equal(dead_species(M.PM_ORC_CAPTAIN, true, { state }), true);

    assert.equal(dead_species(M.NON_PM, true, { state: {} }), true);
    assert.equal(dead_species(undefined, true, { state: {} }), true);
    assert.equal(dead_species(M.NUMMONS, true, { state: {} }), true);
    assert.throws(
        () => dead_species(M.PM_NEWT, true, { state: {} }),
        /requires initialized mvitals/u,
    );
});

test('movement predicates are exact projections of permonst flags', () => {
    const flagCases = [
        [is_flyer, 'mflags1', M.M1_FLY],
        [is_clinger, 'mflags1', M.M1_CLING],
        [is_swimmer, 'mflags1', M.M1_SWIM],
        [amorphous, 'mflags1', M.M1_AMORPHOUS],
        [passes_walls, 'mflags1', M.M1_WALLWALK],
        [tunnels, 'mflags1', M.M1_TUNNEL],
        [needspick, 'mflags1', M.M1_NEEDPICK],
        [hides_under, 'mflags1', M.M1_CONCEAL],
        [is_hider, 'mflags1', M.M1_HIDE],
        [nohands, 'mflags1', M.M1_NOHANDS],
        [notake, 'mflags1', M.M1_NOTAKE],
        [unsolid, 'mflags1', M.M1_UNSOLID],
        [is_animal, 'mflags1', M.M1_ANIMAL],
        [slithy, 'mflags1', M.M1_SLITHY],
        [regenerates, 'mflags1', M.M1_REGEN],
        [perceives, 'mflags1', M.M1_SEE_INVIS],
        [can_teleport, 'mflags1', M.M1_TPORT],
        [is_undead, 'mflags2', M.M2_UNDEAD],
        [is_were, 'mflags2', M.M2_WERE],
        [is_demon, 'mflags2', M.M2_DEMON],
        [is_lord, 'mflags2', M.M2_LORD],
        [is_prince, 'mflags2', M.M2_PRINCE],
        [is_human, 'mflags2', M.M2_HUMAN],
        [is_giant, 'mflags2', M.M2_GIANT],
        [is_wanderer, 'mflags2', M.M2_WANDER],
        [strongmonst, 'mflags2', M.M2_STRONG],
        [throws_rocks, 'mflags2', M.M2_ROCKTHROW],
        [is_minion, 'mflags2', M.M2_MINION],
        [likes_gold, 'mflags2', M.M2_GREEDY],
        [likes_gems, 'mflags2', M.M2_JEWELS],
        [likes_magic, 'mflags2', M.M2_MAGIC],
        [is_covetous, 'mflags3', M.M3_COVETOUS],
        [is_displacer, 'mflags3', M.M3_DISPLACES],
    ];

    for (const species of M.MONSTER_TEMPLATES) {
        for (const [predicate, field, mask] of flagCases) {
            assert.equal(
                predicate(species),
                Boolean(species[field] & mask),
                `${predicate.name}(${species.pmidx})`,
            );
        }
        assert.equal(haseyes(species), !(species.mflags1 & M.M1_NOEYES));
        assert.equal(verysmall(species), species.msize < M.MZ_SMALL);
        assert.equal(bigmonst(species), species.msize >= M.MZ_LARGE);
        assert.equal(
            likes_objs(species),
            Boolean(species.mflags2 & M.M2_COLLECT)
                || species.mattk.some((attack) => attack.aatyp === M.AT_WEAP),
        );
    }
});

test('demon rank and conflict resistance preserve source composition', () => {
    const demonLord = {
        mflags2: M.M2_DEMON | M.M2_LORD,
    };
    const mortalPrince = {
        mflags2: M.M2_PRINCE,
    };
    assert.equal(is_dlord(demonLord), true);
    assert.equal(is_dprince(demonLord), false);
    assert.equal(is_prince(mortalPrince), true);
    assert.equal(is_dprince(mortalPrince), false);

    const state = {
        u: {
            acurr: { a: new Array(6).fill(0) },
            ulevel: 3,
        },
    };
    state.u.acurr.a[A_CHA] = 12;
    const monster = { m_lev: 8 };
    const bounds = [];
    assert.equal(resist_conflict(monster, state, {
        rnd(bound) {
            bounds.push(bound);
            return 8;
        },
    }), true);
    assert.deepEqual(bounds, [20]);
    assert.equal(resist_conflict(monster, state, { rnd: () => 7 }), false);

    // min(19, ...) caps only the high end; the negative source chance stays
    // negative and therefore makes every legal rnd(20) result resist.
    state.u.acurr.a[A_CHA] = 3;
    monster.m_lev = 30;
    assert.equal(resist_conflict(monster, state, { rnd: () => 1 }), true);
});

test('compound movement predicates preserve source special cases', () => {
    const state = monsterState();
    const species = (mndx) => state.mons[mndx];

    assert.equal(is_floater(species(M.PM_FLOATING_EYE)), true);
    assert.equal(is_floater(species(M.PM_YELLOW_LIGHT)), true);
    assert.equal(is_floater(species(M.PM_FOG_CLOUD)), false);
    assert.equal(likes_lava(species(M.PM_FIRE_ELEMENTAL)), true);
    assert.equal(likes_lava(species(M.PM_SALAMANDER)), true);
    assert.equal(likes_lava(species(M.PM_FIRE_VORTEX)), false);

    assert.equal(attacktype(species(M.PM_SOLDIER), M.AT_WEAP), true);
    assert.equal(dmgtype(species(M.PM_RUST_MONSTER), M.AD_RUST), true);
    assert.equal(noattacks(species(M.PM_GAS_SPORE)), true);
    assert.equal(noattacks(species(M.PM_JACKAL)), false);

    // Each independent source clause has a representative: wall-passing,
    // amorphous, unsolid/whirly, tiny, corrosive, metallivorous, and slithy.
    for (const mndx of [
        M.PM_EARTH_ELEMENTAL,
        M.PM_FOG_CLOUD,
        M.PM_GHOST,
        M.PM_AIR_ELEMENTAL,
        M.PM_NEWT,
        M.PM_RUST_MONSTER,
        M.PM_ROCK_MOLE,
        M.PM_GARTER_SNAKE,
    ]) {
        assert.equal(passes_bars(species(mndx)), true, mndx);
    }
    assert.equal(passes_bars(species(M.PM_HUMAN)), false);
});

test('movement attack, life-state, web, and trap queries match source tables', () => {
    const state = monsterState();
    const species = (mndx) => state.mons[mndx];
    const poisonBreath = {
        mattk: [{ aatyp: M.AT_BREA, adtyp: M.AD_DRST }],
    };

    assert.equal(
        attacktype_fordmg(poisonBreath, M.AT_BREA, M.AD_DRST),
        true,
    );
    assert.equal(
        attacktype_fordmg(poisonBreath, M.AT_BREA, M.AD_ANY),
        true,
    );
    assert.equal(
        attacktype_fordmg(poisonBreath, M.AT_BREA, M.AD_RBRE),
        false,
    );

    assert.equal(is_golem(species(M.PM_IRON_GOLEM)), true);
    assert.equal(nonliving(species(M.PM_IRON_GOLEM)), true);
    assert.equal(nonliving(species(M.PM_MANES)), true);
    assert.equal(nonliving(species(M.PM_HUMAN)), false);
    assert.equal(webmaker(species(M.PM_CAVE_SPIDER)), true);
    assert.equal(webmaker(species(M.PM_GIANT_SPIDER)), true);
    assert.equal(webmaker(species(M.PM_HUMAN)), false);

    const monster = { mtrapseen: 1 << (ARROW_TRAP - 1) };
    assert.equal(mon_knows_traps(monster, ARROW_TRAP), true);
    assert.equal(mon_knows_traps(monster, ARROW_TRAP + 1), false);
    assert.equal(mon_knows_traps(monster, ALL_TRAPS), true);
    assert.equal(mon_knows_traps(monster, NO_TRAP), false);
    monster.mtrapseen = 0;
    assert.equal(mon_knows_traps(monster, ALL_TRAPS), false);
    assert.equal(mon_knows_traps(monster, NO_TRAP), true);
});
