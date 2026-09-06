// Monster item-use AI: deciding which items to use and executing the use.
// C refs: muse.c precheck(), mzapwand(), mplayhorn(), mreadmsg(),
// mquaffmsg(), m_use_healing(), m_sees_sleepy_soldier(), find_defensive(),
// find_offensive(), use_offensive()'s hurled-potion case,
// searches_for_item(), cures_stoning(), mcould_eat_tin(); mondata.c
// can_blow().

import {
    ARTICLE_A,
    BOLT_LIM,
    DEAF,
    G_GONE,
    HALLUC,
    HALLUC_RES,
    MFAST,
    MS_SILENT,
    M_SEEN_ACID,
    M_SEEN_COLD,
    M_SEEN_ELEC,
    M_SEEN_FIRE,
    M_SEEN_MAGR,
    M_SEEN_REFL,
    M_SEEN_SLEEP,
    LADDER,
    MM_NOMSG,
    NON_PM,
    OBJ_FLOOR,
    P_DAGGER,
    P_KNIFE,
    POLY_TRAP,
    STAIRS,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    SUPPRESS_SADDLE,
    AUGMENT_IT,
    TELEP_TRAP,
    SEE_INVIS,
    W_ACCESSORY,
    W_AMUL,
    W_ARM,
    W_ARMOR,
    W_ARMF,
    W_ARMG,
    W_ARMS,
    W_SADDLE,
    helpless,
    is_hole,
    isok,
} from './const.js';
import { stop_occupation } from './allmain.js';
import { map_invisible } from './display.js';
import {
    a_monnam,
    capitalizedMonsterName,
    monsterCommonName,
    monverbself,
    rndmonnam,
    x_monnam,
} from './do_name.js';
import { Can_fall_thru } from './dungeon.js';
import { game } from './gstate.js';
import { dist2, distmin, sgn, strsubst } from './hacklib.js';
import { makemon, mongone } from './makemon_create.js';
import { set_malign } from './makemon.js';
import { m_carrying, monkilled } from './mon.js';
import {
    acidic, attacktype, breathless, dmgtype, has_head, is_animal, is_floater,
    is_mercenary, is_unicorn, is_vampshifter, mhe, mindless, needspick,
    nohands, nonliving, passes_walls, same_race, slimeproof, throws_rocks,
    touch_petrifies, verysmall,
} from './mondata.js';
import * as M from './monsters.js';
import { m_at } from './monst.js';
import {
    isContainer,
    objectType,
    sobj_at,
    unknow_object,
} from './obj.js';
import * as O from './objects.js';
import { an, ansimpleoname, donameFresh, simpleonames, singular,
    xnameFresh } from './objnam.js';
