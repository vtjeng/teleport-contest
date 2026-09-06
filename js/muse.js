// Monster item-use AI: deciding which items to use and executing the use.
// C refs: muse.c precheck(), mzapwand(), mplayhorn(), mreadmsg(),
// mquaffmsg(), m_use_healing(), m_sees_sleepy_soldier(), m_tele(),
// m_next2m(), reveal_trap(), mon_escape(), use_defensive(),
// mcureblindness(), find_defensive(), find_misc(),
// muse_newcham_mon(), mloot_container(),
// linedup_chk_corpse(), m_use_undead_turning(), hero_behind_chokepoint(),
// mon_has_friends(), mon_likes_objpile_at(),
// find_offensive(), use_offensive()'s hurled-potion case,
// necrophiliac(), searches_for_item(), cures_stoning(), mcould_eat_tin(),
// mon_reflects(), ureflects(), munstone(), mon_consume_unstone();
// mondata.c can_blow().

import {
    ACID_RES,
    ANTIMAGIC,
    ARTICLE_A,
    BOLT_LIM,
    CORR,
    D_BROKEN,
    D_CLOSED,
    D_LOCKED,
    DEAF,
    DRAWBRIDGE_UP,
    EDOG,
    FAINTED,
    FIRE_RES,
    FIRE_TRAP,
    FORCEBUNGLE,
    FORCETRAP,
    HAND,
    G_GONE,
    HALF_SPDAM,
    HALLUC,
    HALLUC_RES,
    HOLE,
    IS_DOOR,
    In_endgame,
    IS_DRAWBRIDGE,
    IS_FURNITURE,
    Is_botlevel,
    Is_knox_level,
    KILLED_BY_AN,
    LADDER,
    MFAST,
    MIGR_LADDER_DOWN,
    MIGR_LADDER_UP,
    MIGR_RANDOM,
    MIGR_SSTAIRS,
    MIGR_STAIRS_DOWN,
    MIGR_STAIRS_UP,
    MM_NOMSG,
    MS_SILENT,
    M_SEEN_ACID,
    M_SEEN_COLD,
    M_SEEN_ELEC,
    M_SEEN_FIRE,
    M_SEEN_MAGR,
    M_SEEN_REFL,
    M_SEEN_SLEEP,
    NO_MM_FLAGS,
    NORMAL_SPEED,
    NOTELL,
    NON_PM,
    OBJ_AT,
    OBJ_FLOOR,
    P_DAGGER,
    P_KNIFE,
    PIT,
    POLY_TRAP,
    REFLECTING,
    RLOC_MSG,
    SCORR,
    SDOOR,
    SEE_INVIS,
    SHOPBASE,
    STAIRS,
    STONE_RES,
    STRAT_WAITFORU,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    SUPPRESS_SADDLE,
    AUGMENT_IT,
    TELL,
    TELEP_TRAP,
    TEMPLE,
    Trap_Killed_Mon,
    Has_contents,
    W_ACCESSORY,
    W_AMUL,
    W_ARM,
    W_ARMOR,
    W_ARMF,
    W_ARMG,
    W_ARMS,
    W_SADDLE,
    W_WEP,
    N_DIRS,
    TELEPORT_CONTROL,
    XKILL_NOCONDUCT,
    XKILL_NOMSG,
    ZAP_POS,
    helpless,
    is_hole,
    isok,
    u_at,
    BEAR_TRAP,
    In_V_tower,
    W_NONDIGGABLE,
    WEB,
    is_pit,
} from './const.js';
import { stop_occupation } from './allmain.js';
import { losehp, nomul } from './hack.js';
import { dirtocoord, xytodir } from './cmd.js';
import {
    cls, display_self, docrt, flush_screen, map_invisible,
    map_monster_glyph_info, newsym, show_glyph_cell,
} from './display.js';
import { canletgo, dropy, trycall } from './do.js';
import { migrate_to_level } from './dog.js';
import { dog_nutrition } from './dogmove.js';
import {
    Some_Monnam,
    a_monnam,
    capitalizedMonsterName,
    monsterCommonName,
    monverbself,
    rndmonnam,
    x_monnam,
} from './do_name.js';
import {
    Can_dig_down, Can_fall_thru, Can_rise_up, In_hell, On_W_tower_level,
    ceiling, depth, dunlev, dunlevs_in_dungeon, get_level, ledger_no, on_level,
    surface,
} from './dungeon.js';
import { add_to_container, carrying, freeinv, hands_obj, obfree, obj_extract_self } from './invent.js';
import { game } from './gstate.js';
import { can_carry } from './moncarry.js';
import { dist2, distmin, sgn, strsubst } from './hacklib.js';
import { makemon, mongone } from './makemon_create.js';
import { grow_up, rndmonst, set_malign } from './makemon.js';
import { m_next2u } from './mhitu.js';
import {
    healmon, m_carrying, maybe_unhide_at, mon_offmap, mondead, monkilled,
    seemimic, wakeup, xkilled, is_Vlad,
} from './mon.js';
import {
    acidic, attacktype, attacktype_fordmg, breathless, dmgtype, has_head, haseyes, is_animal,
    is_bat, is_floater, is_flyer, is_mercenary, is_undead, is_unicorn,
    is_vampshifter, locomotion, mhe, mhim, mindless, mon_hates_silver,
    mon_knows_traps, mon_learns_traps, monster_resists_element, monstseesu,
    monstunseesu, needspick, nohands, nonliving, passes_walls, resists_magm,
    same_race, slimeproof, throws_rocks, touch_petrifies, verysmall,
    poly_when_stoned,
} from './mondata.js';
import * as M from './monsters.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import {
    Dragon_mail_to_pm,
    Dragon_scales_to_pm,
    Is_dragon_mail,
    Is_dragon_scales,
    bcsign,
    isContainer,
    objectType,
    place_object,
    sobj_at,
    splitobj,
    unbless,
    unknow_object,
    weight,
} from './obj.js';
import * as O from './objects.js';
import { an, ansimpleoname, distant_name, donameFresh, is_plural,
    simpleonames, singular, the, vtense, xnameFresh } from './objnam.js';
