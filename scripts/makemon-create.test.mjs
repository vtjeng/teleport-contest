import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BURN_OBJECT,
    COLNO,
    COULD_SEE,
    DUST,
    G_GENOD,
    G_GONE,
    HOLE,
    I_SPECIAL,
    IN_SIGHT,
    MAX_NUM_WORMS,
    MM_ANGRY,
    MM_ASLEEP,
    MM_FEMALE,
    MM_MALE,
    MM_NOCOUNTBIRTH,
    MM_NOEXCLAM,
    MM_NOGRP,
    MM_NOMSG,
    MON_DETACH,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    NO_MINVENT,
    OBJ_MINVENT,
    OROOM,
    P_POLEARMS,
    PIT,
    PROT_FROM_SHAPE_CHANGERS,
    ROOM,
    ROOMOFFSET,
    ROWNO,
    SHOPBASE,
    STONE,
    TRAPDOOR,
    WEB,
    W_AMUL,
    W_ARM,
    W_ARMC,
    W_ARMF,
    W_ARMG,
    W_ARMH,
    W_ARMS,
    W_ARMU,
    W_SADDLE,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { game } from '../js/gstate.js';
import { add_to_minv } from '../js/invent.js';
import { light_globals_init } from '../js/light.js';
import {
    dmonsfree,
    discard_minvent,
    makemon,
    makemon_runtime,
    m_dowear,
    mklevSleeperSpecies,
    mongone,
    ogreWeaponDivisor,
    racial_exception,
    startsPermanentlyInvisible,
    UnsupportedMonsterCreationError,
} from '../js/makemon_create.js';
import { is_giant, is_mercenary, is_ndemon } from '../js/mondata.js';
import { newMonster, place_monster } from '../js/monst.js';
import { init_objects } from '../js/o_init.js';
import { mksobj, weight } from '../js/obj.js';
import {
    G_FREQ,
    G_HELL,
    G_NOGEN,
    G_UNIQ,
    M2_DEMON,
    M2_GIANT,
    M2_LORD,
    M2_ORC,
    M2_PRINCE,
    NON_PM,
    PM_ARCH_LICH,
    PM_AMOROUS_DEMON,
    PM_BARROW_WIGHT,
    PM_ELF,
    PM_BLACK_LIGHT,
    PM_BLACK_UNICORN,
    PM_BUGBEAR,
    PM_CAVE_SPIDER,
    PM_CHAMELEON,
    PM_DOPPELGANGER,
    PM_DEMILICH,
    PM_FIRE_ELEMENTAL,
    PM_FIRE_GIANT,
    PM_FOG_CLOUD,
    PM_FOX,
    PM_FOREST_CENTAUR,
    PM_GARTER_SNAKE,
    PM_GHOST,
    PM_GIANT_MUMMY,
    PM_GIANT_EEL,
    PM_GIANT_ZOMBIE,
    PM_GIANT,
    PM_GOBLIN,
    PM_GRID_BUG,
    PM_HILL_GIANT,
    PM_HOMUNCULUS,
    PM_HORSE,
    PM_HOBBIT,
    PM_HUMAN,
    PM_HUMAN_MUMMY,
    PM_DWARF,
    PM_GNOME,
    PM_GNOME_RULER,
    PM_GNOMISH_WIZARD,
    PM_JACKAL,
    PM_KOBOLD,
    PM_KOBOLD_MUMMY,
    PM_KOBOLD_ZOMBIE,
    PM_LICH,
    PM_LICHEN,
    PM_LEPRECHAUN,
    PM_LONG_WORM,
    PM_MARILITH,
    PM_MASTER_LICH,
    PM_MINOTAUR,
    PM_NAZGUL,
    PM_NEWT,
    PM_ORC,
    PM_ORC_CAPTAIN,
    PM_OGRE,
    PM_OGRE_LEADER,
    PM_OGRE_TYRANT,
    PM_PLAINS_CENTAUR,
    PM_PONY,
    PM_ROCK_MOLE,
    PM_ROCK_TROLL,
    PM_SEWER_RAT,
    PM_SKELETON,
    PM_SMALL_MIMIC,
    PM_SOLDIER,
    PM_STALKER,
    PM_STONE_GIANT,
    PM_FROST_GIANT,
    PM_ETTIN,
    PM_TROLL,
    PM_UMBER_HULK,
    PM_VAMPIRE,
    PM_VAMPIRE_LEADER,
    PM_WHITE_UNICORN,
    PM_WINGED_GARGOYLE,
    PM_WOODLAND_ELF,
    PM_YELLOW_LIGHT,
    PM_WOOD_NYMPH,
    PM_WUMPUS,
    PM_WATCHMAN,
    PM_ZRUTY,
    S_ELEMENTAL,
    S_LIGHT,
    SPECIAL_PM,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import {
    AKLYS,
    AMULET_OF_LIFE_SAVING,
    ARMOR_CLASS,
    ARROW,
    BATTLE_AXE,
    BEC_DE_CORBIN,
    BOW,
    BOULDER,
    DART,
    CLUB,
    CROSSBOW,
    CROSSBOW_BOLT,
    C_RATION,
    DAGGER,
    DENTED_POT,
    DILITHIUM_CRYSTAL,
    DWARVISH_CLOAK,
    DWARVISH_MITHRIL_COAT,
    ELVEN_BOOTS,
    ELVEN_CLOAK,
    ELVEN_DAGGER,
    ELVEN_LEATHER_HELM,
    ELVEN_MITHRIL_COAT,
    ELVEN_SHIELD,
    ELVEN_SPEAR,
    FLINT,
    GLAIVE,
    GOLD_PIECE,
    ICE_BOX,
    IRON_SHOES,
    HELMET,
    HIGH_BOOTS,
    K_RATION,
    KNIFE,
    LARGE_SHIELD,
    LEATHER_ARMOR,
    LEATHER_CLOAK,
    LEATHER_GLOVES,
    LONG_SWORD,
    LOW_BOOTS,
    LUMP_OF_ROYAL_JELLY,
    MIRROR,
    MUMMY_WRAPPING,
    ORCISH_ARROW,
    ORCISH_BOW,
    ORCISH_DAGGER,
    ORCISH_HELM,
    PARTISAN,
    POT_BOOZE,
    POT_FRUIT_JUICE,
    POT_OBJECT_DETECTION,
    POT_WATER,
    RANSEUR,
    RING_MAIL,
    RING_CLASS,
    ROCK,
    SADDLE,
    SCR_CREATE_MONSTER,
    SCR_TELEPORTATION,
    SLIME_MOLD,
    SLING,
    SHORT_SWORD,
    SMALL_SHIELD,
    SPEAR,
    SPETUM,
    STRANGE_OBJECT,
    TALLOW_CANDLE,
    T_SHIRT,
    STUDDED_LEATHER_ARMOR,
    TWO_HANDED_SWORD,
    WAN_DIGGING,
    WAN_LIGHTNING,
    WAN_MAGIC_MISSILE,
    WORTHLESS_VIOLET_GLASS,
    WEAPON_CLASS,
    objects_globals_init,
} from '../js/objects.js';
import { timeout_globals_init } from '../js/timeout.js';
import { rawMonsterGenerationState } from './monster-test-state.mjs';
import { scriptedRandom, step } from './monster-scripted-random.mjs';

const MON_X = 10;
const MON_Y = 5;
// makemon.c:rndmonst() visits these cumulative D:1 reservoir weights in
// mons[] order. Returning bound - 1 retains the first candidate, jackal.
const DEPTH_ONE_RESERVOIR_BOUNDS = [3, 4, 5, 7, 8, 11, 15, 16, 21];
const FIXED_OBJECT_ID_RANDOM = {
    rn2: () => 0,
    rnd: () => 1,
    rn1: (_bound, base) => base,
    rne: () => 1,
};

function initialLevelState() {
    const state = {
        ...rawMonsterGenerationState(),
        astral_level: { dnum: 9, dlevel: 9 },
        context: { ident: 2 },
        in_mklev: true,
        level: new GameMap(),
        moves: 0,
        rogue_level: { dnum: 0, dlevel: 15 },
        sanctum_level: { dnum: 9, dlevel: 8 },
        urace: {
            mnum: PM_HUMAN,
            lovemask: 0,
            hatemask: M2_ORC,
        },
    };
    state.level.flags.rndmongen = true;
    state.level.at(MON_X, MON_Y).typ = ROOM;
    monst_globals_init(state);
    reset_mvitals(state);
    objects_globals_init(state);
    return state;
}

function leaveOnlyRandomSpecies(state, speciesIndexes) {
    for (const vital of state.mvitals) vital.mvflags |= G_GONE;
    for (const index of speciesIndexes)
        state.mvitals[index].mvflags &= ~G_GONE;
}

function monsterWithHelm(state, mndx, { spe = 0, cursed = false } = {}) {
    const monster = newMonster({
        data: state.mons[mndx],
        mnum: mndx,
        m_id: 9000 + mndx,
        mcanmove: true,
    });
    const helm = mksobj(ORCISH_HELM, false, false, {
        state,
        random: FIXED_OBJECT_ID_RANDOM,
    });
    helm.spe = spe;
    helm.cursed = cursed;
    add_to_minv(monster, helm, { state });
    return { helm, monster };
}

function monsterWithBoots(state, mndx, { spe = -2, cursed = true } = {}) {
    const monster = newMonster({
        data: state.mons[mndx],
        mnum: mndx,
        m_id: 9000 + mndx,
        mcanmove: true,
    });
    const boots = mksobj(ELVEN_BOOTS, false, false, {
        state,
        random: FIXED_OBJECT_ID_RANDOM,
    });
    boots.spe = spe;
    boots.cursed = cursed;
    add_to_minv(monster, boots, { state });
    return { boots, monster };
}

function basicCreationSteps({ gender = true } = {}) {
    const steps = [
        // Shared context.ident advances by a source rnd(2).
        step('rnd', [2], 1),
        // Every reachable species is level zero and rolls rnd(4) hit points.
        step('rnd', [4], 1),
    ];
    if (gender) {
        // Non-neuter species choose their retained corpse gender with rn2(2).
        steps.push(step('rn2', [2], 1));
    }
    return steps;
}

function ordinaryInventoryTail() {
    return [
        // Level zero cannot pass these gates, but both draws still occur.
        step('rn2', [50], 1),
        step('rn2', [100], 1),
        // The saddle predicate evaluates this before rejecting non-domestic
        // initial-level species.
        step('rn2', [100], 1),
    ];
}

function radiusThreeShuffleSteps(thirdRingSize = 24) {
    // teleport.c:collect_coords() shuffles the 8-, 16-, and 24-cell rings
    // completely before enexto_core() examines the first candidate. Near the
    // map edge, the outer ring is clipped to its actual coordinate count.
    return [8, 16, thirdRingSize].flatMap((ringSize) =>
        Array.from(
            { length: ringSize - 1 },
            (_, index) => step('rn2', [ringSize - index], 0),
        ));
}

function garterSnakeCreationSteps({ peaceful }) {
    const steps = [
        step('rnd', [2], 1), // Allocate the next monster id.
        step('d', [1, 8], 1), // Level-one hit points; makemon raises 1 to 2.
        step('rn2', [2], 1), // Garter snakes retain a random corpse gender.
        // A neutral species with alignment record zero starts with rn2(16).
        step('rn2', [16], peaceful ? 1 : 0),
    ];
    if (peaceful)
        steps.push(step('rn2', [2], 1)); // Complete the peaceful result.
    return steps;
}

function recordingRandom({ rn1Result, rn2Result, rndResult } = {}) {
    const calls = [];
    const record = (kind, args, result) => {
        calls.push({ kind, args, result });
        return result;
    };
    return {
        calls,
        random: {
            d: (number, sides) => record('d', [number, sides], number),
            rn1: (range, base) => record(
                'rn1',
                [range, base],
                rn1Result ? rn1Result(range, base) : base,
            ),
            rn2: (bound) => record(
                'rn2',
                [bound],
                rn2Result ? rn2Result(bound) : Math.max(0, bound - 1),
            ),
            rnd: (bound) => record(
                'rnd',
                [bound],
                rndResult ? rndResult(bound) : 1,
            ),
            rne: (bound) => record('rne', [bound], 1),
            rnz: (value) => record('rnz', [value], value),
        },
    };
}

function monsterInventory(monster) {
    const result = [];
    for (let obj = monster.minvent; obj; obj = obj.nobj) result.push(obj);
    return result;
}

function plannedSoldierRandom(plan = {}) {
    const calls = [];
    const armorRounds = plan.armorRounds ?? [
        { direct: 1 },
        { direct: 1 },
        { direct: 1 },
        { direct: 1 },
    ];
    let phase = 'primary';
    let polearmIndex = 0;
    let objectCount = 0;
    let objectCompletionBound = 1000;
    let objectEnchantment = 0;
    let objectEnchantmentUsed = false;
    let armorTenCalls = 0;
    let armorBlessedCall = false;
    let armorObjectIndex = 0;
    let afterObjects = null;
    let armorRound = 0;

    const record = (kind, args, result) => {
        calls.push({ kind, args, result });
        return result;
    };
    const startObjects = (count, next, completionBound = 1000) => {
        objectCount = count;
        objectCompletionBound = completionBound;
        objectEnchantment = 0;
        objectEnchantmentUsed = false;
        armorTenCalls = 0;
        armorBlessedCall = false;
        afterObjects = next;
        phase = 'object';
    };
    const startArmorObject = (next) => {
        startObjects(1, next);
        objectEnchantment = plan.armorEnchantments?.[armorObjectIndex++] ?? 0;
    };
    const finishObject = () => {
        if (--objectCount > 0) return;
        const next = afterObjects;
        afterObjects = null;
        if (typeof next === 'function') next();
        else phase = next;
    };
    const startArmorRound = () => {
        if (armorRound >= 4
            || plan.suppressedFromRound === armorRound + 2) {
            phase = 'ration-k';
        } else {
            phase = 'armor-direct';
        }
    };
    const random = {
        d: (number, sides) => record('d', [number, sides], number),
        rnd: (bound) => record('rnd', [bound], 1),
        rne: (bound) => {
            const result = phase === 'object'
                    && objectEnchantment > 0
                    && !objectEnchantmentUsed
                ? objectEnchantment : 1;
            if (result === objectEnchantment && objectEnchantment > 0)
                objectEnchantmentUsed = true;
            return record('rne', [bound], result);
        },
        rnz: (value) => record('rnz', [value], value),
        rn1: (range, base) => {
            let result = base;
            if (phase === 'polearm') {
                const choices = plan.polearmChoices ?? [PARTISAN];
                assert.ok(
                    polearmIndex < choices.length,
                    'polearm rejection plan ran out of choices',
                );
                result = choices[polearmIndex++];
                if (polearmIndex === choices.length) phase = 'pole-secondary';
            }
            return record('rn1', [range, base], result);
        },
        rn2: (bound) => {
            let result = Math.max(0, bound - 1);
            switch (phase) {
            case 'primary':
                if (bound === 3) {
                    result = plan.primaryGate ?? 1;
                    phase = result ? 'primary-choice' : 'polearm';
                }
                break;
            case 'primary-choice':
                assert.equal(bound, 2);
                result = plan.primaryChoice ?? 1;
                startObjects(1, 'fallback');
                break;
            case 'pole-secondary':
                assert.equal(bound, 2);
                result = plan.poleSecondary ?? 1;
                startObjects(2, 'offensive');
                break;
            case 'fallback':
                assert.equal(bound, 4);
                result = plan.fallbackKnife ?? 1;
                if (result) phase = 'offensive';
                else startObjects(1, 'offensive');
                break;
            case 'offensive':
                assert.equal(bound, 75);
                result = 74;
                phase = 'body-gate';
                break;
            case 'body-gate':
                assert.equal(bound, 5);
                result = plan.bodyGate ?? 1;
                if (result) phase = 'body-choice';
                else startArmorObject(startArmorRound);
                break;
            case 'body-choice':
                assert.equal(bound, 3);
                result = plan.bodyChoice ?? 1;
                startArmorObject(startArmorRound);
                break;
            case 'armor-direct': {
                assert.equal(bound, 3);
                const round = armorRounds[armorRound] ?? {};
                result = round.direct ?? 0;
                if (result) {
                    startArmorObject(() => {
                        ++armorRound;
                        startArmorRound();
                    });
                } else {
                    phase = 'armor-fallback';
                }
                break;
            }
            case 'armor-fallback': {
                assert.equal(bound, 2);
                const round = armorRounds[armorRound] ?? {};
                result = round.fallback ?? 0;
                if (result) {
                    startArmorObject(() => {
                        ++armorRound;
                        startArmorRound();
                    });
                } else {
                    ++armorRound;
                    startArmorRound();
                }
                break;
            }
            case 'ration-k':
                assert.equal(bound, 3);
                result = plan.kRation ?? 1;
                if (result) phase = 'ration-c';
                else startObjects(1, 'ration-c', 6);
                break;
            case 'ration-c':
                assert.equal(bound, 2);
                result = plan.cRation ?? 1;
                if (result) phase = 'early-return';
                else startObjects(1, 'early-return', 6);
                break;
            case 'early-return':
                assert.equal(bound, 13);
                result = plan.earlyReturn ?? 1;
                phase = result ? 'saddle' : 'defensive';
                break;
            case 'defensive':
                assert.equal(bound, 50);
                result = 49;
                phase = 'misc';
                break;
            case 'misc':
                assert.equal(bound, 100);
                result = 99;
                phase = 'saddle';
                break;
            case 'saddle':
                assert.equal(bound, 100);
                result = 99;
                phase = 'done';
                break;
            case 'object':
                if (objectEnchantment > 0 && !objectEnchantmentUsed) {
                    if (bound === 10 && armorTenCalls < 2) {
                        ++armorTenCalls;
                        result = 0;
                    } else if (bound === 2 && armorTenCalls === 2
                        && !armorBlessedCall) {
                        armorBlessedCall = true;
                        result = 1;
                    }
                }
                if (bound === objectCompletionBound) finishObject();
                break;
            case 'done':
                assert.fail(`unexpected rn2(${bound}) after soldier creation`);
                break;
            default:
                assert.fail(`unknown soldier random phase ${phase}`);
            }
            return record('rn2', [bound], result);
        },
    };
    return {
        calls,
        random,
        assertFinished() {
            assert.equal(phase, 'done');
        },
    };
}

function createPlannedSoldier(plan = {}, flags = 0) {
    const state = initialLevelState();
    plan.prepareState?.(state);
    const random = plannedSoldierRandom(plan);
    const monster = makemon(
        state.mons[PM_SOLDIER],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH | flags,
        { state, random: random.random },
    );
    random.assertFinished();
    return { monster, random, state };
}

function createPlannedStoneGiant(plan = {}, flags = 0) {
    let phase = 'initial-gender';
    let remainingGems = 0;
    let gemRoll = 0;
    let gemQuantity = 0;
    const gemRolls = plan.gemRolls ?? [];
    const gemQuantities = plan.gemQuantities ?? [];
    const heavyGate = plan.heavyGate ?? 1;
    const highLevelGems = (plan.heroLevel ?? 1) > 1;
    const finishGem = () => {
        --remainingGems;
        phase = remainingGems > 0 ? 'gem-kind' : 'defensive-item-gate';
    };
    const random = recordingRandom({
        rn1Result: (range, base) => {
            if (phase !== 'gem-quantity') return base;
            assert.deepEqual([range, base], [2, 3], phase);
            const result = gemQuantities[gemQuantity++] ?? base;
            finishGem();
            return result;
        },
        rn2Result: (bound) => {
            switch (phase) {
            case 'initial-gender':
                assert.equal(bound, 2, phase);
                phase = 'boulder-gate';
                return 1;
            case 'boulder-gate':
                assert.equal(bound, 2, phase);
                if (plan.boulderGate ?? 0) {
                    phase = 'boulder-item-tail';
                    return 1;
                }
                phase = 'heavy-weapon-gate';
                return 0;
            case 'boulder-item-tail':
                if (bound !== 5) return Math.max(0, bound - 1);
                phase = heavyGate === 0
                    ? 'heavy-weapon-choice' : 'offensive-item-gate';
                return heavyGate;
            case 'heavy-weapon-gate':
                assert.equal(bound, 5, phase);
                phase = heavyGate === 0
                    ? 'heavy-weapon-choice' : 'offensive-item-gate';
                return heavyGate;
            case 'heavy-weapon-choice':
                assert.equal(bound, 2, phase);
                phase = 'heavy-weapon-item-tail';
                return plan.weaponChoice ?? 0;
            case 'heavy-weapon-item-tail':
                if (bound !== 75) return Math.max(0, bound - 1);
                phase = 'offensive-item-tail';
                return plan.offensiveGate ?? 74;
            case 'offensive-item-gate':
                assert.equal(bound, 75, phase);
                phase = 'offensive-item-tail';
                return plan.offensiveGate ?? 74;
            case 'offensive-item-tail': {
                const gemCountBound = highLevelGems ? 4 : 2;
                if (bound === gemCountBound) {
                    remainingGems = plan.gemCount ?? 0;
                    phase = remainingGems > 0
                        ? 'gem-kind' : 'defensive-item-gate';
                    return remainingGems;
                }
                if (bound === 50) {
                    phase = 'defensive-item-tail';
                    return plan.defensiveGate ?? 49;
                }
                return Math.max(0, bound - 1);
            }
            case 'defensive-item-gate':
                assert.equal(bound, 50, phase);
                phase = 'defensive-item-tail';
                return plan.defensiveGate ?? 49;
            case 'defensive-item-tail':
                if (bound === 100) {
                    const result = plan.miscGate ?? 99;
                    phase = result === 0 ? 'misc-item-choice' : 'saddle-gate';
                    return result;
                }
                return Math.max(0, bound - 1);
            case 'misc-item-choice':
                assert.equal(bound, 40, phase);
                phase = 'misc-item-tail';
                return plan.lifeSavingGate ?? 39;
            case 'misc-item-tail':
                if (bound !== 100) return Math.max(0, bound - 1);
                phase = 'done';
                return 99;
            case 'saddle-gate':
                assert.equal(bound, 100, phase);
                phase = 'done';
                return 99;
            case 'done':
                assert.fail(`unexpected rn2(${bound}) after stone giant creation`);
                break;
            default:
                assert.fail(`unexpected rn2(${bound}) during ${phase}`);
            }
        },
        rndResult: (bound) => {
            if (phase === 'gem-kind') {
                assert.equal(bound, 862, phase);
                const choice = gemRolls[gemRoll++] ?? 1;
                phase = 'gem-stack-roll';
                return choice === 'last' ? bound : choice;
            }
            if (phase === 'gem-stack-roll') {
                assert.equal(bound, 2, phase);
                phase = 'gem-quantity';
            }
            return 1;
        },
    });
    random.assertFinished = () => {
        assert.equal(
            phase,
            flags & NO_MINVENT ? 'boulder-gate' : 'done',
            'stone giant planner must reach its source lifecycle boundary',
        );
        assert.equal(remainingGems, 0);
    };
    const state = initialLevelState();
    state.u.ulevel = plan.heroLevel ?? state.u.ulevel;
    plan.prepareState?.(state);
    const monster = makemon(
        state.mons[PM_STONE_GIANT],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH | flags,
        { state, random: random.random },
    );
    random.assertFinished();
    return { monster, random, state };
}

test('non-armed initial monsters preserve source state and RNG order', () => {
    const species = [
        PM_JACKAL,
        PM_FOX,
        PM_SEWER_RAT,
        PM_GRID_BUG,
        PM_LICHEN,
        PM_KOBOLD_ZOMBIE,
        PM_NEWT,
    ];

    for (const mndx of species) {
        const state = initialLevelState();
        const random = scriptedRandom([
            ...basicCreationSteps({ gender: mndx !== PM_LICHEN }),
            ...ordinaryInventoryTail(),
        ]);
        const monster = makemon(
            state.mons[mndx],
            MON_X,
            MON_Y,
            0,
            { state, random: random.random },
        );
        random.assertExhausted();

        assert.equal(monster.mnum, mndx);
        assert.equal(monster.data, state.mons[mndx]);
        assert.equal(monster.m_id, 2);
        assert.deepEqual([monster.m_lev, monster.mhp, monster.mhpmax], [0, 2, 2]);
        assert.equal(monster.mcansee, true);
        assert.equal(monster.mcanmove, true);
        assert.equal(monster.mgenmklev, true);
        assert.equal(monster.mpeaceful, false);
        assert.equal(monster.minvent, null);
        assert.equal(state.mvitals[mndx].born, 1);
        assert.equal(state.level.monlist, monster);
        assert.equal(state.level.monsters[MON_X][MON_Y], monster);
        assert.equal(state.context.ident, 3);
        if (mndx === PM_LICHEN) assert.equal(monster.female, false);
        else assert.equal(monster.female, true);
    }
});

test('fog-cloud creation keeps mindless random-item gates drawless', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        step('rnd', [2], 1), // advance the monster id from 2 to 3
        // Difficulty one lowers the level-three fog cloud to level two.
        step('d', [2, 8], 9),
        // Both rare gates pass, then muse.c rejects a mindless monster
        // without consuming a random-item selection draw.
        step('rn2', [50], 0),
        step('rn2', [100], 0),
        step('rn2', [100], 1), // non-domestic saddle gate
    ]);
    const monster = makemon(
        state.mons[PM_FOG_CLOUD],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.deepEqual([monster.m_lev, monster.mhp, monster.mhpmax], [2, 9, 9]);
    assert.equal(monster.female, false);
    assert.equal(monster.msleeping, false);
    assert.equal(monster.mpeaceful, false);
    assert.equal(monster.minvent, null);
    assert.equal(state.mvitals[PM_FOG_CLOUD].born, 1);
});

