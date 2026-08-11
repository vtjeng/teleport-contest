// Pet movement, goals, hunger, and inventory decisions.
// C ref: dogmove.c — droppables(), cursed_object_at(), dog_hunger(),
// dog_invent(), dog_goal(), find_targ(), find_friends(), score_targ(),
// best_target(), pet_ranged_attk(), dog_move(), could_reach_item(), and
// can_reach_location().

import {
    ACCFOOD,
    ALLOW_M,
    ALLOW_MDISP,
    ALLOW_TRAPS,
    ALLOW_U,
    APPORT,
    CADAVER,
    COLNO,
    CONFLICT,
    D_CLOSED,
    D_LOCKED,
    DEAF,
    DISMOUNT_THROWN,
    DOGFOOD,
    HALLUC,
    HALLUC_RES,
    helpless,
    IS_DOOR,
    IS_OBSTRUCTED,
    IS_ROOM,
    isok,
    MAGIC_PORTAL,
    MANFOOD,
    M_AP_NOTHING,
    M_AP_TYPMASK,
    M_ATTK_DEF_DIED,
    M_ATTK_MISS,
    MMOVE_DIED,
    MMOVE_DONE,
    MMOVE_MOVED,
    MMOVE_NOTHING,
    MTSZ,
    NEED_HTH_WEAPON,
    NEED_WEAPON,
    ROWNO,
    UNDEF,
    W_ARMS,
} from './const.js';
import { glyph_is_object, newsym, vobj_at } from './display.js';
import {
    capitalizedAlwaysVisibleMonsterName,
    capitalizedMonsterName,
} from './do_name.js';
import { on_level } from './dungeon.js';
import { dogfood as classifyDogFood } from './dogfood.js';
import { game } from './gstate.js';
import { obj_extract_self } from './invent.js';
import { On_stairs } from './stairs.js';
import {
    dist2,
    distmin,
    sgn,
} from './hacklib.js';
import { check_gear_next_turn, mon_allowflags } from './mon.js';
import { can_carry } from './moncarry.js';
import {
    attacktype,
    carnivorous,
    haseyes,
    herbivorous,
    is_animal,
    is_floater,
    is_flyer,
    is_swimmer,
    likes_lava,
    locomotion,
    mindless,
    needspick,
    nohands,
    passes_walls,
    perceives,
    resist_conflict,
    throws_rocks,
    touch_petrifies,
    tunnels,
    verysmall,
    is_vampshifter,
} from './mondata.js';
import {
    AT_NONE,
    AT_WEAP,
    MS_GUARDIAN,
    MS_LEADER,
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_PONY,
    PM_FLOATING_EYE,
    PM_GELATINOUS_CUBE,
    S_MIMIC,
} from './monsters.js';
import { mattackm } from './mhitm.js';
import {
    m_at,
    place_monster,
    remove_monster,
} from './monst.js';
import {
    mfndpos,
    mon_track_add,
    should_displace,
    undesirable_disp,
} from './monmove.js';
import { may_dig } from './hack.js';
import { sobj_at, splitobj } from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import { distant_name, donameFresh, vtense } from './objnam.js';
import {
    BALL_CLASS,
    BOULDER,
    CHAIN_CLASS,
    CREDIT_CARD,
    DWARVISH_MATTOCK,
    GOLD_PIECE,
    LOCK_PICK,
    PICK_AXE,
    ROCK_CLASS,
    SCR_MAIL,
    SKELETON_KEY,
    UNICORN_HORN,
} from './objects.js';
import { rn1, rn2, rnd, rne } from './rng.js';
import { messageAt } from './startup_a11y.js';
import { mpickobj, relobj } from './steal.js';
import { gettrack } from './track.js';
import { ttyPline } from './tty_message.js';
import {
    is_lava,
    is_pool,
    t_at,
} from './trap.js';
import {
    cansee,
    clear_path,
    couldsee,
    do_clear_area,
} from './vision.js';
import { which_armor } from './worn.js';

const SQSRCHRADIUS = 5;
const FARAWAY = COLNO + 2;

// dogmove.c uses a static artifact dummy so unusable tools can never replace
// the sentinel and accidentally become reserved.
const UNUSABLE_TOOL = Object.freeze({
    oartifact: 1,
    otyp: GOLD_PIECE,
});

const DOG_WEAK = 500;
const DOG_STARVE = 750;
const DOG_HUNGRY = 300;
const STARTING_PETS = new Set([PM_KITTEN, PM_LITTLE_DOG, PM_PONY]);
const TARGET_DIRECTIONS = Object.freeze([
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
]);

function doorMask(location) {
    return location?.flags || location?.doormask || 0;
}

function goalOperation(rawEnv, name, fallback) {
    const operation = rawEnv[name] ?? fallback;
    if (typeof operation !== 'function')
        throw new TypeError(`dog_goal requires a ${name} operation`);
    return operation;
}

function hungerOperation(env, name) {
    if (typeof env[name] !== 'function')
        throw new TypeError(`dog_hunger requires a ${name} operation`);
    return env[name];
}

function inventoryOperation(rawEnv, name, fallback) {
    const operation = rawEnv[name] ?? fallback;
    if (typeof operation !== 'function')
        throw new TypeError(`dog_invent requires a ${name} operation`);
    return operation;
}

function isPrize(obj, state) {
    const tracking = state.context?.achieveo;
    if (!tracking) return false;
    return (Boolean(tracking.mines_prize_oid)
            && obj.o_id === tracking.mines_prize_oid)
        || (Boolean(tracking.soko_prize_oid)
            && obj.o_id === tracking.soko_prize_oid);
}

function cannotFetch(obj, state) {
    return obj.oclass === BALL_CLASS
        || obj.oclass === CHAIN_CLASS
        || obj.oclass === ROCK_CLASS
        || obj.otyp === SCR_MAIL
        || isPrize(obj, state);
}

