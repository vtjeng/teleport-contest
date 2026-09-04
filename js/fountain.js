// fountain.js -- drinking from and dipping into fountains.
// C ref: src/fountain.c floating_above() (18-32), dowatersnakes() (38-60),
//        dowaterdemon() (64-90), dowaternymph() (93-116),
//        dogushforth() (119-131) and gush() (133-161),
//        dofindgem() (163-176), dryup() (201-239),
//        drinkfountain() (243-390), dipfountain() (394-554),
//        wash_hands() (557-577).

import {
    ARM,
    A_WIS,
    ER_DESTROYED,
    ER_GREASED,
    ER_NOTHING,
    FINGER,
    G_GONE,
    GLIB,
    HALLUC,
    HALLUC_RES,
    HAND,
    IS_DOOR,
    IS_FOUNTAIN,
    LEVITATION,
    MM_NOMSG,
    POOL,
    ROOM,
    SDOOR,
    TIMEOUT,
    isok,
    nothing_seems_to_happen,
} from './const.js';
import { exercise } from './attrib.js';
import { monster_detect } from './detect.js';
import {
    bot, newsym, glyph_at, glyph_is_cmap, glyph_to_cmap,
} from './display.js';
import { hliquid, a_monnam } from './do_name.js';
import { level_difficulty, dunlevs_in_dungeon, dunlev } from './dungeon.js';
import { del_engr_at } from './engrave.js';
import { game } from './gstate.js';
import { distmin } from './hacklib.js';
import { update_inventory, delobj, money_cnt } from './invent.js';
import { makemon_runtime } from './makemon_create.js';
import { mhis, mhe } from './mondata.js';
import { m_at } from './monst.js';
import { heroIsBlind } from './startup_a11y.js';
import {
    PM_KNIGHT, PM_WATER_DEMON, PM_WATER_MOCCASIN, PM_WATER_NYMPH,
} from './monsters.js';
import { mkgold, mksobj_at, rnd_class, sobj_at, carried } from './obj.js';
import { body_part } from './polyself.js';
import { d, rn1, rn2, rnd, rne } from './rng.js';
import { set_levltyp } from './terrain.js';
import { cansee, do_clear_area } from './vision.js';
import { S_cloud } from './symbols.js';
import { mintrap } from './trap_effects.js';
import { t_at, deltrap, reset_utrap } from './trap.js';
import { water_damage } from './trap_water_damage.js';
import { ttyPline } from './tty_message.js';
import { makeplural } from './fruit.js';
import {
    BOULDER, DILITHIUM_CRYSTAL, LUCKSTONE, COIN_CLASS,
} from './objects.js';

// ── Fail-closed error ──
// Thrown when a fountain function reaches a branch this port has not ported.
export class UnsupportedFountainError extends Error {
    constructor(reason) {
        super(`fountain requires ${reason}`);
        this.name = 'UnsupportedFountainError';
        this.reason = reason;
    }
}

// C ref: youprop.h:240 Levitation. Local because each file defines its own.
function Levitation(state) {
    const value = state.u?.uprops?.[LEVITATION];
    return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
}

// ── floating_above ──
// C ref: fountain.c floating_above() (18-32). Prints a message when the
// hero tries to interact with a feature while levitating.
export async function floating_above(what, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    // C ref: fountain.c:25-29. Trapped in floor overrides the usual message.
    // The TT_INFLOOR and TT_LAVA paths need surface(), which is not ported.
    if (state.u.utrap
        && (state.u.utraptype === 4 /* TT_INFLOOR */
            || state.u.utraptype === 5 /* TT_LAVA */)) {
        throw new UnsupportedFountainError(
            'surface() for floating_above while trapped');
    }
    await message(`You are floating high above the ${what}.`, state);
}