import { discover_object, objdescr_is, observe_object } from './o_init.js';
import { monnear, onscary, youHear } from './monmove.js';
import { lined_up } from './mthrowu.js';
import { in_your_sanctuary } from './priest.js';
import { d, rn2 } from './rng.js';
import { stairway_at } from './stairs.js';
import { messageAt, sensesMonster } from './startup_a11y.js';
import { enexto } from './teleport.js';
import { t_at } from './trap.js';
import { s_suffix } from './hacklib.js';
import { ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';
import { cansee, canseemon, couldsee } from './vision.js';
import { mwelded } from './wield.js';
import { which_armor } from './worn.js';

// The generated catalog stores these values but does not currently export
// their source enum names. MS_SILENT moved to js/const.js when sounds.c
// dochat() needed mondata.h is_silent(); the other two stay here until a
// second caller wants them.
const AT_GAZE = 15;
const MS_BUZZ = 10;

// C ref: muse.c:1272-1290, the offensive half of the MUSE_* action codes.
// Only the five throwable potions are ported; the rest are named so that
// find_offensive()'s nomore() skips and use_offensive()'s switch read the same
// numbering C does.
// C ref: muse.c:306-335, the defensive half of the MUSE_* action codes.
const MUSE_POT_HEALING = 3;
const MUSE_POT_EXTRA_HEALING = 4;
const MUSE_POT_FULL_HEALING = 18;

const MUSE_POT_PARALYSIS = 9;
const MUSE_POT_BLINDNESS = 10;
const MUSE_POT_CONFUSION = 11;
const MUSE_POT_ACID = 14;
const MUSE_POT_SLEEPING = 16;

// C ref: hack.h:1409 POTION_OCCUPANT_CHANCE(n). The chance a potion has a
// milky or smoky occupant decreases with the number already born.
function POTION_OCCUPANT_CHANCE(n) { return 13 + 2 * n; }

// C ref: hack.h distu() and mdistu(). Distance-squared from the hero to a
// monster's position.
function mdistu(mon, state) {
    return dist2(mon.mx, mon.my, state.u?.ux ?? 0, state.u?.uy ?? 0);
}

// C ref: youprop.h Hallucination (116-120).
function Hallucination(state) {
    const halluc = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(halluc?.intrinsic)
        && !(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: youprop.h Deaf.
function Deaf(state) {
    const deafness = state.u?.uprops?.[DEAF];
    return Boolean(deafness?.intrinsic || deafness?.extrinsic
        || state.u?.uroleplay?.deaf);
}

// C ref: pline.c pline_mon() (138-150). Set the message location to the
// monster's square and output the message. The JS port prefixes an accessible
// location through messageAt().
async function pline_mon(mon, text, state) {
    await ttyPline(messageAt(text, mon.mx, mon.my, state), state);
}

function activeHeroProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

// C ref: muse.c precheck() (59-161). Preliminary checks before a monster uses
// an item: milky/smoky potion occupants and cursed-wand backfire. Returns 0 if
// nothing happened, 1 if the monster died, 2 if it was incapacitated.
async function precheck(mon, obj, state, env = {}) {
    if (!obj) return 0;
    const vis = cansee(mon.mx, mon.my, state);

    if (obj.oclass === O.POTION_CLASS) {
        if (objdescr_is(obj, 'milky', state)) {
            if (!(state.mvitals[M.PM_GHOST].mvflags & G_GONE)
                && !rn2(POTION_OCCUPANT_CHANCE(
                    state.mvitals[M.PM_GHOST].born))) {
                const cc = enexto(mon.mx, mon.my,
                    state.mons[M.PM_GHOST], { state });
                if (!cc) return 0;
                await mquaffmsg(mon, obj, state);
                note_unported('mon.c m_useup');
                const mtmp = makemon(
                    state.mons[M.PM_GHOST], cc.x, cc.y, MM_NOMSG,
                    { state },
                );
                if (!mtmp) {
                    if (vis) {
                        await ttyPline(
                            'The potion turns out to be empty.', state);
                    }
                } else {
                    if (vis) {
                        await pline_mon(mon,
                            `As ${monsterCommonName(mon, state)} opens `
                            + `the bottle, an enormous `
                            + `${Hallucination(state) ? rndmonnam({ state }) : 'ghost'}`
                            + ` emerges!`, state);
                        await ttyPline(
                            `${capitalizedMonsterName(mon, state)} `
                            + `is frightened to death, `
                            + `and unable to move.`, state);
                    }
                    note_unported('mhitm.c paralyze_monst');
                }
                return 2;
            }
        }
        if (objdescr_is(obj, 'smoky', state)
            && !(state.mvitals[M.PM_DJINNI].mvflags & G_GONE)
            && !rn2(POTION_OCCUPANT_CHANCE(
                state.mvitals[M.PM_DJINNI].born))) {
            const cc = enexto(mon.mx, mon.my,
                state.mons[M.PM_DJINNI], { state });
            if (!cc) return 0;
            await mquaffmsg(mon, obj, state);
            note_unported('mon.c m_useup');
            const mtmp = makemon(
                state.mons[M.PM_DJINNI], cc.x, cc.y, MM_NOMSG,
                { state },
            );
            if (!mtmp) {
                if (vis) {
                    await ttyPline(
                        'The potion turns out to be empty.', state);
                }
            } else {
                if (vis) {
                    await pline_mon(mtmp,
                        `In a cloud of smoke, ${a_monnam(mtmp, { state })} emerges!`,
                        state);
                }
                await ttyPline(
                    `${vis ? capitalizedMonsterName(mtmp, state) : 'Something'} speaks.`,
                    state);
                // SetVoice() is a no-op in the tty build.
                if (rn2(2)) {
                    // verbalize("You freed me!") is You_hear('"...')
                    const freed = youHear('"You freed me!"', state);
                    if (freed) await ttyPline(freed, state);
                    mtmp.mpeaceful = 1;
                    set_malign(mtmp, state);
                } else {
                    // verbalize("It is about time.")
                    const about = youHear('"It is about time."', state);
                    if (about) await ttyPline(about, state);
                    if (vis) {
                        await ttyPline(
                            `${capitalizedMonsterName(mtmp, state)} vanishes.`,
                            state);
                    }
                    mongone(mtmp, { state });
                }
            }
            return 2;
        }
    }
    if (obj.oclass === O.WAND_CLASS && obj.cursed
        && !rn2(100 /* WAND_BACKFIRE_CHANCE */)) {
        const dam = d(obj.spe + 2, 6);

        if (vis) {
            await pline_mon(mon,
                `${capitalizedMonsterName(mon, state)} zaps `
                + `${an(xnameFresh(obj, state))}, which suddenly explodes!`,
                state);
        } else {
            /* same near/far threshold as mzapwand() */
            const range = couldsee(mon.mx, mon.my, state)
                ? (BOLT_LIM + 1) : (BOLT_LIM - 3);
            // Soundeffect is a no-op in the tty build.
            const heardZap = youHear(`a zap and an explosion ${
                (mdistu(mon, state) <= range * range)
                    ? 'nearby' : 'in the distance'}.`, state);
            if (heardZap) await ttyPline(heardZap, state);
        }
        note_unported('mon.c m_useup');
        mon.mhp -= dam;
        if (mon.mhp < 1 /* DEADMONSTER() */) {
            await monkilled(mon, '', M.AD_RBRE, state, env);
            return 1;
        }
        // gm.m.has_defense = gm.m.has_offense = gm.m.has_misc = 0;
        // Only one needed to be set to 0 but the others are harmless
    }
    return 0;
}

// C ref: muse.c mzapwand() (165-192). Message, charge deduction, and charge
// concealment when a monster zaps a wand.
async function mzapwand(mtmp, otmp, self, state) {
    if (otmp.spe < 1) {
        // impossible("Mon zapping wand with %d charges?", otmp->spe)
        return;
    }
    if (!canseemon(mtmp, state)) {
        const range = couldsee(mtmp.mx, mtmp.my, state)
            ? (BOLT_LIM + 1) : (BOLT_LIM - 3);
        // Soundeffect is a no-op in the tty build.
        const heardZap = youHear(`a ${
            (mdistu(mtmp, state) <= range * range)
                ? 'nearby' : 'distant'} zap.`, state);
        if (heardZap) await ttyPline(heardZap, state);
        unknow_object(otmp, state);
    } else if (self) {
        await ttyPline(
            `${monverbself(mtmp, capitalizedMonsterName(mtmp, state), 'zap', null, state)} with ${donameFresh(otmp, state)}!`,
            state);
    } else {
        await pline_mon(mtmp,
            `${capitalizedMonsterName(mtmp, state)} zaps ${an(xnameFresh(otmp, state))}!`,
            state);
        await stop_occupation(state);
    }
    otmp.spe -= 1;
}

// C ref: muse.c mplayhorn() (195-234). Similar to mzapwand() but for magical
// horns (the only instrument monsters play).
async function mplayhorn(mtmp, otmp, self, state) {
    if (!canseemon(mtmp, state)) {
        const range = couldsee(mtmp.mx, mtmp.my, state)
            ? (BOLT_LIM + 1) : (BOLT_LIM - 3);
        // Soundeffect is a no-op in the tty build.
        const heardHorn = youHear(`a horn being played ${
            (mdistu(mtmp, state) <= range * range)
                ? 'nearby' : 'in the distance'}.`, state);
        if (heardHorn) await ttyPline(heardHorn, state);
        unknow_object(otmp, state);
    } else if (self) {
        observe_object(otmp, state);
        let objnamp = xnameFresh(otmp, state);
        if (objnamp.length >= 128 /* QBUFSZ */)
            objnamp = simpleonames(otmp, state);
        const objbuf = `a ${objnamp} directed at`;
        await ttyPline(
            `${monverbself(mtmp, capitalizedMonsterName(mtmp, state), 'play', objbuf, state)}!`,
            state);
        discover_object(otmp.otyp, true, true, true, state); /* makeknown */
    } else {
        observe_object(otmp, state);
        let objnamp = xnameFresh(otmp, state);
        if (objnamp.length >= 128 /* QBUFSZ */)
            objnamp = simpleonames(otmp, state);
        await ttyPline(
            `${capitalizedMonsterName(mtmp, state)} plays `
            + `${an(objnamp)} directed at you!`,
            state);
        discover_object(otmp.otyp, true, true, true, state); /* makeknown */
        await stop_occupation(state);
    }
    otmp.spe -= 1; /* use a charge */
}

// C ref: muse.c mreadmsg() (238-292). Message when a monster reads a scroll;
// if the scroll hasn't been seen, its label is revealed unless the hero is
// deaf.
async function mreadmsg(mtmp, otmp, state) {
    const vismon = canseemon(mtmp, state);
    let tpindicator = !vismon && sensesMonster(mtmp, state);

    if (!vismon && Deaf(state))
        return; /* no feedback */

    observe_object(otmp, state);
    const onambuf = singular(otmp,
        vismon ? donameFresh : ansimpleoname, state);

    if (vismon) {
        await pline_mon(mtmp,
            `${capitalizedMonsterName(mtmp, state)} reads ${onambuf}!`,
            state);
    } else { /* !Deaf, otherwise we wouldn't reach here */
        const similar = same_race(state.youmonst?.data, mtmp.data, state);
        const uniqmon = ((mtmp.data?.geno & M.G_UNIQ) !== 0
            || mtmp.isshk);
        const recognize = !Hallucination(state)
            && (mtmp.meverseen || (similar && !uniqmon));
        const mflags = (SUPPRESS_INVISIBLE | SUPPRESS_SADDLE
            | (recognize ? SUPPRESS_IT : AUGMENT_IT));

        if (sensesMonster(mtmp, state)) {
            tpindicator = true;
        } else if (couldsee(mtmp.mx, mtmp.my, state)
            && mdistu(mtmp, state) <= 10 * 10) {
            map_invisible(mtmp.mx, mtmp.my, state);
        }

        let blindbuf = `reading ${onambuf}`;
        blindbuf = strsubst(blindbuf, 'reading a scroll labeled',
            mtmp.mconf ? 'attempting to incant' : 'incant');
        const heardRead = youHear(
            `${x_monnam(mtmp, ARTICLE_A, null, mflags, false, state)} `
            + `${blindbuf}.`, state);
        if (heardRead) await ttyPline(heardRead, state);
        if (tpindicator)
            note_unported('display.c flash_mon');
    }
    if (mtmp.mconf) /* (note: won't get if not seen and hero can't hear) */
        await ttyPline(
            `Being confused, ${
                vismon ? monsterCommonName(mtmp, state) : mhe(mtmp, state)
            } mispronounces the magic words...`, state);
}

// C ref: muse.c mquaffmsg() (293-303). Message when a monster quaffs a
// potion.
async function mquaffmsg(mtmp, otmp, state) {
    if (canseemon(mtmp, state)) {
        observe_object(otmp, state);
        await pline_mon(mtmp,
            `${capitalizedMonsterName(mtmp, state)} drinks ${singular(otmp, donameFresh, state)}!`,
            state);
    } else if (!Deaf(state)) {
        // Soundeffect is a no-op in the tty build.
        const heardChug = youHear('a chugging sound.', state);
        if (heardChug) await ttyPline(heardChug, state);
    }
}

// C ref: muse.c m_use_healing() (337-360). Checks whether the monster carries
// a healing potion (full, extra, or regular, in that priority). Returns a
// selection object when one is found, null otherwise. The C version sets
// gm.m.defensive and gm.m.has_defense; the JS version returns the selection
// for the caller to propagate.
function m_use_healing(mtmp, state) {
    let obj;
    if ((obj = m_carrying(mtmp, O.POT_FULL_HEALING, state)) != null) {
        return { kind: 'full healing', object: obj };
    }
    if ((obj = m_carrying(mtmp, O.POT_EXTRA_HEALING, state)) != null) {
        return { kind: 'extra healing', object: obj };
    }
    if ((obj = m_carrying(mtmp, O.POT_HEALING, state)) != null) {
        return { kind: 'healing', object: obj };
    }
    return null;
}

// C ref: muse.c m_sees_sleepy_soldier() (361-381).
function m_sees_sleepy_soldier(monster, state) {
    for (let x = monster.mx - 3; x <= monster.mx + 3; ++x) {
        for (let y = monster.my - 3; y <= monster.my + 3; ++y) {
            if (!isok(x, y) || (x === monster.mx && y === monster.my))
                continue;
            const soldier = m_at(x, y, state);
            if (soldier && is_mercenary(soldier.data)
                && soldier.data?.pmidx !== M.PM_GUARD
                && helpless(soldier)) {
                return true;
            }
        }
    }
    return false;
}

function canLetGoWithoutDiscovery(obj, state) {
    if (!obj) return false;
    if (obj.owornmask & (W_ARMOR | W_ACCESSORY)) return false;
    if (obj === state.uwep && mwelded(obj, state)) return false;
    if (obj.otyp === O.LOADSTONE && obj.cursed) return false;
    if (obj.otyp === O.LEASH && obj.leashmon) return false;
    return !(obj.owornmask & W_SADDLE);
}

// C ref: muse.c find_misc(). This is selection only; use_misc() remains
// outside the simple-turn boundary.
export function select_misc_action(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const species = monster.data;
    const hero = state.u;

    if (is_animal(species) || mindless(species)) return null;
    if (hero?.uswallow && monster === hero.ustuck) return null;
    if (dist2(
        monster.mx,
        monster.my,
        monster.mux,
        monster.muy,
    ) > 36) return null;

    const mobile = species?.mmove !== 0;
    if (monster !== hero?.ustuck && mobile && !monster.mtrapped
        && monster.cham === NON_PM && species?.difficulty < 6) {
        const ignoresBoulders = verysmall(species)
            || throws_rocks(species)
            || passes_walls(species);
        const diagonal = species?.pmidx !== M.PM_GRID_BUG;
        const shoes = which_armor(monster, W_ARMF);
        const ironShoes = shoes
            && objectType(shoes, state).oc_material === O.IRON;
        for (let x = monster.mx - 1; x <= monster.mx + 1; ++x) {
            for (let y = monster.my - 1; y <= monster.my + 1; ++y) {
                if (!isok(x, y)
                    || (hero?.ux === x && hero?.uy === y)
                    || (!diagonal && x !== monster.mx && y !== monster.my)
                    || ((x !== monster.mx || y !== monster.my)
                        && state.level.monsters[x]?.[y])) {
                    continue;
                }
                const trap = t_at(x, y, state);
                if (trap?.ttyp === POLY_TRAP
                    && (ignoresBoulders
                        || !sobj_at(O.BOULDER, x, y, state))
                    && !onscary(x, y, monster, state)
                    && !ironShoes) {
                    return {
                        kind: 'polymorph trap',
                        object: null,
                        x,
                        y,
                    };
                }
            }
        }
    }
    if (nohands(species)) return null;

    let selected = null;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.otyp === O.POT_GAIN_LEVEL
            && (!obj.cursed
                || (!monster.isgd
                    && !monster.isshk
                    && !monster.ispriest))) {
            selected = { kind: 'gain level', object: obj };
        }
        if (selected?.kind === 'bullwhip') continue;
        if (obj.otyp === O.BULLWHIP && !monster.mpeaceful
            && state.uwep && !random.rn2(5) && obj === monster.mw
            && monster.mux === hero?.ux && monster.muy === hero?.uy
            && dist2(monster.mx, monster.my, hero.ux, hero.uy) <= 2
            && !hero.uswallow
            && (canLetGoWithoutDiscovery(state.uwep, state)
                || (hero.twoweap
                    && canLetGoWithoutDiscovery(state.uswapwep, state)))) {
            selected = { kind: 'bullwhip', object: obj };
        }
        if (selected?.kind === 'make invisible') continue;
        if (obj.otyp === O.WAN_MAKE_INVISIBLE && obj.spe > 0
            && !monster.minvis && !monster.invis_blkd
            && (!monster.mpeaceful
                || activeHeroProperty(state, SEE_INVIS))
            && (!attacktype(species, AT_GAZE) || monster.mcan)) {
            selected = { kind: 'make invisible', object: obj };
        }
        if (selected?.kind === 'invisibility') continue;
        if (obj.otyp === O.POT_INVISIBILITY
            && !monster.minvis && !monster.invis_blkd
            && (!monster.mpeaceful
                || activeHeroProperty(state, SEE_INVIS))
            && (!attacktype(species, AT_GAZE) || monster.mcan)) {
            selected = { kind: 'invisibility', object: obj };
        }
        if (selected?.kind === 'speed wand') continue;
        if (obj.otyp === O.WAN_SPEED_MONSTER && obj.spe > 0
            && monster.mspeed !== MFAST && !monster.isgd) {
            selected = { kind: 'speed wand', object: obj };
        }
        if (selected?.kind === 'speed potion') continue;
        if (obj.otyp === O.POT_SPEED
            && monster.mspeed !== MFAST && !monster.isgd) {
            selected = { kind: 'speed potion', object: obj };
        }
        if (selected?.kind === 'polymorph wand') continue;
        if (obj.otyp === O.WAN_POLYMORPH && obj.spe > 0
            && monster.cham === NON_PM && species?.difficulty < 6) {
            selected = { kind: 'polymorph wand', object: obj };
        }
        if (selected?.kind === 'polymorph potion') continue;
        if (obj.otyp === O.POT_POLYMORPH
            && monster.cham === NON_PM && species?.difficulty < 6) {
            selected = { kind: 'polymorph potion', object: obj };
        }
        if (selected?.kind === 'container') continue;
        if (isContainer(obj) && obj.otyp !== O.BAG_OF_TRICKS
            && !random.rn2(5)
            && !(obj.otyp === O.LARGE_BOX && obj.spe === 1)
            && !selected && obj.cobj && !obj.olocked && !obj.otrapped) {
            selected = { kind: 'container', object: obj };
        }
    }
    return selected;
}

// C ref: muse.c find_defensive() (441-750). This partial port returns the
// selected action rather than C's Boolean because use_defensive() remains
// outside the simple-turn boundary. Every action that would make C return
// TRUE therefore reaches the caller's fail-closed monster-item boundary.
//
// The FALSE path is complete for an unaltered ordinary hostile: it preserves
// the wound threshold, physical-escape search, nohands and bugle gates, and
// inventory rejection order. Branches that need unported selection details
// return a conservative action before spending selection RNG. The planning
// pass discards that state when the caller refuses the action.
export function find_defensive(monster, tryescape, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const species = monster.data;
    const hero = state.u;
    const selected = (kind, object = null) => ({ kind, object });

    // find_defensive(TRUE) serves fleeing monsters and has a Knox-specific
    // adjacency guard. This slice owns only dochug()'s FALSE call.
    if (tryescape) return selected('escape defensive search');
    if (is_animal(species) || mindless(species)) return null;
    if (dist2(monster.mx, monster.my, monster.mux, monster.muy) > 25)
        return null;
    if (hero?.uswallow && monster === hero.ustuck) return null;

    // Confusion and stun can select a unicorn horn, lizard corpse, or lizard
    // tin and may spend rn2(3). Keep the whole altered-state family closed.
    if (monster.mconf || monster.mstun)
        return selected('altered defensive state');

    if (!monster.mcansee) {
        if (!nohands(species)) {
            for (let obj = monster.minvent; obj; obj = obj.nobj) {
                if (obj.otyp === O.UNICORN_HORN && !obj.cursed)
                    return selected('unicorn horn', obj);
            }
        }
        if (is_unicorn(species) || species?.pmidx === M.PM_KI_RIN)
            return selected('unicorn horn');
        if (!nohands(species) && species?.pmidx !== M.PM_PESTILENCE) {
            const healing = m_use_healing(monster, state);
            if (healing) return healing;
        }
    }

    // The full corpse-wielding predicate also checks petrification,
    // polymorph-on-stoning, resistance, and lined_up(). Refuse before those
    // unported details whenever the arm could apply.
    if (!monster.mpeaceful && !nohands(species)
        && state.uwep?.otyp === O.CORPSE) {
        return selected('corpse defense evaluation');
    }

    const fraction = (hero?.ulevel ?? 1) < 10
        ? 5
        : (hero?.ulevel ?? 1) < 14 ? 4 : 3;
    if (monster.mhp >= monster.mhpmax
        || (monster.mhp >= 10
            && monster.mhp * fraction >= monster.mhpmax)) {
        return null;
    }
    if (monster.mpeaceful) {
        if (!nohands(species)) {
            const healing = m_use_healing(monster, state);
            if (healing) return healing;
        }
        return null;
    }

    const stuck = monster === hero?.ustuck;
    const immobile = species?.mmove === 0;
    let physicalEscape = null;
    if (!stuck && !immobile && !monster.mtrapped) {
        const terrain = state.level?.at?.(monster.mx, monster.my)?.typ;
        if (terrain === STAIRS || terrain === LADDER) {
            const stair = stairway_at(monster.mx, monster.my, state);
            if (stair) {
                const sameDungeon = stair.tolev?.dnum === hero?.uz?.dnum;
                if (stair.up && sameDungeon) {
                    physicalEscape = selected(
                        terrain === STAIRS ? 'upstairs' : 'up ladder',
                    );
                } else if (!stair.up && sameDungeon
                    && !is_floater(species)) {
                    physicalEscape = selected(
                        terrain === STAIRS ? 'downstairs' : 'down ladder',
                    );
                } else if (!sameDungeon
                    && (stair.up || !is_floater(species))) {
                    physicalEscape = selected('special stairs');
                }
            }
        } else {
            const ignoresBoulders = verysmall(species)
                || throws_rocks(species)
                || passes_walls(species);
            const diagonal = species?.pmidx !== M.PM_GRID_BUG;
            const spots = [[monster.mx, monster.my]];
            for (let x = monster.mx - 1; x <= monster.mx + 1; ++x) {
                for (let y = monster.my - 1; y <= monster.my + 1; ++y) {
                    if (isok(x, y)
                        && (x !== monster.mx || y !== monster.my)) {
                        spots.push([x, y]);
                    }
                }
            }
            for (const [x, y] of spots) {
                if ((hero?.ux === x && hero?.uy === y)
                    || (!diagonal && x !== monster.mx && y !== monster.my)
                    || ((x !== monster.mx || y !== monster.my)
                        && state.level?.monsters?.[x]?.[y])) {
                    continue;
                }
                const trap = t_at(x, y, state);
                if (!trap
                    || (!ignoresBoulders
                        && sobj_at(O.BOULDER, x, y, state))
                    || onscary(x, y, monster, state)) {
                    continue;
                }
                if (is_hole(trap.ttyp)
                    && !is_floater(species)
                    && !monster.isshk && !monster.isgd
                    && !monster.ispriest
                    && Can_fall_thru(hero.uz, state)) {
                    // A hole ends C's scan and takes precedence over a
                    // teleport trap found earlier.
                    physicalEscape = selected('trapdoor');
                    break;
                }
                if (trap.ttyp === TELEP_TRAP)
                    physicalEscape = selected('teleport trap');
            }
        }
    }

    if (nohands(species)) return physicalEscape;
    if (is_mercenary(species) && m_sees_sleepy_soldier(monster, state)) {
        for (let obj = monster.minvent; obj; obj = obj.nobj) {
            if (obj.otyp === O.BUGLE) return selected('bugle', obj);
        }
    }
    if (physicalEscape) return physicalEscape;

    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        // These are find_defensive()'s complete object families. Conditions
        // beyond object identity and charge are deliberately conservative:
        // accepting a possible TRUE arm would skip use_defensive(), whereas
        // refusing it preserves the fail-closed boundary.
        if (obj.otyp === O.WAN_DIGGING && obj.spe > 0)
            return selected('digging wand', obj);
        if (obj.otyp === O.WAN_TELEPORTATION && obj.spe > 0)
            return selected('teleportation wand', obj);
        if (obj.otyp === O.SCR_TELEPORTATION)
            return selected('teleportation scroll', obj);
        if (obj.otyp === O.POT_FULL_HEALING)
            return selected('full healing', obj);
        if (obj.otyp === O.POT_EXTRA_HEALING)
            return selected('extra healing', obj);
        if (obj.otyp === O.WAN_CREATE_MONSTER && obj.spe > 0)
            return selected('create monster wand', obj);
        if (obj.otyp === O.POT_HEALING)
            return selected('healing', obj);
        if (obj.otyp === O.POT_SICKNESS
            && species?.pmidx === M.PM_PESTILENCE) {
            return selected('pestilence healing', obj);
        }
        if (obj.otyp === O.SCR_CREATE_MONSTER)
            return selected('create monster scroll', obj);
    }
    return null;
}