function petMoveOperation(rawEnv, name) {
    const operation = rawEnv[name];
    if (typeof operation !== 'function')
        throw new TypeError(`dog_move requires a ${name} operation`);
    return operation;
}

function conflictActive(state) {
    const conflict = state.u?.uprops?.[CONFLICT];
    return Boolean(conflict?.intrinsic || conflict?.extrinsic)
        && !conflict?.blocked;
}

function heroDeaf(state) {
    const deafness = state.u?.uprops?.[DEAF];
    return Boolean(deafness?.intrinsic || deafness?.extrinsic)
        && !deafness?.blocked;
}

// C ref: youprop.h:120 Hallucination, over :115-119. The comment at :115 says
// hallucination is solely a timeout, so the positive term is the intrinsic
// alone with no worn mask; Halluc_resistance is the intrinsic or the
// extrinsic.
function Hallucination(state) {
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(state.u?.uprops?.[HALLUC]?.intrinsic)
        && !(resistance?.intrinsic || resistance?.extrinsic);
}

function monsterOffMap(monster) {
    return monster.mx === 0;
}

function setMonsterAttackPosition(target, x, y, state) {
    state.gb ??= {};
    state.gb.bhitpos ??= {};
    state.gb.bhitpos.x = x;
    state.gb.bhitpos.y = y;
    state.gn ??= {};
    state.gn.notonhead = target.mx !== x || target.my !== y;
}

function normalizePetMoveEnv(rawEnv) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('dog_move random injection requires rn2');
    return {
        ...rawEnv,
        state,
        random,
        accfood: rawEnv.accfood ?? ACCFOOD,
        canCarry: rawEnv.canCarry ?? can_carry,
        dogfood: rawEnv.dogfood ?? classifyDogFood,
        droppables: rawEnv.droppables ?? droppables,
        couldReachItem: rawEnv.couldReachItem ?? could_reach_item,
        cursedObjectAt: rawEnv.cursedObjectAt ?? cursed_object_at,
        findPositions: rawEnv.findPositions ?? mfndpos,
        monAllowFlags: rawEnv.monAllowFlags ?? mon_allowflags,
    };
}

function nearestVisibleGoal(monster, state, clearArea) {
    let distance = FARAWAY * FARAWAY;
    let goal = null;
    clearArea(
        monster.mx,
        monster.my,
        9,
        (x, y) => {
            const nextDistance = dist2(x, y, state.u.ux, state.u.uy);
            if (distance > nextDistance) {
                goal = { x, y };
                distance = nextDistance;
            }
        },
        null,
        state,
    );
    return goal;
}

// C ref: dogmove.c droppables(). Return the first carried object this pet
// does not reserve as its wielded weapon or one preferred utility tool.
export function droppables(monster) {
    const species = monster.data;
    const weapon = monster.mw;
    let pickaxe = null;
    let unicornHorn = null;
    let key = null;

    if (is_animal(species) || mindless(species)) {
        pickaxe = unicornHorn = key = UNUSABLE_TOOL;
    } else {
        if (!tunnels(species) || !needspick(species))
            pickaxe = UNUSABLE_TOOL;
        if (nohands(species) || verysmall(species))
            key = UNUSABLE_TOOL;
    }
    if (weapon) {
        if (weapon.otyp === PICK_AXE
            || weapon.otyp === DWARVISH_MATTOCK) {
            pickaxe = weapon;
        }
        if (weapon.otyp === UNICORN_HORN) unicornHorn = weapon;
    }

    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        switch (obj.otyp) {
        case DWARVISH_MATTOCK:
            if (which_armor(monster, W_ARMS)) break;
            if (pickaxe?.otyp === PICK_AXE && pickaxe !== weapon
                && (!pickaxe.oartifact || obj.oartifact)) {
                return pickaxe;
            }
            // Fall through: a mattock is otherwise a preferred pick.
        case PICK_AXE:
            if (pickaxe == null
                || (obj.oartifact && !pickaxe.oartifact)) {
                if (pickaxe) return pickaxe;
                pickaxe = obj;
                continue;
            }
            break;
        case UNICORN_HORN:
            if (obj.cursed) break;
            if (!unicornHorn
                || (obj.oartifact && !unicornHorn.oartifact)) {
                if (unicornHorn) return unicornHorn;
                unicornHorn = obj;
                continue;
            }
            break;
        case SKELETON_KEY:
            if (key?.otyp === LOCK_PICK
                && (!key.oartifact || obj.oartifact)) {
                return key;
            }
            // Fall through: skeleton keys outrank lock picks and cards.
        case LOCK_PICK:
            if (key?.otyp === CREDIT_CARD
                && (!key.oartifact || obj.oartifact)) {
                return key;
            }
            // Fall through: any of the three may become the reserved key.
        case CREDIT_CARD:
            if (key == null || (obj.oartifact && !key.oartifact)) {
                if (key) return key;
                key = obj;
                continue;
            }
            break;
        default:
            break;
        }
        if (!obj.owornmask && obj !== weapon) return obj;
    }
    return null;
}

// C ref: dogmove.c cursed_object_at().
export function cursed_object_at(x, y, state = game) {
    for (let obj = state.level?.objects?.[x]?.[y] ?? null;
        obj;
        obj = obj.nexthere) {
        if (obj.cursed) return true;
    }
    return false;
}

