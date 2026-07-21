// Initial-level monster creation.
// C ref: makemon.c makemon(), m_initthrow(), m_initweap(), m_initinv(), and
// mongets(); worn.c m_dowear(). The implementation fails closed outside the
// species and call shape reachable during ordinary-room filling on dungeon
// level one. Expanding it means porting the corresponding complete source
// branches, not approximating their PRNG effects.

import {
    ACCESSIBLE,
    G_GENOD,
    isok,
    MM_ANGRY,
    MM_ASLEEP,
    MM_FEMALE,
    MM_MALE,
    MM_NOCOUNTBIRTH,
    MM_NOGRP,
    M_SEEN_NOTHING,
    NO_MINVENT,
    OBJ_MINVENT,
    W_ARMH,
} from './const.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { add_to_minv } from './invent.js';
import {
    newmonhp,
    peace_minded,
    propagate,
    rndmonst,
    set_malign,
} from './makemon.js';
import { is_female, is_male, is_neuter } from './mondata.js';
import { m_at, newMonster, place_monster } from './monst.js';
import {
    AT_WEAP,
    M2_DOMESTIC,
    M2_GREEDY,
    NON_PM,
    PM_ELF,
    PM_FOX,
    PM_GOBLIN,
    PM_GRID_BUG,
    PM_JACKAL,
    PM_KOBOLD,
    PM_KOBOLD_ZOMBIE,
    PM_LICHEN,
    PM_NEWT,
    PM_SEWER_RAT,
    S_KOBOLD,
    S_ORC,
} from './monsters.js';
import { mksobj, next_ident, weight } from './obj.js';
import { DART, ORCISH_DAGGER, ORCISH_HELM } from './objects.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';

const SUPPORTED_FLAGS = NO_MINVENT
    | MM_NOCOUNTBIRTH
    | MM_ANGRY
    | MM_ASLEEP
    | MM_NOGRP
    | MM_MALE
    | MM_FEMALE;
const INITIAL_LEVEL_MONSTERS = new Set([
    PM_JACKAL,
    PM_FOX,
    PM_KOBOLD,
    PM_GOBLIN,
    PM_SEWER_RAT,
    PM_GRID_BUG,
    PM_LICHEN,
    PM_KOBOLD_ZOMBIE,
    PM_NEWT,
]);

export class UnsupportedMonsterCreationError extends Error {
    constructor(operation) {
        super(`unsupported initial-level monster creation: ${operation}`);
        this.name = 'UnsupportedMonsterCreationError';
        this.operation = operation;
    }
}

function creationEnv(env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { d, rn1, rn2, rnd, rne, rnz };
    const required = ['d', 'rn1', 'rn2', 'rnd', 'rne'];
    if (!required.every((name) => typeof random[name] === 'function')) {
        throw new TypeError(
            `monster creation random injection requires ${required.join(', ')}`,
        );
    }
    return { ...env, state, random };
}

function isRogueLevel(state) {
    return on_level(state.u?.uz, state.rogue_level);
}

function isArmed(monster) {
    return monster.mattk.some((attack) => attack.aatyp === AT_WEAP);
}

function assertSupportedMonster(monster) {
    if (!monster || !INITIAL_LEVEL_MONSTERS.has(monster.pmidx)) {
        throw new UnsupportedMonsterCreationError(
            `monster ${monster?.pmidx ?? 'null'}`,
        );
    }
}