// Complete source path through dochug()'s find_defensive(FALSE), followed by
// find_misc(). Any selected action remains outside the simple-turn boundary.
export function select_fresh_monster_item_action(monster, rawEnv = {}) {
    const defensive = find_defensive(monster, false, rawEnv);
    if (defensive) return defensive;
    return select_misc_action(monster, rawEnv);
}

// C ref: muse.c find_offensive() (1420-1594). "Select an offensive
// item/action for a monster. Returns TRUE iff one is found."
//
// Partial. It answers TRUE only for the five MUSE_POT_* selections and refuses
// every other arm that would select. C reports its choice through
// gm.m.offensive and gm.m.has_offense; `state.m_offense` holds both here, set
// to null on entry and read back by use_offensive() below. The port covers the
// FALSE answer -- the five guards above the inventory loop, and the loop's
// rejection of every item that is not an offensive one -- plus the five
// throwable-potion arms, whose shared use_offensive() case is ported below.
//
// Three wand arms refuse on the object type ahead of conditions C also tests.
// MUSE_WAN_UNDEAD_TURNING needs invent.c carrying() and a corpse ray;
// MUSE_WAN_TELEPORTATION needs onscary(), hero_behind_chokepoint() and
// stairway_at(); and MUSE_SCR_EARTH and MUSE_CAMERA each end in a draw --
// !rn2(10) and !rn2(6) -- that a refusing port must not spend. Refusing early
// stops a monster C would have let past; it never lets one past that C stops.
export function find_offensive(mtmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const unsupported = rawEnv.unsupported;
    if (typeof unsupported !== 'function')
        throw new TypeError('find_offensive requires an unsupported operation');
    const species = mtmp.data;
    const u = state.u;
    const seenres = (mask) => (mtmp.seen_resistance & mask) !== 0;
    const refuse = () => unsupported('monster offensive item use');

    state.m_offense = null;
    if (mtmp.mpeaceful || is_animal(species) || mindless(species)
        || nohands(species)) {
        return false;
    }
    if (u?.uswallow) return false;
    if (in_your_sanctuary(mtmp, 0, 0, state)) return false;
    if (dmgtype(species, M.AD_HEAL)
        && !state.uwep && !state.uarmu && !state.uarm && !state.uarmh
        && !state.uarms && !state.uarmg && !state.uarmc && !state.uarmf) {
        return false;
    }
    /* all offensive items require orthogonal or diagonal targeting */
    if (!lined_up(mtmp, rawEnv)) return false;

    const reflection_skip = seenres(M_SEEN_REFL) /* m_seenres() */
        || monnear(mtmp, mtmp.mux, mtmp.muy, state);
    // C also reads which_armor(mtmp, W_ARMH) here. Its one consumer is the
    // MUSE_SCR_EARTH arm's hard_helmet() test, which this refuses ahead of.
    let has_offense = 0;
    let offensive = null;
    const select = (choice, obj) => {
        offensive = obj;
        has_offense = choice;
    };
    /* this picks the last viable item rather than prioritizing choices */
    for (let obj = mtmp.minvent; obj; obj = obj.nobj) {
        const otyp = obj.otyp;
        if (!reflection_skip) {
            // C's nomore() skips for these eight arms cannot fire: has_offense
            // only ever holds one of the five MUSE_POT_* values below, since
            // every other arm refuses.
            if ((otyp === O.WAN_DEATH && obj.spe > 0 && !seenres(M_SEEN_MAGR))
                || (otyp === O.WAN_SLEEP && obj.spe > 0
                    && (state.multi ?? 0) >= 0 && !seenres(M_SEEN_SLEEP))
                || (otyp === O.WAN_FIRE && obj.spe > 0
                    && !seenres(M_SEEN_FIRE))
                || (otyp === O.FIRE_HORN && obj.spe > 0 && can_blow(mtmp)
                    && !seenres(M_SEEN_FIRE))
                || (otyp === O.WAN_COLD && obj.spe > 0
                    && !seenres(M_SEEN_COLD))
                || (otyp === O.FROST_HORN && obj.spe > 0 && can_blow(mtmp)
                    && !seenres(M_SEEN_COLD))
                || (otyp === O.WAN_LIGHTNING && obj.spe > 0
                    && !seenres(M_SEEN_ELEC))
                || (otyp === O.WAN_MAGIC_MISSILE && obj.spe > 0
                    && !seenres(M_SEEN_MAGR))) {
                refuse();
            }
        }
        if ((otyp === O.WAN_UNDEAD_TURNING && obj.spe > 0)
            || (otyp === O.WAN_STRIKING && obj.spe > 0
                && !seenres(M_SEEN_MAGR))
            || (otyp === O.WAN_TELEPORTATION && obj.spe > 0)) {
            refuse();
        }
        /* nomore(MUSE_POT_PARALYSIS) */
        if (has_offense === MUSE_POT_PARALYSIS) continue;
        if (otyp === O.POT_PARALYSIS && (state.multi ?? 0) >= 0)
            select(MUSE_POT_PARALYSIS, obj);
        /* nomore(MUSE_POT_BLINDNESS) */
        if (has_offense === MUSE_POT_BLINDNESS) continue;
        if (otyp === O.POT_BLINDNESS && !attacktype(species, AT_GAZE))
            select(MUSE_POT_BLINDNESS, obj);
        /* nomore(MUSE_POT_CONFUSION) */
        if (has_offense === MUSE_POT_CONFUSION) continue;
        if (otyp === O.POT_CONFUSION) select(MUSE_POT_CONFUSION, obj);
        /* nomore(MUSE_POT_SLEEPING) */
        if (has_offense === MUSE_POT_SLEEPING) continue;
        if (otyp === O.POT_SLEEPING && !seenres(M_SEEN_SLEEP))
            select(MUSE_POT_SLEEPING, obj);
        /* nomore(MUSE_POT_ACID) */
        if (has_offense === MUSE_POT_ACID) continue;
        if (otyp === O.POT_ACID && !seenres(M_SEEN_ACID))
            select(MUSE_POT_ACID, obj);
        // C's nomore(MUSE_SCR_EARTH) and nomore(MUSE_CAMERA) sit here; neither
        // value is reachable, because both arms refuse.
        if (otyp === O.SCR_EARTH
            || (otyp === O.EXPENSIVE_CAMERA && obj.spe > 0)) {
            refuse();
        }
    }
    if (!has_offense) return false;
    state.m_offense = { has_offense, offensive };
    return true;
}