export async function dog_hunger(monster, edog, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    const moves = Math.trunc(state.moves ?? 0);
    if (moves <= Math.trunc(edog.hungrytime ?? 0) + DOG_WEAK)
        return false;

    const eatsMeat = env.carnivorous ?? carnivorous;
    const eatsPlants = env.herbivorous ?? herbivorous;
    if (!eatsMeat(monster.data) && !eatsPlants(monster.data)) {
        edog.hungrytime = moves + DOG_WEAK;
    } else if (!edog.mhpmax_penalty) {
        const newMaximum = Math.trunc(monster.mhpmax / 3);
        const dies = Math.min(monster.mhp, newMaximum) < 1;
        const starvePet = dies ? hungerOperation(env, 'starvePet') : null;
        const reportWeakPet = dies ? null : hungerOperation(env, 'reportWeakPet');
        const stopOccupation = dies ? null : hungerOperation(env, 'stopOccupation');
        monster.mconf = true;
        edog.mhpmax_penalty = monster.mhpmax - newMaximum;
        monster.mhpmax = newMaximum;
        if (monster.mhp > newMaximum) monster.mhp = newMaximum;
        if (dies) {
            await starvePet(monster, env);
            return true;
        }
        await reportWeakPet(monster, env);
        await stopOccupation(env);
    } else if (moves > edog.hungrytime + DOG_STARVE
               || monster.mhp < 1) {
        await hungerOperation(env, 'starvePet')(monster, env);
        return true;
    }
    return false;
}

// C ref: dogmove.c finish_meating() (1447-1457). Ends a meal in progress. The
// second arm restores the appearance of a pet that was eating a mimic and had
// taken on its disguise; M_AP_TYPE() is monst.h:73's masked read.
export function finish_meating(mtmp) {
    mtmp.meating = 0;
    if (((mtmp.m_ap_type ?? 0) & M_AP_TYPMASK) !== M_AP_NOTHING
        && mtmp.data.mlet !== S_MIMIC) {
        /* was eating a mimic and now appearance needs resetting */
        mtmp.m_ap_type = M_AP_NOTHING;
        mtmp.mappearance = 0;
        newsym(mtmp.mx, mtmp.my);
    }
}

// Return MMOVE_MOVED when the pet ate, MMOVE_DIED when eating killed it,
// and MMOVE_NOTHING for dropping, pickup, or no action.
export async function dog_invent(monster, edog, heroDistance, rawEnv = {}) {
    if (helpless(monster) || monster.meating)
        return MMOVE_NOTHING;

    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn1, rn2, rnd, rne };
    // Every branch draws through rn2, so that much is required up front. The
    // carry arm needs more, and asks for it there rather than here: requiring
    // the whole set eagerly would reject the many callers that never split a
    // stack, while requiring only rn2 let a caller honouring this contract
    // fail later inside js/obj.js against a contract it had never seen.
    if (typeof random.rn2 !== 'function')
        throw new TypeError('dog_invent random injection requires rn2');
    const operationEnv = { ...rawEnv, state, random };
    // pline_xy() and newsym() on the carry arm. A planning scan overrides both
    // with no-ops, because it re-runs the same turn against the live display.
    const message = rawEnv.message ?? ttyPline;
    const redraw = rawEnv.redraw ?? newsym;
    const findDroppable = inventoryOperation(
        rawEnv,
        'droppables',
    );

    if (findDroppable(monster, operationEnv)) {
        if (edog.apport <= 0)
            throw new RangeError('dog_invent requires positive apport');
        if ((!random.rn2(heroDistance + 1)
                || !random.rn2(edog.apport))
            && random.rn2(10) < edog.apport) {
            await inventoryOperation(rawEnv, 'dropInventory', relobj)(
                monster,
                monster.minvis,
                true,
                operationEnv,
            );
            if (edog.apport > 1) edog.apport--;
            edog.dropdist = heroDistance;
            edog.droptime = state.moves;
        }
        return MMOVE_NOTHING;
    }

    const obj = state.level?.objects?.[monster.mx]?.[monster.my] ?? null;
    if (!obj || cannotFetch(obj, state)) return MMOVE_NOTHING;

    const dogfood = inventoryOperation(rawEnv, 'dogfood', classifyDogFood);
    const canReach = inventoryOperation(
        rawEnv,
        'couldReachItem',
    );
    const foodType = dogfood(monster, obj, operationEnv);
    if ((foodType <= CADAVER
            || (edog.mhpmax_penalty && foodType === ACCFOOD))
        && canReach(monster, obj.ox, obj.oy, state)) {
        return await inventoryOperation(rawEnv, 'eatObject')(
            monster,
            obj,
            monster.mx,
            monster.my,
            false,
            operationEnv,
        );
    }

    const canCarry = inventoryOperation(rawEnv, 'canCarry', can_carry);
    const amount = canCarry(monster, obj, operationEnv);
    if (amount > 0 && !obj.cursed
        && canReach(monster, obj.ox, obj.oy, state)
        && random.rn2(20) < edog.apport + 3
        && (random.rn2(heroDistance)
            || !random.rn2(edog.apport))) {
        // splitobj(), remove_object() and add_to_minv() each reach owners
        // that obj.js expects the caller to supply.
        const objectEnv = objectGenerationEnv(operationEnv);
        // can_carry() caps a nohands pet at one item, so any stack of more
        // than one splits here and the pet takes the child. splitobj()
        // normalizes through js/obj.js objectEnv(), which needs the whole
        // source random set because next_ident() draws rnd(2); state it here,
        // where it is true, rather than in the guard above, which every
        // non-splitting caller also passes.
        if (amount !== obj.quan) {
            for (const name of ['rn1', 'rn2', 'rnd', 'rne']) {
                if (typeof random[name] !== 'function') {
                    throw new TypeError(
                        'dog_invent splitting requires rn2, rnd, rn1, and rne',
                    );
                }
            }
        }
        const taken = amount !== obj.quan
            ? splitobj(obj, amount, objectEnv)
            : obj;
        if (cansee(monster.mx, monster.my, state)) {
            // C ref: dogmove.c:452-462. distant_name() runs for its side
            // effects even when verbose is off and the name is discarded, and
            // it runs before the extract so that doname() -> xname() ->
            // find_artifact() still sees the object on the floor.
            const takenName = distant_name(taken, donameFresh, state);
            if (state.flags?.verbose) {
                await message(
                    messageAt(
                        `${capitalizedMonsterName(monster, state)}`
                        + ` picks up ${takenName}.`,
                        monster.mx,
                        monster.my,
                        state,
                    ),
                    state,
                );
            }
        }
        obj_extract_self(taken, objectEnv);
        redraw(monster.mx, monster.my, state);
        mpickobj(monster, taken, objectEnv);
        if (attacktype(monster.data, AT_WEAP)
            && monster.weapon_check === NEED_WEAPON) {
            monster.weapon_check = NEED_HTH_WEAPON;
            await inventoryOperation(rawEnv, 'wieldPickedItem')(
                monster,
                operationEnv,
            );
        }
        check_gear_next_turn(monster);
    }
    return MMOVE_NOTHING;
}

