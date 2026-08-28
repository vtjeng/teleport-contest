import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_CHA,
    FEMALE,
    MALE,
    NEUTRAL,
} from '../js/const.js';
import {
    ARTILIST_TEMPLATE,
    ART_GRIMTOOTH,
    ART_MITRE_OF_HOLINESS,
} from '../js/artifacts.js';
import {
    _mondataInternals,
    acidic,
    amorphous,
    attacktype,
    attacktype_fordmg,
    big_to_little,
    bigmonst,
    can_breathe,
    can_teleport,
    can_be_hatched,
    dmgtype,
    dead_species,
    flesh_petrifies,
    flaming,
    get_atkdam_type,
    haseyes,
    hides_under,
    humanoid,
    is_animal,
    is_clinger,
    is_covetous,
    is_demon,
    is_dwarf,
    is_dlord,
    is_dprince,
    is_displacer,
    is_elf,
    is_female,
    is_floater,
    is_flyer,
    is_gnome,
    is_giant,
    is_hider,
    is_human,
    is_golem,
    is_mind_flayer,
    is_lord,
    is_male,
    is_minion,
    is_neuter,
    is_orc,
    is_prince,
    is_rider,
    is_swimmer,
    is_undead,
    is_wanderer,
    is_were,
    likes_gems,
    likes_fire,
    likes_gold,
    likes_lava,
    likes_magic,
    likes_objs,
    little_to_big,
    locomotion,
    mon_knows_traps,
    monster_resists_element,
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
    poisonous,
    regenerates,
    resist_conflict,
    same_race,
    slimeproof,
    slithy,
    strongmonst,
    thick_skinned,
    throws_rocks,
    touch_petrifies,
    tunnels,
    undead_to_corpse,
    unsolid,
    vegan,
    verysmall,
    webmaker,
    zombie_form,
} from '../js/mondata.js';
import * as M from '../js/monsters.js';
import {
    ALCHEMY_SMOCK,
    OBJECT_TEMPLATES,
    RIN_POISON_RESISTANCE,
} from '../js/objects.js';
import { roles } from '../js/roles.js';

// Monster flags, sizes, class letters, and attack types, transcribed from the
// C headers. mondata.c's predicates test these exact values, so a case built
// from the port's own export would select its branch even if the export were
// missing or wrong: `undefined === undefined` is true and `x & undefined` is 0
// on both sides of the assertion. PM_ constants stay as exports, because C
// generates them from the row order of monsters.h and writes no numeral.

// include/monflag.h, permonst mflags1 bits.
const M1_FLY = 0x00000001;        // monflag.h:85
const M1_SWIM = 0x00000002;       // monflag.h:86
const M1_AMORPHOUS = 0x00000004;  // monflag.h:87
const M1_WALLWALK = 0x00000008;   // monflag.h:88
const M1_CLING = 0x00000010;      // monflag.h:89
const M1_TUNNEL = 0x00000020;     // monflag.h:90
const M1_NEEDPICK = 0x00000040;   // monflag.h:91
const M1_CONCEAL = 0x00000080;    // monflag.h:92
const M1_HIDE = 0x00000100;       // monflag.h:93
const M1_NOTAKE = 0x00000800;     // monflag.h:96
const M1_NOEYES = 0x00001000;     // monflag.h:97
const M1_NOHANDS = 0x00002000;    // monflag.h:98
const M1_NOLIMBS = 0x00006000;    // monflag.h:99, NOHANDS plus a second bit
const M1_ANIMAL = 0x00040000;     // monflag.h:103
const M1_SLITHY = 0x00080000;     // monflag.h:104
const M1_UNSOLID = 0x00100000;    // monflag.h:105
const M1_REGEN = 0x00800000;      // monflag.h:108
const M1_SEE_INVIS = 0x01000000;  // monflag.h:109
const M1_TPORT = 0x02000000;      // monflag.h:110