// C ref: muse.c use_offensive() (1824-2032). "Perform an offensive action for
// a monster.  Must be called immediately after find_offensive()."  Only the
// shared MUSE_POT_PARALYSIS/BLINDNESS/CONFUSION/SLEEPING/ACID case (2005-2023)
// is ported; every other arm refuses, and find_offensive() above cannot select
// one.
//
// C's entry declares buzzfn and calls precheck(), but "offensive potions are
// not drunk, they're thrown", so the potion case skips precheck() entirely.
// C's `oseen` is likewise read only by the wand, horn and bhit arms.
export async function use_offensive(mtmp, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    const unsupported = env.unsupported;
    if (typeof unsupported !== 'function')
        throw new TypeError('use_offensive requires an unsupported operation');
    const selection = state.m_offense;
    if (!selection) {
        throw new Error(
            'use_offensive must follow a find_offensive() that selected',
        );
    }
    const otmp = selection.offensive;

    switch (selection.has_offense) {
    case MUSE_POT_PARALYSIS:
    case MUSE_POT_BLINDNESS:
    case MUSE_POT_CONFUSION:
    case MUSE_POT_SLEEPING:
    case MUSE_POT_ACID: {
        /* Note: this setting of dknown doesn't suffice.  A monster
         * which is out of sight might throw and it hits something _in_
         * sight, a problem not existing with wands because wand rays
         * are not objects.  Also set dknown in mthrowu.c.
         */
        if (cansee(mtmp.mx, mtmp.my, state)) {
            const message = env.message;
            const monsterName = env.monsterName;
            if (typeof message !== 'function'
                || typeof monsterName !== 'function') {
                throw new TypeError(
                    'use_offensive requires message and monsterName owners',
                );
            }
            observe_object(otmp, state);
            // pline_mon() sets the message location to the thrower's square,
            // which messageAt() prefixes under the accessiblemsg option.
            await message(
                messageAt(
                    `${monsterName(mtmp, state)} hurls `
                    + `${singular(otmp, donameFresh, state)}!`,
                    mtmp.mx,
                    mtmp.my,
                    state,
                ),
                state,
            );
        }
        const throwMissile = env.throwMissile;
        if (typeof throwMissile !== 'function')
            throw new TypeError('use_offensive requires throwMissile');
        await throwMissile(
            mtmp,
            mtmp.mx,
            mtmp.my,
            sgn(mtmp.mux - mtmp.mx),
            sgn(mtmp.muy - mtmp.my),
            distmin(mtmp.mx, mtmp.my, mtmp.mux, mtmp.muy),
            otmp,
            env,
        );
        return 2;
    }
    default:
        return unsupported('monster offensive item use');
    }
}