// C ref: dogmove.c dog_goal(). Return -1 to retreat, 0 to stay, 1 to approach,
// or -2 to abort the move. On normal paths, state.gg mirrors C's temporary
// gtyp/gx/gy globals and dog_move() consumes it immediately; a ridden-steed
// abort leaves that scratch untouched, while the close-following abort writes
// the hero goal first. Goal fallback may also update the persistent edog.ogoal.
// Food classification, droppable selection, carry capacity, and the fallback
// clear-area scan retain source control flow.
export function dog_goal(
    monster,
    edog,
    after,
    heroDistance,
    whistleApproach,
    rawEnv = {},
) {
    const state = rawEnv.state ?? game;
    const hero = state.u;
    if (monster === hero?.usteed) return -2;

    const random = rawEnv.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('dog_goal random injection requires rn2');
    const dogfood = goalOperation(rawEnv, 'dogfood', classifyDogFood);
    const findDroppable = goalOperation(rawEnv, 'droppables', droppables);
    const canCarry = goalOperation(rawEnv, 'canCarry', can_carry);
    const couldSee = rawEnv.couldSee
        ?? ((x, y) => couldsee(x, y, state));
    const petCanSee = rawEnv.petCanSee
        ?? ((subject, x, y) =>
            clear_path(subject.mx, subject.my, x, y));
    const canReach = rawEnv.canReachLocation
        ?? ((subject, fromX, fromY, toX, toY) =>
            can_reach_location(
                subject,
                fromX,
                fromY,
                toX,
                toY,
                state,
            ));
    const clearArea = rawEnv.clearArea ?? do_clear_area;
    const operationEnv = { ...rawEnv, state, random };
    const goal = state.gg ??= {};
    const originX = monster.mx;
    const originY = monster.my;
    const inMastersSight = couldSee(originX, originY, operationEnv);
    const hasDroppable = Boolean(findDroppable(monster, operationEnv));

    if (!edog || monster.mleashed) {
        goal.gtyp = APPORT;
        goal.gx = hero.ux;
        goal.gy = hero.uy;
    } else {
        goal.gtyp = UNDEF;
        goal.gx = 0;
        goal.gy = 0;
        const minX = Math.max(1, originX - SQSRCHRADIUS);
        const maxX = Math.min(COLNO - 1, originX + SQSRCHRADIUS);
        const minY = Math.max(0, originY - SQSRCHRADIUS);
        const maxY = Math.min(ROWNO - 1, originY + SQSRCHRADIUS);

        for (let obj = state.level?.objlist ?? null; obj; obj = obj.nobj) {
            const x = obj.ox;
            const y = obj.oy;
            if (x < minX || x > maxX || y < minY || y > maxY)
                continue;
            const foodType = dogfood(monster, obj, operationEnv);
            if (foodType > goal.gtyp || foodType === UNDEF) continue;
            if (cursed_object_at(x, y, state)
                && !(edog.mhpmax_penalty && foodType < MANFOOD)) {
                continue;
            }
            if (!could_reach_item(monster, x, y, state)
                || !canReach(
                    monster,
                    originX,
                    originY,
                    x,
                    y,
                    operationEnv,
                )) {
                continue;
            }
            if (foodType < MANFOOD) {
                if (foodType < goal.gtyp
                    || dist2(x, y, originX, originY)
                        < dist2(goal.gx, goal.gy, originX, originY)) {
                    goal.gx = x;
                    goal.gy = y;
                    goal.gtyp = foodType;
                }
            } else if (goal.gtyp === UNDEF && inMastersSight
                && !hasDroppable
                && (!state.level.at(originX, originY).lit
                    || state.level.at(hero.ux, hero.uy).lit)
                && (foodType === MANFOOD
                    || petCanSee(monster, x, y, operationEnv))
                && edog.apport > random.rn2(8)
                && canCarry(monster, obj, operationEnv) > 0) {
                goal.gx = x;
                goal.gy = y;
                goal.gtyp = APPORT;
            }
        }
    }

    let approach;
    if (goal.gtyp === UNDEF
        || (goal.gtyp !== DOGFOOD && goal.gtyp !== APPORT
            && state.moves < edog.hungrytime)) {
        goal.gx = hero.ux;
        goal.gy = hero.uy;
        if (after && heroDistance <= 4) return -2;
        approach = heroDistance >= 9 ? 1 : monster.mflee ? -1 : 0;
        if (heroDistance > 1
            && (!IS_ROOM(state.level.at(hero.ux, hero.uy).typ)
                || random.rn2(4) === 0
                || whistleApproach
                || (hasDroppable && random.rn2(edog.apport) !== 0))) {
            approach = 1;
        }
        if (approach === 0) {
            if (On_stairs(hero.ux, hero.uy, state)) {
                approach = 1;
            } else {
                for (let obj = state.invent ?? state.gi?.invent ?? null;
                    obj;
                    obj = obj.nobj) {
                    if (dogfood(monster, obj, operationEnv) === DOGFOOD) {
                        approach = 1;
                        break;
                    }
                }
                if (approach === 0) {
                    for (const trap of state.level?.traps ?? []) {
                        if (trap.ttyp !== MAGIC_PORTAL) continue;
                        if (dist2(hero.ux, hero.uy, trap.tx, trap.ty) <= 2)
                            approach = 1;
                        break;
                    }
                }
            }
        }
    } else {
        approach = 1;
    }
    if (monster.mconf) approach = 0;

    if (goal.gx === hero.ux && goal.gy === hero.uy && !inMastersSight) {
        const track = gettrack(originX, originY, state);
        if (track) {
            goal.gx = track.x;
            goal.gy = track.y;
            if (edog) edog.ogoal.x = 0;
        } else if (edog?.ogoal?.x
            && (edog.ogoal.x !== originX || edog.ogoal.y !== originY)) {
            goal.gx = edog.ogoal.x;
            goal.gy = edog.ogoal.y;
            edog.ogoal.x = 0;
        } else {
            const found = nearestVisibleGoal(monster, state, clearArea);
            if (!found
                || (found.x === originX && found.y === originY)) {
                goal.gx = hero.ux;
                goal.gy = hero.uy;
            } else {
                goal.gx = found.x;
                goal.gy = found.y;
                if (edog) {
                    edog.ogoal.x = found.x;
                    edog.ogoal.y = found.y;
                }
            }
        }
    } else if (edog) {
        edog.ogoal.x = 0;
    }

    return approach;
}