// include/monflag.h, permonst mflags2 bits.
const M2_UNDEAD = 0x00000002;     // monflag.h:124
const M2_WERE = 0x00000004;       // monflag.h:125
const M2_HUMAN = 0x00000008;      // monflag.h:126
const M2_ELF = 0x00000010;        // monflag.h:127
const M2_DEMON = 0x00000100;      // monflag.h:131
const M2_LORD = 0x00000400;       // monflag.h:133
const M2_PRINCE = 0x00000800;     // monflag.h:134
const M2_MINION = 0x00001000;     // monflag.h:135
const M2_GIANT = 0x00002000;      // monflag.h:136
const M2_MALE = 0x00010000;       // monflag.h:138
const M2_FEMALE = 0x00020000;     // monflag.h:139
const M2_NEUTER = 0x00040000;     // monflag.h:140
const M2_WANDER = 0x00800000;     // monflag.h:145
const M2_STRONG = 0x04000000;     // monflag.h:148
const M2_ROCKTHROW = 0x08000000;  // monflag.h:149
const M2_GREEDY = 0x10000000;     // monflag.h:150
const M2_JEWELS = 0x20000000;     // monflag.h:151
const M2_COLLECT = 0x40000000;    // monflag.h:152
const M2_MAGIC = 0x80000000;      // monflag.h:154

// include/monflag.h, permonst mflags3 bits and monster sizes.
const M3_COVETOUS = 0x001f;       // monflag.h:168
const M3_DISPLACES = 0x0400;      // monflag.h:175
const MZ_SMALL = 1;               // monflag.h:178
const MZ_MEDIUM = 2;              // monflag.h:179
const MZ_LARGE = 3;               // monflag.h:181

// include/monflag.h, mvitals mvflags bits.
const G_GENOD = 0x02;             // monflag.h:209
const G_EXTINCT = 0x01;           // monflag.h:210

// include/defsym.h MONSYM() rows, monster class letters.
const S_ANT = 1;                  // defsym.h:295
const S_EYE = 5;                  // defsym.h:299
const S_KOP = 37;                 // defsym.h:338

// include/monattk.h, attack and damage types.
const AD_ANY = -1;                // monattk.h:41, dmgtype wildcard
const AD_PHYS = 0;                // monattk.h:42
const AD_MAGM = 1;                // monattk.h:43
const AD_FIRE = 2;                // monattk.h:44
const AD_COLD = 3;                // monattk.h:45
const AD_SLEE = 4;                // monattk.h:46
const AD_DISN = 5;                // monattk.h:47
const AD_ELEC = 6;                // monattk.h:48
const AD_DRST = 7;                // monattk.h:49
const AD_ACID = 8;                // monattk.h:50
const AD_RUST = 24;               // monattk.h:66
const AD_RBRE = 242;              // monattk.h:89
const AT_BREA = 12;               // monattk.h:22
const AT_WEAP = 254;              // monattk.h:28

// include/prop.h, property numbers and worn-equipment slot bits.
const FIRE_RES = 1;               // prop.h:15
const POISON_RES = 6;             // prop.h:20
const ACID_RES = 7;               // prop.h:21
const W_ARMC = 0x00000002;        // prop.h:102, cloak slot
const W_RINGL = 0x00020000;       // prop.h:118, left-ring slot

// include/trap.h, enum trap_types.
const ALL_TRAPS = -1;             // trap.h:59
const NO_TRAP = 0;                // trap.h:60
const ARROW_TRAP = 1;             // trap.h:61

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

test('combat and diet predicates preserve their source species families', () => {
    const state = monsterState();
    const pm = (index) => state.mons[index];

    assert.equal(thick_skinned(pm(M.PM_GRAY_DRAGON)), true);
    assert.equal(thick_skinned(pm(M.PM_NEWT)), false);
    assert.equal(humanoid(pm(M.PM_GOBLIN)), true);
    assert.equal(humanoid(pm(M.PM_GRID_BUG)), false);
    assert.equal(acidic(pm(M.PM_ACID_BLOB)), true);
    assert.equal(poisonous(pm(M.PM_KILLER_BEE)), true);

    assert.equal(is_elf(pm(M.PM_WOODLAND_ELF)), true);
    assert.equal(is_dwarf(pm(M.PM_DWARF)), true);
    assert.equal(is_gnome(pm(M.PM_GNOME)), true);
    assert.equal(is_orc(pm(M.PM_HILL_ORC)), true);

    for (const index of [
        M.PM_FIRE_VORTEX,
        M.PM_FLAMING_SPHERE,
        M.PM_FIRE_ELEMENTAL,
        M.PM_SALAMANDER,
    ]) {
        assert.equal(flaming(pm(index)), true);
        assert.equal(likes_fire(pm(index)), true);
    }
    assert.equal(flaming(pm(M.PM_NEWT)), false);
    assert.equal(likes_fire(pm(M.PM_NEWT)), false);

    assert.equal(touch_petrifies(pm(M.PM_CHICKATRICE)), true);
    assert.equal(touch_petrifies(pm(M.PM_COCKATRICE)), true);
    assert.equal(touch_petrifies(pm(M.PM_MEDUSA)), false);
    assert.equal(flesh_petrifies(pm(M.PM_MEDUSA)), true);

    assert.equal(slimeproof(pm(M.PM_GREEN_SLIME)), true);
    assert.equal(slimeproof(pm(M.PM_GHOST)), true);
    assert.equal(slimeproof(pm(M.PM_NEWT)), false);
    assert.equal(vegan(pm(M.PM_ACID_BLOB)), true);
    assert.equal(vegan(pm(M.PM_STONE_GOLEM)), true);
    assert.equal(vegan(pm(M.PM_STALKER)), false);
    assert.equal(vegan(pm(M.PM_FLESH_GOLEM)), false);
});