function resistsStoning(monster) {
    const resistanceBits = (monster.data?.mresists ?? 0)
        | (monster.mextrinsics ?? 0)
        | (monster.mintrinsics ?? 0);
    return Boolean(resistanceBits & M.MR_STONE);
}

export function can_blow(monster) {
    const species = monster.data;
    const silentOrBuzzing = species?.msound === MS_SILENT
        || species?.msound === MS_BUZZ;
    return !(silentOrBuzzing
        && (breathless(species)
            || verysmall(species)
            || !has_head(species)
            || species?.mlet === M.S_EEL));
}

export function cures_stoning(monster, obj, tinok, state = game) {
    if (obj.otyp === O.POT_ACID) return true;
    if (obj.otyp === O.GLOB_OF_GREEN_SLIME)
        return slimeproof(monster.data);
    if (obj.otyp !== O.CORPSE && (obj.otyp !== O.TIN || !tinok))
        return false;
    if (obj.corpsenm === NON_PM) return false;
    const corpseSpecies = state.mons?.[obj.corpsenm];
    return Boolean(corpseSpecies
        && (obj.corpsenm === M.PM_LIZARD || acidic(corpseSpecies)));
}

export function mcould_eat_tin(monster, state = game) {
    if (is_animal(monster.data)) return false;

    const weapon = monster.mw;
    const weldedWeapon = weapon && mwelded(weapon, state);
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (weldedWeapon && obj !== weapon) continue;
        const skill = obj.oclass === O.WEAPON_CLASS
            ? objectType(obj, state).oc_skill
            : 0;
        if (obj.otyp === O.TIN_OPENER
            || skill === P_DAGGER
            || skill === P_KNIFE) {
            return true;
        }
    }
    return false;
}