// ── dowaterdemon ──
// C ref: fountain.c dowaterdemon() (64-90). Summon a water demon; on low
// levels the demon may grant a wish instead of attacking.
async function dowaterdemon(state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? { d, rn1, rn2, rnd, rne };
    const makeMonster = env.makeMonster ?? makemon_runtime;

    if (!(state.mvitals[PM_WATER_DEMON].mvflags & G_GONE)) {
        const mtmp = await makeMonster(
            state.mons[PM_WATER_DEMON],
            state.u.ux,
            state.u.uy,
            MM_NOMSG,
            { ...env, state, random },
        );
        if (mtmp) {
            if (!heroIsBlind(state)) {
                await message(
                    `You unleash ${a_monnam(mtmp, { state })}!`,
                    state,
                );
            } else {
                await message('You feel the presence of evil.', state);
            }

            // C ref: fountain.c:78. On low levels the demon is grateful
            // and grants a wish. level_difficulty() adds depth adjustments.
            if (random.rnd(100) > (80 + level_difficulty(state))) {
                await message(
                    `Grateful for ${mhis(mtmp, { state })} release, `
                    + `${mhe(mtmp, { state })} grants you a wish!`,
                    state,
                );
                // mongrantswish removes the monster and gives a wish.
                // Dynamic import breaks the fountain.js <-> potion.js cycle.
                const { mongrantswish } = await import('./potion.js');
                await mongrantswish(mtmp, state, env);
            } else if (t_at(mtmp.mx, mtmp.my, state)) {
                await mintrap(mtmp, 0, { ...env, state, random });
            }
        }
    } else {
        // Extinct or genocided.
        await message(
            'The fountain bubbles furiously for a moment, then calms.',
            state,
        );
    }
}

// C ref: fountain.c dowatersnakes() (38-60). This admits only the ordinary
// sighted, non-hallucinating branch. The blind branch needs Soundeffect() and
// You_hear(), while the hallucinating branch needs rndmonnam(); both remain
// explicit boundaries rather than consuming a partial effect.
async function dowatersnakes(state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? { d, rn1, rn2, rnd, rne };
    const makeMonster = env.makeMonster ?? makemon_runtime;
    const hallucination = state.u?.uprops?.[HALLUC];
    const hallucinationResistance = state.u?.uprops?.[HALLUC_RES];

    if (state.mvitals[PM_WATER_MOCCASIN].mvflags & G_GONE) {
        throw new UnsupportedFountainError(
            'the extinct water-snake fountain effect (fate 22)',
        );
    }
    if (heroIsBlind(state)) {
        throw new UnsupportedFountainError(
            'the blind water-snake fountain effect (fate 22)',
        );
    }
    if (hallucination?.intrinsic
        && !(hallucinationResistance?.intrinsic
            || hallucinationResistance?.extrinsic)) {
        throw new UnsupportedFountainError(
            'the hallucinating water-snake fountain effect (fate 22)',
        );
    }

    const num = random.rn1(5, 2);
    await message('An endless stream of snakes pours forth!', state);
    for (let remaining = num; remaining > 0; --remaining) {
        const monster = await makeMonster(
            state.mons[PM_WATER_MOCCASIN],
            state.u.ux,
            state.u.uy,
            MM_NOMSG,
            { ...env, state, random },
        );
        if (monster && t_at(monster.mx, monster.my, state)) {
            await mintrap(monster, 0, { ...env, state, random });
        }
    }
}

// ── dowaternymph ──
// C ref: fountain.c dowaternymph() (93-116). Summon a water nymph at
// the fountain. If extinct or genocided, print a bubble message. The
// blind and deaf paths (You_hear / Soundeffect) remain fail-closed.
async function dowaternymph(state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? { d, rn1, rn2, rnd, rne };
    const makeMonster = env.makeMonster ?? makemon_runtime;

    if (!(state.mvitals[PM_WATER_NYMPH].mvflags & G_GONE)) {
        const mtmp = await makeMonster(
            state.mons[PM_WATER_NYMPH],
            state.u.ux,
            state.u.uy,
            MM_NOMSG,
            { ...env, state, random },
        );
        if (mtmp) {
            if (!heroIsBlind(state)) {
                await message(
                    `You attract ${a_monnam(mtmp, { state })}!`, state);
            } else {
                throw new UnsupportedFountainError(
                    'You_hear for blind water nymph attraction');
            }
            mtmp.msleeping = 0;
            if (t_at(mtmp.mx, mtmp.my, state)) {
                await mintrap(mtmp, 0, { ...env, state, random });
            }
        }
    } else if (!heroIsBlind(state)) {
        // C ref: fountain.c:109-110. Extinct nymphs, sighted hero.
        // Soundeffect calls are not ported; skip them.
        await message(
            'A large bubble rises to the surface and pops.', state);
    } else {
        throw new UnsupportedFountainError(
            'You_hear for blind water nymph bubble');
    }
}