test('wood nymph creation preserves source sleep and empty-inventory draws', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        step('rnd', [2], 1), // advance the monster id from 2 to 3
        // Difficulty one lowers the level-three nymph to level two.
        step('d', [2, 8], 9),
        step('rn2', [5], 1), // source nymph branch puts her to sleep
        step('rn2', [2], 1), // no mirror
        step('rn2', [2], 1), // no object-detection potion
        step('rn2', [50], 2), // level two misses the defensive-item gate
        step('rn2', [100], 2), // level two misses the misc-item gate
        step('rn2', [100], 1), // non-domestic saddle gate
    ]);
    const monster = makemon(
        state.mons[PM_WOOD_NYMPH],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.equal(monster.female, true);
    assert.equal(monster.msleeping, true);
    assert.equal(monster.mpeaceful, false);
    assert.equal(monster.minvent, null);
    assert.equal(state.mvitals[PM_WOOD_NYMPH].born, 1);
});

test('mklev sleeper species match the complete source predicate', () => {
    const state = initialLevelState();

    assert.equal(is_ndemon(state.mons[PM_AMOROUS_DEMON]), true);
    assert.equal(is_ndemon({ mflags2: M2_DEMON | M2_LORD }), false);
    assert.equal(is_ndemon({ mflags2: M2_DEMON | M2_PRINCE }), false);
    assert.equal(is_ndemon({ mflags2: M2_LORD }), false);
    assert.deepEqual(
        [
            PM_AMOROUS_DEMON,
            PM_WUMPUS,
            PM_LONG_WORM,
            PM_GIANT_EEL,
            PM_STALKER,
        ].map((mndx) => mklevSleeperSpecies(state.mons[mndx])),
        [true, true, true, true, false],
    );
});

test('mklev Wumpus and ordinary demon sleep only on a nonzero roll', () => {
    for (const mndx of [PM_WUMPUS, PM_AMOROUS_DEMON]) {
        for (const [roll, sleeping] of [[4, true], [0, false]]) {
            const state = initialLevelState();
            const random = recordingRandom({
                rn2Result: (bound) => bound === 5
                    ? roll : Math.max(0, bound - 1),
            });
            const monster = makemon(
                state.mons[mndx],
                MON_X,
                MON_Y,
                MM_ANGRY | MM_NOCOUNTBIRTH | NO_MINVENT,
                { state, random: random.random },
            );
            const sleeperDraws = random.calls.filter(
                ({ kind, args }) => kind === 'rn2' && args[0] === 5,
            );

            assert.equal(monster.msleeping, sleeping);
            assert.deepEqual(sleeperDraws, [{
                kind: 'rn2',
                args: [5],
                result: roll,
            }]);
            assert.equal(random.calls.at(-1), sleeperDraws[0]);
        }
    }
});

test('the Amulet suppresses the mklev sleeper draw and state change', () => {
    for (const mndx of [PM_WUMPUS, PM_AMOROUS_DEMON]) {
        const state = initialLevelState();
        state.u.uhave.amulet = 1;
        const random = recordingRandom({
            rn2Result: (bound) => bound === 5
                ? 4 : Math.max(0, bound - 1),
        });
        const monster = makemon(
            state.mons[mndx],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOCOUNTBIRTH | NO_MINVENT,
            { state, random: random.random },
        );

        assert.equal(monster.msleeping, false);
        assert.equal(random.calls.some(
            ({ kind, args }) => kind === 'rn2' && args[0] === 5,
        ), false);
    }
});

test('demon lord and prince masks suppress the mklev sleeper draw', () => {
    for (const rank of [M2_LORD, M2_PRINCE]) {
        const state = initialLevelState();
        const ordinary = state.mons[PM_AMOROUS_DEMON];
        state.mons[PM_AMOROUS_DEMON] = {
            ...ordinary,
            mflags2: ordinary.mflags2 | rank,
        };
        const random = recordingRandom({
            rn2Result: (bound) => bound === 5
                ? 4 : Math.max(0, bound - 1),
        });
        const monster = makemon(
            state.mons[PM_AMOROUS_DEMON],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOCOUNTBIRTH | NO_MINVENT,
            { state, random: random.random },
        );

        assert.equal(monster.msleeping, false);
        assert.equal(random.calls.some(
            ({ kind, args }) => kind === 'rn2' && args[0] === 5,
        ), false);
    }
});

test('mklev sleeper roll preserves explicit sleep and skips other contexts', async () => {
    {
        const state = initialLevelState();
        const random = recordingRandom({
            rn2Result: (bound) => bound === 5
                ? 0 : Math.max(0, bound - 1),
        });
        const monster = makemon(
            state.mons[PM_WUMPUS],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_ASLEEP | MM_NOCOUNTBIRTH | NO_MINVENT,
            { state, random: random.random },
        );
        assert.equal(monster.msleeping, true);
        assert.equal(random.calls.filter(
            ({ kind, args }) => kind === 'rn2' && args[0] === 5,
        ).length, 1);
    }

    for (const { mndx, inMklev, flags } of [
        { mndx: PM_STALKER, inMklev: true,
          flags: MM_ANGRY | MM_NOCOUNTBIRTH | NO_MINVENT },
        { mndx: PM_WUMPUS, inMklev: false, flags: MM_NOGRP },
    ]) {
        const state = initialLevelState();
        state.in_mklev = inMklev;
        const random = recordingRandom({
            rn2Result: (bound) => bound === 5
                ? 4 : Math.max(0, bound - 1),
        });
        const monster = inMklev ? makemon(
            state.mons[mndx],
            MON_X,
            MON_Y,
            flags,
            { state, random: random.random },
        ) : await makemon_runtime(
            state.mons[mndx],
            MON_X,
            MON_Y,
            flags,
            { state, random: random.random },
        );

        assert.equal(monster.msleeping, false);
        assert.equal(random.calls.some(
            ({ kind, args }) => kind === 'rn2' && args[0] === 5,
        ), false);
    }
});

test('wood nymph receives mirror then potion in source inventory order', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        step('rnd', [2], 1), // monster id
        step('d', [2, 8], 9), // level-two hit points
        step('rn2', [5], 0), // nymph sleep branch leaves her awake
        step('rn2', [2], 0), // create the mirror
        step('rnd', [2], 1), // mirror object id
        step('rn2', [2], 0), // create the object-detection potion
        step('rnd', [2], 1), // potion object id
        step('rn2', [4], 1), // potion stays uncursed and unblessed
        step('rn2', [50], 2), // no rare defensive item
        step('rn2', [100], 2), // no rare miscellaneous item
        step('rn2', [100], 1), // non-domestic saddle gate
    ]);
    const monster = makemon(
        state.mons[PM_WOOD_NYMPH],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    const potion = monster.minvent;
    const mirror = potion.nobj;
    assert.deepEqual(
        [potion.otyp, potion.o_id, mirror.otyp, mirror.o_id],
        [POT_OBJECT_DETECTION, 4, MIRROR, 3],
    );
    assert.equal(mirror.nobj, null);
    assert.equal(state.context.ident, 5);
});

test('wood nymph rare defensive item keeps selector and wand-init order', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        step('rnd', [2], 1), // monster id
        step('d', [2, 8], 9), // level-two hit points
        step('rn2', [5], 0), // nymph sleep branch leaves her awake
        step('rn2', [2], 1), // no mirror
        step('rn2', [2], 1), // no object-detection potion
        step('rn2', [50], 0), // pass the rare defensive-item gate
        // Difficulty five expands rnd_defensive_item() to nine cases; case
        // seven is a wand of digging outside Sokoban.
        step('rn2', [9], 7),
        step('rnd', [2], 1), // wand object id
        step('rn1', [5, 4], 6), // directed-wand charge count
        step('rn2', [17], 1), // wand stays uncursed and unblessed
        step('rn2', [100], 2), // no rare miscellaneous item
        step('rn2', [100], 1), // non-domestic saddle gate
    ]);
    const monster = makemon(
        state.mons[PM_WOOD_NYMPH],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.equal(monster.minvent.otyp, WAN_DIGGING);
    assert.equal(monster.minvent.spe, 6);
    assert.equal(monster.minvent.owornmask, 0);
});

test('wood nymph wears a rare life-saving amulet during creation', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        step('rnd', [2], 1), // monster id
        step('d', [2, 8], 9), // level-two hit points
        step('rn2', [5], 0), // nymph sleep branch leaves her awake
        step('rn2', [2], 1), // no mirror
        step('rn2', [2], 1), // no object-detection potion
        step('rn2', [50], 2), // no rare defensive item
        step('rn2', [100], 0), // pass the rare miscellaneous-item gate
        step('rn2', [30], 1), // skip low-level polymorph item
        step('rn2', [40], 0), // select life-saving amulet
        step('rnd', [2], 1), // amulet object id
        // mksobj() checks the bad-amulet curse set, then blessorcurse().
        step('rn2', [10], 1),
        step('rn2', [10], 1),
        step('rn2', [100], 1), // non-domestic saddle gate
    ]);
    const monster = makemon(
        state.mons[PM_WOOD_NYMPH],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.equal(monster.minvent.otyp, AMULET_OF_LIFE_SAVING);
    assert.equal(monster.minvent.owornmask, W_AMUL);
    assert.equal(monster.misc_worn_check, W_AMUL);
});

test('m_dowear independently enforces each body and mind eligibility guard', () => {
    const state = initialLevelState();
    const cases = [
        ['very small homunculus', PM_HOMUNCULUS],
        ['no-hands white unicorn', PM_WHITE_UNICORN],
        ['animal zruty', PM_ZRUTY],
        ['mindless nonexception kobold zombie', PM_KOBOLD_ZOMBIE],
    ];

    for (const [name, mndx] of cases) {
        const { helm, monster } = monsterWithHelm(state, mndx);
        m_dowear(monster, true, { state });
        assert.equal(helm.owornmask, 0, name);
        assert.equal(monster.misc_worn_check & W_ARMH, 0, name);
    }
});

test('m_dowear creation exception applies to mummies and skeletons only', () => {
    const cases = [
        ['existing human mummy', PM_HUMAN_MUMMY, false, false],
        ['new human mummy', PM_HUMAN_MUMMY, true, true],
        ['existing skeleton', PM_SKELETON, false, false],
        ['new skeleton', PM_SKELETON, true, true],
    ];

    for (const [name, mndx, creation, expectedWorn] of cases) {
        const state = initialLevelState();
        const { helm, monster } = monsterWithHelm(state, mndx);
        m_dowear(monster, creation, { state });
        assert.equal(
            Boolean(helm.owornmask & W_ARMH),
            expectedWorn,
            name,
        );
        assert.equal(
            Boolean(monster.misc_worn_check & W_ARMH),
            expectedWorn,
            name,
        );
    }
});

test('m_dowear outside creation applies a new pair of boots', () => {
    // C ref: worn.c m_dowear_type():951-960. A new W_ARMF item assigns its
    // oc_delay to mfrozen, clears mcanmove, and sets the monster and object
    // worn masks. The cursed -2 mud boots match the queued runtime witness.
    const state = initialLevelState();
    const { boots, monster } = monsterWithBoots(state, PM_GNOME);

    m_dowear(monster, false, {
        state,
        wearArmor: () => assert.fail('new boots bypass the runtime owner'),
    });

    assert.equal(boots.spe, -2);
    assert.equal(boots.cursed, true);
    assert.equal(boots.owornmask, W_ARMF);
    assert.equal(monster.misc_worn_check, W_ARMF);
    assert.equal(monster.mfrozen, 2);
    assert.equal(monster.mcanmove, false);
});

test('m_dowear outside creation hands non-boots changes to its caller', () => {
    // C ref: worn.c m_dowear_type():912-960. Outside creation the same choice
    // prints a line, charges oc_delay turns of mfrozen and stops the monster
    // moving; runtime replacement and other armor categories still reach the
    // caller's boundary instead of quietly putting the helm on.
    const state = initialLevelState();
    const { helm, monster } = monsterWithHelm(state, PM_GNOME);
    const offered = [];

    m_dowear(monster, false, {
        state,
        wearArmor: (subject, best, old) => { offered.push([subject, best, old]); },
    });

    assert.equal(offered.length, 1);
    assert.deepEqual(offered[0], [monster, helm, null]);
    // The creation-time effect below the hand-off must not have run.
    assert.equal(helm.owornmask, 0);
    assert.equal(monster.misc_worn_check & W_ARMH, 0);
});

test('m_dowear outside creation stays quiet when nothing would change', () => {
    // A monster already wearing its best helmet reaches no slot change, so C
    // spends no turn and prints nothing. The wearArmor hand-off must not fire.
    const state = initialLevelState();
    const { helm, monster } = monsterWithHelm(state, PM_GNOME);
    helm.owornmask = W_ARMH;
    monster.misc_worn_check = W_ARMH;

    m_dowear(monster, false, {
        state,
        wearArmor: () => assert.fail('an unchanged slot reached wearArmor'),
    });

    assert.equal(helm.owornmask, W_ARMH);
});

test('m_dowear requires a wearArmor owner outside creation', () => {
    const state = initialLevelState();
    const { monster } = monsterWithHelm(state, PM_GNOME);
    assert.throws(
        () => m_dowear(monster, false, { state }),
        /m_dowear outside creation requires a wearArmor operation/,
    );
});

test('m_dowear leaves a monster part-way through dressing alone', () => {
    // C ref: worn.c m_dowear_type():814, `if (mon->mfrozen) return;`.
    const state = initialLevelState();
    const { helm, monster } = monsterWithHelm(state, PM_GNOME);
    monster.mfrozen = 2; // Any positive remainder of a previous wear delay.

    m_dowear(monster, true, { state });

    assert.equal(helm.owornmask, 0);
    assert.equal(monster.misc_worn_check & W_ARMH, 0);
});

test('m_dowear retains tied and cursed worn helmets', () => {
    const cases = [
        {
            name: 'equal protection retains the old helmet',
            oldSpe: 0,
            oldCursed: false,
            newSpe: 0,
        },
        {
            name: 'a cursed old helmet blocks a stronger replacement',
            oldSpe: 0,
            oldCursed: true,
            newSpe: 3,
        },
    ];

    for (const scenario of cases) {
        const state = initialLevelState();
        const { helm: oldHelm, monster } = monsterWithHelm(
            state,
            PM_GOBLIN,
            { spe: scenario.oldSpe, cursed: scenario.oldCursed },
        );
        oldHelm.owornmask = W_ARMH;
        monster.misc_worn_check = W_ARMH;
        const newHelm = mksobj(ORCISH_HELM, false, false, {
            state,
            random: FIXED_OBJECT_ID_RANDOM,
        });
        newHelm.spe = scenario.newSpe;
        add_to_minv(monster, newHelm, { state });

        m_dowear(monster, true, { state });

        assert.equal(oldHelm.owornmask, W_ARMH, scenario.name);
        assert.equal(newHelm.owornmask, 0, scenario.name);
        assert.equal(monster.misc_worn_check, W_ARMH, scenario.name);
    }
});

test('m_dowear fills every eligible creation-time armor slot', () => {
    const state = initialLevelState();
    const monster = newMonster({
        data: state.mons[PM_DWARF],
        mnum: PM_DWARF,
        m_id: 9001,
        mcanmove: true,
    });
    const equipment = [
        [ELVEN_MITHRIL_COAT, W_ARM],
        [ELVEN_CLOAK, W_ARMC],
        [ELVEN_LEATHER_HELM, W_ARMH],
        [ELVEN_SHIELD, W_ARMS],
        [LEATHER_GLOVES, W_ARMG],
        [ELVEN_BOOTS, W_ARMF],
        [T_SHIRT, W_ARMU],
    ].map(([otyp, mask]) => {
        const obj = mksobj(otyp, false, false, {
            state,
            random: FIXED_OBJECT_ID_RANDOM,
        });
        add_to_minv(monster, obj, { state });
        return { mask, obj };
    });

    m_dowear(monster, true, { state });

    const allMasks = equipment.reduce((result, item) => result | item.mask, 0);
    assert.equal(monster.misc_worn_check, allMasks);
    for (const { mask, obj } of equipment) assert.equal(obj.owornmask, mask);
});

test('large humanoids can wear only mummy wrapping from generated body armor', () => {
    const state = initialLevelState();
    const monster = newMonster({
        data: state.mons[PM_BUGBEAR],
        mnum: PM_BUGBEAR,
        m_id: 9002,
        minvis: true,
        perminvis: true,
    });
    const suit = mksobj(ELVEN_MITHRIL_COAT, false, false, {
        state,
        random: FIXED_OBJECT_ID_RANDOM,
    });
    const wrapping = mksobj(MUMMY_WRAPPING, false, false, {
        state,
        random: FIXED_OBJECT_ID_RANDOM,
    });
    add_to_minv(monster, suit, { state });
    add_to_minv(monster, wrapping, { state });

    m_dowear(monster, true, { state });

    assert.equal(suit.owornmask, 0);
    assert.equal(wrapping.owornmask, W_ARMC);
    assert.equal(monster.misc_worn_check, W_ARMC);
    assert.equal(monster.invis_blkd, true);
    assert.equal(monster.minvis, false);
});

test('a winged gargoyle is refused every slot cantweararm() closes', () => {
    // C ref: worn.c m_dowear():776-795. mondata.c breakarm():640-650 names
    // PM_WINGED_GARGOYLE outright, so mondata.h cantweararm() (133) answers
    // TRUE and can_wear_armor is FALSE for a form that is otherwise an
    // ordinary MZ_HUMAN humanoid, which nothing else in either predicate
    // refuses. That closes the shirt gate at 778, leaves the cloak gate at 784
    // resting on obj.h WrappingAllowed() (444-446), which names the same
    // species, and sends the suit call at 795 with RACE_EXCEPTION.
    const state = initialLevelState();
    const monster = newMonster({
        data: state.mons[PM_WINGED_GARGOYLE],
        mnum: PM_WINGED_GARGOYLE,
        m_id: 9003,
        mcanmove: true,
    });
    // One object per gated slot, plus a helmet from an ungated slot as the
    // witness that this monster reached m_dowear_type() at all: every
    // assertion below would also hold for a monster that returned at
    // m_dowear():766-773. The suit is elven so that only worn.c
    // racial_exception():1360-1373 rejecting a non-hobbit can refuse it; a
    // suit call without RACE_EXCEPTION would put it on.
    const [shirt, cloak, suit, helm] = [
        T_SHIRT, ELVEN_CLOAK, ELVEN_MITHRIL_COAT, ORCISH_HELM,
    ].map((otyp) => {
        const obj = mksobj(otyp, false, false, {
            state,
            random: FIXED_OBJECT_ID_RANDOM,
        });
        add_to_minv(monster, obj, { state });
        return obj;
    });

    m_dowear(monster, true, { state });

    assert.equal(shirt.owornmask, 0);
    assert.equal(cloak.owornmask, 0);
    assert.equal(suit.owornmask, 0);
    assert.equal(helm.owornmask, W_ARMH);
    assert.equal(monster.misc_worn_check, W_ARMH);
});

test('a marilith is refused the cloak slot WrappingAllowed() closes', () => {
    // C ref: worn.c m_dowear():784. A marilith is MZ_LARGE, so bigmonst()
    // inside breakarm() already answers cantweararm() and can_wear_armor is
    // FALSE; the cloak gate therefore rests on obj.h WrappingAllowed()
    // (444-446) alone, and that macro names PM_MARILITH. A wrapping is the
    // only cloak m_dowear_type():851-852 would consider above MZ_HUMAN, so it
    // is the object that shows whether the gate opened.
    const state = initialLevelState();
    const monster = newMonster({
        data: state.mons[PM_MARILITH],
        mnum: PM_MARILITH,
        m_id: 9004,
        mcanmove: true,
    });
    const wrapping = mksobj(MUMMY_WRAPPING, false, false, {
        state,
        random: FIXED_OBJECT_ID_RANDOM,
    });
    // The same ungated-slot witness as the winged gargoyle above.
    const helm = mksobj(ORCISH_HELM, false, false, {
        state,
        random: FIXED_OBJECT_ID_RANDOM,
    });
    add_to_minv(monster, wrapping, { state });
    add_to_minv(monster, helm, { state });

    m_dowear(monster, true, { state });

    assert.equal(wrapping.owornmask, 0);
    assert.equal(helm.owornmask, W_ARMH);
    assert.equal(monster.misc_worn_check, W_ARMH);
    // The wrapping stayed off, so worn.c update_mon_extrinsics() never blocked
    // this monster's (absent) invisibility.
    assert.equal(monster.invis_blkd, false);
});