function isMagicBag(obj) {
    return obj.otyp === O.BAG_OF_HOLDING || obj.otyp === O.BAG_OF_TRICKS;
}

export function searches_for_item(monster, obj, state = game) {
    const species = monster.data;
    const type = objectType(obj, state);
    const otyp = obj.otyp;

    if (obj.where === OBJ_FLOOR
        && obj.ox === monster.mx
        && obj.oy === monster.my
        && onscary(obj.ox, obj.oy, monster, state)) {
        return false;
    }
    if (is_animal(species) || mindless(species)
        || species?.pmidx === M.PM_GHOST) {
        return false;
    }

    if (otyp === O.WAN_MAKE_INVISIBLE || otyp === O.POT_INVISIBILITY) {
        return !monster.minvis && !monster.invis_blkd
            && !attacktype(species, AT_GAZE);
    }
    if (otyp === O.WAN_SPEED_MONSTER || otyp === O.POT_SPEED)
        return monster.mspeed !== MFAST;

    switch (obj.oclass) {
    case O.WAND_CLASS:
        if (obj.spe <= 0) return false;
        if (otyp === O.WAN_DIGGING) return !is_floater(species);
        if (otyp === O.WAN_POLYMORPH) return species?.difficulty < 6;
        return type.oc_dir === O.RAY
            || otyp === O.WAN_STRIKING
            || otyp === O.WAN_UNDEAD_TURNING
            || otyp === O.WAN_TELEPORTATION
            || otyp === O.WAN_CREATE_MONSTER;
    case O.POTION_CLASS:
        if (otyp === O.POT_HEALING || otyp === O.POT_EXTRA_HEALING
            || otyp === O.POT_FULL_HEALING || otyp === O.POT_POLYMORPH
            || otyp === O.POT_GAIN_LEVEL || otyp === O.POT_PARALYSIS
            || otyp === O.POT_SLEEPING || otyp === O.POT_ACID
            || otyp === O.POT_CONFUSION) {
            return true;
        }
        return otyp === O.POT_BLINDNESS
            && !attacktype(species, AT_GAZE);
    case O.SCROLL_CLASS:
        return otyp === O.SCR_TELEPORTATION
            || otyp === O.SCR_CREATE_MONSTER
            || otyp === O.SCR_EARTH
            || otyp === O.SCR_FIRE;
    case O.AMULET_CLASS:
        if (otyp === O.AMULET_OF_LIFE_SAVING)
            return !(nonliving(species) || is_vampshifter(monster));
        return otyp === O.AMULET_OF_REFLECTION
            || otyp === O.AMULET_OF_GUARDING;
    case O.TOOL_CLASS:
        if (otyp === O.PICK_AXE) return needspick(species);
        if (otyp === O.UNICORN_HORN) {
            return !obj.cursed && !is_unicorn(species)
                && species?.pmidx !== M.PM_KI_RIN;
        }
        if (otyp === O.FROST_HORN || otyp === O.FIRE_HORN)
            return obj.spe > 0 && can_blow(monster);
        if (isContainer(obj)
            && !(isMagicBag(obj) && obj.cursed)
            && !obj.olocked) {
            return true;
        }
        return otyp === O.EXPENSIVE_CAMERA && obj.spe > 0;
    case O.FOOD_CLASS:
        if (otyp === O.CORPSE) {
            const corpseSpecies = state.mons?.[obj.corpsenm];
            return Boolean(corpseSpecies
                && (((monster.misc_worn_check & W_ARMG)
                    && touch_petrifies(corpseSpecies))
                    || (!resistsStoning(monster)
                        && cures_stoning(monster, obj, false, state))));
        }
        if (otyp === O.TIN) {
            return mcould_eat_tin(monster, state)
                && !resistsStoning(monster)
                && cures_stoning(monster, obj, true, state);
        }
        if (otyp === O.EGG) {
            const eggSpecies = state.mons?.[obj.corpsenm];
            return Boolean(eggSpecies && touch_petrifies(eggSpecies));
        }
        return false;
    default:
        return false;
    }
}