// ── dogushforth ──
// C ref: fountain.c dogushforth() (119-131) and gush() (133-161).
// Water gushes forth from the fountain, potentially creating pools.
async function dogushforth(drinking, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? { rn2 };
    let madepool = 0;

    // C ref: fountain.c:124. do_clear_area with range 7 calls gush()
    // for each visible square. The callback is synchronous in C; we
    // collect the work and run it.
    const poolSquares = [];
    do_clear_area(state.u.ux, state.u.uy, 7,
        (x, y) => {
            // C ref: fountain.c gush() (133-161). Inlined here.
            if (((x + y) % 2) || (x === state.u.ux && y === state.u.uy)
                || random.rn2(1 + distmin(state.u.ux, state.u.uy, x, y))
                || state.level.at(x, y).typ !== ROOM
                || sobj_at(BOULDER, x, y, state)
                || nexttodoor(x, y, state)) {
                return;
            }
            // C ref: fountain.c:144-145. Delete floor trap if possible.
            const ttmp = t_at(x, y, state);
            if (ttmp && !delfloortrap(ttmp, state)) return;

            poolSquares.push({ x, y });
        },
        null,
        state,
    );

    // Apply pool creation after the visibility scan completes.
    for (const { x, y } of poolSquares) {
        if (!madepool) {
            await message(
                'Water gushes forth from the overflowing fountain!', state);
        }
        madepool++;

        // C ref: fountain.c:151-155. Create a pool.
        set_levltyp(x, y, POOL, { state });
        state.level.at(x, y).flags = 0;
        del_engr_at(x, y, state);
        // C ref: fountain.c:155. water_damage_chain on floor objects.
        // Not ported; fail-closed only if objects are present.
        const floorObjects = state.level.objects?.[x]?.[y];
        if (floorObjects) {
            throw new UnsupportedFountainError(
                'water_damage_chain() on floor objects in gush()');
        }

        // C ref: fountain.c:157-160. Drown monster or update display.
        const mtmp = m_at(x, y, state);
        if (mtmp) {
            const { minliquid: minliq } = await import('./mon.js');
            await minliq(mtmp, { ...env, state, random });
        } else {
            newsym(x, y);
        }
    }

    if (!madepool) {
        if (drinking) {
            await message('Your thirst is quenched.', state);
        } else {
            await message('Water sprays all over you.', state);
        }
    }
}

// C ref: mkroom.c nexttodoor() (623-637). Returns true if any adjacent
// square is a door or secret door.
function nexttodoor(sx, sy, state) {
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (!isok(sx + dx, sy + dy)) continue;
            const typ = state.level.at(sx + dx, sy + dy).typ;
            if (IS_DOOR(typ) || typ === SDOOR) return true;
        }
    }
    return false;
}

// C ref: trap.c delfloortrap() (6667-6690). Delete certain floor traps.
function delfloortrap(ttmp, state) {
    const {
        SQKY_BOARD, BEAR_TRAP, LANDMINE, FIRE_TRAP, TELEP_TRAP,
        LEVEL_TELEP, WEB, MAGIC_TRAP, ANTI_MAGIC, is_pit, is_hole,
    } = require_trap_constants();
    if (ttmp && (ttmp.ttyp === SQKY_BOARD || ttmp.ttyp === BEAR_TRAP
        || ttmp.ttyp === LANDMINE || ttmp.ttyp === FIRE_TRAP
        || is_pit(ttmp.ttyp) || is_hole(ttmp.ttyp)
        || ttmp.ttyp === TELEP_TRAP || ttmp.ttyp === LEVEL_TELEP
        || ttmp.ttyp === WEB || ttmp.ttyp === MAGIC_TRAP
        || ttmp.ttyp === ANTI_MAGIC)) {
        if (state.u.ux === ttmp.tx && state.u.uy === ttmp.ty) {
            // C ref: trap.c:6681 u_at check.
            if ((state.u.utraptype ?? 0) !== 6 /* TT_BURIEDBALL */) {
                reset_utrap(true, state);
            }
        } else {
            const mtmp = m_at(ttmp.tx, ttmp.ty, state);
            if (mtmp) mtmp.mtrapped = 0;
        }
        deltrap(ttmp, state);
        return true;
    }
    return false;
}