import { discover_object, objdescr_is, observe_object } from './o_init.js';
import { accessible, monflee, mon_would_take_item, monnear, onscary, youHear } from './monmove.js';
import { lined_up, linedup_callback, m_useup } from './mthrowu.js';
import { in_your_sanctuary } from './priest.js';
import { d, rn1, rn2, rn2_on_display_rng, rnd } from './rng.js';
import { in_rooms } from './rooms.js';
import { inhishop } from './shk.js';
import { stairway_at } from './stairs.js';
import { canSpotMonster, is_drawbridge_wall, messageAt, sensesMonster } from './startup_a11y.js';
import {
    enexto, noteleport_level, random_teleport_level, rloc, tele,
    tele_restrict,
} from './teleport.js';
import { CLR_GREEN, CLR_BRIGHT_GREEN } from './terminal.js';
import { begin_burn } from './timeout.js';
import { fill_pit, is_lava, is_pool, maketrap, t_at, trapname, unconscious } from './trap.js';
import { is_ice } from './terrain.js';
import { mintrap, seetrap, wearing_iron_shoes } from './trap_effects.js';
import { makeplural } from './fruit.js';
import { s_suffix, upstart } from './hacklib.js';
import { mpickobj, remove_worn_item } from './steal.js';
import { ttyNorep, ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';
import { cansee, canseemon, couldsee, recalc_block_point, unblock_point } from './vision.js';
import { body_part } from './polyself.js';
import { extract_from_minvent, bimanual, find_mac } from './worn.js';
import { mwelded, welded } from './wield.js';
import { mon_has_amulet, mon_has_special } from './wizard.js';
import { dobuzz, exclam, hit, miss, resist, zhitm } from './zap.js';
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
const MUSE_WAN_TELEPORTATION = 15;
const MUSE_POT_SLEEPING = 16;
const MUSE_WAN_STRIKING = 7;
const MUSE_WAN_UNDEAD_TURNING = 20; /* also a defensive item */

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
                m_useup(mon, obj, { state });
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
            m_useup(mon, obj, { state });
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
        m_useup(mon, obj, { state });
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

// C ref: muse.c m_tele() (384-414). Teleport a monster or send it into a
// trap. `how` is the object type that triggered teleportation (e.g.
// WAN_TELEPORTATION, SCR_TELEPORTATION) or 0 for a voluntary trap entry.
// When how is 0, trapCoords must supply { x, y } of the trap the monster
// is entering, matching gt.trapx/gt.trapy set by find_defensive().
async function m_tele(mtmp, vismon, oseen, how, state, trapCoords) {
    if (await tele_restrict(mtmp, state)) {
        // mysterious force...
        if (vismon && how) {
            // mentions 'teleport' -- makeknown(how)
            discover_object(how, true, true, true, state);
        }
        // monster learns that teleportation isn't useful here
        if (noteleport_level(mtmp, state)) {
            mon_learns_traps(mtmp, TELEP_TRAP);
        }
    } else if ((mon_has_amulet(mtmp) || On_W_tower_level(state.u?.uz, state))
               && !rn2(3)) {
        if (vismon) {
            await pline_mon(
                mtmp,
                `${capitalizedMonsterName(mtmp, state)} seems disoriented`
                    + ' for a moment.',
                state,
            );
        }
    } else {
        // teleport monster 'mtmp'
        if (how) {
            // teleportation has been triggered by an object
            if (oseen) {
                discover_object(how, true, true, true, state);
            }
            await rloc(mtmp, RLOC_MSG, { state });
        } else {
            // monster is voluntarily entering a teleportation trap; use the
            // trap instead of rloc() in case it sends 'victim' to a vault
            mtmp.mx = trapCoords.x;
            mtmp.my = trapCoords.y;
            await mintrap(mtmp, FORCETRAP, { state });
        }
    }
}

// C ref: muse.c m_next2m() (420-437). Return true if monster mtmp has
// another monster next to it. Called from find_defensive() where it is
// limited to Is_knox() only.
export function m_next2m(mtmp, state) {
    if (mtmp.mhp < 1 /* DEADMONSTER */ || mon_offmap(mtmp)) return false;
    for (let x = mtmp.mx - 1; x <= mtmp.mx + 1; x++) {
        for (let y = mtmp.my - 1; y <= mtmp.my + 1; y++) {
            if (!isok(x, y)) continue;
            const m2 = m_at(x, y, state);
            if (m2 && m2 !== mtmp) return true;
        }
    }
    return false;
}

// C ref: muse.c reveal_trap() (757-768). When a monster deliberately enters
// a trap, convert a secret corridor at the trap's location to a normal
// corridor and mark the trap as seen if the hero can see it.
function reveal_trap(trap, seeit, state, env) {
    const lev = state.level.at(trap.tx, trap.ty);

    if (lev.typ === SCORR) {
        lev.typ = CORR;
        lev.flags = 0;
        unblock_point(trap.tx, trap.ty, state);
    }
    if (seeit)
        seetrap(trap, env);
}

// C ref: muse.c mon_escape() (780-795). A monster without the Amulet or
// invocation items escapes the dungeon via upstairs and is removed from the
// game. Returns 0 when the monster must stay, 2 when it escaped.
async function mon_escape(mtmp, vismon, state, env) {
    if (mon_has_special(mtmp)
        || (mtmp.iswiz && (state.context?.no_of_wizards ?? 0) < 2))
        return 0;
    if (vismon)
        await pline_mon(mtmp,
            `${capitalizedMonsterName(mtmp, state)} escapes the dungeon!`,
            state);
    mongone(mtmp, env);
    return 2;
}

// C ref: muse.c mcureblindness() (2872-2881). Cure a monster's blindness
// and announce that it can see again if the hero can see it.
async function mcureblindness(mon, verbos, state) {
    if (!mon.mcansee) {
        mon.mcansee = 1;
        mon.mblinded = 0;
        if (verbos && haseyes(mon.data))
            await pline_mon(mon,
                `${capitalizedMonsterName(mon, state)} can see again.`,
                state);
    }
}

// C ref: muse.c use_defensive() (796-1221). Execute the defensive item
// action that find_defensive() selected. Returns 0 if nothing happened,
// 1 if the monster died, 2 if it acted.
//
// The C version reads gm.m.defensive and gm.m.has_defense; the JS version
// receives the selection object from find_defensive(). For trap-based
// escapes, the selection carries the trap coordinates that C stores in
// gt.trapx/gt.trapy.
export async function use_defensive(mtmp, selection, state, env = {}) {
    const otmp = selection.object;
    const kind = selection.kind;

    const i = await precheck(mtmp, otmp, state, env);
    if (i !== 0) return i;

    const vis = cansee(mtmp.mx, mtmp.my, state);
    const vismon = canseemon(mtmp, state);
    const oseen = otmp && vismon;

    // C ref: muse.c:812-815. When using a defensive choice to run away, the
    // monster should avoid rushing right back; don't override if already
    // scared.
    const fleetim = !mtmp.mflee
        ? (33 - Math.trunc(30 * mtmp.mhp / mtmp.mhpmax)) : 0;
    const m_flee = async (m) => {
        if (fleetim && !m.iswiz) {
            await monflee(m, fleetim, false, false, { state });
        }
    };

    switch (kind) {
    case 'unicorn horn': {
        // MUSE_UNICORN_HORN: unicorn horn object is optional
        if (vismon) {
            if (otmp)
                await pline_mon(mtmp,
                    `${capitalizedMonsterName(mtmp, state)} uses a unicorn horn!`,
                    state);
            else
                await ttyPline(
                    `The tip of ${s_suffix(monsterCommonName(mtmp, state))} horn glows!`,
                    state);
        }
        if (!mtmp.mcansee) {
            await mcureblindness(mtmp, vismon, state);
        } else if (mtmp.mconf || mtmp.mstun) {
            mtmp.mconf = 0;
            mtmp.mstun = 0;
            if (vismon)
                await pline_mon(mtmp,
                    `${capitalizedMonsterName(mtmp, state)} seems steadier now.`,
                    state);
        }
        // C: else impossible("No need for unicorn horn?");
        return 2;
    }
    case 'bugle': {
        // MUSE_BUGLE
        if (vismon) {
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} plays ${donameFresh(otmp, state)}!`,
                state);
        } else if (!Deaf(state)) {
            // Soundeffect is a no-op in the tty build.
            const heard = youHear('a bugle playing reveille!', state);
            if (heard) await ttyPline(heard, state);
        }
        note_unported('music.c awaken_soldiers');
        return 2;
    }
    case 'teleportation wand': {
        // C distinguishes MUSE_WAN_TELEPORTATION_SELF (zap self) from
        // MUSE_WAN_TELEPORTATION (zap beam at others) based on whether the
        // monster carries the Amulet of Yendor.
        if (mon_has_amulet(mtmp)) {
            // MUSE_WAN_TELEPORTATION: zap at others (monster has the Amulet)
            state.gz ??= {};
            state.gz.zap_oseen = oseen;
            await mzapwand(mtmp, otmp, false, state);
            state.m_using = true;
            // bhito (zap.c) is unported; pass null so fhito_loc skips objects.
            note_unported('zap.c bhito');
            await mbhit(mtmp, rn1(8, 6), mbhitm, null, otmp, state);
            /* monster learns that teleportation isn't useful here */
            if (noteleport_level(mtmp, state))
                mon_learns_traps(mtmp, TELEP_TRAP);
            state.m_using = false;
            return 2;
        }
        // MUSE_WAN_TELEPORTATION_SELF: zap self
        if ((mtmp.isshk && inhishop(mtmp, state))
            || mtmp.isgd || mtmp.ispriest)
            return 2;
        await m_flee(mtmp);
        await mzapwand(mtmp, otmp, true, state);
        await m_tele(mtmp, vismon, oseen, O.WAN_TELEPORTATION, state);
        return 2;
    }
    case 'teleportation scroll': {
        // MUSE_SCR_TELEPORTATION
        const obj_is_cursed = otmp.cursed;
        if (mtmp.isshk || mtmp.isgd || mtmp.ispriest)
            return 2;
        await m_flee(mtmp);
        // Take the scroll out of inventory before teleporting, in case the
        // monster lands in lava or on a fire trap and the scroll is destroyed.
        let scrollObj = otmp;
        if (scrollObj.quan > 1)
            scrollObj = splitobj(scrollObj, 1, { state });
        extract_from_minvent(mtmp, scrollObj, false, false, { state });
        await mreadmsg(mtmp, scrollObj, state);
        if (obj_is_cursed || mtmp.mconf) {
            const nlev = random_teleport_level(state);
            if (mon_has_amulet(mtmp)
                || In_endgame(state.u?.uz)) {
                if (vismon)
                    await pline_mon(mtmp,
                        `${capitalizedMonsterName(mtmp, state)} seems very disoriented for a moment.`,
                        state);
            } else if (nlev === depth(state.u?.uz, state)) {
                if (vismon)
                    await pline_mon(mtmp,
                        `${capitalizedMonsterName(mtmp, state)} shudders for a moment.`,
                        state);
            } else {
                const flev = {};
                get_level(flev, nlev, state);
                migrate_to_level(mtmp, ledger_no(flev, state),
                    MIGR_RANDOM, null, { state });
            }
        } else {
            await m_tele(mtmp, vismon, oseen, O.SCR_TELEPORTATION, state);
        }
        // m_tele() handles makeknown(). trycall() is a no-op when the otyp
        // is already discovered. C checks iflags.last_msg != PLNMSG_enum to
        // detect whether any message was shown; since ttyPline does not set
        // last_msg, we check dknown directly (mreadmsg sets it when the hero
        // can see or hear the monster).
        if (scrollObj.dknown)
            await trycall(scrollObj, state);
        obfree(scrollObj, null, { state });
        return 2;
    }
    case 'digging wand': {
        // MUSE_WAN_DIGGING
        await m_flee(mtmp);
        await mzapwand(mtmp, otmp, false, state);
        if (oseen)
            discover_object(O.WAN_DIGGING, true, true, true, state);
        const lev = state.level.at(mtmp.mx, mtmp.my);
        if (IS_FURNITURE(lev.typ)
            || IS_DRAWBRIDGE(lev.typ)
            || (is_drawbridge_wall(mtmp.mx, mtmp.my, state) >= 0)
            || stairway_at(mtmp.mx, mtmp.my, state)) {
            await ttyPline('The digging ray is ineffective.', state);
            return 2;
        }
        if (!Can_dig_down(state.u?.uz, state) && !lev.candig) {
            // Can't dig further; try to make a pit
            if (t_at(mtmp.mx, mtmp.my, state)
                || !(env._trap = maketrap(mtmp.mx, mtmp.my, PIT, { state }))) {
                if (vismon)
                    await ttyPline(
                        `The ${surface(mtmp.mx, mtmp.my, state)} here is too hard to dig in.`,
                        state);
                return 2;
            }
            const t = env._trap;
            if (vis) {
                seetrap(t, { redraw: (x, y) => newsym(x, y) });
                await pline_mon(mtmp,
                    `${capitalizedMonsterName(mtmp, state)} has made a pit in the ${surface(mtmp.mx, mtmp.my, state)}.`,
                    state);
            }
            fill_pit(mtmp.mx, mtmp.my, state);
            recalc_block_point(mtmp.mx, mtmp.my, state);
            return (await mintrap(mtmp, FORCEBUNGLE, { state })) === Trap_Killed_Mon ? 1 : 2;
        }
        // Can dig down: make a hole
        const t = maketrap(mtmp.mx, mtmp.my, HOLE, { state });
        if (!t) return 2;
        recalc_block_point(mtmp.mx, mtmp.my, state);
        seetrap(t, { redraw: (x, y) => newsym(x, y) });
        if (vis) {
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} has made a hole in the ${surface(mtmp.mx, mtmp.my, state)}.`,
                state);
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} ${is_flyer(mtmp.data) ? 'dives' : 'falls'} through...`,
                state);
        } else if (!Deaf(state)) {
            // Soundeffect is a no-op in the tty build.
            const heard = youHear(
                `something crash through the ${surface(mtmp.mx, mtmp.my, state)}.`,
                state);
            if (heard) await ttyPline(heard, state);
        }
        fill_pit(mtmp.mx, mtmp.my, state);
        migrate_to_level(mtmp, ledger_no(state.u?.uz, state) + 1,
            MIGR_RANDOM, null, { state });
        return 2;
    }
    case 'undead turning wand': {
        // MUSE_WAN_UNDEAD_TURNING
        if (!otmp)
            throw new Error('missing defensive item: wand of undead turning');
        state.gz ??= {};
        state.gz.zap_oseen = oseen;
        await mzapwand(mtmp, otmp, false, state);
        state.m_using = true;
        // bhito (zap.c) is unported; pass null so fhito_loc skips objects.
        note_unported('zap.c bhito');
        await mbhit(mtmp, rn1(8, 6), mbhitm, null, otmp, state);
        state.m_using = false;
        return 2;
    }
    case 'create monster wand': {
        // MUSE_WAN_CREATE_MONSTER
        // pm: null => random, eel => aquatic, croc => amphibious
        const pm = !is_pool(mtmp.mx, mtmp.my, state) ? null
            : state.mons[state.u?.uinwater ? M.PM_GIANT_EEL : M.PM_CROCODILE];
        const cc = enexto(mtmp.mx, mtmp.my, pm, { state });
        if (!cc) return 0;
        await mzapwand(mtmp, otmp, false, state);
        const mon = makemon(null, cc.x, cc.y, NO_MM_FLAGS, { state });
        if (mon && canSpotMonster(mon, state) && oseen)
            discover_object(O.WAN_CREATE_MONSTER, true, true, true, state);
        return 2;
    }
    case 'create monster scroll': {
        // MUSE_SCR_CREATE_MONSTER
        let cnt = 1;
        let known = false;
        if (!rn2(73))
            cnt += rnd(4);
        if (mtmp.mconf || otmp.cursed)
            cnt += 12;
        const pm = mtmp.mconf
            ? state.mons[M.PM_ACID_BLOB]
            : null;
        const fish = mtmp.mconf
            ? state.mons[M.PM_ACID_BLOB]
            : is_pool(mtmp.mx, mtmp.my, state)
                ? state.mons[state.u?.uinwater ? M.PM_GIANT_EEL : M.PM_CROCODILE]
                : null;
        await mreadmsg(mtmp, otmp, state);
        while (cnt-- > 0) {
            const cc = enexto(mtmp.mx, mtmp.my, fish, { state });
            if (!cc) break;
            const mon = makemon(pm, cc.x, cc.y, NO_MM_FLAGS, { state });
            if (mon && canSpotMonster(mon, state))
                known = true;
        }
        if (known)
            discover_object(O.SCR_CREATE_MONSTER, true, true, true, state);
        else
            await trycall(otmp, state);
        m_useup(mtmp, otmp, { state });
        return 2;
    }
    case 'trapdoor': {
        // MUSE_TRAPDOOR
        if (Is_botlevel(state.u?.uz))
            return 0;
        await m_flee(mtmp);
        const trapx = selection.x;
        const trapy = selection.y;
        const t = t_at(trapx, trapy, state);
        if (vis) {
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} ${vtense('mon', locomotion(mtmp.data, 'jump'))} into a ${trapname(t.ttyp)}!`,
                state);
        }
        reveal_trap(t, vis, state, { redraw: (x, y) => newsym(x, y) });
        // Don't use rloc_to() because worm tails must "move"
        remove_monster(mtmp.mx, mtmp.my, state);
        newsym(mtmp.mx, mtmp.my);
        place_monster(mtmp, trapx, trapy, state);
        if (mtmp.wormno)
            note_unported('worm.c worm_move');
        newsym(trapx, trapy);
        migrate_to_level(mtmp, ledger_no(state.u?.uz, state) + 1,
            MIGR_RANDOM, null, { state });
        return 2;
    }
    case 'upstairs': {
        // MUSE_UPSTAIRS
        await m_flee(mtmp);
        const stway = stairway_at(mtmp.mx, mtmp.my, state);
        if (!stway) return 0;
        if (ledger_no(state.u?.uz, state) === 1)
            return await mon_escape(mtmp, vismon, state, { state });
        if (In_hell(state.u?.uz, state) && mon_has_amulet(mtmp) && !rn2(4)
            && (dunlev(state.u?.uz) < dunlevs_in_dungeon(state.u?.uz, state) - 3)) {
            if (vismon)
                await ttyPline(
                    `As ${monsterCommonName(mtmp, state)} climbs the stairs, a mysterious force momentarily surrounds ${mhim(mtmp, { state })}...`,
                    state);
            migrate_to_level(mtmp, ledger_no(state.u?.uz, state) + 1,
                MIGR_RANDOM, null, { state });
        } else {
            if (vismon)
                await pline_mon(mtmp,
                    `${capitalizedMonsterName(mtmp, state)} escapes upstairs!`,
                    state);
            migrate_to_level(mtmp, ledger_no(stway.tolev, state),
                MIGR_STAIRS_DOWN, null, { state });
        }
        return 2;
    }
    case 'downstairs': {
        // MUSE_DOWNSTAIRS
        await m_flee(mtmp);
        const stway = stairway_at(mtmp.mx, mtmp.my, state);
        if (!stway) return 0;
        if (vismon)
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} escapes downstairs!`,
                state);
        migrate_to_level(mtmp, ledger_no(stway.tolev, state),
            MIGR_STAIRS_UP, null, { state });
        return 2;
    }
    case 'up ladder': {
        // MUSE_UP_LADDER
        await m_flee(mtmp);
        const stway = stairway_at(mtmp.mx, mtmp.my, state);
        if (!stway) return 0;
        if (vismon)
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} escapes up the ladder!`,
                state);
        migrate_to_level(mtmp, ledger_no(stway.tolev, state),
            MIGR_LADDER_DOWN, null, { state });
        return 2;
    }
    case 'down ladder': {
        // MUSE_DN_LADDER
        await m_flee(mtmp);
        const stway = stairway_at(mtmp.mx, mtmp.my, state);
        if (!stway) return 0;
        if (vismon)
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} escapes down the ladder!`,
                state);
        migrate_to_level(mtmp, ledger_no(stway.tolev, state),
            MIGR_LADDER_UP, null, { state });
        return 2;
    }
    case 'special stairs': {
        // MUSE_SSTAIRS
        await m_flee(mtmp);
        const stway = stairway_at(mtmp.mx, mtmp.my, state);
        if (!stway) return 0;
        if (ledger_no(state.u?.uz, state) === 1)
            return await mon_escape(mtmp, vismon, state, { state });
        if (vismon)
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} escapes ${stway.up ? 'up' : 'down'}stairs!`,
                state);
        migrate_to_level(mtmp, ledger_no(stway.tolev, state),
            MIGR_SSTAIRS, null, { state });
        return 2;
    }
    case 'teleport trap': {
        // MUSE_TELEPORT_TRAP
        await m_flee(mtmp);
        const trapx = selection.x;
        const trapy = selection.y;
        const t = t_at(trapx, trapy, state);
        if (vis) {
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} ${vtense('mon', locomotion(mtmp.data, 'jump'))} onto a ${trapname(t.ttyp)}!`,
                state);
        }
        reveal_trap(t, vis, state, { redraw: (x, y) => newsym(x, y) });
        // Don't use rloc_to() because worm tails must "move"
        remove_monster(mtmp.mx, mtmp.my, state);
        newsym(mtmp.mx, mtmp.my);
        place_monster(mtmp, trapx, trapy, state);
        if (mtmp.wormno)
            note_unported('worm.c worm_move');
        maybe_unhide_at(mtmp.mx, mtmp.my, state);
        newsym(trapx, trapy);
        // C calls m_tele(mtmp, vismon, FALSE, 0), which runs mintrap() with
        // FORCETRAP so the monster teleports through the trap. The JS m_tele
        // delegates to mintrap(), which requires injected operations this
        // context does not provide. Use the same tele_restrict / amulet /
        // rloc sequence m_tele uses for how != 0; the gap is that a vault-
        // bound trap would send the monster to a random location instead.
        if (await tele_restrict(mtmp, state)) {
            if (noteleport_level(mtmp, state))
                mon_learns_traps(mtmp, TELEP_TRAP);
        } else if ((mon_has_amulet(mtmp)
            || On_W_tower_level(state.u?.uz, state)) && !rn2(3)) {
            if (vismon)
                await pline_mon(mtmp,
                    `${capitalizedMonsterName(mtmp, state)} seems disoriented for a moment.`,
                    state);
        } else {
            await rloc(mtmp, RLOC_MSG, { state });
        }
        return 2;
    }
    case 'healing': {
        // MUSE_POT_HEALING
        await mquaffmsg(mtmp, otmp, state);
        const amt = d(6 + 2 * bcsign(otmp), 4);
        healmon(mtmp, amt, 1);
        if (!otmp.cursed && !mtmp.mcansee)
            await mcureblindness(mtmp, vismon, state);
        if (vismon)
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} looks better.`,
                state);
        if (oseen)
            discover_object(O.POT_HEALING, true, true, true, state);
        m_useup(mtmp, otmp, { state });
        return 2;
    }
    case 'extra healing': {
        // MUSE_POT_EXTRA_HEALING
        await mquaffmsg(mtmp, otmp, state);
        const amt = d(6 + 2 * bcsign(otmp), 8);
        healmon(mtmp, amt, otmp.blessed ? 5 : 2);
        if (!mtmp.mcansee)
            await mcureblindness(mtmp, vismon, state);
        if (vismon)
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} looks much better.`,
                state);
        if (oseen)
            discover_object(O.POT_EXTRA_HEALING, true, true, true, state);
        m_useup(mtmp, otmp, { state });
        return 2;
    }
    case 'full healing':
    case 'pestilence healing': {
        // MUSE_POT_FULL_HEALING (also Pestilence's POT_SICKNESS)
        await mquaffmsg(mtmp, otmp, state);
        if (otmp.otyp === O.POT_SICKNESS)
            await unbless(otmp, { state }); /* Pestilence */
        healmon(mtmp, mtmp.mhpmax, otmp.blessed ? 8 : 4);
        if (!mtmp.mcansee && otmp.otyp !== O.POT_SICKNESS)
            await mcureblindness(mtmp, vismon, state);
        if (vismon)
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} looks completely healed.`,
                state);
        if (oseen)
            discover_object(otmp.otyp, true, true, true, state);
        m_useup(mtmp, otmp, { state });
        return 2;
    }
    case 'lizard corpse': {
        // C ref: muse.c use_defensive() MUSE_LIZARD_CORPSE (1204-1209).
        // Not actually called for its unstoning effect; cures stun/confusion.
        if (!otmp)
            throw new Error('missing defensive item: lizard corpse');
        await mon_consume_unstone(mtmp, otmp, false, false, state, env);
        return 2;
    }
    default:
        // C: impossible("%s wanted to perform action %d?", ...)
        return 0;
    }
}