// C ref: dogmove.c find_targ(). Walk one of best_target()'s eight rays,
// skipping unseen occupants and long-worm tail aliases.
export function find_targ(
    monster,
    dx,
    dy,
    maxDistance,
    rawEnv = {},
) {
    const state = rawEnv.state ?? game;
    const monsterAt = rawEnv.monsterAt
        ?? ((x, y) => m_at(x, y, state));
    const monsterCanSee = rawEnv.monsterCanSee
        ?? ((subject, x, y) => clear_path(subject.mx, subject.my, x, y));
    let x = monster.mx;
    let y = monster.my;
    for (let distance = 0; distance < maxDistance; ++distance) {
        x += dx;
        y += dy;
        if (!isok(x, y) || !monsterCanSee(monster, x, y, rawEnv))
            break;
        if (x === monster.mux && y === monster.muy)
            return state.youmonst;

        const target = monsterAt(x, y, rawEnv);
        if (target
            && (!target.minvis || perceives(monster.data))
            && !target.mundetected
            && target.mx === x
            && target.my === y) {
            return target;
        }
    }
    return null;
}

function targetingRefusal(rawEnv, reason) {
    if (typeof rawEnv.unsupported === 'function')
        return rawEnv.unsupported(reason);
    throw new RangeError(`pet ranged targeting requires ${reason}`);
}

function admitOrdinaryStartingPet(monster, rawEnv) {
    if (!STARTING_PETS.has(monster?.data?.pmidx)
        || monster.isminion
        || monster.ispriest
        || is_vampshifter(monster)) {
        targetingRefusal(rawEnv, 'an ordinary starting pet');
    }
    if (monster.mconf)
        targetingRefusal(rawEnv, 'an unconfused starting pet');
}

// C ref: dogmove.c find_friends(). Scan beyond a candidate along the same
// ray for the remembered hero, a visible tame ally, or a quest friendly.
export function find_friends(monster, target, maxDistance, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const monsterAt = rawEnv.monsterAt
        ?? ((x, y) => m_at(x, y, state));
    const monsterCanSee = rawEnv.monsterCanSee
        ?? ((subject, x, y) => clear_path(subject.mx, subject.my, x, y));
    const dx = sgn(target.mx - monster.mx);
    const dy = sgn(target.my - monster.my);
    let x = target.mx;
    let y = target.my;

    for (let distance = distmin(target.mx, target.my, monster.mx, monster.my);
        distance <= maxDistance;
        ++distance) {
        x += dx;
        y += dy;
        if (!isok(x, y) || !monsterCanSee(monster, x, y, rawEnv)) {
            return 0;
        }
        if (monster.mux === x && monster.muy === y) return 1;
        const ally = monsterAt(x, y, rawEnv);
        if (!ally) continue;
        if (ally.mtame) {
            if (!ally.minvis || perceives(monster.data))
                return 1;
        } else if (ally.data?.msound === MS_LEADER
            || ally.data?.msound === MS_GUARDIAN) {
            return 1;
        }
    }
    return 0;
}

// C ref: dogmove.c score_targ(). Covers the ordinary, unconfused starting-pet
// branch used by dog_move(); special faith and shapeshifter branches stay at
// the fail-closed boundary.
export function score_targ(monster, target, rawEnv = {}) {
    admitOrdinaryStartingPet(monster, rawEnv);
    if (target.isminion || target.ispriest || target.isshk || target.isgd) {
        targetingRefusal(rawEnv, 'an ordinary monster target');
    }
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rnd };
    if (typeof random.rnd !== 'function')
        throw new TypeError('score_targ random injection requires rnd');

    if (target.data?.msound === MS_LEADER
        || target.data?.msound === MS_GUARDIAN) {
        targetingRefusal(rawEnv, 'an ordinary monster target');
    }
    if (distmin(monster.mx, monster.my, target.mx, target.my) <= 1)
        return -3000;
    if (target.mtame || target === state.youmonst)
        return -3000;
    if (find_friends(monster, target, 15, rawEnv)) return -3000;

    let score = target.mpeaceful ? 0 : 10;
    if (target.data?.mattk?.[0]?.aatyp === AT_NONE) score -= 1000;
    const weakTarget = target.m_lev < 2 && monster.m_lev > 5;
    const farOutclassed = monster.m_lev > 12
        && target.m_lev < monster.m_lev - 9
        && state.u.ulevel > 8
        && target.m_lev < state.u.ulevel - 7;
    if (weakTarget || farOutclassed) {
        score -= 25;
    }
    if (target.m_lev > monster.m_lev + 4)
        score -= (target.m_lev - monster.m_lev) * 20;
    score += target.m_lev * 2 + Math.trunc(target.mhp / 3);
    score += random.rnd(5);
    return score;
}