// Lazy import of trap constants to avoid circular dependency.
let _trapConstants = null;
function require_trap_constants() {
    if (!_trapConstants) {
        // All of these are already imported from const.js at the top
        // of this file via the barrel import pattern. Import them
        // dynamically to keep the static import list manageable.
        _trapConstants = {
            SQKY_BOARD: 4, BEAR_TRAP: 5, LANDMINE: 6,
            FIRE_TRAP: 10, TELEP_TRAP: 15, LEVEL_TELEP: 16,
            WEB: 18, MAGIC_TRAP: 20, ANTI_MAGIC: 21,
            is_pit: (ttyp) => ttyp === 8 /* PIT */ || ttyp === 9 /* SPIKED_PIT */,
            is_hole: (ttyp) => ttyp === 11 /* HOLE */ || ttyp === 12 /* TRAPDOOR */,
        };
    }
    return _trapConstants;
}

// ── dofindgem ──
// C ref: fountain.c dofindgem() (163-176). Create a random gem at the
// fountain and mark it looted.
async function dofindgem(state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? { rnd };

    if (!heroIsBlind(state)) {
        await message('You spot a gem in the sparkling waters!', state);
    } else {
        await message('You feel a gem here!', state);
    }
    // C ref: fountain.c:171. rnd_class(DILITHIUM_CRYSTAL, LUCKSTONE - 1)
    // picks a random gem type.
    mksobj_at(
        rnd_class(DILITHIUM_CRYSTAL, LUCKSTONE - 1, { random, state }),
        state.u.ux, state.u.uy,
        false, false,
        { random, state },
    );
    SET_FOUNTAIN_LOOTED(state.u.ux, state.u.uy, state);
    newsym(state.u.ux, state.u.uy);
    await exercise(A_WIS, true, state, random, {
        encumberMessage: env.encumberMessage,
    });
}

// ── dryup ──
// C ref: fountain.c dryup() (201-239). With probability 1/3 (or if
// warned), dry up the fountain and replace it with ordinary floor.
async function dryup(x, y, isyou, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? { rn2 };

    if (IS_FOUNTAIN(state.level.at(x, y).typ)
        && (!random.rn2(3)
            || (state.level.at(x, y).flags & F_WARNED))) {
        // C ref: fountain.c:205-214. Town fountain warning; the watch
        // warns the hero. in_town() is not ported; fail-closed so a
        // town-fountain path stops the scorer rather than skipping the
        // watchman interaction.
        if (isyou && in_town_stub(x, y, state)
            && !(state.level.at(x, y).flags & F_WARNED)) {
            throw new UnsupportedFountainError(
                'the in-town fountain warning in dryup()');
        }

        // C ref: fountain.c:216-219. Wizard-mode confirmation.
        // Not needed; the port does not run in wizard mode.

        // C ref: fountain.c:223-228. "The fountain dries up!" if visible
        // and not obscured by a cloud glyph.
        if (cansee(x, y, state)) {
            const glyph = glyph_at(x, y, state);
            if (!glyph_is_cmap(glyph)
                || glyph_to_cmap(glyph) !== S_cloud) {
                await message('The fountain dries up!', state);
            }
        }

        // C ref: fountain.c:230-232. Replace with ordinary floor.
        set_levltyp(x, y, ROOM, { state });
        state.level.at(x, y).flags = 0;
        state.level.at(x, y).horizontal = 0; // blessedftn

        // C ref: fountain.c:235. newsym() so the tile updates.
        newsym(x, y);

        // C ref: fountain.c:236-237. Town guards get angry.
        if (isyou && in_town_stub(x, y, state)) {
            throw new UnsupportedFountainError(
                'angry_guards() after drying up a town fountain');
        }
    }
}

// Fountain flag bits from rm.h.
const F_LOOTED = 1;
const F_WARNED = 2;

// Stub: in_town() is not ported. Returns false so non-town fountains
// work; any session that reaches a town fountain will hit the
// fail-closed throw above instead of silently skipping the watchman.
function in_town_stub(_x, _y, _state) {
    return false;
}