function canLetGoWithoutDiscovery(obj, state) {
    if (!obj) return false;
    if (obj.owornmask & (W_ARMOR | W_ACCESSORY)) return false;
    if (obj === state.uwep && mwelded(obj, state)) return false;
    if (obj.otyp === O.LOADSTONE && obj.cursed) return false;
    if (obj.otyp === O.LEASH && obj.leashmon) return false;
    return !(obj.owornmask & W_SADDLE);
}

// C ref: muse.c find_misc() (2095-2246). Select a miscellaneous item or
// action for a monster: polymorph trap, gain-level potion, bullwhip disarm,
// invisibility, speed, polymorph, or container looting. Returns a selection
// object or null; use_misc() executes the selected action.
export function find_misc(monster, rawEnv = {}) {
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

    const immobile = species?.mmove === 0;
    const stuck = monster === hero?.ustuck;
    if (!stuck && !immobile && !monster.mtrapped
        && monster.cham === NON_PM && species?.difficulty < 6) {
        const ignoresBoulders = verysmall(species)
            || throws_rocks(species)
            || passes_walls(species);
        const diagOk = species?.pmidx !== M.PM_GRID_BUG;
        for (let xx = monster.mx - 1; xx <= monster.mx + 1; ++xx) {
            for (let yy = monster.my - 1; yy <= monster.my + 1; ++yy) {
                if (!isok(xx, yy)
                    || u_at(xx, yy, state)
                    || (!diagOk && xx !== monster.mx && yy !== monster.my)
                    || ((xx !== monster.mx || yy !== monster.my)
                        && state.level.monsters[xx]?.[yy])) {
                    continue;
                }
                const trap = t_at(xx, yy, state);
                if (trap
                    && (ignoresBoulders
                        || !sobj_at(O.BOULDER, xx, yy, state))
                    && !onscary(xx, yy, monster, state)
                    && trap.ttyp === POLY_TRAP
                    && !wearing_iron_shoes(monster, state)) {
                    return {
                        kind: 'polymorph trap',
                        object: null,
                        x: xx,
                        y: yy,
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
            && u_at(monster.mux, monster.muy, state)
            && m_next2u(monster, state)
            && !hero?.uswallow
            && (canLetGoWithoutDiscovery(state.uwep, state)
                || (hero?.twoweap
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
            && !selected && Has_contents(obj)
            && !obj.olocked && !obj.otrapped) {
            selected = { kind: 'container', object: obj };
        }
    }
    return selected;
}

// C ref: muse.c muse_newcham_mon() (2250-2263). Choose a polymorph target
// for a monster: if it wears dragon scales or scale mail, become the
// corresponding dragon; otherwise pick a random monster suitable for the
// current level.
export function muse_newcham_mon(mon, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const m_armr = which_armor(mon, W_ARM, state);
    if (m_armr) {
        if (Is_dragon_scales(m_armr))
            return Dragon_scales_to_pm(m_armr, state);
        if (Is_dragon_mail(m_armr))
            return Dragon_mail_to_pm(m_armr, state);
    }
    return rndmonst(rawEnv);
}

// C ref: muse.c mloot_container() (2264-2382). A monster loots items from
// a container it is carrying. Returns 0 if nothing was taken, 2 if at least
// one item was removed. Messages are printed when the hero can see the
// monster (vismon).
export async function mloot_container(mon, container, vismon, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    let res = 0;

    if (!container || !Has_contents(container) || container.olocked)
        return res; /* 0 */
    // FIXME: handle cursed bag of holding
    if (isMagicBag(container) && container.cursed)
        return res; /* 0 */
    if (container.otyp === O.LARGE_BOX && container.spe === 1)
        return res; /* SchroedingersBox */

    let takeout_count;
    switch (rn2(10)) {
    default: /* case 0, 1, 2, 3: */
        takeout_count = 1;
        break;
    case 4: case 5: case 6:
        takeout_count = 2;
        break;
    case 7: case 8:
        takeout_count = 3;
        break;
    case 9:
        takeout_count = 4;
        break;
    }
    const howfar = mdistu(mon, state);
    const nearby = howfar <= 7 * 7;
    let contnr_nam = '';
    let mpronounbuf = '';
    if (vismon) {
        // do this once so that when hallucinating it won't change
        // from one item to the next
        mpronounbuf = mhe(mon, { state });
    }

    for (let takeout_indx = 0; takeout_indx < takeout_count; ++takeout_indx) {
        if (!Has_contents(container)) /* might have removed all items */
            break;
        // TODO? Monster ought to prioritize on something it wants to use.
        let nitems = 0;
        for (let xobj = container.cobj; xobj; xobj = xobj.nobj)
            ++nitems;
        // nitems is always greater than 0 due to Has_contents() check;
        // throttle item removal as the container becomes less filled
        if (!rn2(nitems + 1))
            break;
        nitems = rn2(nitems);
        let xobj = container.cobj;
        while (xobj) {
            if (--nitems < 0) break;
            xobj = xobj.nobj;
        }

        container.cknown = 0; /* hero no longer knows container's contents
                                * even if [attempted] removal is observed */
        if (!contnr_nam) {
            // xname sets dknown, distant_name might depending on its own
            // idea about nearness
            const xn = xnameFresh(container, state);
            contnr_nam = an(nearby ? xn : distant_name(container, xnameFresh, state));
        }
        // this was originally just 'can_carry(mon, xobj)' which
        // covers objects a monster shouldn't pick up but also
        // checks carrying capacity; for that, it ended up counting
        // xobj's weight twice when container is carried; so take
        // xobj out, check whether it can be carried, and then put
        // it back (below) if it can't be
        obj_extract_self(xobj, { state });   /* this reduces container's weight */
        // check whether mon can handle xobj and whether weight of xobj plus
        // minvent (including container, now without xobj) can be carried
        if (can_carry(mon, xobj, { state })) {
            if (vismon) {
                if (howfar > 2) /* not adjacent */
                    await ttyNorep(
                        `${capitalizedMonsterName(mon, state)} rummages through ${contnr_nam}.`,
                        state,
                    );
                else if (takeout_indx === 0) /* adjacent, first item */
                    await pline_mon(mon,
                        `${capitalizedMonsterName(mon, state)} removes ${donameFresh(xobj, state)} from ${contnr_nam}.`,
                        state);
                else /* adjacent, additional items */
                    await ttyPline(
                        `${upstart(mpronounbuf)} removes ${donameFresh(xobj, state)}.`,
                        state,
                    );
            }
            if (container.otyp === O.ICE_BOX)
                note_unported('pickup.c removed_from_icebox');
            // obj_extract_self(xobj) -- already done above
            mpickobj(mon, xobj, { state });
            res = 2;
        } else { /* couldn't carry xobj separately so put back inside */
            // an achievement prize (castle's wand?) might already be
            // marked nomerge (when it hasn't been in invent yet)
            const already_nomerge = xobj.nomerge !== 0 && xobj.nomerge != null;
            const just_xobj = !Has_contents(container);

            // this doesn't restore the original contents ordering
            // [shouldn't be a problem; even though this item didn't
            // give the rummage message, that's what mon was doing]
            xobj.nomerge = 1;
            xobj = add_to_container(container, xobj, { state });
            if (!already_nomerge)
                xobj.nomerge = 0;
            container.owt = weight(container, { state });
            if (just_xobj)
                break; /* out of takeout_count loop */
        } /* can_carry */
    } /* takeout_count */
    return res;
}

// C ref: muse.c use_misc() (2383-2630). Execute the miscellaneous monster
// action that find_misc() selected. The selection carries a `kind` string and
// an `object` (or null for a polymorph trap). Returns 0 when nothing happened,
// 1 when the monster died, or 2 when the action completed.
//
// Unported callees whose results the C discards:
//   mon.c m_useup       -- consumed object stays in monster inventory
//   worn.c mon_set_minvis   -- visibility flag change skipped
//   worn.c mon_adjust_speed -- speed flag change skipped
//   mon.c newcham           -- polymorph skipped
//   worm.c worm_move        -- worm segment relocation skipped
export async function use_misc(mtmp, selection, state, env = {}) {
    const otmp = selection.object;
    const i = await precheck(mtmp, otmp, state, env);
    if (i !== 0) return i;
    const vis = cansee(mtmp.mx, mtmp.my, state);
    const vismon = canseemon(mtmp, state);
    const oseen = otmp && vismon;

    switch (selection.kind) {
    case 'gain level': {
        // MUSE_POT_GAIN_LEVEL
        if (!otmp) throw new Error('use_misc: no potion of gain level');
        await mquaffmsg(mtmp, otmp, state);
        if (otmp.cursed) {
            if (Can_rise_up(mtmp.mx, mtmp.my, state.u.uz, state)) {
                const tolev = depth(state.u.uz, state) - 1;
                const tolevel = {};
                get_level(tolevel, tolev, state);
                // insurance against future changes...
                if (!on_level(tolevel, state.u.uz)) {
                    if (vismon) {
                        await pline_mon(mtmp,
                            `${capitalizedMonsterName(mtmp, state)} rises up, through the ${ceiling(mtmp.mx, mtmp.my, state)}!`,
                            state);
                        await trycall(otmp, state);
                    }
                    m_useup(mtmp, otmp, { state });
                    migrate_to_level(mtmp, ledger_no(tolevel, state),
                        MIGR_RANDOM, null, { state });
                    return 2;
                }
            }
            // skipmsg: falls through when Can_rise_up is false or on_level
            if (vismon) {
                await pline_mon(mtmp,
                    `${capitalizedMonsterName(mtmp, state)} looks uneasy.`,
                    state);
                await trycall(otmp, state);
            }
            m_useup(mtmp, otmp, { state });
            return 2;
        }
        if (vismon)
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} seems more experienced.`,
                state);
        if (oseen)
            discover_object(O.POT_GAIN_LEVEL, true, true, true, state);
        m_useup(mtmp, otmp, { state });
        if (!grow_up(mtmp, null, { state, ...env }))
            return 1; /* grew into genocided monster */
        return 2;
    }
    case 'make invisible':
    case 'invisibility': {
        // MUSE_WAN_MAKE_INVISIBLE / MUSE_POT_INVISIBILITY
        if (!otmp) throw new Error('use_misc: no potion of invisibility');
        if (otmp.otyp === O.WAN_MAKE_INVISIBLE) {
            await mzapwand(mtmp, otmp, true, state);
        } else {
            await mquaffmsg(mtmp, otmp, state);
        }
        // format monster's name before altering its visibility
        const nambuf = monsterCommonName(mtmp, state);
        note_unported('worn.c mon_set_minvis');
        if (vismon && mtmp.minvis) { /* was seen, now invisible */
            if (canSpotMonster(mtmp, state)) {
                await ttyPline(messageAt(
                    `${upstart(s_suffix(nambuf))} body takes on a ${Hallucination(state) ? 'normal' : 'strange'} transparency.`,
                    mtmp.mx, mtmp.my, state), state);
            } else {
                await ttyPline(messageAt(
                    `Suddenly you cannot see ${nambuf}.`,
                    mtmp.mx, mtmp.my, state), state);
                if (vis)
                    map_invisible(mtmp.mx, mtmp.my, state);
            }
            if (oseen)
                discover_object(otmp.otyp, true, true, true, state);
        } else if (vismon && !mtmp.minvis) {
            /* cursed potion; mon tried to make itself invisible but failed */
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} briefly seems to be transparent.`,
                state);
        } else if (!vismon && canseemon(mtmp, state)) {
            /* cursed potion; this won't happen because a monster will only
               drink a potion of invisibility when not already invisible */
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} suddenly appears!`,
                state);
        }
        if (otmp.otyp === O.POT_INVISIBILITY) {
            if (otmp.cursed)
                await you_aggravate(mtmp, state);
            m_useup(mtmp, otmp, { state });
        }
        return 2;
    }
    case 'speed wand': {
        // MUSE_WAN_SPEED_MONSTER
        if (!otmp) throw new Error('use_misc: no wand of speed monster');
        await mzapwand(mtmp, otmp, true, state);
        note_unported('worn.c mon_adjust_speed');
        return 2;
    }
    case 'speed potion': {
        // MUSE_POT_SPEED
        if (!otmp) throw new Error('use_misc: no potion of speed');
        await mquaffmsg(mtmp, otmp, state);
        note_unported('worn.c mon_adjust_speed');
        m_useup(mtmp, otmp, { state });
        return 2;
    }
    case 'polymorph wand': {
        // MUSE_WAN_POLYMORPH
        if (!otmp) throw new Error('use_misc: no wand of polymorph');
        await mzapwand(mtmp, otmp, true, state);
        note_unported('mon.c newcham');
        if (oseen)
            discover_object(O.WAN_POLYMORPH, true, true, true, state);
        return 2;
    }
    case 'polymorph potion': {
        // MUSE_POT_POLYMORPH
        if (!otmp) throw new Error('use_misc: no potion of polymorph');
        await mquaffmsg(mtmp, otmp, state);
        m_useup(mtmp, otmp, { state });
        if (vismon)
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} suddenly mutates!`,
                state);
        note_unported('mon.c newcham');
        if (oseen)
            discover_object(O.POT_POLYMORPH, true, true, true, state);
        return 2;
    }
    case 'polymorph trap': {
        // MUSE_POLY_TRAP
        const trapX = selection.x;
        const trapY = selection.y;
        const t = t_at(trapX, trapY, state);
        const vistrapspot = cansee(t.tx, t.ty, state);
        if (vis || vistrapspot)
            seetrap(t, state);
        if (vismon || vistrapspot) {
            // C: vtense(fakename[0], locomotion(...))
            // fakename[0] is "mon", a singular noun for conjugation
            await pline_mon(mtmp,
                `${Some_Monnam(mtmp, state)} deliberately ${vtense('mon', locomotion(mtmp.data, 'jump'))} onto a ${t.tseen ? trapname(t.ttyp, false, state) : 'hidden trap'}!`,
                state);
        }

        /* don't use rloc() due to worms */
        remove_monster(mtmp.mx, mtmp.my, state);
        newsym(mtmp.mx, mtmp.my, state);
        place_monster(mtmp, trapX, trapY, state);
        maybe_unhide_at(trapX, trapY, state);
        if (mtmp.wormno)
            note_unported('worm.c worm_move');
        newsym(trapX, trapY, state);

        note_unported('mon.c newcham');
        return 2;
    }
    case 'container':
        // MUSE_BAG
        if (!otmp) throw new Error('use_misc: no container');
        return await mloot_container(mtmp, otmp, vismon, { state, ...env });
    case 'bullwhip': {
        // MUSE_BULLWHIP -- attempt to disarm hero
        const The_whip = vismon ? 'The bullwhip' : 'A whip';
        let where_to = rn2(4);
        let obj = state.uwep;

        if (!obj || !await canletgo(obj, '', state)
            || (state.u?.twoweap
                && await canletgo(state.uswapwep, '', state)
                && rn2(2)))
            obj = state.uswapwep;
        if (!obj) break; /* shouldn't happen after find_misc() */

        const the_weapon = the(xnameFresh(obj, state), state);
        let hand = body_part(HAND, state.youmonst);
        if (bimanual(obj, state))
            hand = makeplural(hand);
        const hand_buf = hand;

        if (vismon)
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} flicks a bullwhip towards your ${hand_buf}!`,
                state);
        if (obj.otyp === O.HEAVY_IRON_BALL) {
            await ttyPline(
                `${The_whip} fails to wrap around ${the_weapon}.`, state);
            return 1;
        }
        // C: urgent_pline -- behaves like pline for message delivery
        await ttyPline(
            `${The_whip} wraps around ${the_weapon} you're wielding!`, state);
        if (welded(obj, state)) {
            await ttyPline(
                `${!is_plural(obj) ? 'It is' : 'They are'} welded to your ${hand_buf}${!obj.bknown ? '!' : '.'}`,
                state);
            /* welded() takes care of obj->bknown = 1 */
            where_to = 0;
        }
        if (!where_to) {
            await ttyPline('The whip slips free.', state); /* not The_whip */
            return 1;
        } else if (where_to === 3 && mon_hates_silver(mtmp)
                   && objectType(obj, state).oc_material === O.SILVER) {
            /* this monster won't want to catch a silver weapon;
               drop it at hero's feet instead */
            where_to = 2;
        }
        remove_worn_item(obj, false, state);
        freeinv(obj, { state });
        switch (where_to) {
        case 1: /* onto floor beneath mon */
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} yanks ${the_weapon} from your ${hand_buf}!`,
                state);
            place_object(obj, mtmp.mx, mtmp.my, { state });
            break;
        case 2: /* onto floor beneath you */
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} yanks ${the_weapon} to the ${surface(state.u.ux, state.u.uy, state)}!`,
                state);
            await dropy(obj, { state });
            break;
        case 3: /* into mon's inventory */
            await pline_mon(mtmp,
                `${capitalizedMonsterName(mtmp, state)} snatches ${the_weapon}!`,
                state);
            await mpickobj(mtmp, obj, { state });
            break;
        }
        return 1;
    }
    case undefined:
        return 0; /* i.e. an exploded wand */
    default:
        throw new Error(
            `${capitalizedMonsterName(mtmp, state)} wanted to perform action ${selection.kind}?`);
    }
    return 0;
}