// C ref: dogmove.c best_target(). Preserve dy-major/dx-minor ray order and
// first-on-tie selection; score_targ() owns each candidate's random fuzz.
export function best_target(monster, forced, rawEnv = {}) {
    if (!monster) return null;
    if (!monster.mcansee) return null;
    admitOrdinaryStartingPet(monster, rawEnv);
    let bestScore = -40000;
    let bestTarget = null;
    for (const [dx, dy] of TARGET_DIRECTIONS) {
        const candidate = find_targ(monster, dx, dy, 7, rawEnv);
        if (!candidate) continue;
        const candidateScore = score_targ(monster, candidate, rawEnv);
        if (candidateScore > bestScore) {
            bestScore = candidateScore;
            bestTarget = candidate;
        }
    }
    if (!forced) {
        if (bestScore < 0) return null;
    }
    return bestTarget;
}

// C ref: dogmove.c pet_ranged_attk(). Covers forced=FALSE and the distant
// physical miss returned by mhitm.c mattackm(); real ranged attacks and
// retaliation remain refused by the called narrow owner.
export function pet_ranged_attk(monster, forced, rawEnv = {}) {
    if (forced) targetingRefusal(rawEnv, 'an unforced target scan');
    admitOrdinaryStartingPet(monster, rawEnv);
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2, rnd };
    if (typeof random.rn2 !== 'function'
        || typeof random.rnd !== 'function') {
        throw new TypeError(
            'pet_ranged_attk random injection requires rn2 and rnd',
        );
    }
    const edog = monster.mextra?.edog;
    if (!edog) targetingRefusal(rawEnv, 'ordinary pet hunger state');
    const hungry = state.moves > edog.hungrytime + DOG_HUNGRY;
    const target = best_target(monster, false, { ...rawEnv, state, random });
    if (!target) return MMOVE_NOTHING;
    if (hungry) {
        if (random.rn2(5)) return MMOVE_NOTHING;
    }
    if (target === state.youmonst)
        targetingRefusal(rawEnv, 'a monster target');

    state.gb ??= {};
    state.gb.bhitpos ??= {};
    state.gb.bhitpos.x = monster.mx;
    state.gb.bhitpos.y = monster.my;
    state.gn ??= {};
    state.gn.notonhead = false;
    const attack = rawEnv.mattackm ?? mattackm;
    const status = attack(monster, target, { ...rawEnv, state, random });
    if (status !== M_ATTK_MISS)
        targetingRefusal(rawEnv, 'a distant physical miss');
    return MMOVE_NOTHING;
}