test('same_race follows directional race, class, and growth comparisons', () => {
    const state = monsterState();
    const pm = (index) => state.mons[index];

    assert.equal(same_race(pm(M.PM_NEWT), pm(M.PM_NEWT)), true);
    assert.equal(same_race(pm(M.PM_HUMAN), pm(M.PM_ARCHEOLOGIST)), true);
    assert.equal(same_race(pm(M.PM_HILL_ORC), pm(M.PM_ORC_ZOMBIE)), true);
    assert.equal(same_race(pm(M.PM_KOBOLD), pm(M.PM_KOBOLD_MUMMY)), true);
    assert.equal(same_race(pm(M.PM_KOBOLD_MUMMY), pm(M.PM_KOBOLD)), true);

    // The growth walk crosses both little-dog steps in either direction.
    assert.equal(same_race(pm(M.PM_LITTLE_DOG), pm(M.PM_LARGE_DOG)), true);
    assert.equal(same_race(pm(M.PM_LARGE_DOG), pm(M.PM_LITTLE_DOG)), true);
    assert.equal(same_race(pm(M.PM_GARGOYLE), pm(M.PM_WINGED_GARGOYLE)), true);
    assert.equal(same_race(pm(M.PM_KILLER_BEE), pm(M.PM_QUEEN_BEE)), true);
    assert.equal(same_race(pm(M.PM_LONG_WORM_TAIL), pm(M.PM_LONG_WORM)), true);

    assert.equal(same_race(pm(M.PM_TENGU), pm(M.PM_IMP)), false);
    assert.equal(same_race(pm(M.PM_KOBOLD_ZOMBIE), pm(M.PM_ORC_ZOMBIE)),
        false);
    assert.equal(same_race(pm(M.PM_KOBOLD_ZOMBIE), pm(M.PM_KOBOLD_MUMMY)),
        true);
    assert.equal(same_race(pm(M.PM_NEWT), pm(M.PM_GRID_BUG)), false);
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
    assert.equal(zombie_form({ mlet: S_KOP, mflags2: M2_ELF }),
        M.PM_ELF_ZOMBIE);
});