// ── drinkfountain ──
// C ref: fountain.c drinkfountain() (243-390). Called from dodrink() when
// the hero is standing on a fountain and answers 'y' to the prompt.
export async function drinkfountain(state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? { d, rn1, rn2, rnd, rne };

    const mgkftn = state.level.at(state.u.ux, state.u.uy).horizontal === 1;
    const fate = random.rnd(30);

    // C ref: fountain.c:249-252. Levitation prevents drinking.
    if (Levitation(state)) {
        await floating_above('fountain', state, env);
        return;
    }

    // C ref: fountain.c:254-277. Blessed fountain with positive luck.
    if (mgkftn && (state.u.uluck ?? 0) >= 0 && fate >= 10) {
        throw new UnsupportedFountainError(
            'the blessed-fountain ability restoration in drinkfountain()');
    }

    if (fate < 10) {
        // C ref: fountain.c:279-284. Refreshing draught.
        await message('The cool draught refreshes you.', state);
        state.u.uhunger += random.rnd(10);
        // newuhs(FALSE) updates hunger status; it is ported in eat.js.
        // Import deferred to avoid a circular dependency at load time.
        const { newuhs } = await import('./eat.js');
        await newuhs(false, state, env);
        if (mgkftn) return;
    } else {
        switch (fate) {
        case 19: // Self-knowledge
            throw new UnsupportedFountainError(
                'self-knowledge fountain effect (fate 19)');
        case 20: // Foul water
            // C ref: fountain.c:313-316. eat.js and hack.js are imported
            // here rather than at the top of the file, as newuhs() is above,
            // to keep fountain.js out of their import cycle; they supply the
            // hooks morehungry() needs if this subtraction changes hunger
            // status.
            await message('The water is foul!  You gag and vomit.', state);
            {
                const { morehungry, vomit } = await import('./eat.js');
                const { endRunning } = await import('./hack.js');
                const hungerEnv = {
                    ...env,
                    message,
                    endRunning: env.endRunning
                        ?? ((currentState) => endRunning(currentState)),
                    statusRefresh: env.statusRefresh ?? (() => bot()),
                };
                await morehungry(
                    random.rn1(20, 11),
                    state,
                    hungerEnv,
                );
                vomit(state);
            }
            break;
        case 21: // Poisonous
            throw new UnsupportedFountainError(
                'poisonous-water fountain effect (fate 21)');
        case 22: // Fountain of snakes!
            await dowatersnakes(state, env);
            break;
        case 23: // Water demon
            await dowaterdemon(state, env);
            break;
        case 24: // Maybe curse some items
            throw new UnsupportedFountainError(
                'cursing-items fountain effect (fate 24)');
        case 25: // See invisible
            throw new UnsupportedFountainError(
                'see-invisible fountain effect (fate 25)');
        case 26: // See Monsters
            if (await monster_detect(null, 0, state, env)) {
                await message('The water tastes like nothing.', state);
            }
            await exercise(A_WIS, true, state, random, {
                encumberMessage: env.encumberMessage,
            });
            break;
        case 27: // Find a gem
            throw new UnsupportedFountainError(
                'find-gem fountain effect (fate 27)');
        case 28: // Water Nymph
            throw new UnsupportedFountainError(
                'water-nymph fountain effect (fate 28)');
        case 29: // Scare
            throw new UnsupportedFountainError(
                'scare fountain effect (fate 29)');
        case 30: // Gushing forth
            throw new UnsupportedFountainError(
                'gushing-forth fountain effect (fate 30)');
        default: // Tepid water
            throw new UnsupportedFountainError(
                'tepid-water fountain effect (default)');
        }
    }

    // C ref: fountain.c:389. Common tail: possibly dry up the fountain.
    await dryup(state.u.ux, state.u.uy, true, state, env);
}

// ── Fountain flag macros ──
// C ref: rm.h FOUNTAIN_IS_LOOTED, SET_FOUNTAIN_LOOTED, CLEAR_FOUNTAIN_LOOTED.
function FOUNTAIN_IS_LOOTED(x, y, state) {
    return Boolean(state.level.at(x, y).flags & F_LOOTED);
}
function SET_FOUNTAIN_LOOTED(x, y, state) {
    state.level.at(x, y).flags |= F_LOOTED;
}
function CLEAR_FOUNTAIN_LOOTED(x, y, state) {
    state.level.at(x, y).flags &= ~F_LOOTED;
}