test('discard_minvent reverses wrapping state only for a live monster', () => {
    for (const { name, mhp, expectedBlocked, expectedVisible } of [
        {
            name: 'live monster',
            mhp: 10,
            expectedBlocked: false,
            expectedVisible: true,
        },
        {
            name: 'dead monster',
            mhp: 0,
            expectedBlocked: true,
            expectedVisible: false,
        },
    ]) {
        const state = initialLevelState();
        const monster = newMonster({
            data: state.mons[PM_HUMAN_MUMMY],
            mnum: PM_HUMAN_MUMMY,
            mhp,
            minvis: true,
            perminvis: true,
        });
        const wrapping = mksobj(MUMMY_WRAPPING, false, false, {
            state,
            random: FIXED_OBJECT_ID_RANDOM,
        });
        add_to_minv(monster, wrapping, { state });
        m_dowear(monster, true, { state });
        assert.equal(monster.invis_blkd, true, name);
        assert.equal(monster.minvis, false, name);

        const random = scriptedRandom([]);
        discard_minvent(monster, false, { state, random: random.random });
        random.assertExhausted();

        assert.equal(monster.minvent, null, name);
        assert.equal(wrapping.owornmask, 0, name);
        assert.equal(monster.misc_worn_check, I_SPECIAL, name);
        assert.equal(monster.invis_blkd, expectedBlocked, name);
        assert.equal(monster.minvis, expectedVisible, name);
    }
});

test('mongone marks a monster dead before discarding worn wrapping', () => {
    const state = initialLevelState();
    const monster = newMonster({
        data: state.mons[PM_HUMAN_MUMMY],
        mnum: PM_HUMAN_MUMMY,
        m_id: 45,
        mhp: 10,
        minvis: true,
        perminvis: true,
    });
    state.level.monlist = monster;
    place_monster(monster, MON_X, MON_Y, state);
    const wrapping = mksobj(MUMMY_WRAPPING, false, false, {
        state,
        random: FIXED_OBJECT_ID_RANDOM,
    });
    add_to_minv(monster, wrapping, { state });
    m_dowear(monster, true, { state });
    assert.equal(monster.invis_blkd, true);
    assert.equal(monster.minvis, false);

    const random = scriptedRandom([
        // steal.c mdrop_special_objs() checks every carried object before
        // mongone() discards it, even when ordinary resistance is zero.
        step('rn2', [100], 99),
    ]);
    mongone(monster, { state, random: random.random });
    random.assertExhausted();

    assert.equal(monster.mhp, 0);
    assert.equal(monster.minvent, null);
    assert.equal(wrapping.owornmask, 0);
    assert.equal(monster.misc_worn_check, I_SPECIAL);
    assert.equal(monster.invis_blkd, true);
    assert.equal(monster.minvis, false);
});

test('ghost creation names from player or source ghost-name reservoir', () => {
    const cases = [
        {
            name: 'player name branch',
            nameSteps: [step('rn2', [7], 0)],
            expected: 'Alice',
        },
        {
            name: 'fixed ghost-name branch',
            nameSteps: [
                step('rn2', [7], 1),
                // Index 26 is the first two-word entry, exercising exact
                // reservoir order rather than a fixture-specific alias.
                step('rn2', [34], 26),
            ],
            expected: 'Nick Danger',
        },
    ];

    for (const scenario of cases) {
        const state = initialLevelState();
        state.plname = 'Alice';
        const random = scriptedRandom([
            step('rnd', [2], 1), // monster id
            // Difficulty one lowers the level-ten ghost to level nine.
            step('d', [9, 8], 30),
            step('rn2', [2], 1), // retained corpse gender
            ...scenario.nameSteps,
        ]);
        const monster = makemon(
            state.mons[PM_GHOST],
            MON_X,
            MON_Y,
            NO_MINVENT,
            { state, random: random.random },
        );
        random.assertExhausted();

        assert.equal(monster.mextra.mgivenname, scenario.expected, scenario.name);
        assert.equal(monster.female, true, scenario.name);
        assert.equal(monster.mpeaceful, false, scenario.name);
        assert.equal(monster.minvent, null, scenario.name);
    }
});

test('new monsters prepend to the source level-wide chain', () => {
    const state = initialLevelState();
    state.level.at(MON_X + 1, MON_Y).typ = ROOM;
    const firstRandom = scriptedRandom([
        ...basicCreationSteps(),
        ...ordinaryInventoryTail(),
    ]);
    const first = makemon(
        state.mons[PM_JACKAL],
        MON_X,
        MON_Y,
        0,
        { state, random: firstRandom.random },
    );
    firstRandom.assertExhausted();

    const secondRandom = scriptedRandom([
        ...basicCreationSteps(),
        ...ordinaryInventoryTail(),
    ]);
    const second = makemon(
        state.mons[PM_NEWT],
        MON_X + 1,
        MON_Y,
        0,
        { state, random: secondRandom.random },
    );
    secondRandom.assertExhausted();

    assert.equal(state.level.monlist, second);
    assert.equal(second.nmon, first);
    assert.equal(first.nmon, null);
    assert.equal(state.level.monsters[MON_X][MON_Y], first);
    assert.equal(state.level.monsters[MON_X + 1][MON_Y], second);
});

test('random-coordinate creation accepts the first sampled good position', () => {
    const state = initialLevelState();
    state.level.at(17, 4).typ = ROOM;
    const random = scriptedRandom([
        step('rn1', [77, 2], 17),
        step('rn2', [21], 4),
        ...basicCreationSteps(),
    ]);

    const monster = makemon(
        state.mons[PM_NEWT],
        0,
        0,
        MM_NOCOUNTBIRTH | MM_NOMSG | NO_MINVENT,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.deepEqual([monster.mx, monster.my], [17, 4]);
    assert.equal(state.level.monsters[17][4], monster);
    assert.equal(state.mvitals[PM_NEWT].born, 0);
});

test('runtime random creation selects a compatible unseen D:1 monster', async () => {
    const state = initialLevelState();
    state.in_mklev = false;
    state.level.at(17, 4).typ = ROOM;
    const random = scriptedRandom([
        step('rn1', [77, 2], 17), // First runtime coordinate candidate.
        step('rn2', [21], 4), // Its row is outside the hero's sight map.
        ...DEPTH_ONE_RESERVOIR_BOUNDS.map((bound) =>
            step('rn2', [bound], bound - 1)),
        ...basicCreationSteps(),
        step('rn2', [2], 0), // Jackal's small-group gate does not fire.
        ...ordinaryInventoryTail(),
    ]);

    const monster = await makemon_runtime(null, 0, 0, 0, {
        state,
        random: random.random,
    });
    random.assertExhausted();

    assert.equal(monster.data, state.mons[PM_JACKAL]);
    assert.deepEqual([monster.mx, monster.my], [17, 4]);
    assert.equal(monster.mgenmklev, false);
    assert.equal(state.level.monlist, monster);
    assert.equal(monster.nmon, null);
});

test('runtime random coordinates reject a visible sample before goodpos', async () => {
    const state = initialLevelState();
    state.in_mklev = false;
    state.level.at(17, 4).typ = ROOM;
    state.level.at(18, 5).typ = ROOM;
    state.viz_array = Array.from(
        { length: ROWNO },
        () => new Uint8Array(COLNO),
    );
    state.viz_array[4][17] = IN_SIGHT;
    const random = scriptedRandom([
        step('rn1', [77, 2], 17), // Rejected because the hero sees it.
        step('rn2', [21], 4),
        step('rn1', [77, 2], 18), // First unseen accessible sample.
        step('rn2', [21], 5),
        ...DEPTH_ONE_RESERVOIR_BOUNDS.map((bound) =>
            step('rn2', [bound], 0)),
        ...basicCreationSteps(),
        ...ordinaryInventoryTail(),
    ]);

    const monster = await makemon_runtime(null, 0, 0, 0, {
        state,
        random: random.random,
    });
    random.assertExhausted();
    assert.deepEqual([monster.mx, monster.my], [18, 5]);
    assert.equal(monster.data, state.mons[PM_NEWT]);
});

test('runtime random coordinates use the unseen exhaustive scan first', async () => {
    const state = initialLevelState();
    state.in_mklev = false;
    state.level.at(MON_X, MON_Y).typ = STONE;
    // Offsets <17,4> make <18,5> the first x-major fallback coordinate.
    state.level.at(18, 5).typ = ROOM;
    state.viz_array = Array.from(
        { length: ROWNO },
        () => new Uint8Array(COLNO),
    );
    state.viz_array[4][17] = IN_SIGHT;
    const failedPairs = Array.from({ length: 50 }, () => [
        step('rn1', [77, 2], 17),
        step('rn2', [21], 4),
    ]).flat();
    const random = scriptedRandom([
        ...failedPairs,
        ...DEPTH_ONE_RESERVOIR_BOUNDS.map((bound) =>
            step('rn2', [bound], 0)),
        ...basicCreationSteps(),
        ...ordinaryInventoryTail(),
    ]);

    const monster = await makemon_runtime(null, 0, 0, 0, {
        state,
        random: random.random,
    });
    random.assertExhausted();
    assert.deepEqual([monster.mx, monster.my], [18, 5]);
    assert.equal(monster.data, state.mons[PM_NEWT]);
});

test('runtime random coordinates relax visibility on the final scan', async () => {
    const state = initialLevelState();
    state.in_mklev = false;
    state.u.ux = 17;
    state.u.uy = 5;
    const occupation = () => 1;
    state.go = { occupation, occtxt: 'waiting' };
    state.level.at(MON_X, MON_Y).typ = STONE;
    // The only valid square is visible. With no stair, the first scan must
    // skip it and the second scan must return it with GP_CHECKSCARY still off.
    state.level.at(18, 5).typ = ROOM;
    state.viz_array = Array.from(
        { length: ROWNO },
        () => new Uint8Array(COLNO).fill(IN_SIGHT | COULD_SEE),
    );
    const failedPairs = Array.from({ length: 50 }, () => [
        step('rn1', [77, 2], 17),
        step('rn2', [21], 4),
    ]).flat();
    const redraws = [];
    const stopped = [];
    const random = scriptedRandom([
        ...failedPairs,
        ...DEPTH_ONE_RESERVOIR_BOUNDS.map((bound) =>
            step('rn2', [bound], 0)),
        ...basicCreationSteps(),
        ...ordinaryInventoryTail(),
    ]);

    const messages = [];
    let releaseAppearance;
    const appearancePaused = new Promise((resolve) => {
        releaseAppearance = resolve;
    });
    const creation = makemon_runtime(null, 0, 0, 0, {
        state,
        random: random.random,
        message: (text) => messages.push(['pline', text]),
        async norepMessage(text) {
            messages.push(['norep', text]);
            await appearancePaused;
        },
        hooks: {
            newsym: (x, y) => redraws.push([x, y]),
            async stopOccupation(threat, env) {
                stopped.push(threat);
                assert.equal(state.go.occupation, occupation);
                await env.message('You stop waiting.');
                state.go.occupation = null;
            },
        },
    });
    await Promise.resolve();
    assert.deepEqual(messages, [[
        'norep',
        'A newt suddenly appears next to you!',
    ]]);
    assert.equal(state.go.occupation, occupation);
    assert.deepEqual(stopped, []);
    releaseAppearance();
    const monster = await creation;
    random.assertExhausted();
    assert.deepEqual([monster.mx, monster.my], [18, 5]);
    assert.deepEqual(redraws, [[18, 5]]);
    assert.deepEqual(messages, [
        ['norep', 'A newt suddenly appears next to you!'],
        ['pline', 'You stop waiting.'],
    ]);
    assert.deepEqual(stopped, [monster]);
    assert.equal(state.go.occupation, null);
});

test('runtime random coordinates fall back to an in-dungeon stair', async () => {
    const state = initialLevelState();
    state.in_mklev = false;
    state.level.at(20, 8).typ = ROOM;
    state.stairs = {
        sx: 20,
        sy: 8,
        tolev: { dnum: state.u.uz.dnum, dlevel: 2 },
        next: null,
    };
    // Mark every coordinate visible so all 50 samples and the first fallback
    // scan fail solely on the runtime visibility constraint.
    state.viz_array = Array.from(
        { length: ROWNO },
        () => new Uint8Array(COLNO).fill(IN_SIGHT),
    );
    const failedPairs = Array.from({ length: 50 }, () => [
        step('rn1', [77, 2], 17),
        step('rn2', [21], 4),
    ]).flat();
    const random = scriptedRandom([
        ...failedPairs,
        step('rn2', [2], 0), // Accept the first same-dungeon stair.
        ...DEPTH_ONE_RESERVOIR_BOUNDS.map((bound) =>
            step('rn2', [bound], 0)),
        ...basicCreationSteps(),
        ...ordinaryInventoryTail(),
    ]);

    const redraws = [];
    const monster = await makemon_runtime(null, 0, 0, 0, {
        state,
        random: random.random,
        hooks: { newsym: (x, y) => redraws.push([x, y]) },
    });
    random.assertExhausted();
    assert.deepEqual([monster.mx, monster.my], [20, 8]);
    assert.equal(monster.data, state.mons[PM_NEWT]);
    assert.deepEqual(redraws, [[20, 8]]);
});

test('runtime random creation retries a species that cannot use its square', async () => {
    const state = initialLevelState();
    state.in_mklev = false;
    // Hero level seven admits the difficulty-four fog cloud. Keep only it and
    // the jackal in rndmonst()'s reservoir so the two selection passes are
    // explicit: jackal first, then the Elbereth-immune eyeless cloud.
    state.u.ulevel = 7;
    leaveOnlyRandomSpecies(state, [PM_JACKAL, PM_FOG_CLOUD]);
    state.level.at(17, 4).typ = ROOM;
    state.head_engr = {
        nxt_engr: null,
        engr_x: 17,
        engr_y: 4,
        engr_txt: ['Elbereth'],
        engr_time: 0,
        engr_type: DUST,
    };
    const random = scriptedRandom([
        step('rn1', [77, 2], 17), // Choose the engraved runtime square.
        step('rn2', [21], 4),
        step('rn2', [3], 0), // Initial reservoir candidate: jackal.
        step('rn2', [5], 4), // Retain jackal over the later fog cloud.
        step('rn2', [3], 0), // Retry starts from jackal again.
        step('rn2', [5], 0), // Replace it with the compatible fog cloud.
        step('rnd', [2], 1), // Allocate the first runtime monster id.
        step('d', [3, 8], 3), // Level-three fog-cloud hit points.
        ...ordinaryInventoryTail(),
    ]);

    const monster = await makemon_runtime(null, 0, 0, 0, {
        state,
        random: random.random,
    });
    random.assertExhausted();
    assert.equal(monster.data, state.mons[PM_FOG_CLOUD]);
    assert.equal(state.mvitals[PM_JACKAL].born, 0);
    assert.equal(state.mvitals[PM_FOG_CLOUD].born, 1);
    assert.equal(state.context.ident, 3);
});

test('runtime appearance suffixes retain exact source distance boundaries',
    async () => {
        for (const scenario of [
            {
                name: 'unseen', x: 20, y: 5, visible: false, expected: [],
            },
            {
                name: 'diagonal', x: 11, y: 6, visible: true,
                expected: ['A newt suddenly appears next to you!'],
            },
            {
                name: 'radius eight', x: 18, y: 5, visible: true,
                expected: ['A newt suddenly appears close by!'],
            },
        ]) {
            const state = initialLevelState();
            state.in_mklev = false;
            state.u.ux = 10;
            state.u.uy = 5;
            state.level.at(scenario.x, scenario.y).typ = ROOM;
            state.viz_array = Array.from(
                { length: ROWNO },
                () => new Uint8Array(COLNO),
            );
            if (scenario.visible) {
                state.viz_array[scenario.y][scenario.x]
                    = IN_SIGHT | COULD_SEE;
            }
            const random = scriptedRandom([
                ...basicCreationSteps(),
                ...ordinaryInventoryTail(),
            ]);
            const messages = [];

            await makemon_runtime(
                state.mons[PM_NEWT],
                scenario.x,
                scenario.y,
                MM_NOGRP,
                {
                    state,
                    random: random.random,
                    norepMessage: async (text) => messages.push(text),
                },
            );
            random.assertExhausted();
            assert.deepEqual(messages, scenario.expected, scenario.name);
        }
    });

test('direct runtime call shapes require an async tail owner before mutation',
    () => {
        for (const scenario of [
            { name: 'random parent', ptr: null, x: 0, y: 0, flags: 0 },
            {
                name: 'group child', ptr: PM_NEWT,
                x: MON_X, y: MON_Y, flags: MM_NOGRP,
            },
            {
                name: 'primitive owner', ptr: PM_NEWT,
                x: MON_X, y: MON_Y, flags: MM_NOGRP,
                runtimeContinuation: 1,
            },
        ]) {
            const state = initialLevelState();
            state.in_mklev = false;
            const random = scriptedRandom([]);
            const ident = state.context.ident;
            const ptr = scenario.ptr == null
                ? null : state.mons[scenario.ptr];

            assert.throws(
                () => makemon(ptr, scenario.x, scenario.y, scenario.flags, {
                    state,
                    random: random.random,
                    runtimeContinuation: scenario.runtimeContinuation,
                }),
                /runtime creation without its async tail owner/u,
                scenario.name,
            );
            random.assertExhausted();
            assert.equal(state.context.ident, ident, scenario.name);
            assert.equal(state.level.monlist, null, scenario.name);
            if (scenario.ptr != null) {
                assert.equal(
                    state.mvitals[scenario.ptr].born,
                    0,
                    scenario.name,
                );
            }
        }
    });

// read.c create_particular_creation():3307 is the fourth runtime call shape
// this file admits, and the only one whose flags vary. Each scenario below is
// separated from an admitted one by a single term, and the two refusals are
// told apart by their message: an admitted shape reaches the async-tail test
// first, an unadmitted one falls through to the mklev test underneath it.
test('the create_particular call shape admits only the hero square and its '
    + 'three flag values',
    () => {
        const heroSquare = { x: MON_X, y: MON_Y };
        for (const scenario of [
            // The three mmflags values read.c's own expression can build:
            // MM_NOEXCLAM alone for a name with no gender, and MM_NOEXCLAM
            // plus the one gender bit d->fem contributes for a name with one.
            { name: 'no gender', flags: MM_NOEXCLAM, admitted: true },
            {
                name: 'male name', flags: MM_NOEXCLAM | MM_MALE,
                admitted: true,
            },
            {
                name: 'female name', flags: MM_NOEXCLAM | MM_FEMALE,
                admitted: true,
            },
            // Both gender bits at once is not a value the ternary at
            // read.c:3288-3289 can produce.
            {
                name: 'both genders',
                flags: MM_NOEXCLAM | MM_MALE | MM_FEMALE,
                admitted: false,
            },
            // MM_NOEXCLAM is what separates this shape from every other
            // runtime call with a species and a square.
            { name: 'no MM_NOEXCLAM', flags: MM_ANGRY, admitted: false },
            // create_particular_creation() always passes u.ux, u.uy.
            {
                name: 'east of the hero', flags: MM_NOEXCLAM,
                x: MON_X + 1, admitted: false,
            },
            {
                name: 'south of the hero', flags: MM_NOEXCLAM,
                y: MON_Y + 1, admitted: false,
            },
            // A null species is the random-selection shape, which carries no
            // flags at all.
            { name: 'no species', flags: MM_NOEXCLAM, ptr: null,
                admitted: false },
        ]) {
            const state = initialLevelState();
            state.in_mklev = false;
            state.u.ux = heroSquare.x;
            state.u.uy = heroSquare.y;
            const random = scriptedRandom([]);
            const ptr = scenario.ptr === null ? null : state.mons[PM_NEWT];

            assert.throws(
                () => makemon(
                    ptr,
                    scenario.x ?? heroSquare.x,
                    scenario.y ?? heroSquare.y,
                    scenario.flags,
                    { state, random: random.random },
                ),
                scenario.admitted
                    ? /runtime creation without its async tail owner/u
                    : /outside mklev/u,
                scenario.name,
            );
            random.assertExhausted();
            assert.equal(state.level.monlist, null, scenario.name);
        }
    });

test('runtime creation validates output owners before RNG or state', async () => {
    for (const owners of [
        { message: null, norepMessage: async () => {} },
        { message: async () => {}, norepMessage: null },
    ]) {
        const state = initialLevelState();
        state.in_mklev = false;
        const random = scriptedRandom([]);
        const ident = state.context.ident;

        await assert.rejects(
            makemon_runtime(null, 0, 0, 0, {
                state,
                random: random.random,
                ...owners,
            }),
            /message operations/u,
        );
        random.assertExhausted();
        assert.equal(state.context.ident, ident);
        assert.equal(state.level.monlist, null);
    }
});

test('a runtime-random mimic names its furniture appearance after selection',
    async () => {
        const state = initialLevelState();
        state.in_mklev = false;
        state.mons[PM_SMALL_MIMIC].difficulty = 1;
        leaveOnlyRandomSpecies(state, [PM_SMALL_MIMIC]);
        state.level.rooms = [{ rtype: OROOM }];
        for (let x = 1; x < COLNO; ++x) {
            for (let y = 0; y < ROWNO; ++y) {
                state.level.at(x, y).typ = ROOM;
                state.level.at(x, y).roomno = ROOMOFFSET;
            }
        }
        state.viz_array = Array.from(
            { length: ROWNO },
            () => new Uint8Array(COLNO).fill(IN_SIGHT | COULD_SEE),
        );
        const random = recordingRandom({
            rn1Result: (_range, base) => base === 2 ? 17 : base,
            rn2Result: (bound) => bound === 21 ? 4 : 0,
        });
        const ident = state.context.ident;
        const messages = [];

        const mimic = await makemon_runtime(null, 0, 0, 0, {
            state,
            random: random.random,
            norepMessage: async (message) => messages.push(message),
        });
        assert.deepEqual(
            random.calls.slice(0, 2).map(({ kind, args, result }) => [
                kind,
                args,
                result,
            ]),
            [
                ['rn1', [77, 2], 17],
                ['rn2', [21], 4],
            ],
        );
        assert.ok(mimic);
        assert.equal(mimic.m_ap_type, M_AP_FURNITURE);
        assert.equal(state.context.ident, ident + 1);
        assert.equal(state.mvitals[PM_SMALL_MIMIC].born, 1);
        assert.equal(state.level.monsters[mimic.mx][mimic.my], mimic);
        assert.equal(messages.length, 1);
        assert.match(messages[0], /^A staircase up suddenly appears/u);
    });

test('runtime random creation builds source-order hostile groups', async () => {
    const state = initialLevelState();
    state.in_mklev = false;
    // The parent and every radius-three candidate are valid floor squares;
    // zero shuffle offsets make <16,3> the first group destination.
    for (let x = 14; x <= 20; ++x) {
        for (let y = 1; y <= 7; ++y) state.level.at(x, y).typ = ROOM;
    }
    // The child is visible while the randomly placed parent is not. Its
    // creation message therefore supplies an awaited boundary inside
    // m_initgrp(), before the parent's inventory tail can draw.
    state.viz_array = Array.from(
        { length: ROWNO },
        () => new Uint8Array(COLNO),
    );
    state.viz_array[3][16] = IN_SIGHT | COULD_SEE;
    const parentInventorySteps = ordinaryInventoryTail();
    const script = [
        step('rn1', [77, 2], 17), // Parent coordinate.
        step('rn2', [21], 4),
        ...DEPTH_ONE_RESERVOIR_BOUNDS.map((bound) =>
            step('rn2', [bound], bound - 1)),
        ...basicCreationSteps(),
        step('rn2', [2], 1), // Take jackal's small-group branch.
        step('rnd', [3], 1), // Level one reduces any 1..3 roll to one member.
        ...radiusThreeShuffleSteps(),
        ...basicCreationSteps(), // Create the hostile group member first.
        ...ordinaryInventoryTail(),
        ...parentInventorySteps, // Parent inventory follows its group.
    ];
    const random = scriptedRandom(script);
    let releaseChildMessage;
    const childMessagePaused = new Promise((resolve) => {
        releaseChildMessage = resolve;
    });
    const messages = [];

    const creation = makemon_runtime(null, 0, 0, 0, {
        state,
        random: random.random,
        async norepMessage(text) {
            messages.push(text);
            await childMessagePaused;
        },
    });
    await Promise.resolve();
    assert.equal(messages.length, 1);
    assert.match(messages[0], /^A jackal suddenly appears/u);
    assert.equal(
        random.consumedCount(),
        script.length - parentInventorySteps.length,
        'parent inventory must wait for the child Norep boundary',
    );
    releaseChildMessage();
    const parent = await creation;
    random.assertExhausted();

    const groupMember = state.level.monlist;
    assert.notEqual(groupMember, parent);
    assert.equal(groupMember.data, state.mons[PM_JACKAL]);
    assert.deepEqual([groupMember.mx, groupMember.my], [16, 3]);
    assert.equal(groupMember.mpeaceful, false);
    assert.equal(groupMember.mavenge, false);
    assert.equal(groupMember.nmon, parent);
    assert.equal(parent.nmon, null);
});

test('large runtime groups chain placement and override recursive peace', async () => {
    const state = initialLevelState();
    state.in_mklev = false;
    // Level five removes m_initgrp()'s low-level divisor. Restrict rndmonst()
    // to the neutral, probabilistically peaceful G_LGROUP garter snake.
    state.u.ulevel = 5;
    leaveOnlyRandomSpecies(state, [PM_GARTER_SNAKE]);
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) state.level.at(x, y).typ = ROOM;
    }
    const memberSteps = (thirdRingSize = 24) => [
        step('rn2', [16], 0), // Hostile precheck permits this group member.
        ...radiusThreeShuffleSteps(thirdRingSize),
        // Recursive makemon() independently rolls peaceful; m_initgrp()
        // must force the resulting member hostile and recompute malign.
        ...garterSnakeCreationSteps({ peaceful: true }),
        ...ordinaryInventoryTail(),
    ];
    const redraws = [];
    const random = scriptedRandom([
        step('rn1', [77, 2], 17), // Parent coordinate.
        step('rn2', [21], 4),
        step('rn2', [1], 0), // The one-species reservoir selects garter snake.
        ...garterSnakeCreationSteps({ peaceful: false }),
        step('rn2', [3], 1), // Choose m_initlgrp() rather than m_initsgrp().
        step('rnd', [10], 3), // Create three members at hero level five.
        ...memberSteps(),
        ...memberSteps(),
        ...memberSteps(17), // Radius three clips at the top edge from <15,2>.
        ...ordinaryInventoryTail(), // Parent inventory follows the group.
    ]);

    const parent = await makemon_runtime(null, 0, 0, 0, {
        state,
        random: random.random,
        hooks: { newsym: (x, y) => redraws.push([x, y]) },
    });
    random.assertExhausted();

    const newest = state.level.monlist;
    const middle = newest.nmon;
    const oldest = middle.nmon;
    assert.equal(oldest.nmon, parent);
    assert.equal(parent.nmon, null);
    assert.deepEqual(
        [parent, oldest, middle, newest].map((monster) => [
            monster.mx,
            monster.my,
        ]),
        [[17, 4], [16, 3], [15, 2], [14, 1]],
    );
    for (const member of [oldest, middle, newest]) {
        assert.equal(member.data, state.mons[PM_GARTER_SNAKE]);
        assert.equal(member.mpeaceful, false);
        assert.equal(member.mavenge, false);
        assert.equal(member.malign, 3);
    }
    assert.equal(state.mvitals[PM_GARTER_SNAKE].born, 4);
    // Recursive children redraw as each creation finishes; the parent redraw
    // remains last, after its own inventory initialization.
    assert.deepEqual(redraws, [[16, 3], [15, 2], [14, 1], [17, 4]]);
});