test('rider and fixed-gender predicates mirror permonst fields', () => {
    const state = monsterState();
    assert.equal(is_rider(state.mons[M.PM_DEATH]), true);
    assert.equal(is_rider(state.mons[M.PM_PESTILENCE]), true);
    assert.equal(is_rider(state.mons[M.PM_FAMINE]), true);
    assert.equal(is_rider(state.mons[M.PM_NEWT]), false);
    assert.equal(is_rider(), false);

    assert.equal(is_male({ mflags2: M2_MALE }), true);
    assert.equal(is_male({ mflags2: M2_FEMALE }), false);
    assert.equal(is_female({ mflags2: M2_FEMALE }), true);
    assert.equal(is_female({ mflags2: M2_NEUTER }), false);
    assert.equal(is_neuter({ mflags2: M2_NEUTER }), true);
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
        [is_flyer, 'mflags1', M1_FLY],
        [is_clinger, 'mflags1', M1_CLING],
        [is_swimmer, 'mflags1', M1_SWIM],
        [amorphous, 'mflags1', M1_AMORPHOUS],
        [passes_walls, 'mflags1', M1_WALLWALK],
        [tunnels, 'mflags1', M1_TUNNEL],
        [needspick, 'mflags1', M1_NEEDPICK],
        [hides_under, 'mflags1', M1_CONCEAL],
        [is_hider, 'mflags1', M1_HIDE],
        [nohands, 'mflags1', M1_NOHANDS],
        [notake, 'mflags1', M1_NOTAKE],
        [unsolid, 'mflags1', M1_UNSOLID],
        [is_animal, 'mflags1', M1_ANIMAL],
        [slithy, 'mflags1', M1_SLITHY],
        [regenerates, 'mflags1', M1_REGEN],
        [perceives, 'mflags1', M1_SEE_INVIS],
        [can_teleport, 'mflags1', M1_TPORT],
        [is_undead, 'mflags2', M2_UNDEAD],
        [is_were, 'mflags2', M2_WERE],
        [is_demon, 'mflags2', M2_DEMON],
        [is_lord, 'mflags2', M2_LORD],
        [is_prince, 'mflags2', M2_PRINCE],
        [is_human, 'mflags2', M2_HUMAN],
        [is_giant, 'mflags2', M2_GIANT],
        [is_wanderer, 'mflags2', M2_WANDER],
        [strongmonst, 'mflags2', M2_STRONG],
        [throws_rocks, 'mflags2', M2_ROCKTHROW],
        [is_minion, 'mflags2', M2_MINION],
        [likes_gold, 'mflags2', M2_GREEDY],
        [likes_gems, 'mflags2', M2_JEWELS],
        [likes_magic, 'mflags2', M2_MAGIC],
        [is_covetous, 'mflags3', M3_COVETOUS],
        [is_displacer, 'mflags3', M3_DISPLACES],
    ];

    for (const species of M.MONSTER_TEMPLATES) {
        for (const [predicate, field, mask] of flagCases) {
            assert.equal(
                predicate(species),
                Boolean(species[field] & mask),
                `${predicate.name}(${species.pmidx})`,
            );
        }
        assert.equal(haseyes(species), !(species.mflags1 & M1_NOEYES));
        assert.equal(verysmall(species), species.msize < MZ_SMALL);
        assert.equal(bigmonst(species), species.msize >= MZ_LARGE);
        assert.equal(
            likes_objs(species),
            Boolean(species.mflags2 & M2_COLLECT)
                || species.mattk.some((attack) => attack.aatyp === AT_WEAP),
        );
    }
});

test('locomotion follows source trait precedence for movement messages', () => {
    const ordinary = {
        mflags1: 0,
        mlet: S_ANT,
        mmove: 12,
        msize: MZ_MEDIUM,
    };
    const form = (overrides, fallback = 'move') => locomotion(
        { ...ordinary, ...overrides },
        fallback,
    );

    assert.equal(form({ mlet: S_EYE }), 'float');
    assert.equal(form({ mflags1: M1_FLY }), 'fly');
    assert.equal(form({ mflags1: M1_SLITHY }), 'slither');
    assert.equal(form({ mflags1: M1_AMORPHOUS }), 'ooze');
    assert.equal(form({ mmove: 0 }), 'wiggle');
    assert.equal(form({ mflags1: M1_NOLIMBS }), 'crawl');
    assert.equal(form({}), 'move');
    assert.equal(form({ mflags1: M1_FLY }, 'Move'), 'Fly');
});