// ── somegold ──
// C ref: steal.c somegold() (14-34). Determine how much gold to lose
// based on the total amount available. Uses rn1 for each bracket.
function somegold(lmoney, random) {
    const LARGEST_INT = 0x7FFFFFFF;
    let igold = lmoney >= LARGEST_INT ? LARGEST_INT : Math.trunc(lmoney);
    if (igold < 50) {
        // all gold
    } else if (igold < 100) {
        igold = random.rn1(igold - 25 + 1, 25);
    } else if (igold < 500) {
        igold = random.rn1(igold - 50 + 1, 50);
    } else if (igold < 1000) {
        igold = random.rn1(igold - 100 + 1, 100);
    } else if (igold < 5000) {
        igold = random.rn1(igold - 500 + 1, 500);
    } else if (igold < 10000) {
        igold = random.rn1(igold - 1000 + 1, 1000);
    } else {
        igold = random.rn1(igold - 5000 + 1, 5000);
    }
    return igold;
}

// ── dipfountain ──
// C ref: fountain.c dipfountain() (394-554). Called from dodip() when the
// hero dips an object into a fountain. Applies water_damage to the item,
// then rolls rnd(30) for a random fate.
//
// Fail-closed arms: Excalibur creation (long sword + lawful + knight),
// curse/uncurse (unless exercised), and several fate branches that need
// unported helpers.
export async function dipfountain(obj, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? { d, rn1, rn2, rnd, rne };
    const { hands_obj } = await import('./invent.js');

    let er = ER_NOTHING;
    const is_hands = (obj === hands_obj);

    // C ref: fountain.c:399-402. Levitation prevents dipping.
    if (Levitation(state)) {
        await floating_above('fountain', state, env);
        return;
    }

    // C ref: fountain.c:404-447. Excalibur path: dipping a long sword
    // in a fountain when the hero meets specific conditions. Fail-closed
    // because it needs oname(), discover_artifact(), and artifact checks
    // that are not fully ported for in-game use.
    const { LONG_SWORD } = await import('./objects.js');
    if (obj.otyp === LONG_SWORD && (state.u.ulevel ?? 0) >= 5) {
        // C evaluates rn2() as part of the compound condition; consume it
        // even when throwing so the PRNG stays in sync.
        const isKnight = state.urole?.mnum === PM_KNIGHT;
        if (!random.rn2(isKnight ? 6 : 30)
            && obj.quan === 1 && !obj.oartifact) {
            throw new UnsupportedFountainError(
                'the Excalibur creation path in dipfountain()');
        }
    }

    // C ref: fountain.c:448-452. Wash hands or water-damage the item.
    if (is_hands || obj === state.u.uarmg) {
        er = await wash_hands(state, env);
    } else {
        er = await water_damage(obj, null, true, {
            ...env, state, random, message,
        });
    }

    // C ref: fountain.c:454-456. If item was damaged and coin flip, stop.
    if (er === ER_DESTROYED || (er !== ER_NOTHING && !random.rn2(2))) {
        return;
    }

    // C ref: fountain.c:458-551. Random fate dispatch.
    const fate = random.rnd(30);
    switch (fate) {
    case 16: // Curse the item
        if (!is_hands && obj.oclass !== COIN_CLASS && !obj.cursed) {
            obj.blessed = false;
            obj.cursed = true;
            // C ref: mkobj.c curse() has side effects for carried items
            // (luck, equipment, timers). The full version is not ported;
            // the flag flip matches the field-level effect.
        }
        break;
    case 17:
    case 18:
    case 19:
    case 20: // Uncurse the item
        if (!is_hands && obj.cursed) {
            if (!heroIsBlind(state)) {
                await message(
                    `The ${hliquid('water', env)} glows for a moment.`,
                    state);
            }
            obj.cursed = false;
        } else {
            await message('A feeling of loss comes over you.', state);
        }
        break;
    case 21: // Water Demon
        await dowaterdemon(state, env);
        break;
    case 22: // Water Nymph
        await dowaternymph(state, env);
        break;
    case 23: // An Endless Stream of Snakes
        await dowatersnakes(state, env);
        break;
    case 24: // Find a gem
        if (!FOUNTAIN_IS_LOOTED(state.u.ux, state.u.uy, state)) {
            await dofindgem(state, env);
            break;
        }
        // FALLTHROUGH
        // eslint-disable-next-line no-fallthrough
    case 25: // Water gushes forth
        await dogushforth(false, state, env);
        break;
    case 26: // Strange feeling
        await message(
            `A strange tingling runs up your ${body_part(ARM, state)}.`,
            state);
        break;
    case 27: // Strange feeling
        await message('You feel a sudden chill.', state);
        break;
    case 28: { // An urge to take a bath
        await message(
            'An urge to take a bath overwhelms you.', state);
        const money = money_cnt(state.invent ?? null);
        if (money > 10) {
            // C ref: fountain.c:509-523. Lose some gold in the fountain.
            let loss = Math.trunc(somegold(money, random) / 10);
            let otmp = state.invent ?? null;
            while (otmp && loss > 0) {
                const nextobj = otmp.nobj;
                if (otmp.oclass === COIN_CLASS) {
                    const { objectType } = await import('./obj.js');
                    const denomination = objectType(otmp, state).oc_cost;
                    let coin_loss = Math.trunc(
                        (loss + denomination - 1) / denomination);
                    coin_loss = Math.min(coin_loss, Math.trunc(otmp.quan));
                    otmp.quan -= coin_loss;
                    loss -= coin_loss * denomination;
                    if (!otmp.quan) delobj(otmp, { state });
                }
                otmp = nextobj;
            }
            await message(
                'You lost some of your gold in the fountain!', state);
            CLEAR_FOUNTAIN_LOOTED(state.u.ux, state.u.uy, state);
            await exercise(A_WIS, false, state, random, {
                encumberMessage: env.encumberMessage,
            });
        }
        break;
    }
    case 29: { // You see coins
        if (FOUNTAIN_IS_LOOTED(state.u.ux, state.u.uy, state)) break;
        SET_FOUNTAIN_LOOTED(state.u.ux, state.u.uy, state);
        const coinAmount = random.rnd(
            (dunlevs_in_dungeon(state.u.uz, state) - dunlev(state.u.uz)
                + 1) * 2) + 5;
        mkgold(coinAmount, state.u.ux, state.u.uy, { random, state });
        if (!heroIsBlind(state)) {
            await message(
                `Far below you, you see coins glistening in the ${hliquid('water', env)}.`,
                state);
        }
        await exercise(A_WIS, true, state, random, {
            encumberMessage: env.encumberMessage,
        });
        newsym(state.u.ux, state.u.uy);
        break;
    }
    default:
        if (er === ER_NOTHING) {
            await message(nothing_seems_to_happen, state);
        }
        break;
    }
    update_inventory(env);
    await dryup(state.u.ux, state.u.uy, true, state, env);
}