test('hero level three applies the middle runtime group divisor', async () => {
    const state = initialLevelState();
    state.in_mklev = false;
    state.u.ulevel = 3;
    state.u.uz.dlevel = 5;
    leaveOnlyRandomSpecies(state, [PM_GARTER_SNAKE]);
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) state.level.at(x, y).typ = ROOM;
    }
    const memberSteps = () => [
        step('rn2', [16], 0),
        ...radiusThreeShuffleSteps(),
        ...garterSnakeCreationSteps({ peaceful: true }),
        ...ordinaryInventoryTail(),
    ];
    const random = scriptedRandom([
        step('rn1', [77, 2], 17),
        step('rn2', [21], 4),
        step('rn2', [1], 0),
        ...garterSnakeCreationSteps({ peaceful: false }),
        step('rn2', [3], 1),
        // At level three C divides four by two, producing two members. The
        // level-one divisor would reduce it to one before the zero clamp.
        step('rnd', [10], 4),
        ...memberSteps(),
        ...memberSteps(),
        ...ordinaryInventoryTail(),
    ]);

    const parent = await makemon_runtime(null, 0, 0, 0, {
        state,
        random: random.random,
    });
    random.assertExhausted();
    assert.equal(state.level.monlist.nmon.nmon, parent);
    assert.equal(state.mvitals[PM_GARTER_SNAKE].born, 3);
});

test('random-coordinate creation scans x-major after exactly 50 failed pairs', () => {
    const state = initialLevelState();
    state.level.at(3, 2).typ = ROOM;
    const failedPairs = Array.from({ length: 50 }, () => [
        step('rn1', [77, 2], 2),
        step('rn2', [21], 0),
    ]).flat();
    const random = scriptedRandom([
        ...failedPairs,
        ...basicCreationSteps(),
    ]);

    const monster = makemon(
        state.mons[PM_NEWT],
        0,
        0,
        MM_NOCOUNTBIRTH | NO_MINVENT,
        { state, random: random.random },
    );
    random.assertExhausted();

    // From offsets <2,0>, the deterministic scan visits <3,1> first and
    // <3,2> second. Row zero is deliberately absent from this fallback pass.
    assert.deepEqual([monster.mx, monster.my], [3, 2]);
    assert.equal(state.level.monsters[3][2], monster);
});

test('random-coordinate exhaustion returns null without creation state', () => {
    const state = initialLevelState();
    state.level.at(MON_X, MON_Y).typ = STONE;
    const failedPairs = Array.from({ length: 50 }, () => [
        step('rn1', [77, 2], 2),
        step('rn2', [21], 0),
    ]).flat();
    const random = scriptedRandom(failedPairs);

    assert.equal(
        makemon(
            state.mons[PM_NEWT],
            0,
            0,
            MM_NOCOUNTBIRTH | NO_MINVENT,
            { state, random: random.random },
        ),
        null,
    );
    random.assertExhausted();
    assert.equal(state.level.monlist, null);
    assert.equal(state.context.ident, 2);
    assert.equal(state.mvitals[PM_NEWT].born, 0);
});

test('mongone leaves a detached chain node until dmonsfree unlinks it', () => {
    const state = initialLevelState();
    state.level.at(MON_X + 1, MON_Y).typ = ROOM;
    const firstRandom = scriptedRandom(basicCreationSteps());
    const first = makemon(
        state.mons[PM_NEWT],
        MON_X,
        MON_Y,
        NO_MINVENT,
        { state, random: firstRandom.random },
    );
    firstRandom.assertExhausted();
    const secondRandom = scriptedRandom(basicCreationSteps());
    const second = makemon(
        state.mons[PM_JACKAL],
        MON_X + 1,
        MON_Y,
        NO_MINVENT,
        { state, random: secondRandom.random },
    );
    secondRandom.assertExhausted();

    const teardownRandom = scriptedRandom([]);
    mongone(first, { state, random: teardownRandom.random });
    teardownRandom.assertExhausted();

    assert.equal(state.level.monsters[MON_X][MON_Y], null);
    assert.equal(state.level.monsters[MON_X + 1][MON_Y], second);
    assert.equal(first.mhp, 0);
    assert.equal(first.mstate & MON_DETACH, MON_DETACH);
    assert.deepEqual([first.mx, first.my], [MON_X, MON_Y]);
    assert.equal(state.level.monlist, second);
    assert.equal(second.nmon, first);
    assert.equal(state.iflags.purge_monsters, 1);

    assert.equal(dmonsfree(state), 1);
    assert.equal(state.level.monlist, second);
    assert.equal(second.nmon, null);
    assert.equal(first.nmon, null);
    assert.equal(state.iflags.purge_monsters, 0);
});

test('spider creation places its side object before inventory and hides when legal', () => {
    for (const scenario of [
        { name: 'ordinary floor', trap: null, hidden: true },
        { name: 'non-pit trap', trap: WEB, hidden: false },
    ]) {
        const state = initialLevelState();
        init_objects(state, () => 0);
        if (scenario.trap != null) {
            state.level.traps.unshift({
                tx: MON_X,
                ty: MON_Y,
                ttyp: scenario.trap,
            });
        }
        const random = recordingRandom();
        const monster = makemon(
            state.mons[PM_CAVE_SPIDER],
            MON_X,
            MON_Y,
            MM_NOCOUNTBIRTH,
            {
                state,
                random: random.random,
                hooks: { artifactCount: () => 0 },
            },
        );

        const sideObject = state.level.objects[MON_X][MON_Y];
        assert.ok(sideObject, scenario.name);
        assert.deepEqual(
            [sideObject.ox, sideObject.oy],
            [MON_X, MON_Y],
            scenario.name,
        );
        assert.equal(monster.mundetected, scenario.hidden, scenario.name);
        const objectClassDraw = random.calls.findIndex(
            (call) => call.kind === 'rnd' && call.args[0] === 100,
        );
        const defensiveGate = random.calls.findIndex(
            (call) => call.kind === 'rn2' && call.args[0] === 50,
        );
        assert.ok(objectClassDraw >= 0, scenario.name);
        assert.ok(defensiveGate > objectClassDraw, scenario.name);
    }
});

test('light monsters own mobile light through creation and teardown', () => {
    const state = initialLevelState();
    state.level.at(MON_X + 1, MON_Y).typ = ROOM;
    light_globals_init(state);

    const yellowRandom = scriptedRandom([
        step('rnd', [2], 1),
        step('d', [2, 8], 9),
        step('rn2', [50], 2),
        step('rn2', [100], 2),
        step('rn2', [100], 1),
    ]);
    const yellow = makemon(
        state.mons[PM_YELLOW_LIGHT],
        MON_X,
        MON_Y,
        MM_NOCOUNTBIRTH,
        { state, random: yellowRandom.random },
    );
    yellowRandom.assertExhausted();
    assert.equal(yellow.minvis, false);
    assert.equal(state.gl.light_base.id, yellow);
    assert.equal(state.gl.light_base.range, 1);

    const blackRandom = scriptedRandom([
        step('rnd', [2], 1),
        step('d', [4, 8], 18),
        step('rn2', [50], 4),
        step('rn2', [100], 4),
        step('rn2', [100], 1),
    ]);
    const black = makemon(
        state.mons[PM_BLACK_LIGHT],
        MON_X + 1,
        MON_Y,
        MM_NOCOUNTBIRTH,
        { state, random: blackRandom.random },
    );
    blackRandom.assertExhausted();
    assert.equal(black.minvis, true);
    assert.equal(black.perminvis, true);
    assert.equal(state.gl.light_base.id, black);
    assert.equal(state.gl.light_base.next.id, yellow);

    const teardownRandom = scriptedRandom([]);
    mongone(yellow, { state, random: teardownRandom.random });
    assert.equal(state.gl.light_base.id, black);
    assert.equal(state.gl.light_base.next, null);
    mongone(black, { state, random: teardownRandom.random });
    teardownRandom.assertExhausted();
    assert.equal(state.gl.light_base, null);
    assert.equal(state.iflags.purge_monsters, 2);
});

test('makemon starts only stalkers and black lights permanently invisible',
    () => {
        const state = initialLevelState();
        // makemon.c:1315-1320 shares one switch arm between S_LIGHT and
        // S_ELEMENTAL, then admits exactly these two species. Pin both halves
        // against the generated mons[] catalog: neither another light nor
        // another elemental may acquire the two struct monst fields.
        assert.equal(state.mons[PM_STALKER].mlet, S_ELEMENTAL);
        assert.equal(state.mons[PM_BLACK_LIGHT].mlet, S_LIGHT);
        assert.equal(state.mons[PM_YELLOW_LIGHT].mlet, S_LIGHT);
        assert.equal(state.mons[PM_FIRE_ELEMENTAL].mlet, S_ELEMENTAL);
        assert.equal(startsPermanentlyInvisible(state.mons[PM_STALKER]), true);
        assert.equal(
            startsPermanentlyInvisible(state.mons[PM_BLACK_LIGHT]),
            true,
        );
        assert.equal(
            startsPermanentlyInvisible(state.mons[PM_YELLOW_LIGHT]),
            false,
        );
        assert.equal(
            startsPermanentlyInvisible(state.mons[PM_FIRE_ELEMENTAL]),
            false,
        );

        const random = recordingRandom();
        const stalker = makemon(
            state.mons[PM_STALKER],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOCOUNTBIRTH,
            { state, random: random.random },
        );
        assert.equal(stalker.perminvis, true);
        assert.equal(stalker.minvis, true);
        assert.equal(stalker.mgenmklev, true);
        assert.equal(state.level.monsters[MON_X][MON_Y], stalker);
    });

test('initial chameleon can retain its natural form and inventory gates', () => {
    const state = initialLevelState();
    light_globals_init(state);
    const redraws = [];
    const random = scriptedRandom([
        step('rnd', [2], 1),
        step('d', [5, 8], 20),
        step('rn2', [2], 1),
        step('rn2', [3], 1),
        step('rn1', [SPECIAL_PM, 0], PM_CHAMELEON),
        step('rn2', [50], 5),
        step('rn2', [100], 5),
        step('rn2', [100], 1),
    ]);
    const monster = makemon(
        state.mons[PM_CHAMELEON],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOCOUNTBIRTH,
        {
            state,
            random: random.random,
            hooks: { newsym: (x, y) => redraws.push([x, y]) },
        },
    );
    random.assertExhausted();

    assert.equal(monster.cham, PM_CHAMELEON);
    assert.equal(monster.mnum, PM_CHAMELEON);
    assert.equal(monster.data, state.mons[PM_CHAMELEON]);
    assert.deepEqual([monster.m_lev, monster.mhp, monster.mhpmax], [5, 20, 20]);
    assert.equal(monster.misc_worn_check, 0);
    assert.equal(monster.minvent, null);
    assert.deepEqual(redraws, []);
});