// Own the x-major mfndpos candidate scan, source tie-breaking draws, and
// coordinate movement. Combat, object mutation, region crossing, and
// post-move effects remain with their injected upstream owners.
export async function dog_move(monster, after, rawEnv = {}) {
    const env = normalizePetMoveEnv(rawEnv);
    const { random, state } = env;
    const edog = monster.mtame && !monster.isminion
        ? monster.mextra?.edog : null;
    if (!edog && !monster.isminion) {
        rawEnv.impossible?.('dog_move for non-pet?');
        return MMOVE_NOTHING;
    }
    if (edog && await dog_hunger(monster, edog, env)) return MMOVE_DIED;

    const originX = monster.mx;
    const originY = monster.my;
    let heroDistance = dist2(originX, originY, state.u.ux, state.u.uy);
    if (monster === state.u.usteed) {
        const resistConflict = env.resistConflict
            ?? ((subject) => resist_conflict(subject, state, random));
        if (conflictActive(state) && !resistConflict(monster, env)) {
            await petMoveOperation(env, 'dismountSteed')(
                DISMOUNT_THROWN,
                env,
            );
            return MMOVE_MOVED;
        }
        heroDistance = 1;
    } else if (!heroDistance) {
        return MMOVE_NOTHING;
    }

    let nextX = originX;
    let nextY = originY;
    let eatAfterMoving = null;
    const curseMessages = new Array(9).fill(false);

    let whistleApproach = false;
    if (edog) {
        const inventoryResult = await dog_invent(
            monster,
            edog,
            heroDistance,
            env,
        );
        const offMap = (env.monsterOffMap ?? monsterOffMap)(monster, env);
        if (inventoryResult === MMOVE_DIED || offMap)
            return monster.mhp < 1 ? MMOVE_DIED : MMOVE_DONE;
        if (inventoryResult === MMOVE_MOVED) {
            if (monster.mleashed && heroDistance > 4) {
                await petMoveOperation(env, 'repositionLeashedPet')(
                    monster,
                    heroDistance,
                    nextX,
                    nextY,
                    env,
                );
            }
            return MMOVE_MOVED;
        }
        whistleApproach = state.moves - edog.whistletime < 5;
    }

    const approach = dog_goal(
        monster,
        edog,
        after,
        heroDistance,
        whistleApproach,
        env,
    );
    if (approach === -2) return MMOVE_NOTHING;
    if (conflictActive(state)) {
        const resistConflict = env.resistConflict
            ?? ((subject) => resist_conflict(subject, state, random));
        if (!resistConflict(monster, env) && !edog) {
            await petMoveOperation(env, 'loseGuardianAngel')(
                monster,
                env,
            );
            return MMOVE_DIED;
        }
    }

    const data = { cnt: 0, poss: [], info: [] };
    const allowflags = env.monAllowFlags(monster, env);
    const count = env.findPositions(monster, data, allowflags, env);
    let uncursedCount = 0;
    for (let index = 0; index < count; ++index) {
        const { x, y } = data.poss[index];
        if (m_at(x, y, state)
            && !(data.info[index] & (ALLOW_M | ALLOW_MDISP))) {
            continue;
        }
        if (!env.cursedObjectAt(x, y, state)) uncursedCount++;
    }

    const betterWithDisplacing = should_displace(
        monster,
        data,
        state.gg.gx,
        state.gg.gy,
        env,
    );
    let chosenIndex = -1;
    let choiceCount = 0;
    let nearestDistance = dist2(
        nextX,
        nextY,
        state.gg.gx,
        state.gg.gy,
    );

    for (let index = 0; index < count; ++index) {
        const { x, y } = data.poss[index];
        if (monster.mleashed
            && dist2(x, y, state.u.ux, state.u.uy) > 4) {
            continue;
        }
        if (!edog) {
            const distance = dist2(x, y, state.u.ux, state.u.uy);
            if (distance > 16 && distance >= heroDistance) continue;
        }

        const occupant = m_at(x, y, state);
        if ((data.info[index] & ALLOW_M) && occupant) {
            const balk = monster.m_lev
                + Math.trunc(5 * monster.mhp / monster.mhpmax) - 2;
            if (occupant.m_lev >= balk
                || (occupant.mtame && monster.mtame
                    && !conflictActive(state))
                || petMoveOperation(env, 'maxPassiveDamage')(
                    occupant,
                    monster,
                    env,
                ) >= monster.mhp
                || ((monster.mhp * 4 < monster.mhpmax
                    || occupant.data?.msound === MS_GUARDIAN
                    || occupant.data?.msound === MS_LEADER)
                    && occupant.mpeaceful
                    && !conflictActive(state))) {
                continue;
            }
            const hazardousTarget = (
                occupant.data?.pmidx === PM_FLOATING_EYE
                    && random.rn2(10)
                    && monster.mcansee
                    && haseyes(monster.data)
                    && occupant.mcansee
                    && (!occupant.minvis || perceives(monster.data))
                    && !petMoveOperation(env, 'monsterReflects')(
                        monster,
                        env,
                    )
            ) || (occupant.data?.pmidx === PM_GELATINOUS_CUBE
                && random.rn2(10))
                || (touch_petrifies(occupant.data)
                    && !petMoveOperation(env, 'resistsStone')(
                        monster,
                        env,
                    ));
            if (hazardousTarget) {
                if (dist2(
                    monster.mx,
                    monster.my,
                    occupant.mx,
                    occupant.my,
                ) <= 2 || petMoveOperation(env, 'bestTarget')(
                    monster,
                    false,
                    env,
                ) !== occupant) {
                    continue;
                }
                // dogmove.c sets ranged_only here, then immediately skips the
                // target due to its retained FIXME.
                continue;
            }
            if (after) return MMOVE_NOTHING;
            setMonsterAttackPosition(occupant, x, y, state);
            const result = await petMoveOperation(env, 'attackMonster')(
                monster,
                occupant,
                after,
                env,
            );
            if (result !== MMOVE_DONE && result !== MMOVE_DIED)
                throw new RangeError('dog_move attackMonster status');
            return result;
        }
        if ((data.info[index] & ALLOW_MDISP) && occupant
            && betterWithDisplacing
            && !undesirable_disp(monster, x, y, env)) {
            const result = await petMoveOperation(env, 'displaceMonster')(
                monster,
                occupant,
                env,
            );
            return result & M_ATTK_DEF_DIED
                ? MMOVE_DIED : MMOVE_NOTHING;
        }
        if (petMoveOperation(env, 'avoidKicked')(
            monster,
            x,
            y,
            env,
        ) || petMoveOperation(env, 'avoidSokobanPush')(
            monster,
            x,
            y,
            env,
        )) {
            continue;
        }

        const trap = (data.info[index] & ALLOW_TRAPS)
            ? t_at(x, y, state) : null;
        if (trap) {
            if (monster.mleashed) {
                if (!heroDeaf(state)) {
                    await petMoveOperation(env, 'whimper')(monster, env);
                }
            } else if (trap.tseen && random.rn2(40)) {
                continue;
            }
        }

        if (edog) {
            const canReachFood = env.couldReachItem(
                monster,
                x,
                y,
                state,
            );
            for (let obj = state.level?.objects?.[x]?.[y] ?? null;
                obj;
                obj = obj.nexthere) {
                if (obj.cursed) {
                    curseMessages[index] = true;
                    continue;
                }
                if (!canReachFood) continue;
                const foodType = env.dogfood(monster, obj, env);
                if (foodType < MANFOOD
                    && (foodType < env.accfood
                        || edog.hungrytime <= state.moves)) {
                    nextX = x;
                    nextY = y;
                    chosenIndex = index;
                    eatAfterMoving = obj;
                    curseMessages[index] = false;
                    break;
                }
            }
            if (eatAfterMoving) break;
        }
        if (curseMessages[index] && !monster.mleashed
            && uncursedCount > 0
            && random.rn2(13 * uncursedCount)) {
            continue;
        }

        if (!monster.mleashed
            && distmin(
                monster.mx,
                monster.my,
                state.u.ux,
                state.u.uy,
            ) > 5) {
            const backtrackCount = edog ? uncursedCount : count;
            let rejected = false;
            for (let trackIndex = 0;
                trackIndex < MTSZ && trackIndex < backtrackCount - 1;
                ++trackIndex) {
                if (x === monster.mtrack[trackIndex].x
                    && y === monster.mtrack[trackIndex].y
                    && random.rn2(MTSZ * (backtrackCount - trackIndex))) {
                    rejected = true;
                    break;
                }
            }
            if (rejected) continue;
        }

        const distance = dist2(x, y, state.gg.gx, state.gg.gy);
        const relative = (distance - nearestDistance) * approach;
        if ((relative === 0 && !random.rn2(++choiceCount))
            || relative < 0
            || (relative > 0 && !whistleApproach
                && ((originX === nextX && originY === nextY
                    && !random.rn2(3))
                    || !random.rn2(12)))) {
            nextX = x;
            nextY = y;
            nearestDistance = distance;
            if (relative < 0) choiceCount = 0;
            chosenIndex = index;
        }
    }

    if (!eatAfterMoving) {
        const rangedResult = await petMoveOperation(
            env,
            'petRangedAttack',
        )(monster, false, env);
        if (rangedResult !== MMOVE_NOTHING) return rangedResult;
    }

    if (nextX !== originX || nextY !== originY) {
        if (data.info[chosenIndex] & ALLOW_U) {
            if (monster.mleashed) {
                await petMoveOperation(env, 'reportLeashBreak')(
                    monster,
                    env,
                );
                petMoveOperation(env, 'unleashMonster')(monster, false, env);
            }
            await petMoveOperation(env, 'attackHero')(monster, env);
            return MMOVE_DONE;
        }
        if (!await petMoveOperation(env, 'mayCrossRegion')(
            monster,
            nextX,
            nextY,
            env,
        )) {
            return MMOVE_MOVED;
        }
        if (petMoveOperation(env, 'digWeaponCheck')(
            monster,
            nextX,
            nextY,
            env,
        )) {
            return MMOVE_NOTHING;
        }
        const wasSeen = Boolean(petMoveOperation(env, 'canSeeMonster')(
            monster,
            state,
        ));
        remove_monster(originX, originY, state);
        place_monster(monster, nextX, nextY, state);
        if (curseMessages[chosenIndex]
            && (wasSeen || Boolean(petMoveOperation(
                env,
                'canSeeMonster',
            )(monster, state)))) {
            // C ref: dogmove.c:1299-1312. Describe the top item of the pile
            // rather than the cursed item that made the pet reluctant. C
            // avoids glyph_at() here on purpose, as its comment at 1299-1301
            // says: place_monster() above has already put the pet on the
            // square, so glyph_at() would answer with the pet. The question is
            // whether the hero's map memory holds an object there.
            const remembersObject = !Hallucination(state)
                && Boolean(state.level?.flags?.hero_memory)
                && glyph_is_object(state.level.at(nextX, nextY));
            const top = remembersObject ? vobj_at(nextX, nextY, state) : null;
            // decl.h:36 aliases `something` to the string "something".
            const what = top
                ? distant_name(top, donameFresh, state)
                : 'something';
            // C ref: pline.c pline_mon() (138-150). It is plain pline() behind
            // set_msg_xy(mtmp->mx, mtmp->my), which only the accessiblemsg
            // option reads back; messageAt() carries that coordinate the same
            // way js/mon.js wake_msg() does for mon.c:4325. place_monster()
            // has already moved the pet, so mx and my are the destination.
            const message = env.message ?? ttyPline;
            await message(
                messageAt(
                    `${capitalizedAlwaysVisibleMonsterName(monster, state)}`
                    + ` ${vtense(null, locomotion(monster.data, 'step'))}`
                    + ' reluctantly '
                    + ((is_flyer(monster.data) || is_floater(monster.data))
                        ? 'over' : 'onto')
                    + ` ${what}.`,
                    monster.mx,
                    monster.my,
                    state,
                ),
                state,
            );
        }
        mon_track_add(monster, originX, originY);
        if (eatAfterMoving) {
            const result = await petMoveOperation(env, 'eatObject')(
                monster,
                eatAfterMoving,
                originX,
                originY,
                false,
                env,
            );
            if (result === MMOVE_DIED) return MMOVE_DIED;
        }
    } else if (monster.mleashed && heroDistance > 4) {
        await petMoveOperation(env, 'repositionLeashedPet')(
            monster,
            heroDistance,
            nextX,
            nextY,
            env,
        );
    }
    // Upstream reports a completed pet movement opportunity as MMOVE_MOVED
    // even when no candidate changed the coordinates.  m_move() uses this
    // result to run postmov() and finish the action.
    return MMOVE_MOVED;
}