// ── wash_hands ──
// C ref: fountain.c wash_hands() (557-577). Wash hands in fountain, pool,
// or sink. Clears Glib and optionally applies water damage to gloves.
export async function wash_hands(state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? { rn2 };
    const hands = makeplural(body_part(HAND, state));
    let res = ER_NOTHING;
    const wasGlib = Boolean(state.u?.uprops?.[GLIB]?.intrinsic & TIMEOUT);

    await message(
        `You wash your ${state.u.uarmg ? 'gloved ' : ''}${hands} in the ${hliquid('water', env)}.`,
        state);

    if (wasGlib) {
        const { make_glib } = await import('./potion.js');
        make_glib(0, state);
        // C ref: fountain.c:568. fingers_or_gloves(TRUE).
        // do_wear.c fingers_or_gloves() is module-local; inline the logic.
        const digits = state.u.uarmg
            ? 'gloves' : makeplural(body_part(FINGER, state));
        await message(`Your ${digits} are no longer slippery.`, state);
    }

    if (state.u.uarmg) {
        res = await water_damage(state.u.uarmg, null, true, {
            ...env, state, random, message,
        });
    }

    // C ref: fountain.c:574-575. If was glib and no damage to gloves,
    // report ER_GREASED so the caller knows something happened.
    if (wasGlib && res === ER_NOTHING) {
        res = ER_GREASED;
    }
    return res;
}