test('shapechanger protection leaves an initial chameleon unactivated', () => {
    const state = initialLevelState();
    state.u.uprops = [];
    state.u.uprops[PROT_FROM_SHAPE_CHANGERS] = {
        intrinsic: 1,
        extrinsic: 0,
    };
    const random = scriptedRandom([
        step('rnd', [2], 1),
        step('d', [5, 8], 20),
        step('rn2', [2], 1),
        step('rn2', [50], 5),
        step('rn2', [100], 5),
        step('rn2', [100], 1),
    ]);
    const monster = makemon(
        state.mons[PM_CHAMELEON],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOCOUNTBIRTH,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.equal(monster.cham, NON_PM);
    assert.equal(monster.mnum, PM_CHAMELEON);
    assert.equal(monster.misc_worn_check, 0);
});

test('initial chameleon retries a placeholder then takes luminous form', () => {
    const state = initialLevelState();
    light_globals_init(state);
    const redraws = [];
    const hooks = { newsym: (x, y) => redraws.push([x, y]) };
    const random = scriptedRandom([
        step('rnd', [2], 1),
        step('d', [5, 8], 20),
        step('rn2', [2], 1),
        step('rn2', [3], 1),
        step('rn1', [SPECIAL_PM, 0], PM_HUMAN),
        step('rn2', [3], 1),
        step('rn1', [SPECIAL_PM, 0], PM_BLACK_LIGHT),
        step('d', [4, 8], 12),
    ]);
    const monster = makemon(
        state.mons[PM_CHAMELEON],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOCOUNTBIRTH,
        { state, random: random.random, hooks },
    );
    random.assertExhausted();

    assert.equal(monster.cham, PM_CHAMELEON);
    assert.equal(monster.mnum, PM_BLACK_LIGHT);
    assert.equal(monster.data, state.mons[PM_BLACK_LIGHT]);
    assert.deepEqual([monster.m_lev, monster.mhp, monster.mhpmax], [4, 12, 12]);
    assert.equal(monster.perminvis, true);
    assert.equal(monster.minvis, true);
    assert.equal(monster.misc_worn_check, I_SPECIAL);
    assert.equal(monster.minvent, null);
    assert.equal(state.gl.light_base.id, monster);
    assert.equal(state.gl.light_base.range, 1);
    assert.deepEqual(redraws, [[MON_X, MON_Y]]);

    const teardown = scriptedRandom([]);
    mongone(monster, { state, random: teardown.random, hooks });
    teardown.assertExhausted();
    assert.equal(state.gl.light_base, null);
    assert.deepEqual(redraws, [
        [MON_X, MON_Y],
        [MON_X, MON_Y],
    ]);
});

test('initial chameleon rejects genocided and non-natural shapeshifter forms', () => {
    for (const scenario of [
        {
            name: 'genocided',
            target: PM_NEWT,
            configure(state) {
                state.mvitals[PM_NEWT].mvflags |= G_GENOD;
            },
        },
        {
            name: 'non-natural shapeshifter',
            target: PM_DOPPELGANGER,
            configure() {},
        },
    ]) {
        const state = initialLevelState();
        light_globals_init(state);
        scenario.configure(state);
        const random = scriptedRandom([
            step('rnd', [2], 1),
            step('d', [5, 8], 20),
            step('rn2', [2], 1),
            step('rn2', [3], 1),
            step('rn1', [SPECIAL_PM, 0], scenario.target),
            step('rn2', [3], 1),
            step('rn1', [SPECIAL_PM, 0], PM_BLACK_LIGHT),
            step('d', [4, 8], 12),
        ]);

        const monster = makemon(
            state.mons[PM_CHAMELEON],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOCOUNTBIRTH,
            { state, random: random.random },
        );
        random.assertExhausted();
        assert.equal(monster.mnum, PM_BLACK_LIGHT, scenario.name);
        assert.equal(monster.data, state.mons[PM_BLACK_LIGHT], scenario.name);
    }
});

test('initial chameleon stops after twenty rejected forms and resumes inventory', () => {
    const state = initialLevelState();
    light_globals_init(state);
    const rejectedSelections = Array.from({ length: 20 }, () => [
        step('rn2', [3], 1),
        step('rn1', [SPECIAL_PM, 0], PM_HUMAN),
    ]).flat();
    const random = scriptedRandom([
        step('rnd', [2], 1),
        step('d', [5, 8], 20),
        step('rn2', [2], 1),
        ...rejectedSelections,
        step('rn2', [50], 5),
        step('rn2', [100], 5),
        step('rn2', [100], 1),
    ]);

    const monster = makemon(
        state.mons[PM_CHAMELEON],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOCOUNTBIRTH,
        { state, random: random.random },
    );
    random.assertExhausted();
    assert.equal(monster.mnum, PM_CHAMELEON);
    assert.equal(monster.data, state.mons[PM_CHAMELEON]);
    assert.equal(monster.misc_worn_check, 0);
    assert.equal(monster.minvent, null);
});

test('initial chameleon long-worm form owns and removes its full tail', () => {
    const state = initialLevelState();
    state.level.at(MON_X - 1, MON_Y).typ = ROOM;
    state.level.at(MON_X - 2, MON_Y).typ = ROOM;
    light_globals_init(state);
    const redraws = [];
    const hooks = { newsym: (x, y) => redraws.push([x, y]) };
    // Each requested tail segment shuffles all eight directions. Descending
    // Fisher-Yates results preserve their source order, selecting west first.
    const identityShuffle = Array.from({ length: 2 }, () =>
        Array.from(
            { length: 8 },
            (_, index) => step('rn2', [8 - index], 7 - index),
        )).flat();
    const random = scriptedRandom([
        step('rnd', [2], 1), // adjusted initial level
        step('d', [5, 8], 20), // initial chameleon hit points
        step('rn2', [2], 0), // initial gender is male
        step('rn2', [3], 0), // select from the 98-entry animal reservoir
        step('rn2', [98], 59), // reservoir entry 59 is PM_LONG_WORM
        step('rn2', [10], 0), // new form flips gender to female
        step('d', [8, 8], 32), // replacement long-worm hit points
        step('rn2', [5], 2), // request two tail segments
        ...identityShuffle,
    ]);
    const monster = makemon(
        state.mons[PM_CHAMELEON],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOCOUNTBIRTH,
        { state, random: random.random, hooks },
    );
    random.assertExhausted();

    assert.equal(monster.cham, PM_CHAMELEON);
    assert.equal(monster.mnum, PM_LONG_WORM);
    assert.equal(monster.female, true);
    assert.equal(monster.wormno, 1);
    assert.equal(monster.misc_worn_check, I_SPECIAL);
    assert.equal(monster.minvent, null);
    assert.deepEqual(
        state.level.worms[1].segments,
        [
            { x: MON_X - 2, y: MON_Y },
            { x: MON_X - 1, y: MON_Y },
            { x: MON_X, y: MON_Y },
        ],
    );
    for (const x of [MON_X - 2, MON_X - 1, MON_X])
        assert.equal(state.level.monsters[x][MON_Y], monster);
    assert.deepEqual(redraws, [
        [MON_X - 1, MON_Y],
        [MON_X - 2, MON_Y],
        [MON_X, MON_Y],
    ]);

    const teardown = scriptedRandom([]);
    mongone(monster, { state, random: teardown.random, hooks });
    teardown.assertExhausted();
    assert.equal(monster.wormno, 0);
    assert.equal(state.level.worms[1], null);
    for (const x of [MON_X - 2, MON_X - 1, MON_X])
        assert.equal(state.level.monsters[x][MON_Y], null);
    assert.deepEqual(redraws, [
        [MON_X - 1, MON_Y],
        [MON_X - 2, MON_Y],
        [MON_X, MON_Y],
        [MON_X - 2, MON_Y],
        [MON_X - 1, MON_Y],
        [MON_X, MON_Y],
        [MON_X, MON_Y],
    ]);
    assert.equal(monster.mstate & MON_DETACH, MON_DETACH);
    assert.equal(state.iflags.purge_monsters, 1);
});

test('initial long-worm tail truncates after one blocked neighbor search', () => {
    const state = initialLevelState();
    light_globals_init(state);
    const redraws = [];
    const shuffle = Array.from(
        { length: 8 },
        (_, index) => step('rn2', [8 - index], 7 - index),
    );
    // This repeats the long-worm selection above, then requests two segments.
    // One full direction shuffle finds no valid neighbor and truncates the tail.
    const random = scriptedRandom([
        step('rnd', [2], 1),
        step('d', [5, 8], 20),
        step('rn2', [2], 0),
        step('rn2', [3], 0),
        step('rn2', [98], 59),
        step('rn2', [10], 0),
        step('d', [8, 8], 32),
        step('rn2', [5], 2),
        ...shuffle,
    ]);

    const monster = makemon(
        state.mons[PM_CHAMELEON],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOCOUNTBIRTH,
        {
            state,
            random: random.random,
            hooks: { newsym: (x, y) => redraws.push([x, y]) },
        },
    );
    random.assertExhausted();
    assert.equal(monster.mnum, PM_LONG_WORM);
    assert.equal(monster.wormno, 1);
    assert.deepEqual(
        state.level.worms[1].segments,
        [{ x: MON_X, y: MON_Y }],
    );
    assert.equal(state.level.monsters[MON_X][MON_Y], monster);
    assert.deepEqual(redraws, [[MON_X, MON_Y]]);
});

test('initial long worm skips tail draws when every worm slot is occupied', () => {
    const state = initialLevelState();
    light_globals_init(state);
    const occupied = Array.from(
        { length: MAX_NUM_WORMS },
        (_, index) => index ? { owner: index } : null,
    );
    state.level.worms = [...occupied];
    // The same transcript selects PM_LONG_WORM and flips gender. With no free
    // worm slot, source code skips both the rn2(5) length and direction draws.
    const random = scriptedRandom([
        step('rnd', [2], 1),
        step('d', [5, 8], 20),
        step('rn2', [2], 0),
        step('rn2', [3], 0),
        step('rn2', [98], 59),
        step('rn2', [10], 0),
        step('d', [8, 8], 32),
    ]);

    const monster = makemon(
        state.mons[PM_CHAMELEON],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOCOUNTBIRTH,
        { state, random: random.random },
    );
    random.assertExhausted();
    assert.equal(monster.mnum, PM_LONG_WORM);
    assert.equal(monster.wormno, 0);
    assert.deepEqual(state.level.worms, occupied);
    assert.equal(state.level.monsters[MON_X][MON_Y], monster);
});

test('co-aligned unicorn creation overrides an explicitly angry attitude', () => {
    const cases = [
        { mndx: PM_WHITE_UNICORN, expected: true },
        { mndx: PM_BLACK_UNICORN, expected: false },
    ];
    for (const { mndx, expected } of cases) {
        const state = initialLevelState();
        state.u.ualign.type = 1;
        const random = scriptedRandom([
            step('rnd', [2], 1),
            step('d', [3, 8], 12),
            step('rn2', [2], 0),
            step('rn2', [50], 3),
            step('rn2', [100], 3),
            step('rn2', [100], 1),
        ]);
        const monster = makemon(
            state.mons[mndx],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOCOUNTBIRTH,
            { state, random: random.random },
        );
        random.assertExhausted();
        assert.equal(monster.mpeaceful, expected);
    }
});

test('neutral ponies and horses do not receive the true-unicorn override', () => {
    for (const mndx of [PM_PONY, PM_HORSE]) {
        const state = initialLevelState();
        state.u.ualign.type = 0;
        const random = recordingRandom();
        const monster = makemon(
            state.mons[mndx],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOCOUNTBIRTH | NO_MINVENT,
            { state, random: random.random },
        );

        assert.equal(monster.mpeaceful, false, state.mons[mndx].pmnames[2]);
        // Neutral hostile non-unicorns retain set_malign()'s +3 kill value.
        assert.equal(monster.malign, 3, state.mons[mndx].pmnames[2]);
    }
});

test('ordinary domestic creation equips a saddle after inventory gates', () => {
    const state = initialLevelState();
    init_objects(state, () => 0);
    let hundredDraws = 0;
    const random = recordingRandom({
        rn2Result: (bound) => {
            if (bound === 100) {
                ++hundredDraws;
                return hundredDraws === 2 ? 0 : 99;
            }
            return Math.max(0, bound - 1);
        },
    });
    const monster = makemon(
        state.mons[PM_PONY],
        MON_X,
        MON_Y,
        MM_NOCOUNTBIRTH,
        { state, random: random.random },
    );

    const saddle = monster.minvent;
    assert.equal(saddle.otyp, SADDLE);
    assert.equal(saddle.where, OBJ_MINVENT);
    assert.equal(saddle.ocarry, monster);
    assert.equal(saddle.owornmask, W_SADDLE);
    assert.equal(saddle.leashmon, monster.m_id);
    assert.equal(monster.misc_worn_check, W_SADDLE);
    assert.equal(hundredDraws, 2);

    const defensiveGate = random.calls.findIndex(
        (call) => call.kind === 'rn2' && call.args[0] === 50,
    );
    const saddleGate = random.calls.findLastIndex(
        (call) => call.kind === 'rn2' && call.args[0] === 100,
    );
    const saddleId = random.calls.findIndex(
        (call, index) => index > saddleGate
            && call.kind === 'rnd'
            && call.args[0] === 2,
    );
    assert.ok(defensiveGate >= 0);
    assert.ok(saddleGate > defensiveGate);
    assert.ok(saddleId > saddleGate);

    const missedState = initialLevelState();
    init_objects(missedState, () => 0);
    const missedRandom = recordingRandom();
    const unsaddled = makemon(
        missedState.mons[PM_PONY],
        MON_X,
        MON_Y,
        MM_NOCOUNTBIRTH,
        { state: missedState, random: missedRandom.random },
    );
    assert.equal(
        monsterInventory(unsaddled).some((obj) => obj.otyp === SADDLE),
        false,
    );
});

test('Statuary armed families generate their source equipment', () => {
    const cases = [
        {
            mndx: PM_DWARF,
            expected: [DAGGER, IRON_SHOES, DWARVISH_CLOAK],
        },
        {
            mndx: PM_ORC_CAPTAIN,
            expected: [ORCISH_HELM],
        },
        {
            mndx: PM_PLAINS_CENTAUR,
            expected: [CROSSBOW_BOLT, CROSSBOW],
        },
        {
            mndx: PM_OGRE,
            expected: [CLUB],
        },
        {
            mndx: PM_WOODLAND_ELF,
            expected: [
                ELVEN_SHIELD,
                ELVEN_SPEAR,
                ELVEN_DAGGER,
                ELVEN_LEATHER_HELM,
                ELVEN_MITHRIL_COAT,
            ],
        },
    ];

    for (const { mndx, expected } of cases) {
        const state = initialLevelState();
        const random = recordingRandom();
        const monster = makemon(
            state.mons[mndx],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOCOUNTBIRTH,
            { state, random: random.random },
        );
        assert.deepEqual(
            monsterInventory(monster).map((obj) => obj.otyp),
            expected,
            state.mons[mndx].pmnames[2],
        );
    }
});

test('forest centaurs use bows while other centaurs retain crossbows', () => {
    const cases = [
        {
            name: 'armed forest centaur',
            mndx: PM_FOREST_CENTAUR,
            weaponGate: 1,
            expected: [ARROW, BOW],
            wrong: [CROSSBOW_BOLT, CROSSBOW],
        },
        {
            name: 'unarmed forest centaur',
            mndx: PM_FOREST_CENTAUR,
            weaponGate: 0,
            expected: [],
            wrong: [ARROW, BOW, CROSSBOW_BOLT, CROSSBOW],
        },
        {
            name: 'armed plains centaur',
            mndx: PM_PLAINS_CENTAUR,
            weaponGate: 1,
            expected: [CROSSBOW_BOLT, CROSSBOW],
            wrong: [ARROW, BOW],
        },
    ];

    for (const scenario of cases) {
        const state = initialLevelState();
        let twoDraws = 0;
        const random = recordingRandom({
            rn2Result: (bound) => {
                if (bound === 2 && ++twoDraws === 2)
                    return scenario.weaponGate;
                return Math.max(0, bound - 1);
            },
        });
        const monster = makemon(
            state.mons[scenario.mndx],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH,
            { state, random: random.random },
        );
        const inventory = monsterInventory(monster);

        assert.deepEqual(
            inventory.map((obj) => obj.otyp),
            scenario.expected,
            scenario.name,
        );
        assert.equal(
            inventory.some((obj) => scenario.wrong.includes(obj.otyp)),
            false,
            `${scenario.name}: wrong centaur loadout`,
        );
        for (const obj of inventory) {
            assert.equal(obj.where, OBJ_MINVENT, scenario.name);
            assert.equal(obj.ocarry, monster, scenario.name);
            assert.equal(obj.owornmask, 0, scenario.name);
        }

        const quantityDraws = random.calls.filter(
            (call) => call.kind === 'rn1'
                && call.args[0] === 12 && call.args[1] === 3,
        );
        assert.equal(
            quantityDraws.length,
            scenario.weaponGate,
            `${scenario.name}: m_initthrow gate and order`,
        );
        if (scenario.weaponGate) {
            assert.equal(inventory[0].quan, 3, scenario.name);
            assert.equal(
                inventory[0].owt,
                state.objects[inventory[0].otyp].oc_weight * 3,
                scenario.name,
            );
        }
    }
});

test('ogre weapon divisors retain the source tyrant, leader, and ordinary bounds',
    () => {
        const state = initialLevelState();
        assert.equal(ogreWeaponDivisor(state.mons[PM_OGRE_TYRANT]), 3);
        assert.equal(ogreWeaponDivisor(state.mons[PM_OGRE_LEADER]), 6);
        assert.equal(ogreWeaponDivisor(state.mons[PM_OGRE]), 12);

        // The tyrant is the divisor-3 arm mkroom.c mk_zoo_thronemon() seats
        // on a throne above difficulty 9, so makemon() must build it rather
        // than refuse it. Gating the single rn2(3) at zero takes the battle
        // axe of makemon.c:448; every other draw returns its bound minus one.
        let tyrantGatePending = true;
        const random = recordingRandom({
            rn2Result: (bound) => {
                if (bound === 3 && tyrantGatePending) {
                    tyrantGatePending = false;
                    return 0;
                }
                return Math.max(0, bound - 1);
            },
        });
        const monster = makemon(
            state.mons[PM_OGRE_TYRANT],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH,
            { state, random: random.random },
        );

        assert.equal(tyrantGatePending, false);
        assert.deepEqual(
            monsterInventory(monster).map((obj) => obj.otyp),
            [BATTLE_AXE],
        );
    });

test('ogre leaders use rn2(6) for both source weapons before generic inventory',
    () => {
        for (const { name, gate, expected } of [
            { name: 'battle axe', gate: 0, expected: BATTLE_AXE },
            { name: 'club', gate: 1, expected: CLUB },
        ]) {
            const state = initialLevelState();
            let leaderGatePending = true;
            const random = recordingRandom({
                rn2Result: (bound) => {
                    if (bound === 6 && leaderGatePending) {
                        leaderGatePending = false;
                        return gate;
                    }
                    return Math.max(0, bound - 1);
                },
            });
            const monster = makemon(
                state.mons[PM_OGRE_LEADER],
                MON_X,
                MON_Y,
                MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH,
                { state, random: random.random },
            );
            const inventory = monsterInventory(monster);

            assert.equal(leaderGatePending, false, name);
            assert.deepEqual(inventory.map((obj) => obj.otyp), [expected], name);
            assert.equal(inventory[0].where, OBJ_MINVENT, name);
            assert.equal(inventory[0].ocarry, monster, name);
            assert.equal(inventory[0].quan, 1, name);
            assert.equal(inventory[0].owornmask, 0, name);

            const weaponGate = random.calls.findIndex(
                (call) => call.kind === 'rn2' && call.args[0] === 6,
            );
            const offensiveGate = random.calls.findIndex(
                (call) => call.kind === 'rn2' && call.args[0] === 75,
            );
            assert.ok(weaponGate >= 0, name);
            assert.ok(offensiveGate > weaponGate, name);
            assert.equal(random.calls[weaponGate].result, gate, name);
            assert.deepEqual(
                random.calls.slice(offensiveGate).map(
                    (call) => [call.kind, call.args, call.result],
                ),
                [
                    ['rn2', [75], 74],
                    ['rn2', [50], 49],
                    ['rn2', [100], 99],
                    ['rn2', [5], 4],
                    ['rn2', [100], 99],
                ],
                `${name}: generic inventory continuation`,
            );
        }
    });

test('ordinary ogres retain rn2(12) and the same generic continuation', () => {
    const state = initialLevelState();
    const random = recordingRandom();
    const monster = makemon(
        state.mons[PM_OGRE],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH,
        { state, random: random.random },
    );

    assert.deepEqual(monsterInventory(monster).map((obj) => obj.otyp), [CLUB]);
    assert.equal(
        random.calls.some(
            (call) => call.kind === 'rn2' && call.args[0] === 6,
        ),
        false,
    );
    const weaponGate = random.calls.findIndex(
        (call) => call.kind === 'rn2' && call.args[0] === 12,
    );
    const offensiveGate = random.calls.findIndex(
        (call) => call.kind === 'rn2' && call.args[0] === 75,
    );
    assert.ok(weaponGate >= 0);
    assert.ok(offensiveGate > weaponGate);
    assert.equal(random.calls[weaponGate].result, 11);
    assert.deepEqual(
        random.calls.slice(offensiveGate).map(
            (call) => [call.kind, call.args, call.result],
        ),
        [
            ['rn2', [75], 74],
            ['rn2', [50], 49],
            ['rn2', [100], 99],
            ['rn2', [5], 4],
            ['rn2', [100], 99],
        ],
    );
});

test('trolls preserve the outer no-weapon gate and all four polearm arms', () => {
    const cases = [
        { name: 'no weapon', outer: 1, selection: null, expected: null },
        { name: 'ranseur', outer: 0, selection: 0, expected: RANSEUR },
        { name: 'partisan', outer: 0, selection: 1, expected: PARTISAN },
        { name: 'glaive', outer: 0, selection: 2, expected: GLAIVE },
        { name: 'spetum', outer: 0, selection: 3, expected: SPETUM },
    ];

    for (const scenario of cases) {
        const state = initialLevelState();
        let twoDraws = 0;
        let selectionPending = scenario.selection !== null;
        const random = recordingRandom({
            rn2Result: (bound) => {
                if (bound === 2 && ++twoDraws === 2)
                    return scenario.outer;
                if (bound === 4 && selectionPending) {
                    selectionPending = false;
                    return scenario.selection;
                }
                return Math.max(0, bound - 1);
            },
        });
        const monster = makemon(
            state.mons[PM_TROLL],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH,
            { state, random: random.random },
        );
        const inventory = monsterInventory(monster);

        assert.deepEqual(
            inventory.map((obj) => obj.otyp),
            scenario.expected === null ? [] : [scenario.expected],
            scenario.name,
        );
        for (const obj of inventory) {
            assert.equal(obj.where, OBJ_MINVENT, scenario.name);
            assert.equal(obj.ocarry, monster, scenario.name);
            assert.equal(obj.quan, 1, scenario.name);
            assert.equal(obj.owornmask, 0, scenario.name);
        }

        const twoDrawIndexes = random.calls.flatMap(
            (call, index) => call.kind === 'rn2' && call.args[0] === 2
                ? [index] : [],
        );
        assert.ok(twoDrawIndexes.length >= 2, scenario.name);
        const outerIndex = twoDrawIndexes[1];
        assert.equal(
            random.calls[outerIndex].result,
            scenario.outer,
            `${scenario.name}: outer rn2(2) gate`,
        );
        if (scenario.selection === null) {
            assert.deepEqual(
                random.calls[outerIndex + 1],
                { kind: 'rn2', args: [75], result: 74 },
                `${scenario.name}: skip directly to generic inventory`,
            );
        } else {
            assert.equal(selectionPending, false, scenario.name);
            assert.deepEqual(
                random.calls[outerIndex + 1],
                { kind: 'rn2', args: [4], result: scenario.selection },
                `${scenario.name}: polearm switch follows outer gate`,
            );
        }

        const offensiveGate = random.calls.findIndex(
            (call, index) => index > outerIndex
                && call.kind === 'rn2' && call.args[0] === 75,
        );
        assert.ok(offensiveGate > outerIndex, scenario.name);
        assert.deepEqual(
            random.calls.slice(offensiveGate).map(
                (call) => [call.kind, call.args, call.result],
            ),
            [
                ['rn2', [75], 74],
                ['rn2', [50], 49],
                ['rn2', [100], 99],
                ['rn2', [100], 99],
            ],
            `${scenario.name}: generic inventory continuation`,
        );
    }
});

test('rock trolls remain outside the ordinary D:5 reservoir before RNG', () => {
    const state = initialLevelState();
    const random = recordingRandom();

    assert.throws(
        () => makemon(
            state.mons[PM_ROCK_TROLL],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH,
            { state, random: random.random },
        ),
        (error) => error instanceof UnsupportedMonsterCreationError
            && error.operation === `monster ${PM_ROCK_TROLL}`,
    );
    assert.deepEqual(random.calls, []);
});

test('barrow wights construct knife then long sword before generic inventory',
    () => {
        const state = initialLevelState();
        const random = recordingRandom({
            rn2Result: (bound) => bound === 75 ? 0 : Math.max(0, bound - 1),
        });
        const monster = makemon(
            state.mons[PM_BARROW_WIGHT],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH,
            { state, random: random.random },
        );
        const inventory = monsterInventory(monster);

        // mongets() prepends.  The lower source-order ids prove that the
        // knife was constructed first and the long sword second; the later
        // generic offensive item then becomes the final chain head.
        assert.deepEqual(
            inventory.map((obj) => [obj.otyp, obj.o_id]),
            [
                [WAN_LIGHTNING, 5],
                [LONG_SWORD, 4],
                [KNIFE, 3],
            ],
        );
        for (const obj of inventory) {
            assert.equal(obj.where, OBJ_MINVENT);
            assert.equal(obj.ocarry, monster);
            assert.equal(obj.quan, 1);
            assert.equal(obj.owornmask, 0);
        }

        const offensiveGate = random.calls.findIndex(
            (call) => call.kind === 'rn2' && call.args[0] === 75,
        );
        assert.ok(offensiveGate > 0);
        assert.deepEqual(
            random.calls.slice(offensiveGate).map(
                (call) => [call.kind, call.args, call.result],
            ),
            [
                ['rn2', [75], 0],
                ['rn2', [35], 34],
                ['rn2', [13], 12],
                ['rnd', [2], 1],
                ['rn1', [5, 4], 4],
                ['rn2', [17], 16],
                ['rn2', [50], 49],
                ['rn2', [100], 99],
                ['rn2', [100], 99],
            ],
            'source generic item and inventory continuation',
        );
    });

test('Nazgul remain outside the ordinary D:5 reservoir before RNG', () => {
    const state = initialLevelState();
    const random = recordingRandom();

    assert.throws(
        () => makemon(
            state.mons[PM_NAZGUL],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH,
            { state, random: random.random },
        ),
        (error) => error instanceof UnsupportedMonsterCreationError
            && error.operation === `monster ${PM_NAZGUL}`,
    );
    assert.deepEqual(random.calls, []);
});

test('soldiers preserve both primary weapon arms and secondary knife gates',
    () => {
        assert.equal(is_mercenary(initialLevelState().mons[PM_SOLDIER]), true);
        assert.equal(is_mercenary(initialLevelState().mons[PM_HUMAN]), false);

        const cases = [
            {
                name: 'polearm and dagger',
                plan: { primaryGate: 0, poleSecondary: 1 },
                expected: [DAGGER, PARTISAN],
            },
            {
                name: 'polearm and knife',
                plan: { primaryGate: 0, poleSecondary: 0 },
                expected: [KNIFE, PARTISAN],
            },
            {
                name: 'spear without fallback',
                plan: {
                    primaryGate: 1,
                    primaryChoice: 1,
                    fallbackKnife: 1,
                },
                expected: [SPEAR],
            },
            {
                name: 'short sword with fallback knife',
                plan: {
                    primaryGate: 1,
                    primaryChoice: 0,
                    fallbackKnife: 0,
                },
                expected: [KNIFE, SHORT_SWORD],
            },
        ];
        const soldierWeapons = new Set([
            PARTISAN, DAGGER, KNIFE, SPEAR, SHORT_SWORD,
        ]);

        for (const { name, plan, expected } of cases) {
            const { monster } = createPlannedSoldier(plan);
            const inventory = monsterInventory(monster);
            assert.deepEqual(
                inventory
                    .filter((obj) => soldierWeapons.has(obj.otyp))
                    .map((obj) => obj.otyp),
                expected,
                name,
            );
            for (const obj of inventory) {
                assert.equal(obj.where, OBJ_MINVENT, name);
                assert.equal(obj.ocarry, monster, name);
            }
        }
    });

test('soldier polearm selection retries until the catalog skill is polearms',
    () => {
        const { monster, random, state } = createPlannedSoldier({
            primaryGate: 0,
            polearmChoices: [PARTISAN, RANSEUR],
            prepareState: (catalogState) => {
                catalogState.objects[PARTISAN].oc_skill = P_POLEARMS + 1;
            },
        });
        const polearmCalls = random.calls.filter(
            (call) => call.kind === 'rn1'
                && call.args[0] === BEC_DE_CORBIN - PARTISAN + 1
                && call.args[1] === PARTISAN,
        );
        assert.deepEqual(
            polearmCalls.map(({ result }) => result),
            [PARTISAN, RANSEUR],
        );
        assert.notEqual(state.objects[PARTISAN].oc_skill, P_POLEARMS);
        assert.equal(state.objects[RANSEUR].oc_skill, P_POLEARMS);
        assert.deepEqual(
            monsterInventory(monster)
                .filter((obj) => obj.otyp === PARTISAN || obj.otyp === RANSEUR)
                .map((obj) => obj.otyp),
            [RANSEUR],
        );
    });

test('soldier armor rounds update mac, wear their winners, and stop at ten',
    () => {
        const direct = createPlannedSoldier();
        assert.deepEqual(
            monsterInventory(direct.monster).map((obj) => [
                obj.otyp,
                obj.owornmask,
            ]),
            [
                [LEATHER_GLOVES, W_ARMG],
                [LOW_BOOTS, W_ARMF],
                [SMALL_SHIELD, W_ARMS],
                [HELMET, W_ARMH],
                [RING_MAIL, W_ARM],
                [SPEAR, 0],
            ],
        );
        assert.equal(
            direct.monster.misc_worn_check,
            W_ARM | W_ARMH | W_ARMS | W_ARMF | W_ARMG,
        );

        const studded = createPlannedSoldier({
            bodyChoice: 0,
            armorRounds: [
                { direct: 0, fallback: 0 },
                { direct: 0, fallback: 0 },
                { direct: 0, fallback: 0 },
                { direct: 0, fallback: 0 },
            ],
        });
        assert.deepEqual(
            monsterInventory(studded.monster).map((obj) => obj.otyp),
            [STUDDED_LEATHER_ARMOR, SPEAR],
        );

        const cloak = createPlannedSoldier({
            bodyGate: 0,
            armorRounds: [
                { direct: 0, fallback: 0 },
                { direct: 0, fallback: 0 },
                { direct: 0, fallback: 0 },
                { direct: 0, fallback: 1 },
            ],
        });
        assert.deepEqual(
            monsterInventory(cloak.monster).map((obj) => [
                obj.otyp,
                obj.owornmask,
            ]),
            [
                [LEATHER_CLOAK, W_ARMC],
                [LEATHER_ARMOR, W_ARM],
                [SPEAR, 0],
            ],
        );

        const capped = createPlannedSoldier({
            bodyGate: 0,
            armorRounds: [
                { direct: 0, fallback: 1 },
                { direct: 0, fallback: 1 },
                { direct: 0, fallback: 1 },
            ],
            suppressedFromRound: 5,
        });
        assert.deepEqual(
            monsterInventory(capped.monster).map((obj) => [
                obj.otyp,
                obj.owornmask,
            ]),
            [
                [HIGH_BOOTS, W_ARMF],
                [LARGE_SHIELD, W_ARMS],
                [DENTED_POT, W_ARMH],
                [LEATHER_ARMOR, W_ARM],
                [SPEAR, 0],
            ],
        );
        assert.equal(
            monsterInventory(capped.monster).some(
                (obj) => obj.otyp === LEATHER_GLOVES
                    || obj.otyp === LEATHER_CLOAK,
            ),
            false,
        );

        // mksobj(TRUE) can give armor a positive spe through rne(3).
        // These source-valid enchantments put mac at exactly 10 before each
        // earlier round, pinning every short-circuit rather than assuming an
        // unenchanted base armor class.
        const cappedBeforeHelmet = createPlannedSoldier({
            armorEnchantments: [4],
            suppressedFromRound: 2,
        });
        assert.deepEqual(
            monsterInventory(cappedBeforeHelmet.monster).map((obj) => [
                obj.otyp,
                obj.spe,
                obj.owornmask,
            ]),
            [
                [RING_MAIL, 4, W_ARM],
                [SPEAR, 0, 0],
            ],
        );

        const cappedBeforeShield = createPlannedSoldier({
            armorEnchantments: [0, 3],
            armorRounds: [{ direct: 1 }],
            suppressedFromRound: 3,
        });
        assert.deepEqual(
            monsterInventory(cappedBeforeShield.monster).map((obj) => [
                obj.otyp,
                obj.spe,
                obj.owornmask,
            ]),
            [
                [HELMET, 3, W_ARMH],
                [RING_MAIL, 0, W_ARM],
                [SPEAR, 0, 0],
            ],
        );

        const cappedBeforeBoots = createPlannedSoldier({
            armorEnchantments: [0, 0, 2],
            armorRounds: [{ direct: 1 }, { direct: 1 }],
            suppressedFromRound: 4,
        });
        assert.deepEqual(
            monsterInventory(cappedBeforeBoots.monster).map((obj) => [
                obj.otyp,
                obj.spe,
                obj.owornmask,
            ]),
            [
                [SMALL_SHIELD, 2, W_ARMS],
                [HELMET, 0, W_ARMH],
                [RING_MAIL, 0, W_ARM],
                [SPEAR, 0, 0],
            ],
        );
    });

test('soldier rations and rn2(13) preserve the generic-tail boundary', () => {
    const withRations = createPlannedSoldier({
        kRation: 0,
        cRation: 0,
    });
    const rationObjects = monsterInventory(withRations.monster).filter(
        (obj) => obj.otyp === K_RATION || obj.otyp === C_RATION,
    );
    assert.deepEqual(
        rationObjects.map((obj) => [obj.otyp, obj.quan]),
        [[C_RATION, 1], [K_RATION, 1]],
    );
    assert.ok(rationObjects[0].o_id > rationObjects[1].o_id);

    const earlyIndex = withRations.random.calls.findIndex(
        (call) => call.kind === 'rn2' && call.args[0] === 13,
    );
    assert.ok(earlyIndex >= 0);
    assert.deepEqual(
        withRations.random.calls.slice(earlyIndex).map(
            (call) => [call.kind, call.args, call.result],
        ),
        [
            ['rn2', [13], 1],
            ['rn2', [100], 99],
        ],
    );

    const continued = createPlannedSoldier({ earlyReturn: 0 });
    const continueIndex = continued.random.calls.findIndex(
        (call) => call.kind === 'rn2' && call.args[0] === 13,
    );
    assert.ok(continueIndex >= 0);
    assert.deepEqual(
        continued.random.calls.slice(continueIndex).map(
            (call) => [call.kind, call.args, call.result],
        ),
        [
            ['rn2', [13], 0],
            ['rn2', [50], 49],
            ['rn2', [100], 99],
            ['rn2', [100], 99],
        ],
    );
});

test('soldier NO_MINVENT and unsupported mercenary siblings stay drawless',
    () => {
        const state = initialLevelState();
        const random = recordingRandom();
        const soldier = makemon(
            state.mons[PM_SOLDIER],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH | NO_MINVENT,
            { state, random: random.random },
        );
        assert.equal(soldier.minvent, null);
        assert.equal(soldier.misc_worn_check, 0);
        assert.equal(
            random.calls.some(
                (call) => call.kind === 'rn2'
                    && (call.args[0] === 75 || call.args[0] === 13),
            ),
            false,
        );

        const siblingState = initialLevelState();
        const siblingRandom = recordingRandom();
        assert.equal(is_mercenary(siblingState.mons[PM_WATCHMAN]), true);
        assert.throws(
            () => makemon(
                siblingState.mons[PM_WATCHMAN],
                MON_X,
                MON_Y,
                MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH,
                { state: siblingState, random: siblingRandom.random },
            ),
            (error) => error instanceof UnsupportedMonsterCreationError
                && error.operation === `monster ${PM_WATCHMAN}`,
        );
        assert.deepEqual(siblingRandom.calls, []);
    });

test('runtime random soldier groups initialize members before parent inventory',
    async () => {
        const state = initialLevelState();
        state.in_mklev = false;
        state.u.ulevel = 30;
        leaveOnlyRandomSpecies(state, [PM_SOLDIER]);
        for (let x = 1; x < COLNO; ++x) {
            for (let y = 0; y < ROWNO; ++y) state.level.at(x, y).typ = ROOM;
        }
        const random = recordingRandom();
        const parent = await makemon_runtime(null, 0, 0, 0, {
            state,
            random: random.random,
            hooks: { newsym: () => {} },
        });
        const member = state.level.monlist;
        assert.notEqual(member, parent);
        assert.equal(member.nmon, parent);
        assert.equal(parent.nmon, null);
        assert.equal(member.data, state.mons[PM_SOLDIER]);
        assert.equal(parent.data, state.mons[PM_SOLDIER]);

        const memberInventory = monsterInventory(member);
        const parentInventory = monsterInventory(parent);
        for (const [name, monster, inventory] of [
            ['member', member, memberInventory],
            ['parent', parent, parentInventory],
        ]) {
            assert.deepEqual(
                inventory.map((obj) => [obj.otyp, obj.owornmask]),
                [
                    [LEATHER_GLOVES, W_ARMG],
                    [LOW_BOOTS, W_ARMF],
                    [SMALL_SHIELD, W_ARMS],
                    [HELMET, W_ARMH],
                    [RING_MAIL, W_ARM],
                    [SPEAR, 0],
                ],
                name,
            );
            assert.equal(
                monster.misc_worn_check,
                W_ARM | W_ARMH | W_ARMS | W_ARMF | W_ARMG,
                name,
            );
            for (const obj of inventory) {
                assert.equal(obj.where, OBJ_MINVENT, name);
                assert.equal(obj.ocarry, monster, name);
            }
        }
        assert.ok(
            Math.max(...memberInventory.map((obj) => obj.o_id))
                < Math.min(...parentInventory.map((obj) => obj.o_id)),
            'recursive member inventory must finish before parent inventory',
        );
    });

test('stone giants preserve both weapon gates and choices before inventory',
    () => {
        assert.equal(is_giant(initialLevelState().mons[PM_STONE_GIANT]), true);
        const cases = [
            {
                name: 'no boulder or heavy weapon',
                plan: { boulderGate: 0, heavyGate: 1 },
                expected: [],
            },
            {
                name: 'boulder without heavy weapon',
                plan: { boulderGate: 1, heavyGate: 1 },
                expected: [BOULDER],
            },
            {
                name: 'battle axe without boulder',
                plan: {
                    boulderGate: 0,
                    heavyGate: 0,
                    weaponChoice: 0,
                },
                expected: [BATTLE_AXE],
            },
            {
                name: 'two-handed sword after boulder',
                plan: {
                    boulderGate: 1,
                    heavyGate: 0,
                    weaponChoice: 1,
                },
                // mongets() prepends the later source object.
                expected: [TWO_HANDED_SWORD, BOULDER],
            },
        ];

        for (const scenario of cases) {
            const { monster, random } = createPlannedStoneGiant(scenario.plan);
            const inventory = monsterInventory(monster);
            assert.deepEqual(
                inventory.map((obj) => obj.otyp),
                scenario.expected,
                scenario.name,
            );
            for (const obj of inventory) {
                assert.equal(obj.where, OBJ_MINVENT, scenario.name);
                assert.equal(obj.ocarry, monster, scenario.name);
                assert.equal(obj.quan, 1, scenario.name);
                assert.equal(obj.owornmask, 0, scenario.name);
            }
            const boulderGate = random.calls.findIndex(
                (call, index) => index > 0
                    && call.kind === 'rn2' && call.args[0] === 2,
            );
            const heavyGate = random.calls.findIndex(
                (call) => call.kind === 'rn2' && call.args[0] === 5,
            );
            const offensiveGate = random.calls.findIndex(
                (call) => call.kind === 'rn2' && call.args[0] === 75,
            );
            const gemCount = random.calls.findIndex(
                (call, index) => index > offensiveGate
                    && call.kind === 'rn2' && call.args[0] === 2,
            );
            assert.ok(boulderGate >= 0, scenario.name);
            assert.ok(heavyGate > boulderGate, scenario.name);
            assert.ok(offensiveGate > heavyGate, scenario.name);
            assert.ok(gemCount > offensiveGate, scenario.name);
            assert.deepEqual(
                random.calls.slice(gemCount).map(
                    (call) => [call.kind, call.args, call.result],
                ),
                [
                    ['rn2', [2], 0],
                    ['rn2', [50], 49],
                    ['rn2', [100], 99],
                    ['rn2', [100], 99],
                ],
                `${scenario.name}: generic inventory and saddle continuation`,
            );
        }
    });

test('stone giant gemstone loops use weighted endpoints, quantities, and merges',
    () => {
        const distinct = createPlannedStoneGiant({
            heroLevel: 30,
            gemCount: 2,
            gemRolls: [1, 'last'],
            gemQuantities: [3, 4],
        });
        const distinctInventory = monsterInventory(distinct.monster);
        assert.deepEqual(
            distinctInventory.map((obj) => obj.otyp),
            [WORTHLESS_VIOLET_GLASS, DILITHIUM_CRYSTAL],
        );
        assert.deepEqual(
            distinctInventory.map((obj) => obj.quan),
            [4, 3],
        );
        assert.deepEqual(
            distinct.random.calls
                .filter((call) => call.kind === 'rnd'
                    && call.args[0] === 862)
                .map((call) => call.result),
            [1, 862],
            // objects.h contributes 171 across real gems and 691 across
            // glass, so rnd_class() selects over an inclusive total of 862.
            'rnd_class must retain the weighted inclusive endpoint choices',
        );
        assert.deepEqual(
            distinct.random.calls
                .filter((call) => call.kind === 'rn1'
                    && call.args[0] === 2 && call.args[1] === 3)
                .map((call) => call.result),
            [3, 4],
        );
        const countIndex = distinct.random.calls.findIndex(
            (call) => call.kind === 'rn2'
                && call.args[0] === 4 && call.result === 2,
        );
        assert.ok(countIndex >= 0);
        assert.deepEqual(
            distinct.random.calls.slice(countIndex).map(
                (call) => [call.kind, call.args, call.result],
            ),
            [
                ['rn2', [4], 2],
                ['rnd', [862], 1],
                ['rnd', [2], 1],
                ['rn1', [2, 3], 3],
                ['rnd', [862], 862],
                ['rnd', [2], 1],
                ['rn1', [2, 3], 4],
                ['rn2', [50], 49],
                ['rn2', [100], 99],
                ['rn2', [100], 99],
            ],
            'mksobj(FALSE,FALSE) stays drawless between selection and quantity',
        );
        for (const obj of distinctInventory) {
            assert.equal(obj.where, OBJ_MINVENT);
            assert.equal(obj.ocarry, distinct.monster);
            assert.equal(obj.owt, weight(obj, { state: distinct.state }));
        }
        assert.ok(distinctInventory[0].o_id > distinctInventory[1].o_id);

        const realMerge = createPlannedStoneGiant({
            heroLevel: 30,
            gemCount: 2,
            gemRolls: [1, 1],
            gemQuantities: [3, 4],
        });
        const [realGem] = monsterInventory(realMerge.monster);
        assert.equal(realGem.nobj, null);
        assert.equal(realGem.otyp, DILITHIUM_CRYSTAL);
        assert.equal(realGem.quan, 7);
        assert.equal(realGem.owt, weight(realGem, { state: realMerge.state }));
        assert.equal(realGem.o_id, 4,
            'the incoming undiscovered real gem has the higher oid adjustment');
        assert.equal(realMerge.state.context.ident, 5);

        const glassMerge = createPlannedStoneGiant({
            heroLevel: 30,
            gemCount: 2,
            gemRolls: ['last', 'last'],
            gemQuantities: [3, 4],
        });
        const [glass] = monsterInventory(glassMerge.monster);
        assert.equal(glass.nobj, null);
        assert.equal(glass.otyp, WORTHLESS_VIOLET_GLASS);
        assert.equal(glass.quan, 7);
        assert.equal(glass.owt, weight(glass, { state: glassMerge.state }));
        assert.equal(glass.o_id, 3,
            'glass keeps the earlier stack id because it has no oid adjustment');
        assert.equal(glassMerge.state.context.ident, 5);
    });

test('stone giants retain generic defensive, miscellaneous, wearing, and no gold',
    () => {
        const defensive = createPlannedStoneGiant({ defensiveGate: 0 });
        assert.deepEqual(
            monsterInventory(defensive.monster).map((obj) => obj.otyp),
            [SCR_TELEPORTATION],
        );

        const lifeSaving = createPlannedStoneGiant({
            miscGate: 0,
            lifeSavingGate: 0,
        });
        const [amulet] = monsterInventory(lifeSaving.monster);
        assert.equal(amulet.otyp, AMULET_OF_LIFE_SAVING);
        assert.equal(amulet.where, OBJ_MINVENT);
        assert.equal(amulet.ocarry, lifeSaving.monster);
        assert.equal(amulet.owornmask, W_AMUL);
        assert.equal(lifeSaving.monster.misc_worn_check, W_AMUL);
        assert.equal(
            lifeSaving.random.calls.filter(
                (call) => call.kind === 'rn2' && call.args[0] === 5,
            ).length,
            1,
            'M2_JEWELS alone must not take the likes_gold() gate',
        );
        assert.deepEqual(
            lifeSaving.random.calls
                .filter((call) => call.kind === 'rn2'
                    && call.args[0] === 100)
                .map((call) => call.result),
            [0, 99],
            'miscellaneous creation precedes the unconditional saddle roll',
        );
    });

test('the giant gemstone predicate remains is_giant rather than the glyph alone',
    () => {
        const result = createPlannedStoneGiant({
            heroLevel: 30,
            gemCount: 2,
            prepareState: (state) => {
                const source = state.mons[PM_STONE_GIANT];
                state.mons[PM_STONE_GIANT] = {
                    ...source,
                    mflags2: source.mflags2 & ~M2_GIANT,
                };
            },
        });
        assert.equal(is_giant(result.monster.data), false);
        assert.deepEqual(monsterInventory(result.monster), []);
        assert.equal(
            result.random.calls.some(
                (call) => call.kind === 'rn2' && call.args[0] === 4,
            ),
            false,
            'non-giant S_GIANT skips the gemstone count draw',
        );
    });

test('stone giant NO_MINVENT and later giant families stop before inventory RNG',
    () => {
        const suppressed = createPlannedStoneGiant({}, NO_MINVENT);
        assert.equal(suppressed.monster.minvent, null);
        assert.equal(suppressed.monster.misc_worn_check, 0);
        assert.equal(
            suppressed.random.calls.some(
                (call) => call.kind === 'rn2'
                    && [75, 50, 100].includes(call.args[0]),
            ),
            false,
        );

        for (const mndx of [
            PM_GIANT,
            PM_HILL_GIANT,
            PM_FIRE_GIANT,
            PM_FROST_GIANT,
            PM_ETTIN,
            PM_MINOTAUR,
        ]) {
            const state = initialLevelState();
            const random = recordingRandom();
            assert.throws(
                () => makemon(
                    state.mons[mndx],
                    MON_X,
                    MON_Y,
                    MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH,
                    { state, random: random.random },
                ),
                (error) => error instanceof UnsupportedMonsterCreationError
                    && error.operation === `monster ${mndx}`,
                state.mons[mndx].pmnames[2],
            );
            assert.deepEqual(random.calls, [], state.mons[mndx].pmnames[2]);
            assert.equal(state.level.monlist, null);
            assert.equal(state.level.monsters[MON_X][MON_Y], null);
            assert.equal(state.mvitals[mndx].born, 0);
            assert.equal(state.context.ident, 2);
        }
    });

test('minotaurs use their source inventory arm before generic giant items',
    () => {
        const state = initialLevelState();
        const random = scriptedRandom([
            step('rnd', [2], 1), // next_ident()
            step('d', [14, 8], 14), // adj_lev() at D:1
            step('rn2', [2], 1), // random corpse gender
            step('rn2', [8], 7), // no wand of digging
            step('rn2', [50], 49), // no defensive item
            step('rn2', [100], 99), // no miscellaneous item
            step('rn2', [100], 99), // no saddle
        ]);

        const monster = makemon(
            state.mons[PM_MINOTAUR],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH,
            {
                state,
                random: random.random,
                _fillEmptyMazeMinotaur: true,
            },
        );
        random.assertExhausted();

        assert.equal(monster.data.pmidx, PM_MINOTAUR);
        assert.deepEqual(
            monsterInventory(monster),
            [],
            'minotaurs must not take the generic gemstone arm',
        );
    });

test('minotaurs receive a wand of digging from either source gate', () => {
    const savedEarthLevel = game.earth_level;
    try {
        for (const earthLevel of [false, true]) {
            const state = initialLevelState();
            game.earth_level = earthLevel
                ? { dnum: 0, dlevel: 1 }
                : null;
            const random = recordingRandom({
                rn2Result: (bound) => bound === 8
                    ? earthLevel ? 7 : 0
                    : Math.max(0, bound - 1),
            });

            const monster = makemon(
                state.mons[PM_MINOTAUR],
                MON_X,
                MON_Y,
                MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH,
                {
                    state,
                    random: random.random,
                    _fillEmptyMazeMinotaur: true,
                },
            );

            assert.equal(monster.minvent.otyp, WAN_DIGGING, earthLevel);
            const wandGate = random.calls.findIndex(
                (call) => call.kind === 'rn2' && call.args[0] === 8,
            );
            assert.ok(wandGate >= 0, earthLevel);
            assert.equal(
                random.calls[wandGate].result,
                earthLevel ? 7 : 0,
                earthLevel,
            );
        }
    } finally {
        game.earth_level = savedEarthLevel;
    }
});

test('runtime random stone giant groups finish members before parent inventory',
    async () => {
        const state = initialLevelState();
        state.in_mklev = false;
        state.u.ulevel = 30;
        leaveOnlyRandomSpecies(state, [PM_STONE_GIANT]);
        for (let x = 1; x < COLNO; ++x) {
            for (let y = 0; y < ROWNO; ++y) state.level.at(x, y).typ = ROOM;
        }
        const random = recordingRandom();
        const parent = await makemon_runtime(null, 0, 0, 0, {
            state,
            random: random.random,
            hooks: { newsym: () => {} },
        });
        const member = state.level.monlist;
        assert.notEqual(member, parent);
        assert.equal(member.nmon, parent);
        assert.equal(parent.nmon, null);
        assert.equal(member.data, state.mons[PM_STONE_GIANT]);
        assert.equal(parent.data, state.mons[PM_STONE_GIANT]);

        const memberInventory = monsterInventory(member);
        const parentInventory = monsterInventory(parent);
        for (const [name, monster, inventory] of [
            ['member', member, memberInventory],
            ['parent', parent, parentInventory],
        ]) {
            assert.deepEqual(
                inventory.map((obj) => [obj.otyp, obj.quan]),
                [[DILITHIUM_CRYSTAL, 9], [BOULDER, 1]],
                name,
            );
            assert.equal(monster.mgenmklev, false, name);
            assert.equal(state.level.monsters[monster.mx][monster.my], monster);
            for (const obj of inventory) {
                assert.equal(obj.where, OBJ_MINVENT, name);
                assert.equal(obj.ocarry, monster, name);
                assert.equal(obj.owt, weight(obj, { state }), name);
            }
        }
        assert.ok(
            Math.max(...memberInventory.map((obj) => obj.o_id))
                < Math.min(...parentInventory.map((obj) => obj.o_id)),
            'recursive member inventory must finish before parent inventory',
        );
    });

// C ref: makemon.c:180-185. Ettins (S_GIANT, pmidx PM_ETTIN) receive a CLUB
// instead of BOULDER, and skip the heavy-weapon rn2(5) gate that other giants
// use.  This arm fires only when rndmonst selects an ettin during level
// generation (ettin difficulty 10 exceeds the D:5 reservoir ceiling of 9).
test('ettins receive CLUB instead of BOULDER and skip the heavy-weapon gate',
    () => {
        const state = initialLevelState();
        // Ettins share S_GIANT but lack M2_GIANT, so is_giant is false and
        // the gem loop in m_initinv does not apply.
        assert.equal(is_giant(state.mons[PM_ETTIN]), false);
        const random = recordingRandom();
        // _rndmonMklev bypasses assertSupportedSpecies, matching the path
        // rndmonst takes during mklev for species outside the reservoir
        // allowlist.
        const monster = makemon(
            state.mons[PM_ETTIN],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOGRP | MM_NOCOUNTBIRTH,
            { state, random: random.random, _rndmonMklev: true },
        );

        assert.ok(monster, 'ettin should be created');
        // The recording random's rn2(2) returns 1 (truthy), so the boulder/
        // club gate fires.  Ettin gets CLUB where stone giant gets BOULDER.
        const inventory = monsterInventory(monster);
        const clubs = inventory.filter((obj) => obj.otyp === CLUB);
        assert.ok(clubs.length > 0, 'ettin must have at least one club');
        const boulders = inventory.filter((obj) => obj.otyp === BOULDER);
        assert.equal(boulders.length, 0, 'ettin must not have a boulder');

        // The heavy-weapon gate rn2(5) must not appear: C guards it with
        // ptr->mnum != PM_ETTIN.
        const heavyWeaponGate = random.calls.find(
            (call) => call.kind === 'rn2' && call.args[0] === 5
                && random.calls.indexOf(call)
                    > random.calls.findIndex(
                        (c) => c.kind === 'rn2' && c.args[0] === 2,
                    ),
        );
        assert.equal(
            heavyWeaponGate,
            undefined,
            'ettin must skip the rn2(5) heavy-weapon gate',
        );
    });

test('hobbits receive each source weapon arm before the generic item gates', () => {
    const cases = [
        {
            name: 'dagger',
            arm: 0,
            expected: [DAGGER],
        },
        {
            name: 'elven dagger',
            arm: 1,
            expected: [ELVEN_DAGGER],
        },
        {
            name: 'sling with flint',
            arm: 2,
            ammoRoll: 0,
            expected: [FLINT, SLING],
        },
        {
            name: 'sling with rocks',
            arm: 2,
            ammoRoll: 1,
            expected: [ROCK, SLING],
        },
    ];

    for (const scenario of cases) {
        const state = initialLevelState();
        let weaponChoicePending = true;
        let ammoChoicePending = scenario.arm === 2;
        const random = recordingRandom({
            rn2Result: (bound) => {
                if (bound === 3 && weaponChoicePending) {
                    weaponChoicePending = false;
                    return scenario.arm;
                }
                if (bound === 4 && ammoChoicePending) {
                    ammoChoicePending = false;
                    return scenario.ammoRoll;
                }
                return Math.max(0, bound - 1);
            },
        });
        const monster = makemon(
            state.mons[PM_HOBBIT],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOCOUNTBIRTH,
            { state, random: random.random },
        );
        const inventory = monsterInventory(monster);

        assert.deepEqual(
            inventory.map((obj) => obj.otyp),
            scenario.expected,
            scenario.name,
        );
        for (const obj of inventory) {
            assert.equal(obj.where, OBJ_MINVENT, scenario.name);
            assert.equal(obj.ocarry, monster, scenario.name);
            assert.equal(obj.owornmask, 0, scenario.name);
        }
        if (scenario.arm === 2) {
            assert.equal(inventory[0].quan, 3, scenario.name);
            assert.equal(
                inventory[0].owt,
                state.objects[inventory[0].otyp].oc_weight * 3,
                scenario.name,
            );
            assert.ok(
                random.calls.some(
                    (call) => call.kind === 'rn1'
                        && call.args[0] === 6 && call.args[1] === 3,
                ),
                `${scenario.name}: m_initthrow quantity range`,
            );
        }

        const offensiveGate = random.calls.findIndex(
            (call) => call.kind === 'rn2' && call.args[0] === 75,
        );
        assert.ok(offensiveGate >= 2, scenario.name);
        assert.deepEqual(
            random.calls
                .slice(offensiveGate - 2, offensiveGate)
                .map((call) => [call.kind, call.args, call.result]),
            [
                ['rn2', [10], 9],
                ['rn2', [10], 9],
            ],
            `${scenario.name}: ordered coat and cloak gates`,
        );
        assert.deepEqual(
            random.calls
                .slice(offensiveGate)
                .map((call) => [call.kind, call.args]),
            [
                ['rn2', [75]],
                ['rn2', [50]],
                ['rn2', [100]],
                ['rn2', [100]],
            ],
            `${scenario.name}: generic inventory continuation`,
        );
    }
});

test('hobbit coat gate creates an owned elven suit and wears it', () => {
    const state = initialLevelState();
    let phase = 'weapon-choice';
    let coatObjectTenDraws = 0;
    const random = recordingRandom({
        rn2Result: (bound) => {
            if (phase === 'weapon-choice' && bound === 3) {
                phase = 'weapon-object';
                return 0;
            }
            if (phase === 'weapon-object' && bound === 1000) {
                phase = 'coat-gate';
                return bound - 1;
            }
            if (phase === 'coat-gate' && bound === 10) {
                phase = 'coat-object';
                return 0;
            }
            if (phase === 'coat-object' && bound === 10) {
                ++coatObjectTenDraws;
                if (coatObjectTenDraws === 4) {
                    phase = 'generic-tail';
                }
                return bound - 1;
            }
            return Math.max(0, bound - 1);
        },
    });
    const monster = makemon(
        state.mons[PM_HOBBIT],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOCOUNTBIRTH,
        { state, random: random.random },
    );
    const inventory = monsterInventory(monster);
    const coat = inventory.find((obj) => obj.otyp === ELVEN_MITHRIL_COAT);

    assert.equal(phase, 'generic-tail');
    assert.deepEqual(inventory.map((obj) => obj.otyp), [
        ELVEN_MITHRIL_COAT,
        DAGGER,
    ]);
    assert.equal(coat.where, OBJ_MINVENT);
    assert.equal(coat.ocarry, monster);
    assert.equal(coat.quan, 1);
    assert.equal(coat.owornmask, W_ARM);
    assert.equal(monster.misc_worn_check, W_ARM);
});

test('hobbit cloak gate follows a rejected coat and equips its own slot', () => {
    const state = initialLevelState();
    let phase = 'weapon-choice';
    let cloakObjectTenDraws = 0;
    const random = recordingRandom({
        rn2Result: (bound) => {
            if (phase === 'weapon-choice' && bound === 3) {
                phase = 'weapon-object';
                return 0;
            }
            if (phase === 'weapon-object' && bound === 1000) {
                phase = 'coat-gate';
                return bound - 1;
            }
            if (phase === 'coat-gate' && bound === 10) {
                phase = 'cloak-gate';
                return bound - 1;
            }
            if (phase === 'cloak-gate' && bound === 10) {
                phase = 'cloak-object';
                return 0;
            }
            if (phase === 'cloak-object' && bound === 10) {
                ++cloakObjectTenDraws;
                if (cloakObjectTenDraws === 3) phase = 'generic-tail';
                return bound - 1;
            }
            return Math.max(0, bound - 1);
        },
    });
    const monster = makemon(
        state.mons[PM_HOBBIT],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOCOUNTBIRTH,
        { state, random: random.random },
    );
    const inventory = monsterInventory(monster);
    const cloak = inventory.find((obj) => obj.otyp === DWARVISH_CLOAK);

    assert.equal(phase, 'generic-tail');
    assert.deepEqual(inventory.map((obj) => obj.otyp), [
        DWARVISH_CLOAK,
        DAGGER,
    ]);
    assert.equal(cloak.where, OBJ_MINVENT);
    assert.equal(cloak.ocarry, monster);
    assert.equal(cloak.quan, 1);
    assert.equal(cloak.owornmask, W_ARMC);
    assert.equal(monster.misc_worn_check, W_ARMC);
});

test('racial_exception matches worn.c elven armor membership', () => {
    const state = initialLevelState();
    const hobbit = newMonster({ data: state.mons[PM_HOBBIT] });
    const dwarf = newMonster({ data: state.mons[PM_DWARF] });
    const elvenArmor = [
        ELVEN_LEATHER_HELM,
        ELVEN_MITHRIL_COAT,
        ELVEN_CLOAK,
        ELVEN_SHIELD,
        ELVEN_BOOTS,
    ];

    for (const otyp of elvenArmor) {
        const obj = mksobj(otyp, false, false, {
            state,
            random: FIXED_OBJECT_ID_RANDOM,
        });
        assert.equal(racial_exception(hobbit, obj), 1, otyp);
        assert.equal(racial_exception(dwarf, obj), 0, otyp);
    }
    const nonElven = mksobj(DWARVISH_MITHRIL_COAT, false, false, {
        state,
        random: FIXED_OBJECT_ID_RANDOM,
    });
    assert.equal(racial_exception(hobbit, nonElven), 0);
});

test('every Statuary reservoir species completes creation', () => {
    const catalog = initialLevelState().mons.slice(0, SPECIAL_PM).filter(
        (species) => species.difficulty >= 3
            && species.difficulty <= 7
            && (species.geno & G_FREQ)
            && !(species.geno & (G_NOGEN | G_UNIQ | G_HELL)),
    );
    assert.equal(catalog.length, 105);

    for (const species of catalog) {
        const state = initialLevelState();
        init_objects(state, () => 0);
        light_globals_init(state);
        timeout_globals_init(state);
        const random = recordingRandom();
        const monster = makemon(
            state.mons[species.pmidx],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOCOUNTBIRTH,
            {
                state,
                random: random.random,
                hooks: {
                    artifactCount: () => 0,
                    newsym: () => {},
                },
            },
        );
        if (species.pmidx === PM_CHAMELEON) {
            assert.equal(monster.cham, PM_CHAMELEON, species.pmnames[2]);
            assert.notEqual(monster.mnum, PM_CHAMELEON, species.pmnames[2]);
        } else {
            assert.equal(monster.mnum, species.pmidx, species.pmnames[2]);
        }
    }
});

test('gnome ruler gets the general weapon table and prince quality floor', () => {
    const state = initialLevelState();
    const random = recordingRandom({
        rndResult: (bound) => bound === 10 ? 5 : 1,
    });
    const monster = makemon(
        state.mons[PM_GNOME_RULER],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOCOUNTBIRTH,
        { state, random: random.random },
    );

    assert.equal(monster.minvent.otyp, AKLYS);
    assert.equal(monster.minvent.spe, 1);
    assert.ok(random.calls.some(
        (call) => call.kind === 'rnd' && call.args[0] === 10,
    ));
});

test('Uruk-hai equipment produces a poisoned three-arrow stack with recomputed weight', () => {
    const state = initialLevelState();
    const random = recordingRandom({
        rn2Result: (bound) => {
            // Zero selects the captain's Uruk-hai branch and passes the
            // two- and three-way arrow quantity and poison decisions.
            if (bound === 2 || bound === 3) return 0;
            return Math.max(0, bound - 1);
        },
    });
    const monster = makemon(
        state.mons[PM_ORC_CAPTAIN],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOCOUNTBIRTH,
        { state, random: random.random },
    );
    const inventory = monsterInventory(monster);
    const arrows = inventory.find((obj) => obj.otyp === ORCISH_ARROW);

    assert.ok(inventory.some((obj) => obj.otyp === ORCISH_BOW));
    assert.ok(arrows);
    assert.equal(arrows.opoisoned, true);
    assert.equal(arrows.quan, 3);
    assert.equal(arrows.owt, 3);
});

test('non-nymph armed monsters receive both rare item classes in source order', () => {
    const state = initialLevelState();
    const random = recordingRandom({
        rn2Result: (bound) => {
            if (bound === 75 || bound === 50) return 0;
            return Math.max(0, bound - 1);
        },
    });
    const monster = makemon(
        state.mons[PM_BUGBEAR],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOCOUNTBIRTH,
        { state, random: random.random },
    );

    assert.deepEqual(
        monsterInventory(monster).map((obj) => obj.otyp),
        [SCR_CREATE_MONSTER, WAN_MAGIC_MISSILE],
    );
    const offensiveGate = random.calls.findIndex(
        (call) => call.kind === 'rn2' && call.args[0] === 75,
    );
    const defensiveGate = random.calls.findIndex(
        (call) => call.kind === 'rn2' && call.args[0] === 50,
    );
    assert.ok(offensiveGate >= 0);
    assert.ok(defensiveGate > offensiveGate);
});

test('mummies wear wrapping and leprechauns sleep with existing gold', () => {
    const cases = [
        {
            mndx: PM_HUMAN_MUMMY,
            expectedType: MUMMY_WRAPPING,
            expectedMask: W_ARMC,
        },
        {
            mndx: PM_LEPRECHAUN,
            expectedType: GOLD_PIECE,
            expectedMask: 0,
        },
    ];
    for (const { mndx, expectedType, expectedMask } of cases) {
        const state = initialLevelState();
        const random = recordingRandom();
        const monster = makemon(
            state.mons[mndx],
            MON_X,
            MON_Y,
            MM_ANGRY | MM_NOCOUNTBIRTH,
            { state, random: random.random },
        );
        assert.equal(monster.minvent.otyp, expectedType);
        assert.equal(monster.minvent.owornmask, expectedMask);
        if (mndx === PM_LEPRECHAUN) {
            assert.equal(monster.msleeping, true);
            assert.equal(monster.minvent.quan, 1);
            assert.equal(
                random.calls.some(
                    (call) => call.kind === 'rn2' && call.args[0] === 5,
                ),
                false,
            );
        }
    }
});

test('dark-level gnome candle starts burning after monster pickup', () => {
    const state = initialLevelState();
    light_globals_init(state);
    timeout_globals_init(state);
    const random = recordingRandom({
        rn2Result: (bound) => bound === 60
            ? 0
            : Math.max(0, bound - 1),
    });
    const monster = makemon(
        state.mons[PM_GNOMISH_WIZARD],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOCOUNTBIRTH,
        { state, random: random.random },
    );

    const candle = monster.minvent;
    assert.equal(candle.otyp, TALLOW_CANDLE);
    assert.equal(candle.quan, 1);
    assert.equal(candle.lamplit, true);
    assert.equal(candle.timed, 1);
    assert.equal(state.gt.timer_base.func_index, BURN_OBJECT);
    assert.equal(state.gt.timer_base.arg, candle);
    assert.equal(state.gl.light_base.id, candle);
});

test('greedy unarmed monsters receive gold after the rare item gates', () => {
    const state = initialLevelState();
    const random = recordingRandom({
        rn2Result: (bound) => bound === 5
            ? 0
            : Math.max(0, bound - 1),
    });
    const monster = makemon(
        state.mons[PM_ROCK_MOLE],
        MON_X,
        MON_Y,
        MM_ANGRY | MM_NOCOUNTBIRTH,
        { state, random: random.random },
    );

    assert.equal(monster.minvent.otyp, GOLD_PIECE);
    const miscGate = random.calls.findIndex(
        (call) => call.kind === 'rn2' && call.args[0] === 100,
    );
    const goldGate = random.calls.findIndex(
        (call) => call.kind === 'rn2' && call.args[0] === 5,
    );
    assert.ok(miscGate >= 0);
    assert.ok(goldGate > miscGate);
});

test('goblin creates helm before dagger, then wears the prepended helm', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        ...basicCreationSteps(),
        // Goblin's first rn2(2) selects the helm.
        step('rn2', [2], 1),
        step('rnd', [2], 1), // helm object id
        // Armor BUC initialization: ordinary helm reaches all three gates.
        step('rn2', [10], 1),
        step('rn2', [11], 1),
        step('rn2', [10], 1),
        step('rn2', [10], 1),
        // Iron erosion generation outside the initial-inventory phase.
        step('rn2', [100], 1),
        step('rn2', [80], 1),
        step('rn2', [80], 1),
        step('rn2', [1000], 1),
        // Goblin's second rn2(2) selects the dagger. The goblin-specific
        // ternary then short-circuits without another item-choice draw.
        step('rn2', [2], 1),
        step('rnd', [2], 1), // dagger object id
        // Ordinary, non-multigen weapon BUC initialization.
        step('rn2', [11], 1),
        step('rn2', [10], 1),
        step('rn2', [10], 1),
        // Dagger erosion generation.
        step('rn2', [100], 1),
        step('rn2', [80], 1),
        step('rn2', [80], 1),
        step('rn2', [1000], 1),
        // Level zero cannot receive the rare offensive item.
        step('rn2', [75], 1),
        ...ordinaryInventoryTail(),
    ]);
    const monster = makemon(
        state.mons[PM_GOBLIN],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    const dagger = monster.minvent;
    const helm = dagger.nobj;
    assert.deepEqual(
        [dagger.otyp, dagger.o_id, helm.otyp, helm.o_id],
        [ORCISH_DAGGER, 4, ORCISH_HELM, 3],
    );
    for (const obj of [dagger, helm]) {
        assert.equal(obj.where, OBJ_MINVENT);
        assert.equal(obj.ocarry, monster);
    }
    assert.equal(dagger.owornmask, 0);
    assert.equal(helm.owornmask, W_ARMH);
    assert.equal(monster.misc_worn_check, W_ARMH);
    assert.equal(monster.mw, null);
    assert.equal(state.context.ident, 5);
});