// C ref: muse.c you_aggravate() (2631-2653). Called when a monster drinks a
// cursed potion of invisibility: announce its presence to the hero, briefly
// show its position on the map, and (if the hero is unconscious) jolt the
// hero awake.
async function you_aggravate(mtmp, state) {
    await ttyPline(
        `For some reason, ${s_suffix(monsterCommonName(mtmp, state, SUPPRESS_IT))} presence is known to you.`,
        state);
    await cls();
    // C: #ifdef CLIPPING cliparound() -- not applicable to the JS renderer
    show_glyph_cell(mtmp.mx, mtmp.my, map_monster_glyph_info(mtmp, state));
    display_self(state);
    // C: You_feel("aggravated at %s.") -- prepends "You feel "
    await ttyPline(messageAt(
        `You feel aggravated at ${monsterCommonName(mtmp, state, SUPPRESS_IT)}.`,
        mtmp.mx, mtmp.my, state), state);
    // C: display_nhwindow(WIN_MAP, TRUE) -- flush the map display
    await flush_screen(1);
    await docrt({ state });
    if (unconscious(state)) {
        state.multi = -1;
        state.nomovemsg = 'Aggravated, you are jolted into full consciousness.';
    }
    newsym(mtmp.mx, mtmp.my, state);
    if (!canSpotMonster(mtmp, state))
        map_invisible(mtmp.mx, mtmp.my, state);
}