test('demon rank and conflict resistance preserve source composition', () => {
    const demonLord = {
        mflags2: M2_DEMON | M2_LORD,
    };
    const mortalPrince = {
        mflags2: M2_PRINCE,
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

test('monster elemental resistance includes source equipment defenses', () => {
    const state = {
        artilist: ARTILIST_TEMPLATE,
        objects: OBJECT_TEMPLATES,
    };
    const monster = {
        data: { mresists: 0 },
        mextrinsics: 0,
        mintrinsics: 0,
        minvent: null,
        mw: null,
    };

    assert.equal(monster_resists_element(monster, POISON_RES, state), false);

    // mon_resistancebits combines the species, acquired, and worn masks.
    monster.mintrinsics = 1 << (POISON_RES - 1);
    assert.equal(monster_resists_element(monster, POISON_RES, state), true);
    monster.mintrinsics = 0;

    monster.minvent = {
        otyp: RIN_POISON_RESISTANCE,
        owornmask: W_RINGL,
        nobj: null,
    };
    assert.equal(monster_resists_element(monster, POISON_RES, state), true);

    // A worn alchemy smock grants both poison and acid resistance even
    // though its object definition can encode only one property.
    monster.minvent = {
        otyp: ALCHEMY_SMOCK,
        owornmask: W_ARMC,
        nobj: null,
    };
    assert.equal(monster_resists_element(monster, ACID_RES, state), true);

    // Grimtooth's defn field grants poison resistance while wielded.
    monster.minvent = null;
    monster.mw = { oartifact: ART_GRIMTOOTH };
    assert.equal(monster_resists_element(monster, POISON_RES, state), true);

    // The Mitre's cary field grants fire resistance from any inventory slot.
    monster.mw = null;
    monster.minvent = {
        oartifact: ART_MITRE_OF_HOLINESS,
        owornmask: 0,
        nobj: null,
    };
    assert.equal(monster_resists_element(monster, FIRE_RES, state), true);
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

    assert.equal(attacktype(species(M.PM_SOLDIER), AT_WEAP), true);
    assert.equal(dmgtype(species(M.PM_RUST_MONSTER), AD_RUST), true);
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
        mattk: [{ aatyp: AT_BREA, adtyp: AD_DRST }],
    };

    assert.equal(
        attacktype_fordmg(poisonBreath, AT_BREA, AD_DRST),
        true,
    );
    assert.equal(
        attacktype_fordmg(poisonBreath, AT_BREA, AD_ANY),
        true,
    );
    assert.equal(
        attacktype_fordmg(poisonBreath, AT_BREA, AD_RBRE),
        false,
    );

    assert.equal(is_golem(species(M.PM_IRON_GOLEM)), true);
    assert.equal(nonliving(species(M.PM_IRON_GOLEM)), true);
    assert.equal(nonliving(species(M.PM_MANES)), true);
    assert.equal(nonliving(species(M.PM_HUMAN)), false);
    assert.equal(webmaker(species(M.PM_CAVE_SPIDER)), true);
    assert.equal(webmaker(species(M.PM_GIANT_SPIDER)), true);
    assert.equal(webmaker(species(M.PM_HUMAN)), false);

    // C ref: mondata.h:122 can_breathe(). True for species carrying AT_BREA.
    // Red dragon has a breath attack; gnome does not.
    assert.equal(can_breathe(species(M.PM_RED_DRAGON)), true,
        'red dragon has AT_BREA: its primary attack is breath');
    assert.equal(can_breathe(species(M.PM_GNOME)), false,
        'gnome has no breath attack');
    assert.equal(can_breathe(species(M.PM_HUMAN)), false,
        'human has no breath attack');

    // C ref: mondata.h:210-211 is_mind_flayer(). Two species by identity.
    assert.equal(is_mind_flayer(species(M.PM_MIND_FLAYER)), true,
        'PM_MIND_FLAYER matches the first alternative');
    assert.equal(is_mind_flayer(species(M.PM_MASTER_MIND_FLAYER)), true,
        'PM_MASTER_MIND_FLAYER matches the second alternative');
    assert.equal(is_mind_flayer(species(M.PM_GNOME)), false,
        'gnome is not a mind flayer');
    assert.equal(is_mind_flayer(species(M.PM_HUMAN)), false,
        'human is not a mind flayer');

    const monster = { mtrapseen: 1 << (ARROW_TRAP - 1) };
    assert.equal(mon_knows_traps(monster, ARROW_TRAP), true);
    assert.equal(mon_knows_traps(monster, ARROW_TRAP + 1), false);
    assert.equal(mon_knows_traps(monster, ALL_TRAPS), true);
    assert.equal(mon_knows_traps(monster, NO_TRAP), false);
    monster.mtrapseen = 0;
    assert.equal(mon_knows_traps(monster, ALL_TRAPS), false);
    assert.equal(mon_knows_traps(monster, NO_TRAP), true);
});

test('get_atkdam_type rolls only a random breath, in the source array order',
    () => {
        // C ref: mondata.c get_atkdam_type() (1659-1669). The eight members of
        // rnd_breath_typ[] and their order are transcribed from that array,
        // and hack.h:1493 ROLL_FROM() indexes it with rn2(SIZE(array)), so the
        // bound is eight and index i selects member i.
        const rnd_breath_typ = [
            AD_MAGM, AD_FIRE, AD_COLD, AD_SLEE,
            AD_DISN, AD_ELEC, AD_DRST, AD_ACID,
        ];

        for (const [index, expected] of rnd_breath_typ.entries()) {
            const bounds = [];
            const random = {
                rn2: (bound) => {
                    bounds.push(bound);
                    return index;
                },
            };
            assert.equal(get_atkdam_type(AD_RBRE, random), expected, `${index}`);
            assert.deepEqual(bounds, [rnd_breath_typ.length]);
        }

        // Every other damage type is answered unchanged and spends nothing.
        // AD_PHYS is the zero member, which a truth test would confuse with
        // "no damage type"; AD_ACID is a member of the breath array itself,
        // reached here without a roll.
        const refuse = {
            rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
        };
        for (const adtyp of [AD_PHYS, AD_ACID, AD_DRST, AD_RUST]) {
            assert.equal(get_atkdam_type(adtyp, refuse), adtyp, `${adtyp}`);
        }
    });