test('kobold keeps both dart quantity draws and recomputes final weight', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        ...basicCreationSteps(),
        step('rn2', [4], 0), // select the one-in-four dart branch
        step('rnd', [2], 1), // dart object id
        // mksobj's multigen quantity is observable even though m_initthrow
        // replaces it with the later 3..14 stack size.
        step('rn1', [6, 6], 7),
        step('rn2', [11], 1),
        step('rn2', [10], 1),
        step('rn2', [10], 1),
        step('rn2', [100], 1), // multigen poison gate
        // Iron erosion generation.
        step('rn2', [100], 1),
        step('rn2', [80], 1),
        step('rn2', [80], 1),
        step('rn2', [1000], 1),
        step('rn1', [12, 3], 4), // final m_initthrow quantity
        step('rn2', [75], 1),
        ...ordinaryInventoryTail(),
    ]);
    const monster = makemon(
        state.mons[PM_KOBOLD],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    const darts = monster.minvent;
    assert.equal(darts.otyp, DART);
    assert.equal(darts.o_id, 3);
    assert.equal(darts.quan, 4);
    assert.equal(darts.owt, 4);
    assert.equal(darts.where, OBJ_MINVENT);
    assert.equal(darts.ocarry, monster);
    assert.equal(darts.nobj, null);
    assert.equal(state.context.ident, 4);
});