// C ref: muse.c find_defensive() (440-748). Select a defensive item or
// action for a monster. C answers TRUE with the choice in gm.m.defensive and
// gm.m.has_defense; this port returns the selection object use_defensive()
// takes, or null where C answers FALSE. A trap selection carries the
// coordinates C stores in gt.trapx and gt.trapy.
export function find_defensive(monster, tryescape, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const species = monster.data;
    const hero = state.u;
    const x = monster.mx;
    const y = monster.my;
    const stuck = monster === hero?.ustuck;
    const immobile = species?.mmove === 0;
    const selected = (kind, object = null) => ({ kind, object });

    if (is_animal(species) || mindless(species)) return null;
    if (!tryescape && dist2(x, y, monster.mux, monster.muy) > 25)
        return null;
    if (tryescape && Is_knox_level(hero?.uz)
        && !m_next2u(monster, state) && m_next2m(monster, state))
        return null;
    if (hero?.uswallow && stuck) return null;

    // C ref: muse.c:475-487. A cursed unicorn horn is skipped because it
    // never gets used up; unicorns and ki-rin use their own horns.
    if (monster.mconf || monster.mstun || !monster.mcansee) {
        let horn = null;
        if (!nohands(species)) {
            for (let obj = monster.minvent; obj; obj = obj.nobj) {
                if (obj.otyp === O.UNICORN_HORN && !obj.cursed) {
                    horn = obj;
                    break;
                }
            }
        }
        if (horn || is_unicorn(species) || species?.pmidx === M.PM_KI_RIN)
            return selected('unicorn horn', horn);
    }

    // C ref: muse.c:489-509. Confused or stunned monsters look for a lizard
    // corpse or tin to cure the condition.
    if (monster.mconf || monster.mstun) {
        let liztin = null;
        for (let obj = monster.minvent; obj; obj = obj.nobj) {
            if (obj.otyp === O.CORPSE && obj.corpsenm === M.PM_LIZARD)
                return selected('lizard corpse', obj);
            else if (obj.otyp === O.TIN && obj.corpsenm === M.PM_LIZARD)
                liztin = obj;
        }
        // confused or stunned monster might not be able to open tin
        if (liztin && mcould_eat_tin(monster, state) && random.rn2(3))
            return selected('lizard corpse', liztin);
    }

    // C ref: muse.c:511-524. A blind monster checks for healing alone, since
    // healing cures blindness; Pestilence won't use healing even when blind.
    if (!monster.mcansee && !nohands(species)
        && species?.pmidx !== M.PM_PESTILENCE) {
        const healing = m_use_healing(monster, state);
        if (healing) return healing;
    }

    // C ref: muse.c:526-540. Monsters aren't given wands of undead turning,
    // but one that happened to pick one up uses it against a corpse wielder,
    // now, even if it isn't wounded.
    if (!monster.mpeaceful && !nohands(species)
        && state.uwep?.otyp === O.CORPSE
        && touch_petrifies(state.mons[state.uwep.corpsenm])
        && !poly_when_stoned(species, state)
        && !monster_resists_element(monster, STONE_RES, state)
        && lined_up(monster, { state, random })) {
        for (let obj = monster.minvent; obj; obj = obj.nobj) {
            if (obj.otyp === O.WAN_UNDEAD_TURNING && obj.spe > 0)
                return selected('undead turning wand', obj);
        }
    }

    if (!tryescape) {
        // do we try to heal?
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
    }

    let physicalEscape = null;
    if (stuck || immobile || monster.mtrapped) {
        /* fleeing by stairs or traps is not possible */
    } else {
        const terrain = state.level?.at?.(x, y)?.typ;
        if (terrain === STAIRS || terrain === LADDER) {
            const stair = stairway_at(x, y, state);
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
            /* Note: trap doors take precedence over teleport traps. */
            const ignoreBoulders = verysmall(species)
                || throws_rocks(species)
                || passes_walls(species);
            const diagOk = species?.pmidx !== M.PM_GRID_BUG;
            /* collect viable spots; monster's <mx,my> comes first */
            const spots = [[x, y]];
            for (let xx = x - 1; xx <= x + 1; xx++) {
                for (let yy = y - 1; yy <= y + 1; yy++) {
                    if (isok(xx, yy) && (xx !== x || yy !== y))
                        spots.push([xx, yy]);
                }
            }
            /* look for a suitable trap among the viable spots */
            for (const [xx, yy] of spots) {
                /* skip if it's hero's location
                   or a diagonal spot and monster can't move diagonally
                   or some other monster is there */
                if ((hero?.ux === xx && hero?.uy === yy)
                    || (xx !== x && yy !== y && !diagOk)
                    || (state.level?.monsters?.[xx]?.[yy]
                        && !(xx === x && yy === y))) {
                    continue;
                }
                /* skip if there's no trap or can't/won't move onto trap */
                const trap = t_at(xx, yy, state);
                if (!trap
                    || (!ignoreBoulders && sobj_at(O.BOULDER, xx, yy, state))
                    || onscary(xx, yy, monster, state)) {
                    continue;
                }
                /* use trap if it's the correct type */
                if (is_hole(trap.ttyp)
                    && !is_floater(species)
                    && !monster.isshk && !monster.isgd
                    && !monster.ispriest
                    && Can_fall_thru(hero.uz, state)) {
                    physicalEscape = {
                        kind: 'trapdoor', object: null, x: xx, y: yy,
                    };
                    break; /* no need to look at any other spots */
                } else if (trap.ttyp === TELEP_TRAP) {
                    physicalEscape = {
                        kind: 'teleport trap', object: null, x: xx, y: yy,
                    };
                }
            }
        }
    }

    if (nohands(species)) /* can't use objects */
        return physicalEscape;

    if (is_mercenary(species)) {
        const bugle = m_carrying(monster, O.BUGLE, state);
        if (bugle && m_sees_sleepy_soldier(monster, state))
            physicalEscape = selected('bugle', bugle);
    }

    /* use immediate physical escape prior to attempting magic */
    if (physicalEscape) /* stairs, trap door or tele-trap, bugle alert */
        return physicalEscape;

    /* kludge to cut down on trap destruction (particularly portals) */
    let t = t_at(x, y, state);
    if (t && (is_pit(t.ttyp) || t.ttyp === WEB || t.ttyp === BEAR_TRAP))
        t = null; /* ok for monster to dig here */

    // C ref: muse.c:655-747. The scan does not stop at the first match: a
    // later item overrides an earlier one, a 1-in-3 draw ends the scan once
    // something is selected, and nomore() skips an item family the monster
    // already selected. `defKind` stands in for gm.m.has_defense; it differs
    // from the selection kind only for Pestilence, whose potion of sickness
    // counts as MUSE_POT_FULL_HEALING.
    let def = null;
    let defKind = null;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        /* don't always use the same selection pattern */
        if (defKind && !random.rn2(3))
            break;

        /* nomore(MUSE_WAN_DIGGING); */
        if (defKind === 'digging wand')
            break;
        if (obj.otyp === O.WAN_DIGGING && obj.spe > 0 && !stuck && !t
            && !monster.isshk && !monster.isgd && !monster.ispriest
            && !is_floater(species)
            /* monsters digging in Sokoban can ruin things */
            && !state.level?.flags?.sokoban_rules
            /* digging wouldn't be effective; assume they know that */
            && !((state.level?.at?.(x, y)?.wall_info ?? 0) & W_NONDIGGABLE)
            && !(Is_botlevel(hero?.uz) || In_endgame(hero?.uz))
            && !(is_ice(x, y, state) || is_pool(x, y, state)
                || is_lava(x, y, state))
            && !(is_Vlad(monster) && In_V_tower(hero?.uz))) {
            def = selected('digging wand', obj);
            defKind = 'digging wand';
        }
        // nomore(MUSE_WAN_TELEPORTATION_SELF), nomore(MUSE_WAN_TELEPORTATION):
        // use_defensive() tells the two apart by mon_has_amulet().
        if (defKind === 'teleportation wand') continue;
        if (obj.otyp === O.WAN_TELEPORTATION && obj.spe > 0) {
            /* use the TELEP_TRAP bit to determine if they know
             * about noteleport on this level or not.  Avoids
             * ineffective re-use of teleportation.  This does
             * mean if the monster leaves the level, they'll know
             * about teleport traps.
             */
            if (!noteleport_level(monster, state)
                || !mon_knows_traps(monster, TELEP_TRAP)) {
                def = selected('teleportation wand', obj);
                defKind = 'teleportation wand';
            }
        }
        // nomore(MUSE_SCR_TELEPORTATION)
        if (defKind === 'teleportation scroll') continue;
        if (obj.otyp === O.SCR_TELEPORTATION && monster.mcansee
            && haseyes(species)
            && (!obj.cursed || (!(monster.isshk && inhishop(monster, state))
                                && !monster.isgd && !monster.ispriest))) {
            /* see WAN_TELEPORTATION case above */
            if (!noteleport_level(monster, state)
                || !mon_knows_traps(monster, TELEP_TRAP)) {
                def = selected('teleportation scroll', obj);
                defKind = 'teleportation scroll';
            }
        }

        if (species?.pmidx !== M.PM_PESTILENCE) {
            // nomore(MUSE_POT_FULL_HEALING)
            if (defKind === 'full healing') continue;
            if (obj.otyp === O.POT_FULL_HEALING) {
                def = selected('full healing', obj);
                defKind = 'full healing';
            }
            // nomore(MUSE_POT_EXTRA_HEALING)
            if (defKind === 'extra healing') continue;
            if (obj.otyp === O.POT_EXTRA_HEALING) {
                def = selected('extra healing', obj);
                defKind = 'extra healing';
            }
            // nomore(MUSE_WAN_CREATE_MONSTER)
            if (defKind === 'create monster wand') continue;
            if (obj.otyp === O.WAN_CREATE_MONSTER && obj.spe > 0) {
                def = selected('create monster wand', obj);
                defKind = 'create monster wand';
            }
            // nomore(MUSE_POT_HEALING)
            if (defKind === 'healing') continue;
            if (obj.otyp === O.POT_HEALING) {
                def = selected('healing', obj);
                defKind = 'healing';
            }
        } else { /* Pestilence */
            // nomore(MUSE_POT_FULL_HEALING)
            if (defKind === 'full healing') continue;
            if (obj.otyp === O.POT_SICKNESS) {
                def = selected('pestilence healing', obj);
                defKind = 'full healing';
            }
            // nomore(MUSE_WAN_CREATE_MONSTER)
            if (defKind === 'create monster wand') continue;
            if (obj.otyp === O.WAN_CREATE_MONSTER && obj.spe > 0) {
                def = selected('create monster wand', obj);
                defKind = 'create monster wand';
            }
        }
        // nomore(MUSE_SCR_CREATE_MONSTER)
        if (defKind === 'create monster scroll') continue;
        if (obj.otyp === O.SCR_CREATE_MONSTER) {
            def = selected('create monster scroll', obj);
            defKind = 'create monster scroll';
        }
    }
    return def;
}