function preflightCreation(ptr, x, y, mmflags, normalized) {
    const { state } = normalized;
    if (!Number.isInteger(mmflags) || mmflags < 0)
        throw new TypeError('makemon flags must be a nonnegative integer');
    if (mmflags & ~SUPPORTED_FLAGS) {
        throw new UnsupportedMonsterCreationError(
            `mmflags 0x${(mmflags & ~SUPPORTED_FLAGS).toString(16)}`,
        );
    }
    if (!state.in_mklev)
        throw new UnsupportedMonsterCreationError('outside mklev');
    if (x === 0 && y === 0)
        throw new UnsupportedMonsterCreationError('random coordinates');
    if (!isok(x, y) || !ACCESSIBLE(state.level?.at(x, y)?.typ)) {
        throw new UnsupportedMonsterCreationError(
            `non-accessible location <${x},${y}>`,
        );
    }
    if (!ptr && !(mmflags & MM_NOGRP))
        throw new UnsupportedMonsterCreationError('random monster groups');
    if (!Array.isArray(state.mons) || !Array.isArray(state.mvitals))
        throw new Error('makemon requires initialized monster globals');
    if (!state.context || !Number.isInteger(state.context.ident)
        || state.context.ident <= 0
        || state.context.ident > 0xffff_ffff) {
        throw new Error('makemon requires initialized context.ident');
    }
    if (!state.u?.ualign || !state.urace)
        throw new Error('makemon requires initialized hero alignment and race');
    if (state.migrating_objs || state.gm?.migrating_objs) {
        throw new UnsupportedMonsterCreationError('migrating object delivery');
    }
    if (ptr) {
        assertSupportedMonster(ptr);
        if (state.mons[ptr.pmidx] !== ptr) {
            throw new UnsupportedMonsterCreationError(
                'monster record outside the mutable catalog',
            );
        }
    }
}

function addFreshMonsterObject(monster, obj, normalized) {
    const merged = add_to_minv(monster, obj, normalized);
    if (merged) {
        throw new UnsupportedMonsterCreationError(
            'new monster inventory object merged unexpectedly',
        );
    }
    return obj;
}

// C ref: makemon.c mongets(). The reachable species are neither demons,
// lawful minions, player monsters, nor princes, so source postprocessing is
// empty before mpickobj() links the fresh object.
function mongets(monster, otyp, normalized) {
    if (!otyp) return null;
    assertSupportedMonster(monster.data);
    const obj = mksobj(otyp, true, false, normalized);
    return addFreshMonsterObject(monster, obj, normalized);
}

// C ref: makemon.c m_initthrow().
function m_initthrow(monster, otyp, quantityRange, normalized) {
    const obj = mksobj(otyp, true, false, normalized);
    obj.quan = normalized.random.rn1(quantityRange, 3);
    obj.owt = weight(obj, normalized);
    return addFreshMonsterObject(monster, obj, normalized);
}

// C ref: makemon.c m_initweap().
function m_initweap(monster, normalized) {
    const { random, state } = normalized;
    const ptr = monster.data;
    assertSupportedMonster(ptr);
    if (isRogueLevel(state)) return;
    if (!isArmed(ptr)) {
        throw new UnsupportedMonsterCreationError(
            `m_initweap for unarmed monster ${ptr.pmidx}`,
        );
    }

    switch (ptr.mlet) {
    case S_KOBOLD:
        if (!random.rn2(4)) m_initthrow(monster, DART, 12, normalized);
        break;
    case S_ORC:
        if (ptr.pmidx !== PM_GOBLIN) {
            throw new UnsupportedMonsterCreationError(
                `orc weapon branch ${ptr.pmidx}`,
            );
        }
        if (random.rn2(2)) mongets(monster, ORCISH_HELM, normalized);
        if (random.rn2(2)) mongets(monster, ORCISH_DAGGER, normalized);
        break;
    default:
        throw new UnsupportedMonsterCreationError(
            `weapon class ${ptr.mlet}`,
        );
    }

    // Every source branch reaches the rare offensive-item check. Level-zero
    // monsters cannot pass it, but the draw is still observable.
    if (monster.m_lev > random.rn2(75)) {
        throw new UnsupportedMonsterCreationError('random offensive item');
    }
}