test('random MM_NOGRP creation uses the full level-one reservoir', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        // These cumulative weights are the nine viable level-one records in
        // mons[] order. Zero replaces the reservoir at every record, ending
        // at newt without a separate final choice draw.
        ...[3, 4, 5, 7, 8, 11, 15, 16, 21]
            .map((bound) => step('rn2', [bound], 0)),
        step('rnd', [2], 1), // next_ident advances context.ident from 2 to 3
        step('rnd', [4], 1), // level-zero HP rolls 1, then rises to 2
        step('rn2', [2], 0), // gender leaves the newt female flag false
        step('rn2', [50], 0), // level 0 fails the defensive-item gate
        step('rn2', [100], 0), // level 0 fails the miscellaneous-item gate
        step('rn2', [100], 0), // saddle hits, but a newt is non-domestic
    ]);
    const monster = makemon(
        null,
        MON_X,
        MON_Y,
        MM_NOGRP,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.equal(monster.mnum, PM_NEWT);
    assert.equal(state.mvitals[PM_NEWT].born, 1);
});

test('goblin attitude honors an orc hero before inventory draws', () => {
    const state = initialLevelState();
    state.u.ualign.type = -1;
    state.urace = { mnum: PM_ORC, lovemask: 0, hatemask: 0 };
    const random = scriptedRandom([
        ...basicCreationSteps(),
        // A co-aligned goblin is peaceful only when both source draws are
        // nonzero: 16 + alignment record, then 2 + abs(-3).
        step('rn2', [16], 1),
        step('rn2', [5], 1),
        step('rn2', [2], 0), // no helm
        step('rn2', [2], 0), // no dagger
        step('rn2', [75], 1),
        ...ordinaryInventoryTail(),
    ]);
    const monster = makemon(
        state.mons[PM_GOBLIN],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.equal(monster.mpeaceful, true);
    assert.equal(monster.malign, -9);
    assert.equal(monster.minvent, null);
});

test('creation flags suppress their source draws and mutations', () => {
    const state = initialLevelState();
    const random = scriptedRandom([
        step('rnd', [2], 1), // monster id
        step('rnd', [4], 1), // level-zero hit points
    ]);
    const monster = makemon(
        state.mons[PM_GOBLIN],
        MON_X,
        MON_Y,
        MM_ASLEEP
            | MM_ANGRY
            | MM_FEMALE
            | MM_NOCOUNTBIRTH
            | NO_MINVENT,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.equal(monster.msleeping, true);
    assert.equal(monster.mpeaceful, false);
    assert.equal(monster.female, true);
    assert.equal(monster.minvent, null);
    assert.equal(state.mvitals[PM_GOBLIN].born, 0);
});

test('Mausoleum preflight admits every reachable species and rejects its boundaries', () => {
    const inclusiveRange = (first, last) => Array.from(
        { length: last - first + 1 },
        (_, index) => first + index,
    );
    const admitted = [
        ...inclusiveRange(PM_LICH, PM_DEMILICH),
        ...inclusiveRange(PM_KOBOLD_MUMMY, PM_GIANT_MUMMY),
        ...inclusiveRange(PM_VAMPIRE, PM_VAMPIRE_LEADER),
        ...inclusiveRange(PM_KOBOLD_ZOMBIE, PM_GIANT_ZOMBIE),
    ];
    assert.equal(new Set(admitted).size, 21);

    for (const mndx of admitted) {
        const state = initialLevelState();
        const random = recordingRandom();
        const monster = makemon(
            state.mons[mndx],
            MON_X,
            MON_Y,
            MM_NOGRP | NO_MINVENT,
            { state, random: random.random },
        );
        const naturalForm = monster.cham === NON_PM
            ? monster.mnum : monster.cham;
        assert.equal(naturalForm, mndx, state.mons[mndx].pmnames[2]);
        assert.equal(monster.minvent, null, state.mons[mndx].pmnames[2]);
    }

    for (const mndx of [PM_MASTER_LICH, PM_ARCH_LICH, PM_SKELETON]) {
        const state = initialLevelState();
        const random = scriptedRandom([]);
        assert.throws(
            () => makemon(
                state.mons[mndx],
                MON_X,
                MON_Y,
                MM_NOGRP | NO_MINVENT,
                { state, random: random.random },
            ),
            UnsupportedMonsterCreationError,
            state.mons[mndx].pmnames[2],
        );
        random.assertExhausted();
    }
});

test('runtime creation on a non-main-dungeon level fails before RNG or state', () => {
    // During mklev, monster creation works on any dungeon branch -- Quest,
    // Mines, Sokoban, etc. -- because the level template and rndmonst()
    // place whatever species the level definition requests.  Outside mklev
    // (runtime creation), non-main-dungeon levels still fail because the
    // runtime call shapes require mainDungeonLevel.
    const cases = [
        {
            name: 'another dungeon at local level one',
            level: { dnum: 1, dlevel: 1 },
        },
        {
            name: 'another dungeon at a deeper level',
            level: { dnum: 2, dlevel: 3 },
        },
    ];

    for (const scenario of cases) {
        const state = initialLevelState();
        state.in_mklev = false;
        state.u.uz = scenario.level;
        const random = scriptedRandom([]);

        assert.throws(
            () => makemon(
                null,
                MON_X,
                MON_Y,
                MM_NOGRP | NO_MINVENT,
                { state, random: random.random },
            ),
            UnsupportedMonsterCreationError,
            scenario.name,
        );
        random.assertExhausted();
        assert.equal(state.level.monlist, null, scenario.name);
        assert.equal(state.level.monsters[MON_X][MON_Y], null, scenario.name);
        assert.equal(state.mvitals[PM_NEWT].born, 0, scenario.name);
        assert.equal(state.context.ident, 2, scenario.name);
    }
});

test('NO_MINVENT leaves migrating object queues untouched', () => {
    for (const queueOwner of ['state', 'gm']) {
        const state = initialLevelState();
        const tail = { nobj: null };
        const migrating = { nobj: tail };
        if (queueOwner === 'state') state.migrating_objs = migrating;
        else state.gm = { migrating_objs: migrating };
        const random = scriptedRandom(basicCreationSteps());

        const monster = makemon(
            state.mons[PM_NEWT],
            MON_X,
            MON_Y,
            NO_MINVENT,
            { state, random: random.random },
        );
        random.assertExhausted();

        assert.equal(monster.minvent, null);
        assert.equal(state.level.monlist, monster);
        assert.equal(state.mvitals[PM_NEWT].born, 1);
        assert.equal(state.context.ident, 3);
        if (queueOwner === 'state')
            assert.equal(state.migrating_objs, migrating);
        else
            assert.equal(state.gm.migrating_objs, migrating);
        assert.equal(migrating.nobj, tail);
        assert.equal(tail.nobj, null);
    }
});

test('inventory-enabled creation rejects migrating object delivery', () => {
    for (const queueOwner of ['state', 'gm']) {
        const state = initialLevelState();
        const tail = { nobj: null };
        const migrating = { nobj: tail };
        if (queueOwner === 'state') state.migrating_objs = migrating;
        else state.gm = { migrating_objs: migrating };
        const random = scriptedRandom([]);

        assert.throws(
            () => makemon(
                state.mons[PM_NEWT],
                MON_X,
                MON_Y,
                0,
                { state, random: random.random },
            ),
            UnsupportedMonsterCreationError,
            queueOwner,
        );
        random.assertExhausted();
        assert.equal(state.level.monlist, null);
        assert.equal(state.level.monsters[MON_X][MON_Y], null);
        assert.equal(state.mvitals[PM_NEWT].born, 0);
        assert.equal(state.context.ident, 2);
        assert.equal(migrating.nobj, tail);
        assert.equal(tail.nobj, null);
    }
});

test('unsupported creation modes fail before consuming RNG or state', () => {
    const state = initialLevelState();
    const random = scriptedRandom([]);

    // Random monster groups without MM_NOGRP are unsupported at runtime
    // (outside mklev). During mklev, rndmonst-chosen species may form
    // groups, so null-ptr without MM_NOGRP is a valid call shape there.
    state.in_mklev = false;
    assert.throws(
        () => makemon(null, MON_X, MON_Y, 0, {
            state,
            random: random.random,
        }),
        UnsupportedMonsterCreationError,
    );
    state.in_mklev = true;
    state.rogue_level = { ...state.u.uz };
    assert.throws(
        () => makemon(state.mons[PM_CHAMELEON], MON_X, MON_Y, MM_NOGRP, {
            state,
            random: random.random,
        }),
        UnsupportedMonsterCreationError,
    );
    random.assertExhausted();
    assert.equal(state.level.monlist, null);
    assert.equal(state.context.ident, 2);
});

test('source no-creation exits leave the square and identity untouched', () => {
    const disabled = initialLevelState();
    disabled.level.flags.rndmongen = false;
    const disabledRandom = scriptedRandom([]);
    assert.equal(
        makemon(null, MON_X, MON_Y, MM_NOGRP, {
            state: disabled,
            random: disabledRandom.random,
        }),
        null,
    );
    disabledRandom.assertExhausted();

    const genocided = initialLevelState();
    genocided.mvitals[PM_NEWT].mvflags |= G_GENOD;
    const genocidedRandom = scriptedRandom([]);
    assert.equal(
        makemon(genocided.mons[PM_NEWT], MON_X, MON_Y, 0, {
            state: genocided,
            random: genocidedRandom.random,
        }),
        null,
    );
    genocidedRandom.assertExhausted();

    for (const state of [disabled, genocided]) {
        assert.equal(state.level.monlist, null);
        assert.equal(state.context.ident, 2);
        assert.equal(state.level.monsters[MON_X][MON_Y], null);
    }
});

test('elf racial hostility cannot be undone by goblin alignment', () => {
    const state = initialLevelState();
    state.u.ualign.type = -1;
    state.urace = {
        mnum: PM_ELF,
        lovemask: 0,
        hatemask: M2_ORC,
    };
    const random = scriptedRandom([
        ...basicCreationSteps(),
        step('rn2', [2], 0), // no helm
        step('rn2', [2], 0), // no dagger
        step('rn2', [75], 1),
        ...ordinaryInventoryTail(),
    ]);
    const monster = makemon(
        state.mons[PM_GOBLIN],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.equal(monster.mpeaceful, false);
    assert.equal(monster.malign, 3);
});

// makemon.c set_mimic_sym():2467-2486, the arm a mimic standing inside a shop
// takes. shknam.c mkshobj_at() is the caller that reaches it: it turns 2% of a
// D:2 shop's stocked squares into a mimic instead of an object.
//
// The room's rtype is what selects the arm, so the fixture sets it directly
// rather than running mkshop(); `shopIndex` is C's `rt - SHOPBASE`, the row of
// shknam.c shtypes[] the room sells from.
function shopLevelState(shopIndex, dlevel = 2) {
    const state = initialLevelState();
    state.u.uz = { dnum: 0, dlevel };
    state.level.at(MON_X, MON_Y).roomno = ROOMOFFSET;
    state.level.rooms = [{ rtype: SHOPBASE + shopIndex }];
    state.level.nroom = 1;
    init_objects(state, () => 0);
    return state;
}

// A small mimic is level seven, so makemon() rolls d(6, 8) after lowering it
// for depth two. The gender draw follows because mimics are not neuter.
function mimicCreationSteps() {
    return [
        step('rnd', [2], 1), // advance context.ident from 2 to 3
        step('d', [6, 8], 6), // hit points
        step('rn2', [2], 1), // retained corpse gender
    ];
}

// makemon()'s inventory tail for an unarmed, level-seven species: the
// defensive and miscellaneous item gates, both of which fail here.
function mimicInventoryTail() {
    return [
        step('rn2', [50], 1),
        step('rn2', [100], 1),
        step('rn2', [100], 1),
    ];
}

function permissiveRandom() {
    return {
        d: (number) => number,
        rn1: (_range, base) => base,
        rn2: (bound) => (bound === 10 ? 1 : Math.max(0, bound - 1)),
        rnd: (bound) => (bound === 100 ? 1 : 1),
        rne: () => 1,
        rnz: (value) => value,
    };
}

function makeShopMimic(state, random) {
    return makemon(
        state.mons[PM_SMALL_MIMIC],
        MON_X,
        MON_Y,
        0,
        { state, random },
    );
}

test('a shop mimic hides as a strange object once rn2(10) reaches the depth',
    () => {
        // makemon.c:2468. `rn2(10) >= depth(&u.uz)` sends the mimic to
        // S_MIMIC_DEF, which assign_sym answers with STRANGE_OBJECT, and
        // get_shop_item() is never called. Two is the smallest result that
        // satisfies the test at depth two, so a port comparing with `>` takes
        // the other arm here.
        const reached = shopLevelState(0);
        const reachedRandom = scriptedRandom([
            ...mimicCreationSteps(),
            step('rn2', [10], 2),
            ...mimicInventoryTail(),
        ]);
        const strange = makeShopMimic(reached, reachedRandom.random);
        reachedRandom.assertExhausted();
        assert.equal(strange.m_ap_type, M_AP_OBJECT);
        assert.equal(strange.mappearance, STRANGE_OBJECT);

        // One below the depth takes the shop's own stock instead. The general
        // store's single iprobs[] row is RANDOM_CLASS, so C rerolls over
        // syms[]; index 14 of that reroll is one of the two S_MIMIC_DEF
        // entries, so this mimic also ends as a strange object but costs two
        // further draws to get there.
        const below = shopLevelState(0);
        const belowRandom = scriptedRandom([
            ...mimicCreationSteps(),
            step('rn2', [10], 1),
            step('rnd', [100], 1), // get_shop_item(): RANDOM_CLASS
            step('rn2', [15], 14), // syms[16], the second S_MIMIC_DEF
            ...mimicInventoryTail(),
        ]);
        const stocked = makeShopMimic(below, belowRandom.random);
        belowRandom.assertExhausted();
        assert.equal(stocked.mappearance, STRANGE_OBJECT);
    });

test('a shop mimic compares rn2(10) against the depth, not against two', () => {
    // The same draw that reached depth two falls below depth three, so the
    // right-hand side has to be depth(&u.uz) rather than any constant.
    const state = shopLevelState(0, 3);
    const random = scriptedRandom([
        ...mimicCreationSteps(),
        step('rn2', [10], 2),
        step('rnd', [100], 1), // get_shop_item(): RANDOM_CLASS
        step('rn2', [15], 14), // syms[16], S_MIMIC_DEF
        ...mimicInventoryTail(),
    ]);
    const mimic = makeShopMimic(state, random.random);
    random.assertExhausted();
    assert.equal(mimic.mappearance, STRANGE_OBJECT);
});

test('a general store mimic rerolls over syms[] past its furniture entries',
    () => {
        // makemon.c:2483-2484. `syms[rn2(SIZE(syms) - 2) + 2]` skips syms[]'s
        // two leading MAXOCLASSES entries, so a shop mimic can never become
        // furniture. Result 4 lands on syms[6], COIN_CLASS, which assign_sym
        // answers with GOLD_PIECE without calling mkobj().
        const coins = shopLevelState(0);
        const coinsRandom = scriptedRandom([
            ...mimicCreationSteps(),
            step('rn2', [10], 1),
            step('rnd', [100], 1), // get_shop_item(): RANDOM_CLASS
            step('rn2', [15], 4), // syms[6]
            ...mimicInventoryTail(),
        ]);
        const golden = makeShopMimic(coins, coinsRandom.random);
        coinsRandom.assertExhausted();
        assert.equal(golden.m_ap_type, M_AP_OBJECT);
        assert.equal(golden.mappearance, GOLD_PIECE);

        // Result 0 lands on syms[2], RING_CLASS. Without the offset it would
        // land on syms[0], MAXOCLASSES, and the mimic would become furniture.
        const rings = shopLevelState(0);
        const ring = makeShopMimic(rings, {
            ...permissiveRandom(),
            rn2: (bound) => {
                if (bound === 10) return 1;
                if (bound === 15) return 0;
                return Math.max(0, bound - 1);
            },
        });
        assert.equal(ring.m_ap_type, M_AP_OBJECT);
        assert.equal(rings.objects[ring.mappearance].oc_class, RING_CLASS);
    });

test('a themed shop mimic takes the class its own iprobs[] row names', () => {
    // shknam.c get_shop_item(). The used armor dealership is shtypes[1], whose
    // iprobs[] are 90% ARMOR_CLASS then 10% WEAPON_CLASS, and C subtracts each
    // share from one rnd(100) in turn. A roll of 90 exhausts the first row
    // exactly and stops there; 95 carries five into the second.
    for (const [roll, expected] of [[90, ARMOR_CLASS], [95, WEAPON_CLASS]]) {
        const state = shopLevelState(1);
        const mimic = makeShopMimic(state, {
            ...permissiveRandom(),
            rnd: (bound) => (bound === 100 ? roll : 1),
        });
        assert.equal(mimic.m_ap_type, M_AP_OBJECT, `roll ${roll}`);
        assert.equal(
            state.objects[mimic.mappearance].oc_class, expected, `roll ${roll}`,
        );
    }
});

test('a mimic wears the object a negated iprobs[] itype names', () => {
    // makemon.c:2473-2475. `s_sym < 0` sets ap_type and appear straight from
    // the shop's stock and jumps past assign_sym, so mkobj() is never called
    // and the mimic costs no draw beyond get_shop_item()'s rnd(100).
    //
    // shtypes[5] is the delicatessen: 83 FOOD_CLASS, then 5 -POT_FRUIT_JUICE,
    // 4 -POT_BOOZE, 5 -POT_WATER and 3 -ICE_BOX. Rolls 84, 89, 93 and 98 are
    // the first of each negated row, so a share read one short or one long
    // answers a different object here.
    for (const [roll, expected] of [
        [84, POT_FRUIT_JUICE], [89, POT_BOOZE],
        [93, POT_WATER], [98, ICE_BOX],
    ]) {
        const state = shopLevelState(5);
        const random = scriptedRandom([
            ...mimicCreationSteps(),
            step('rn2', [10], 1),
            step('rnd', [100], roll),
            ...mimicInventoryTail(),
        ]);
        const mimic = makeShopMimic(state, random.random);
        random.assertExhausted();
        assert.equal(mimic.m_ap_type, M_AP_OBJECT, `roll ${roll}`);
        assert.equal(mimic.mappearance, expected, `roll ${roll}`);
        // None of these four is a corpse, egg, tin or slime mold, so the
        // tail leaves the mimic without an mcorpsenm overlay at all.
        assert.equal(mimic.mextra, null, `roll ${roll}`);
    }
});

test('a health food store mimic is a lump of royal jelly or a slime mold',
    () => {
        // makemon.c:2476-2481. The health food store is shtypes[10], whose
        // first 70 shares are VEGETARIAN_CLASS, which is MAXOCLASSES + 1. C
        // declines to choose among every vegetarian food and spends one rn2(2)
        // on two named objects instead, again without reaching assign_sym.
        const jelly = shopLevelState(10);
        const jellyRandom = scriptedRandom([
            ...mimicCreationSteps(),
            step('rn2', [10], 1),
            step('rnd', [100], 70), // the last VEGETARIAN_CLASS share
            step('rn2', [2], 1),
            ...mimicInventoryTail(),
        ]);
        const jellyMimic = makeShopMimic(jelly, jellyRandom.random);
        jellyRandom.assertExhausted();
        assert.equal(jellyMimic.m_ap_type, M_AP_OBJECT);
        assert.equal(jellyMimic.mappearance, LUMP_OF_ROYAL_JELLY);
        assert.equal(jellyMimic.mextra, null);

        // rn2(2) of 0 takes the slime mold, which the tail then gives the
        // current fruit and which marks that fruit as made.
        const mold = shopLevelState(10);
        mold.context.current_fruit = 7; // an arbitrary live fruit index
        mold.flags = { ...mold.flags, made_fruit: false };
        const moldRandom = scriptedRandom([
            ...mimicCreationSteps(),
            step('rn2', [10], 1),
            step('rnd', [100], 1),
            step('rn2', [2], 0),
            ...mimicInventoryTail(),
        ]);
        const moldMimic = makeShopMimic(mold, moldRandom.random);
        moldRandom.assertExhausted();
        assert.equal(moldMimic.mappearance, SLIME_MOLD);
        assert.equal(moldMimic.mextra.mcorpsenm, 7);
        assert.equal(mold.flags.made_fruit, true);
    });

test("the health food store's shares divide its two arms at 70", () => {
    // shtypes[10] is 70 VEGETARIAN_CLASS then 20 -POT_FRUIT_JUICE, so the two
    // arms meet between rolls 70 and 71. Roll 71 is the first negated share
    // and takes the arm above without spending the jelly arm's rn2(2).
    const state = shopLevelState(10);
    const random = scriptedRandom([
        ...mimicCreationSteps(),
        step('rn2', [10], 1),
        step('rnd', [100], 71),
        ...mimicInventoryTail(),
    ]);
    const mimic = makeShopMimic(state, random.random);
    random.assertExhausted();
    assert.equal(mimic.mappearance, POT_FRUIT_JUICE);
});

// Left unpinned deliberately: `roomType === FODDERSHOP && stock > MAXOCLASSES`
// has two clauses that are true on exactly the same inputs against shtypes[]
// as generated. No row but the health food store's lists an itype above
// MAXOCLASSES, and that row lists nothing else that is non-negative, so
// dropping either clause leaves every reachable case unchanged.

test('umber hulk creation proceeds through the species gate and full '
    + 'mklev path without AT_WEAP inventory', () => {
    // PM_UMBER_HULK has difficulty 12, which exceeds the D:5 reservoir cap of
    // 9 in isOrdinaryD5ReservoirSpecies(). The species gate admits it by
    // direct pmidx check so that deeper level-teleport targets can generate
    // umber hulks through rndmonst(). Source confirms no S_UMBER or
    // PM_UMBER_HULK special cases in makemon.c, no AT_WEAP attacks, and
    // m_dowear() running over an empty inventory.
    //
    // The umber hulk has mlevel 9; at the test's D:1 level_difficulty of 1,
    // adj_lev adjusts it to 8 (difference = 1-9 = -8 decrements once).
    // maligntyp = 0, so peace_minded reaches the rn2(alignmentRecordBound)
    // path; returning 0 short-circuits to hostile without a second draw.
    const state = initialLevelState();
    const random = scriptedRandom([
        // next_ident: advance the shared monster id from 2 to 3.
        step('rnd', [2], 1),
        // newmonhp: adjusted level 8 gives d(8, 8) hit points.
        step('d', [8, 8], 20),
        // Non-neuter gender selection.
        step('rn2', [2], 1),
        // peace_minded: neutral hero, neutral monster (maligntyp 0).
        // rn2(16) returns 0, short-circuiting to hostile.
        step('rn2', [16], 0),
        // m_initinv: no species-specific branch for S_UMBER.
        // Defensive item gate: m_lev 8 vs rn2(50); 8 <= 49 fails.
        step('rn2', [50], 49),
        // Misc item gate: m_lev 8 vs rn2(100); 8 <= 99 fails.
        step('rn2', [100], 99),
        // Saddle gate: consumed but M2_DOMESTIC is false for umber hulks.
        step('rn2', [100], 1),
    ]);

    const monster = makemon(
        state.mons[PM_UMBER_HULK],
        MON_X,
        MON_Y,
        0,
        { state, random: random.random },
    );
    random.assertExhausted();

    assert.ok(monster, 'makemon returned a monster');
    assert.equal(monster.data.pmidx, PM_UMBER_HULK);
    // Adjusted level 8 from adj_lev (mlevel 9 at level_difficulty 1).
    assert.equal(monster.m_lev, 8);
    assert.deepEqual([monster.mhp, monster.mhpmax], [20, 20]);
    // Hostile from the short-circuiting peace_minded rn2(16) = 0.
    assert.equal(monster.mpeaceful, false);
    // No inventory: no AT_WEAP, and both item gates failed.
    assert.equal(monster.minvent, null);
    assert.equal(state.mvitals[PM_UMBER_HULK].born, 1);
});

// C ref: makemon.c:1281-1293.  Monsters created on certain special levels
// start knowing about traps and/or have wand experience.  Verified by
// reading the C source: In_sokoban sets PIT and HOLE bits, Is_stronghold
// sets TRAPDOOR, MS_LEADER/MS_NEMESIS set ALL_TRAPS, and several branch
// predicates set mwandexp.  Each assertion checks the monster field after
// makemon returns with the global game dnum fields pointing at the level.
test('makemon sets mon_learns_traps and mwandexp on branch levels', () => {
    // Save the global game's dungeon fields so the test can restore them.
    const saved = {
        quest_dnum: game.quest_dnum,
        sokoban_dnum: game.sokoban_dnum,
        stronghold_level: game.stronghold_level,
        tower_dnum: game.tower_dnum,
        knox_level: game.knox_level,
        astral_level: game.astral_level,
    };
    try {
        // Assign dungeon numbers the const.js branch predicates will read.
        game.quest_dnum = 3;
        game.sokoban_dnum = 4;
        game.stronghold_level = { dnum: 0, dlevel: 10 };
        game.tower_dnum = 5;
        game.knox_level = { dnum: 0, dlevel: 12 };
        game.astral_level = { dnum: 9, dlevel: 1 };

        // --- Quest level: mwandexp should be true --------------------------
        {
            const state = initialLevelState();
            state.u.uz = { dnum: 3, dlevel: 1 };
            // Add a dungeon entry for dnum 3 so depth() does not crash.
            state.dungeons[3] = {
                depth_start: 1, dunlev_ureached: 1, entry_lev: 1,
                flags: { align: 0, hellish: false }, num_dunlevs: 5,
            };
            const random = recordingRandom();
            const monster = makemon(
                state.mons[PM_NEWT],
                MON_X, MON_Y,
                MM_NOGRP | NO_MINVENT,
                { state, random: random.random },
            );
            assert.ok(monster, 'quest makemon returned a monster');
            // PM_NEWT is mindless, so it should not learn traps.
            // But In_quest should set mwandexp.
            assert.equal(monster.mwandexp, true, 'quest level sets mwandexp');
            // Mindless creature: no trap knowledge.
            assert.equal(monster.mtrapseen, 0, 'mindless newt has no trapseen');
        }

        // --- Sokoban level: PIT and HOLE bits on non-mindless species ------
        {
            const state = initialLevelState();
            state.u.uz = { dnum: 4, dlevel: 1 };
            state.dungeons[4] = {
                depth_start: 6, dunlev_ureached: 1, entry_lev: 1,
                flags: { align: 0, hellish: false }, num_dunlevs: 4,
            };
            const random = recordingRandom();
            // PM_GOBLIN is not mindless (S_ORC), so it should learn traps.
            const monster = makemon(
                state.mons[PM_GOBLIN],
                MON_X, MON_Y,
                MM_NOGRP | NO_MINVENT,
                { state, random: random.random },
            );
            assert.ok(monster, 'sokoban makemon returned a monster');
            const pitBit = 1 << (PIT - 1);
            const holeBit = 1 << (HOLE - 1);
            assert.equal(
                monster.mtrapseen & pitBit, pitBit,
                'sokoban non-mindless learns PIT',
            );
            assert.equal(
                monster.mtrapseen & holeBit, holeBit,
                'sokoban non-mindless learns HOLE',
            );
            // Sokoban is not in the mwandexp list.
            assert.equal(monster.mwandexp, false, 'sokoban does not set mwandexp');
        }

        // --- Stronghold: TRAPDOOR bit on non-mindless species --------------
        {
            const state = initialLevelState();
            state.u.uz = { dnum: 0, dlevel: 10 };
            state.dungeons[0] = {
                depth_start: 1, dunlev_ureached: 10, entry_lev: 1,
                flags: { align: 0, hellish: false }, num_dunlevs: 20,
            };
            const random = recordingRandom();
            const monster = makemon(
                state.mons[PM_GOBLIN],
                MON_X, MON_Y,
                MM_NOGRP | NO_MINVENT,
                { state, random: random.random },
            );
            assert.ok(monster, 'stronghold makemon returned a monster');
            const trapdoorBit = 1 << (TRAPDOOR - 1);
            assert.equal(
                monster.mtrapseen & trapdoorBit, trapdoorBit,
                'stronghold non-mindless learns TRAPDOOR',
            );
            // Stronghold is in the mwandexp list.
            assert.equal(monster.mwandexp, true, 'stronghold sets mwandexp');
        }

        // --- Main dungeon ordinary level: nothing extra --------------------
        {
            const state = initialLevelState();
            // dnum=0, dlevel=1: not stronghold, not any branch.
            const random = recordingRandom();
            const monster = makemon(
                state.mons[PM_GOBLIN],
                MON_X, MON_Y,
                MM_NOGRP | NO_MINVENT,
                { state, random: random.random },
            );
            assert.ok(monster, 'main dungeon makemon returned a monster');
            assert.equal(monster.mtrapseen, 0, 'ordinary level: no trapseen');
            assert.equal(monster.mwandexp, false, 'ordinary level: no mwandexp');
        }
    } finally {
        // Restore the global game's dungeon fields.
        game.quest_dnum = saved.quest_dnum;
        game.sokoban_dnum = saved.sokoban_dnum;
        game.stronghold_level = saved.stronghold_level;
        game.tower_dnum = saved.tower_dnum;
        game.knox_level = saved.knox_level;
        game.astral_level = saved.astral_level;
    }
});