// Complete source path through dochug()'s find_defensive(FALSE), followed by
// find_misc(). Any selected action remains outside the simple-turn boundary.
export function select_fresh_monster_item_action(monster, rawEnv = {}) {
    const defensive = find_defensive(monster, false, rawEnv);
    if (defensive) return defensive;
    return find_misc(monster, rawEnv);
}

// C ref: muse.c linedup_chk_corpse() (1294-1299). Callback for
// linedup_callback(): returns true when a corpse is on the floor at (x,y).
export function linedup_chk_corpse(x, y, state) {
    return sobj_at(O.CORPSE, x, y, state) !== null;
}

// C ref: muse.c m_use_undead_turning() (1300-1341). Checks whether the monster
// should zap a wand of undead turning offensively: either the hero is carrying
// a corpse, or there is a corpse on the ground in a direct line from the
// monster to the hero (and up to 3 steps beyond). On success, calls `select`
// to record the choice. C writes gm.m.offensive and gm.m.has_offense directly;
// this version takes the `select` callback that find_offensive() defines.
function m_use_undead_turning(mtmp, obj, select, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const u = state.u;
    const ax = u.ux + sgn(mtmp.mux - mtmp.mx) * 3;
    const ay = u.uy + sgn(mtmp.muy - mtmp.my) * 3;
    const bx = mtmp.mx;
    const by = mtmp.my;

    if (!(obj.otyp === O.WAN_UNDEAD_TURNING && obj.spe > 0))
        return;

    /* not necrophiliac(); unlike deciding whether to pick this
       type of wand up, we aren't interested in corpses within
       carried containers until they're moved into open inventory;
       we don't check whether hero is poly'd into an undead--the
       wand's turning effect is too weak to be a useful direct
       attack--only whether hero is carrying at least one corpse */
    if (carrying(O.CORPSE, state)
        || linedup_callback(ax, ay, bx, by,
            (x, y) => linedup_chk_corpse(x, y, state), rawEnv)
        /* or there's a corpse on the ground in a direct line from the
           monster to the hero, and up to 3 steps beyond. */
        ) {
        select(MUSE_WAN_UNDEAD_TURNING, obj);
    }
}

// C ref: muse.c hero_behind_chokepoint() (1344-1368). From the monster's point
// of view, is the hero behind a chokepoint? Checks the two squares flanking
// the step from the hero toward the monster; if both are inaccessible (wall,
// closed door, or out of bounds), the hero is behind a chokepoint.
export function hero_behind_chokepoint(mtmp, state = game) {
    const dx = sgn(mtmp.mx - mtmp.mux);
    const dy = sgn(mtmp.my - mtmp.muy);

    const x = mtmp.mux + dx;
    const y = mtmp.muy + dy;

    const dir = xytodir(dx, dy);
    // DIR_LEFT2(dir) = (dir + 6) % N_DIRS, DIR_RIGHT2(dir) = (dir + 2) % N_DIRS
    // DIR_CLAMP(dir) = (dir + N_DIRS) % N_DIRS
    const dir_l = ((dir + 6) % N_DIRS + N_DIRS) % N_DIRS;
    const dir_r = ((dir + 2) % N_DIRS + N_DIRS) % N_DIRS;

    const c1 = dirtocoord(dir_l);
    const c2 = dirtocoord(dir_r);
    if (!c1 || !c2) return false;
    const c1x = c1.x + x, c1y = c1.y + y;
    const c2x = c2.x + x, c2y = c2.y + y;

    if ((!isok(c1x, c1y) || !accessible(c1x, c1y, state))
        && (!isok(c2x, c2y) || !accessible(c2x, c2y, state)))
        return true;
    return false;
}

// C ref: muse.c mon_has_friends() (1371-1392). Returns true when a hostile
// monster has at least one other hostile monster adjacent to it.
export function mon_has_friends(mtmp, state = game) {
    if (mtmp.mtame || mtmp.mpeaceful)
        return false;

    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const x = mtmp.mx + dx;
            const y = mtmp.my + dy;

            if (isok(x, y)) {
                const mon2 = m_at(x, y, state);
                if (mon2 && mon2 !== mtmp
                    && !mon2.mtame && !mon2.mpeaceful)
                    return true;
            }
        }
    }

    return false;
}

// C ref: muse.c mon_likes_objpile_at() (1395-1420). Returns true when the
// monster likes any of the top 3 items in the object pile at (x,y), or the
// pile has more than 3 stacks.
export function mon_likes_objpile_at(mtmp, x, y, rawEnv = {}) {
    const state = rawEnv.state ?? game;

    if (!isok(x, y) || !OBJ_AT(x, y, state))
        return false;

    /* monster likes any of the top 3 items in the pile? */
    let i = 0;
    let otmp = state.level.objects[x]?.[y] ?? null;
    for (; otmp && i < 3; i++) {
        if (mon_would_take_item(mtmp, otmp, rawEnv))
            return true;
        otmp = otmp.nexthere;
    }

    /* pile is larger than 3 stacks? */
    if (i >= 3)
        return true;

    return false;
}

// C ref: muse.c mbhitm() (1597-1704). Monster beam/projectile hit effect on
// another monster (or the hero). Called by mbhit() for each monster in the
// beam's path. Returns 0 in all cases; the return value tells mbhit whether
// to stop, but C always returns 0 here.
async function mbhitm(mtmp, otmp, state) {
    let reveal_invis = false;
    let learnit = false;
    const hits_you = (mtmp === state.youmonst);

    if (!hits_you && otmp.otyp !== O.WAN_UNDEAD_TURNING) {
        mtmp.msleeping = 0;
        if (mtmp.m_ap_type)
            seemimic(mtmp, state);
    }
    switch (otmp.otyp) {
    case O.WAN_STRIKING:
        reveal_invis = true;
        if (hits_you) {
            // Antimagic: youprop.h:57, intrinsic or extrinsic.
            const hasAntimagic = Boolean(
                state.u?.uprops?.[ANTIMAGIC]?.intrinsic
                || state.u?.uprops?.[ANTIMAGIC]?.extrinsic,
            );
            if (hasAntimagic) {
                monstseesu(M_SEEN_MAGR, state);
                note_unported('display.c shieldeff');
                // Soundeffect is a no-op in the tty build.
                await ttyPline('Boing!', state);
                learnit = true;
            } else if (rnd(20) < 10 + (state.u?.uac ?? 10)
                       && !(state.gb?.buzzer
                            && !state.gb.buzzer.mwandexp)) {
                monstunseesu(M_SEEN_MAGR, state);
                await ttyPline('The wand hits you!', state);
                let tmp = d(2, 12);
                // Half_spell_damage: youprop.h:293-295.
                const halfSpellDam = Boolean(
                    state.u?.uprops?.[HALF_SPDAM]?.intrinsic
                    || state.u?.uprops?.[HALF_SPDAM]?.extrinsic,
                );
                if (halfSpellDam)
                    tmp = Math.trunc((tmp + 1) / 2);
                await losehp(tmp, 'wand', KILLED_BY_AN, state);
                learnit = true;
            } else {
                await ttyPline('The wand misses you.', state);
            }
            await stop_occupation(state);
            nomul(0, state);
        } else if (resists_magm(mtmp, state)) {
            note_unported('display.c shieldeff');
            // Soundeffect is a no-op in the tty build.
            await ttyPline('Boing!', state);
            learnit = true;
        } else if (rnd(20) < 10 + find_mac(mtmp, state)) {
            const tmp = d(2, 12);
            await hit('wand', mtmp, exclam(tmp), state);
            resist(mtmp, otmp.oclass, tmp, TELL, state);
            learnit = true;
        } else {
            await miss('wand', mtmp, state);
        }
        /* need to see the wand being zapped and also the spot where the
           target is hit; don't have to see the target itself though */
        if (learnit && state.gz?.zap_oseen
            && (hits_you || cansee(mtmp.mx, mtmp.my, state)))
            discover_object(O.WAN_STRIKING, true, true, true, state);
        break;
    case O.WAN_TELEPORTATION:
        if (hits_you) {
            await tele(state);
            if (state.gz?.zap_oseen)
                discover_object(O.WAN_TELEPORTATION, true, true, true, state);
        } else {
            /* for consistency with zap.c, don't identify */
            if (mtmp.ispriest
                && in_rooms(mtmp.mx, mtmp.my, TEMPLE, state).length > 0) {
                if (cansee(mtmp.mx, mtmp.my, state))
                    await pline_mon(mtmp,
                        `${capitalizedMonsterName(mtmp, state)} resists the magic!`,
                        state);
            } else if (!(await tele_restrict(mtmp, state)))
                rloc(mtmp, RLOC_MSG, { state });
        }
        break;
    case O.WAN_CANCELLATION:
    case O.SPE_CANCELLATION:
        note_unported('zap.c cancel_monst');
        break;
    case O.WAN_UNDEAD_TURNING:
        if (hits_you) {
            note_unported('zap.c unturn_you');
            learnit = Boolean(state.gz?.zap_oseen);
        } else {
            let wake = false;

            // unturn_dead() revives carried corpses. Its return value is used
            // (gates wakeup), but the function itself calls revive() and many
            // other unported functions; skip and lose the corpse-revival wake.
            note_unported('zap.c unturn_dead');
            if (is_undead(mtmp.data) || is_vampshifter(mtmp)) {
                wake = true;
                reveal_invis = true;
                /* context.bypasses=True: if resist() happens to be fatal,
                   make_corpse() will set obj->bypass on the new corpse
                   so that mbhito() will skip it instead of reviving it */
                state.context ??= {};
                state.context.bypasses = true;
                resist(mtmp, O.WAND_CLASS, rnd(8), NOTELL, state);
            }
            if (wake) {
                if (mtmp.mhp >= 1) /* !DEADMONSTER */
                    await wakeup(mtmp, false, { state });
                learnit = Boolean(state.gz?.zap_oseen);
            }
        }
        if (learnit)
            discover_object(O.WAN_UNDEAD_TURNING, true, true, true, state);
        break;
    default:
        break;
    }
    if (reveal_invis && mtmp.mhp >= 1 /* !DEADMONSTER */
        && cansee(state.gb.bhitpos.x, state.gb.bhitpos.y, state)
        && !canSpotMonster(mtmp, state))
        map_invisible(state.gb.bhitpos.x, state.gb.bhitpos.y, state);

    return 0;
}

// C ref: muse.c fhito_loc() (1707-1727). Hit all objects at x,y with the
// fhito function. Returns true if any object was affected.
function fhito_loc(obj, tx, ty, fhito, state) {
    if (!fhito || !OBJ_AT(tx, ty, state))
        return false;

    let hitanything = 0;
    const objects = state.level?.objects;
    if (!objects) return false;
    let otmp = objects[tx]?.[ty] ?? null;
    while (otmp) {
        const next_obj = otmp.nexthere;
        if (otmp.where !== OBJ_FLOOR || otmp.ox !== tx || otmp.oy !== ty) {
            otmp = next_obj;
            continue;
        }
        hitanything += fhito(otmp, obj);
        otmp = next_obj;
    }

    return hitanything ? true : false;
}