// C ref: dogmove.c could_reach_item().
export function could_reach_item(monster, x, y, state = game) {
    return (!is_pool(x, y, state) || is_swimmer(monster.data))
        && (!is_lava(x, y, state) || likes_lava(monster.data))
        && (!sobj_at(BOULDER, x, y, state)
            || throws_rocks(monster.data));
}

// C ref: dogmove.c can_reach_location(). The source recursion is bounded by
// dog_goal()'s five-square search radius; retain its x-major/y-minor order.
export function can_reach_location(
    monster,
    startX,
    startY,
    goalX,
    goalY,
    state = game,
) {
    if (startX === goalX && startY === goalY) return true;
    if (!isok(startX, startY)) return false;

    const distance = dist2(startX, startY, goalX, goalY);
    for (let x = startX - 1; x <= startX + 1; ++x) {
        for (let y = startY - 1; y <= startY + 1; ++y) {
            if (!isok(x, y) || dist2(x, y, goalX, goalY) >= distance)
                continue;
            const location = state.level?.at?.(x, y);
            if (!location) continue;
            if (IS_OBSTRUCTED(location.typ)
                && !passes_walls(monster.data)
                && (!may_dig(x, y, state)
                    || !tunnels(monster.data)
                    || on_level(state.u?.uz, state.rogue_level))) {
                continue;
            }
            if (IS_DOOR(location.typ)
                && (doorMask(location) & (D_CLOSED | D_LOCKED))) {
                continue;
            }
            if (!could_reach_item(monster, x, y, state)) continue;
            if (can_reach_location(
                monster,
                x,
                y,
                goalX,
                goalY,
                state,
            )) {
                return true;
            }
        }
    }
    return false;
}