// C ref: makemon.c m_initinv(). None of the initial-level species has a
// class-specific branch, likes gold, or can pass either level-zero item gate.
function m_initinv(monster, normalized) {
    const { random, state } = normalized;
    const ptr = monster.data;
    assertSupportedMonster(ptr);
    if (isRogueLevel(state)) return;

    if (monster.m_lev > random.rn2(50)) {
        throw new UnsupportedMonsterCreationError('random defensive item');
    }
    if (monster.m_lev > random.rn2(100)) {
        throw new UnsupportedMonsterCreationError('random miscellaneous item');
    }
    if (ptr.mflags2 & M2_GREEDY) {
        throw new UnsupportedMonsterCreationError('gold-carrying monster');
    }
}

// C ref: worn.c m_dowear(). Within the supported inventory set, only an
// orcish helm is wearable. It has no autocurse, light, or extrinsic effects.
function m_dowear(monster) {
    let helm = null;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.where !== OBJ_MINVENT || obj.ocarry !== monster) {
            throw new Error('m_dowear found invalid monster inventory ownership');
        }
        if (obj.otyp === ORCISH_HELM) helm = obj;
        else if (obj.otyp !== ORCISH_DAGGER && obj.otyp !== DART) {
            throw new UnsupportedMonsterCreationError(
                `wearing object ${obj.otyp}`,
            );
        }
    }
    if (helm && !helm.owornmask) {
        monster.misc_worn_check |= W_ARMH;
        helm.owornmask |= W_ARMH;
    }
    return monster;
}

function initializeGender(monster, ptr, mmflags, random) {
    const femaleok = !is_male(ptr) && !is_neuter(ptr);
    const maleok = !is_female(ptr) && !is_neuter(ptr);
    if (is_female(ptr) || ((mmflags & MM_FEMALE) && femaleok)) {
        monster.female = true;
    } else if (is_male(ptr) || ((mmflags & MM_MALE) && maleok)) {
        monster.female = false;
    } else {
        monster.female = femaleok ? Boolean(random.rn2(2)) : false;
    }
}

// C ref: makemon.c makemon(). This owns the exact level-one, explicit-square,
// in-mklev path used by fill_ordinary_room().
export function makemon(ptr, x, y, mmflags = 0, env = {}) {
    const normalized = creationEnv(env);
    const { random, state } = normalized;
    preflightCreation(ptr, x, y, mmflags, normalized);

    if (state.iflags?.debug_mongen
        || (state.level.flags.rndmongen === false && !ptr)) {
        return null;
    }
    if (m_at(x, y, state)) return null;

    const anymon = !ptr;
    if (anymon) {
        ptr = rndmonst(normalized);
        if (!ptr) return null;
        assertSupportedMonster(ptr);
    }
    const mndx = ptr.pmidx;
    if (state.mvitals[mndx].mvflags & G_GENOD) return null;

    propagate(
        mndx,
        !(mmflags & MM_NOCOUNTBIRTH),
        false,
        normalized,
    );
    const monster = newMonster({
        msleeping: Boolean(mmflags & MM_ASLEEP),
        nmon: state.level.monlist,
    });
    state.level.monlist = monster;
    monster.m_id = next_ident(normalized);
    monster.data = ptr;
    monster.mnum = mndx;
    newmonhp(monster, mndx, normalized);
    initializeGender(monster, ptr, mmflags, random);

    place_monster(monster, x, y, state);
    monster.mcansee = true;
    monster.mcanmove = true;
    monster.mgenmklev = Boolean(state.in_mklev);
    monster.seen_resistance = M_SEEN_NOTHING;
    monster.mpeaceful = (mmflags & MM_ANGRY)
        ? false
        : peace_minded(ptr, normalized);
    if (ptr.mlet === S_ORC && state.urace.mnum === PM_ELF)
        monster.mpeaceful = false;
    monster.cham = NON_PM;
    set_malign(monster, state);

    if (!(mmflags & NO_MINVENT)) {
        if (isArmed(ptr)) m_initweap(monster, normalized);
        m_initinv(monster, normalized);
        m_dowear(monster);

        const saddleRoll = random.rn2(100);
        if (!saddleRoll && (ptr.mflags2 & M2_DOMESTIC)) {
            throw new UnsupportedMonsterCreationError('initial saddle');
        }
    }

    return monster;
}