// C ref: muse.c mbhit() (1734-1814). A modified bhit() for monsters. Traces
// a line from the monster towards its target, calling fhitm on each monster
// (or the hero) hit and fhito_fn on objects at each location. Handles door
// and drawbridge interactions for WAN_STRIKING.
async function mbhit(mon, range, fhitm, fhito_fn, obj, state) {
    const otyp = obj.otyp;

    state.gb ??= {};
    state.gb.bhitpos = { x: mon.mx, y: mon.my };
    const ddx = sgn(mon.mux - mon.mx);
    const ddy = sgn(mon.muy - mon.my);

    while (range-- > 0) {
        state.gb.bhitpos.x += ddx;
        state.gb.bhitpos.y += ddy;
        const x = state.gb.bhitpos.x;
        const y = state.gb.bhitpos.y;

        if (!isok(x, y)) {
            state.gb.bhitpos.x -= ddx;
            state.gb.bhitpos.y -= ddy;
            break;
        }
        if (u_at(state.gb.bhitpos.x, state.gb.bhitpos.y, state)) {
            await fhitm(state.youmonst, obj, state);
            range -= 3;
        } else {
            const mtmp = m_at(state.gb.bhitpos.x, state.gb.bhitpos.y, state);
            if (mtmp) {
                if (cansee(state.gb.bhitpos.x, state.gb.bhitpos.y, state)
                    && !canSpotMonster(mtmp, state))
                    map_invisible(
                        state.gb.bhitpos.x, state.gb.bhitpos.y, state);
                await fhitm(mtmp, obj, state);
                range -= 3;
            }
        }
        if (fhito_loc(obj, state.gb.bhitpos.x, state.gb.bhitpos.y,
                       fhito_fn, state))
            range--;
        const lev = state.level.at(state.gb.bhitpos.x, state.gb.bhitpos.y);
        const ltyp = lev.typ;
        let dbx = x;
        let dby = y;
        if (otyp === O.WAN_STRIKING
            /* if levl[x][y].typ is DRAWBRIDGE_UP then the zap is passing
               over the moat in front of a closed drawbridge and doesn't
               hit any part of the bridge's mechanism */
            && ltyp !== DRAWBRIDGE_UP) {
            // find_drawbridge() and destroy_drawbridge() are unported.
            note_unported('dbridge.c find_drawbridge');
        }
        if (IS_DOOR(ltyp) || ltyp === SDOOR) {
            switch (otyp) {
            /* note: monsters don't use opening or locking magic
               at present, but keep these as placeholders */
            case O.WAN_OPENING:
            case O.WAN_LOCKING:
            case O.WAN_STRIKING:
                // doorlock() is unported.
                note_unported('lock.c doorlock');
                break;
            }
        }
        if (!ZAP_POS(ltyp)
            || (IS_DOOR(ltyp) && (lev.doormask
                                  & (D_LOCKED | D_CLOSED)))) {
            state.gb.bhitpos.x -= ddx;
            state.gb.bhitpos.y -= ddy;
            break;
        }
    }
}

// C ref: muse.c buzz_force_miss() (1815-1823). Wrapper around dobuzz() that
// forces the first shot to miss, used when a monster fires a wand for the
// first time (mwandexp is false).
async function buzz_force_miss(type, nd, sx, sy, dx, dy, state) {
    await dobuzz(type, nd, sx, sy, dx, dy, true, false, true, state);
}