// C ref: muse.c mon_reflects() (2797-2833). Checks whether a monster reflects
// a ray. When `str` is non-null and reflection is found, prints a message of
// the form "But it reflects from <mon's> <item>!" and discovers the object
// where applicable. When `str` is null, just returns the boolean.
//
// arti_reflects(MON_WEP(mon)) checks whether a wielded artifact weapon
// reflects. No ported monster wields such an artifact, so the arm is a throw.
export async function mon_reflects(mon, str, state = game) {
    let orefl = which_armor(mon, W_ARMS, state);

    if (orefl && orefl.otyp === O.SHIELD_OF_REFLECTION) {
        if (str) {
            const msg = str.replace('%s', s_suffix(monsterCommonName(mon, state)))
                .replace('%s', 'shield');
            await ttyPline(msg, state);
            // makeknown(SHIELD_OF_REFLECTION)
            discover_object(O.SHIELD_OF_REFLECTION, true, true, true, state);
        }
        return true;
    }
    // arti_reflects(MON_WEP(mon)) -- wielded artifact reflection
    const monwep = mon.mw; /* MON_WEP() */
    if (monwep && monwep.oartifact) {
        // No ported monster wields an artifact that reflects.
        throw new Error(
            'mon_reflects() reached arti_reflects() for a wielded artifact',
        );
    }
    orefl = which_armor(mon, W_AMUL, state);
    if (orefl && orefl.otyp === O.AMULET_OF_REFLECTION) {
        if (str) {
            const msg = str.replace('%s', s_suffix(monsterCommonName(mon, state)))
                .replace('%s', 'amulet');
            await ttyPline(msg, state);
            discover_object(O.AMULET_OF_REFLECTION, true, true, true, state);
        }
        return true;
    }
    orefl = which_armor(mon, W_ARM, state);
    if (orefl && (orefl.otyp === O.SILVER_DRAGON_SCALES
                  || orefl.otyp === O.SILVER_DRAGON_SCALE_MAIL)) {
        if (str) {
            const msg = str.replace('%s', s_suffix(monsterCommonName(mon, state)))
                .replace('%s', 'armor');
            await ttyPline(msg, state);
        }
        return true;
    }
    if (mon.data === state.mons?.[M.PM_SILVER_DRAGON]
        || mon.data === state.mons?.[M.PM_CHROMATIC_DRAGON]) {
        /* Silver dragons only reflect when mature; babies do not */
        if (str) {
            const msg = str.replace('%s', s_suffix(monsterCommonName(mon, state)))
                .replace('%s', 'scales');
            await ttyPline(msg, state);
        }
        return true;
    }
    return false;
}