// C ref: muse.c find_offensive() (1420-1594). "Select an offensive
// item/action for a monster. Returns TRUE iff one is found."
//
// Partial: the eight reflection-gated wand/horn arms, MUSE_SCR_EARTH, and
// MUSE_CAMERA refuse because their use_offensive() cases are not ported.
// MUSE_WAN_STRIKING, MUSE_WAN_UNDEAD_TURNING, and MUSE_WAN_TELEPORTATION are
// fully wired and can select. The five MUSE_POT_* arms select as before.
//
// MUSE_SCR_EARTH and MUSE_CAMERA each end in a draw -- !rn2(10) and !rn2(6)
// -- that a refusing port must not spend. Refusing early stops a monster C
// would have let past; it never lets one past that C stops.
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
            // C's nomore() skips for these eight arms: when has_offense holds
            // one of these values the continue skips re-evaluation, but none
            // of these arms can select because they all refuse.
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
        /* nomore(MUSE_WAN_UNDEAD_TURNING) */
        if (has_offense === MUSE_WAN_UNDEAD_TURNING) continue;
        m_use_undead_turning(mtmp, obj, select, rawEnv);
        /* nomore(MUSE_WAN_STRIKING) */
        if (has_offense === MUSE_WAN_STRIKING) continue;
        if (otyp === O.WAN_STRIKING && obj.spe > 0
            && !seenres(M_SEEN_MAGR)) {
            select(MUSE_WAN_STRIKING, obj);
        }
        /* nomore(MUSE_WAN_TELEPORTATION) */
        if (has_offense === MUSE_WAN_TELEPORTATION) continue;
        if (otyp === O.WAN_TELEPORTATION && obj.spe > 0
            /* don't give controlled hero a free teleport */
            && !activeHeroProperty(state, TELEPORT_CONTROL)
            /* same hack as MUSE_WAN_TELEPORTATION_SELF */
            && (!noteleport_level(mtmp, state)
                || !mon_knows_traps(mtmp, TELEP_TRAP))
            /* do try to move hero to a more vulnerable spot */
            && (onscary(u.ux, u.uy, mtmp, state)
                || (hero_behind_chokepoint(mtmp, state)
                    && mon_has_friends(mtmp, state))
                || mon_likes_objpile_at(mtmp, u.ux, u.uy, rawEnv)
                || stairway_at(u.ux, u.uy, state))) {
            select(MUSE_WAN_TELEPORTATION, obj);
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
// a monster.  Must be called immediately after find_offensive()."
// Ported arms: MUSE_WAN_TELEPORTATION, MUSE_WAN_UNDEAD_TURNING,
// MUSE_WAN_STRIKING (via mbhit), and the five MUSE_POT_* throwable potions.
// The eight reflection-gated wand/horn arms, MUSE_SCR_EARTH, and MUSE_CAMERA
// still refuse in find_offensive().
//
// C's entry declares buzzfn and calls precheck(), but "offensive potions are
// not drunk, they're thrown", so the potion case skips precheck() entirely.
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

    // C: buzzfn = mtmp->mwandexp ? buzz : buzz_force_miss;
    // The first wand shot always misses when the monster has never used one.
    // Not wired here because the buzz/horn arms still refuse in find_offensive.
    // When they are ported, set buzzfn from mtmp.mwandexp and use it below.

    /* offensive potions are not drunk, they're thrown */
    if (otmp.oclass !== O.POTION_CLASS) {
        const i = await precheck(mtmp, otmp, state, env);
        if (i !== 0) return i;
    }
    const oseen = canseemon(mtmp, state);

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
    case MUSE_WAN_TELEPORTATION:
    case MUSE_WAN_UNDEAD_TURNING:
    case MUSE_WAN_STRIKING: {
        state.gz ??= {};
        state.gz.zap_oseen = oseen;
        await mzapwand(mtmp, otmp, false, state);
        state.m_using = true;
        state.gb ??= {};
        state.gb.buzzer = mtmp;
        // bhito (zap.c) is unported; pass null so fhito_loc skips objects.
        note_unported('zap.c bhito');
        await mbhit(mtmp, rn1(8, 6), mbhitm, null, otmp, state);
        state.gb.buzzer = 0;
        /* note: 'otmp' might have been destroyed (drawbridge destruction) */
        state.m_using = false;
        if (selection.has_offense === MUSE_WAN_STRIKING)
            mtmp.mwandexp = true;
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

// C ref: muse.c necrophiliac() -- inside #if 0 in the C source (dead code).
// Checks whether an object list contains a corpse (any, or one whose species
// touch-petrifies), recursing into containers.
export function necrophiliac(objlist, any_corpse, state = game) {
    let obj = objlist;
    while (obj) {
        if (obj.otyp === O.CORPSE
            && (any_corpse || touch_petrifies(state.mons[obj.corpsenm])))
            return true;
        if (Has_contents(obj) && necrophiliac(obj.cobj, false, state))
            return true;
        obj = obj.nobj;
    }
    return false;
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

/* C ref: muse.c 2836-2871 ureflects() */
export async function ureflects(fmt, str, state = game) {
    const extrinsic = state.u?.uprops?.[REFLECTING]?.extrinsic ?? 0;
    /* Check from outermost to innermost objects */
    if (extrinsic & W_ARMS) {
        if (fmt && str) {
            await ttyPline(fmt.replace('%s', str).replace('%s', 'shield'), state);
            discover_object(O.SHIELD_OF_REFLECTION, true, true, true, state); /* makeknown */
        }
        return true;
    } else if (extrinsic & W_WEP) {
        /* Due to wielded artifact weapon */
        if (fmt && str) {
            await ttyPline(fmt.replace('%s', str).replace('%s', 'weapon'), state);
        }
        return true;
    } else if (extrinsic & W_AMUL) {
        if (fmt && str) {
            await ttyPline(fmt.replace('%s', str).replace('%s', 'medallion'), state);
            discover_object(O.AMULET_OF_REFLECTION, true, true, true, state); /* makeknown */
        }
        return true;
    } else if (extrinsic & W_ARM) {
        if (fmt && str) {
            await ttyPline(
                fmt.replace('%s', str).replace('%s', state.uskin ? 'luster' : 'armor'),
                state,
            );
        }
        return true;
    } else if (state.youmonst?.data === state.mons?.[M.PM_SILVER_DRAGON]) {
        if (fmt && str) {
            await ttyPline(fmt.replace('%s', str).replace('%s', 'scales'), state);
        }
        return true;
    }
    return false;
}

/* C ref: muse.c munstone() (2884-2902). A stoning monster checks whether it
   can cure itself by eating a lizard corpse, acidic corpse, tin, or quaffing
   acid. Returns TRUE if the monster consumed something. */
export async function munstone(mon, by_you, state = game, env = {}) {
    if (monster_resists_element(mon, STONE_RES, state))
        return false;
    if (mon.meating || helpless(mon))
        return false;
    mon.mstrategy &= ~STRAT_WAITFORU;

    const tinok = mcould_eat_tin(mon, state);
    for (let obj = mon.minvent; obj; obj = obj.nobj) {
        if (cures_stoning(mon, obj, tinok, state)) {
            await mon_consume_unstone(mon, obj, by_you, true, state, env);
            return true;
        }
    }
    return false;
}

/* C ref: muse.c mon_consume_unstone() (2906-2984). A monster eats or quaffs
   an item to stop petrification (stoning=true) or cure stun/confusion
   (stoning=false). */
async function mon_consume_unstone(
    mon, obj, by_you, stoning, state = game, env = {},
) {
    const random = env.random ?? { rnd };
    const vis = canseemon(mon, state);
    const tinned = obj.otyp === O.TIN;
    const food = obj.otyp === O.CORPSE || tinned;
    const acid = obj.otyp === O.POT_ACID
        || (food && acidic(state.mons[obj.corpsenm]));
    const lizard = food && obj.corpsenm === M.PM_LIZARD;
    // dog_nutrition() also sets meating
    const nutrit = food ? dog_nutrition(mon, obj, state) : 0;

    // "is slowing down" message and removal of intrinsic speed
    if (stoning)
        note_unported('worn.c mon_adjust_speed');

    if (vis) {
        const save_quan = obj.quan;
        obj.quan = 1;
        const verb = (obj.oclass === O.POTION_CLASS) ? 'quaffs'
            : (obj.otyp === O.TIN) ? 'opens and eats the contents of'
            : 'eats';
        await pline_mon(mon,
            `${capitalizedMonsterName(mon, state)} ${verb} ${distant_name(obj, donameFresh, state)}.`,
            state);
        obj.quan = save_quan;
    } else if (!Deaf(state)) {
        const heard = youHear(
            `${(obj.oclass === O.POTION_CLASS) ? 'drinking' : 'chewing'}.`,
            state);
        if (heard) await ttyPline(heard, state);
    }

    m_useup(mon, obj, { state });
    /* obj is now gone */

    if (acid && !tinned && !monster_resists_element(mon, ACID_RES, state)) {
        mon.mhp -= random.rnd(15);
        if (vis)
            await pline_mon(mon,
                `${capitalizedMonsterName(mon, state)} has a very bad case of stomach acid.`,
                state);
        if (mon.mhp < 1) { /* DEADMONSTER */
            await pline_mon(mon,
                `${capitalizedMonsterName(mon, state)} dies!`,
                state);
            if (by_you)
                // hero gets credit and blame for the kill but does not
                // break pacifism conduct
                await xkilled(mon, XKILL_NOMSG | XKILL_NOCONDUCT, state, env);
            else
                await mondead(mon, state, env);
            return;
        }
    }
    if (stoning && vis) {
        if (Hallucination(state))
            await ttyPline(
                `What a pity - ${monsterCommonName(mon, state)} just ruined a future piece of art!`,
                state);
        else
            await pline_mon(mon,
                `${capitalizedMonsterName(mon, state)} seems limber!`,
                state);
    }
    if (lizard && (mon.mconf || mon.mstun)) {
        mon.mconf = 0;
        mon.mstun = 0;
        if (vis && !is_bat(mon.data) && mon.data !== state.mons[M.PM_STALKER])
            await pline_mon(mon,
                `${capitalizedMonsterName(mon, state)} seems steadier now.`,
                state);
    }
    if (mon.mtame && !mon.isminion && nutrit > 0) {
        const edog = EDOG(mon);
        if (edog.hungrytime < state.moves)
            edog.hungrytime = state.moves;
        edog.hungrytime += nutrit;
        mon.mconf = 0;
    }
    // use up monster's next move
    mon.movement -= NORMAL_SPEED;
    mon.mlstmv = state.moves;
}

/* C ref: muse.c munslime() (3031-3101). A monster being turned into slime
   checks whether it can cure itself by breathing fire on itself, using an
   item from its inventory, or stepping onto a fire trap. Returns TRUE if
   the monster took action. */
export async function munslime(mon, by_you, state = game, env = {}) {
    const random = env.random ?? { rn1 };
    const mptr = mon.data;

    if (slimeproof(mptr))
        return false;
    if (mon.meating || helpless(mon))
        return false;
    mon.mstrategy &= ~STRAT_WAITFORU;

    /* if monster can breathe fire, do so upon self */
    if (!mon.mcan && !mon.mspec_used
        && attacktype_fordmg(mptr, M.AT_BREA, M.AD_FIRE)) {
        const odummy = { otyp: O.STRANGE_OBJECT };  /* cg.zeroobj */
        return await muse_unslime(mon, odummy, null, by_you, state, env);
    }

    /* same MUSE criteria as use_defensive() */
    if (!is_animal(mptr) && !mindless(mptr)) {
        let t;

        for (let obj = mon.minvent; obj; obj = obj.nobj)
            if (cures_sliming(mon, obj))
                return await muse_unslime(mon, obj, null, by_you, state, env);

        t = t_at(mon.mx, mon.my, state);
        if ((!t || t.ttyp !== FIRE_TRAP)
            && mptr.mmove && !mon.mtrapped) {
            /* collect accessible neighbor cells */
            const xs = [], ys = [];
            for (let x = mon.mx - 1; x <= mon.mx + 1; ++x)
                for (let y = mon.my - 1; y <= mon.my + 1; ++y)
                    if (isok(x, y) && accessible(x, y, state)
                        && !m_at(x, y, state)
                        && (x !== state.u.ux || y !== state.u.uy)) {
                        xs.push(x);
                        ys.push(y);
                    }
            const nxy = xs.length;
            /* partial Fisher-Yates shuffle, stopping at the first fire trap */
            for (let idx = 0; idx < nxy; ++idx) {
                const ridx = random.rn1(nxy - idx, idx);
                if (ridx !== idx) {
                    const tmpx = xs[idx]; xs[idx] = xs[ridx]; xs[ridx] = tmpx;
                    const tmpy = ys[idx]; ys[idx] = ys[ridx]; ys[ridx] = tmpy;
                }
                const found = t_at(xs[idx], ys[idx], state);
                if (found && found.ttyp === FIRE_TRAP) {
                    t = found;
                    break;
                }
            }
        }
        if (t && t.ttyp === FIRE_TRAP)
            return await muse_unslime(mon, hands_obj, t, by_you, state, env);
    } /* MUSE */

    return false;
}

/* C ref: muse.c muse_unslime() (3104-3219). A monster uses an item or trap
   selected by munslime() to burn away incipient slime. */
async function muse_unslime(mon, obj, trap, by_you, state = game, env = {}) {
    const random = env.random ?? { rn1, rn2, d };
    const otyp = obj.otyp;
    let dmg = 0;
    let vis = canseemon(mon, state);
    let res = true;

    if (vis)
        await pline_mon(mon,
            `${capitalizedMonsterName(mon, state)} starts turning ${green_mon(mon, state) ? 'into ooze' : hcolor('green', state)}.`,
            state);
    /* -4 => sliming, causes quiet loss of enhanced speed */
    note_unported('worn.c mon_adjust_speed');

    if (trap) {
        const Mnam = vis ? capitalizedMonsterName(mon, state) : null;

        if (mon.mx === trap.tx && mon.my === trap.ty) {
            if (vis)
                await pline_mon(mon,
                    `${Mnam} triggers ${trap.tseen ? 'the' : 'a'} fire trap!`,
                    state);
        } else {
            remove_monster(mon.mx, mon.my, state);
            newsym(mon.mx, mon.my, state);
            place_monster(mon, trap.tx, trap.ty, state);
            if (mon.wormno) /* won't happen; worms don't MUSE to unslime */
                note_unported('worm.c worm_move');
            newsym(mon.mx, mon.my, state);
            if (vis)
                await pline_mon(mon,
                    `${Mnam} ${vtense('mon', locomotion(mon.data, 'move'))} ${is_floater(mon.data) ? 'over' : 'onto'} ${trap.tseen ? 'the' : 'a'} fire trap!`,
                    state);
        }
        await mintrap(mon, FORCETRAP, { state });
    } else if (otyp === O.STRANGE_OBJECT) {
        /* monster is using fire breath on self */
        if (vis)
            await pline_mon(mon,
                `${monverbself(mon, capitalizedMonsterName(mon, state), 'breath', 'fire on', state)}.`,
                state);
        if (!random.rn2(3))
            mon.mspec_used = random.rn1(10, 5);
        /* -21 => monster's fire breath; 1 => # of damage dice */
        const result = await zhitm(mon, by_you ? 21 : -21, 1, state, random);
        dmg = result.damage;
    } else if (otyp === O.SCR_FIRE) {
        await mreadmsg(mon, obj, state);
        if (mon.mconf) {
            if (cansee(mon.mx, mon.my, state))
                await pline_mon(mon, 'Oh, what a pretty fire!', state);
            if (vis)
                await trycall(obj, state);
            m_useup(mon, obj, { state });
            vis = false;    /* skip makeknown() below */
            res = false;    /* failed to cure sliming */
        } else {
            dmg = Math.trunc((2 * (random.rn1(3, 3) + 2 * bcsign(obj)) + 1) / 3);
            m_useup(mon, obj, { state });
            /* -11 => monster's fireball */
            note_unported('explode.c explode');
            dmg = 0; /* damage has been applied by explode() */
        }
    } else if (otyp === O.POT_OIL) {
        const was_lit = obj.lamplit ? true : false;
        let saw_lit = false;

        if (obj.quan > 1)
            obj = splitobj(obj, 1, { state });
        if (vis && !was_lit) {
            await pline_mon(mon,
                `${capitalizedMonsterName(mon, state)} ignites ${ansimpleoname(obj, state)}.`,
                state);
            saw_lit = true;
        }
        begin_burn(obj, was_lit, { state });
        vis |= canseemon(mon, state); /* burning potion may improve visibility */
        if (vis) {
            if (!Unaware(state))
                observe_object(obj, state); /* hero is watching mon drink obj */
            await pline_mon(mon,
                `${saw_lit ? upstart(mhe(mon)) : capitalizedMonsterName(mon, state)} quaffs a burning ${simpleonames(obj, state)}`,
                state);
            discover_object(O.POT_OIL, true, true, true, state); /* makeknown */
        }
        dmg = random.d(3, 4); /* [**TEMP** (different from hero)] */
        m_useup(mon, obj, { state });
    } else { /* wand/horn of fire w/ positive charge count */
        if (obj.otyp === O.FIRE_HORN)
            await mplayhorn(mon, obj, true, state);
        else
            await mzapwand(mon, obj, true, state);
        /* -1 => monster's wand of fire; 2 => # of damage dice */
        const result = await zhitm(mon, by_you ? 1 : -1, 2, state, random);
        dmg = result.damage;
    }

    if (dmg) {
        /* zhitm() applies damage but doesn't kill creature off */
        if (mon.mhp < 1) { /* DEADMONSTER */
            if (by_you) {
                if (vis)
                    await pline_mon(mon,
                        `${capitalizedMonsterName(mon, state)} is ${nonliving(mon.data) ? 'destroyed' : 'killed'} by the fire!`,
                        state);
                await xkilled(mon, XKILL_NOMSG | XKILL_NOCONDUCT, state, env);
            } else
                await monkilled(mon, 'fire', M.AD_FIRE, state, env);
        } else {
            /* non-fatal damage occurred */
            if (vis)
                await pline_mon(mon,
                    `${capitalizedMonsterName(mon, state)} is burned${exclam(dmg)}`,
                    state);
        }
    }
    if (vis) {
        if (res && mon.mhp >= 1) /* !DEADMONSTER */
            await pline_mon(mon,
                `${s_suffix(capitalizedMonsterName(mon, state))} slime is burned away!`,
                state);
        if (otyp !== O.STRANGE_OBJECT)
            discover_object(otyp, true, true, true, state); /* makeknown */
    }
    /* use up monster's next move */
    mon.movement -= NORMAL_SPEED;
    mon.mlstmv = state.moves;
    return res;
}

/* C ref: muse.c cures_sliming() (3222-3240). Decides whether obj can be used
   by mon to cure green slime. */
export function cures_sliming(mon, obj) {
    /* scroll of fire */
    if (obj.otyp === O.SCR_FIRE)
        return haseyes(mon.data) && mon.mcansee && !nohands(mon.data);

    /* potion of oil; will be set burning if not already */
    if (obj.otyp === O.POT_OIL)
        return !nohands(mon.data);

    /* non-empty wand or horn of fire;
       hero doesn't need hands or even limbs to zap, so mon doesn't either */
    return (obj.otyp === O.WAN_FIRE
            || (obj.otyp === O.FIRE_HORN && can_blow(mon)))
        && obj.spe > 0;
}

/* C ref: muse.c green_mon() (3249-3258). TRUE if the monster appears green
   based on its display color. Returns FALSE under hallucination. */
export function green_mon(mon, state = game) {
    if (Hallucination(state))
        return false;
    return mon.data.mcolor === CLR_GREEN
        || mon.data.mcolor === CLR_BRIGHT_GREEN;
}

/* Hallucination color table for hcolor(), matching do_name.c hcolor()
   (1461-1466). Returns the color name, or a random hallucinated one. */
const hcolors = Object.freeze([
    'ultraviolet', 'infrared', 'bluish-orange', 'reddish-green', 'dark white',
    'light black', 'sky blue-pink', 'pinkish-cyan', 'indigo-chartreuse',
    'salty', 'sweet', 'sour', 'bitter', 'umami',
    'striped', 'spiral', 'swirly', 'plaid', 'checkered', 'argyle', 'paisley',
    'blotchy', 'guernsey-spotted', 'polka-dotted', 'square', 'round',
    'triangular', 'cabernet', 'sangria', 'fuchsia', 'wisteria', 'lemon-lime',
    'strawberry-banana', 'peppermint', 'romantic', 'incandescent',
    'octarine',
    'excitingly dull', 'mauve', 'electric',
    'neon', 'fluorescent', 'phosphorescent', 'translucent', 'opaque',
    'psychedelic', 'iridescent', 'rainbow-colored', 'polychromatic',
    'colorless', 'colorless green',
    'dancing', 'singing', 'loving', 'loudy', 'noisy', 'clattery', 'silent',
    'apocyan', 'infra-pink', 'opalescent', 'violant', 'tuneless',
    'viridian', 'aureolin', 'cinnabar', 'purpurin', 'gamboge', 'madder',
    'bistre', 'ecru', 'fulvous', 'tekhelet', 'selective yellow',
]);

/* C ref: do_name.c hcolor(). Local copy for muse_unslime. */
function hcolor(colorpref, state) {
    return (Hallucination(state) || !colorpref)
        ? hcolors[rn2_on_display_rng(hcolors.length)]
        : colorpref;
}

/* C ref: youprop.h Unaware. Local copy for muse_unslime. */
function Unaware(state) {
    return Math.trunc(state.multi ?? 0) < 0
        && (unconscious(state) || state.u?.uhs === FAINTED);
}
