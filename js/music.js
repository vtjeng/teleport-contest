// music.c — instrument improvisation, tunes, and waking monsters.
// Hero_playnotes/Soundeffect are empty macros in the reference tty build
// (sndprocs.h:273); their arguments, including obj_to_instr, are not evaluated.
import {
    ACH_TUNE, A_DEX, A_WIS, ALTAR, AM_MASK, AM_SANCTUM, Amask2align,
    ARTICLE_THE,
    BLINDED, COLNO, CONFUSION, D_NODOOR, DEAF, DOOR,
    DRAWBRIDGE_DOWN, ECMD_OK, ECMD_TIME, FOUNTAIN, FUMBLING, GRAVE,
    HALF_PHDAM, HALLUC, HALLUC_RES, IS_DRAWBRIDGE,
    CORR, M_AP_MONSTER, M_AP_NOTHING, M_AP_TYPE, NO_KILLER_PREFIX,
    PIT, ROWNO, ROOM, SCORR, SDOOR, SHOPBASE, SINK, STRAT_WAITMASK,
    SUPPRESS_SADDLE, STUNNED, THRONE, TT_BURIEDBALL, TT_PIT,
    UNCHANGING, has_mgivenname, is_pit, plur, u_at,
} from './const.js';
import { isok } from './cmd_isok.js';
import { acurr, exercise } from './attrib.js';
import { getdir, yn_function } from './cmd.js';
import { find_drawbridge, is_drawbridge_wall } from './dbridge.js';
import { cvt_sdoor_to_door } from './detect.js';
import { newsym } from './display.js';
import { fillholetyp } from './dig.js';
import { game } from './gstate.js';
import { losehp } from './hack.js';
import { dist2, highc, mungspaces } from './hacklib.js';
import { align_str, record_achievement } from './insight.js';
import { consume_obj_charge, obj_extract_self, sobj_at } from './invent.js';
import {
    can_blow, ceiling_hider, humanoid, is_clinger, is_flyer,
    is_mercenary, mindless, unique_corpstat,
} from './mondata.js';
import { monflee, monfleeMessage, onscary, youHear } from './monmove.js';
import { Amonnam, a_monnam, Monnam, mon_nam, x_monnam } from './do_name.js';
import { tamedog } from './dog.js';
import { m_at } from './monst.js';
import { seemimic, wakeup } from './mon.js';
import { discover_object } from './o_init.js';
import { an, the, thesimpleoname, Tobjnam, xnameFresh, yname, Yname2 } from './objnam.js';
import {
    BOULDER, BUGLE, DRUM_OF_EARTHQUAKE, FIRE_HORN, FROST_HORN, LEATHER_DRUM,
    MAGIC_FLUTE, MAGIC_HARP, TOOL_CLASS, TOOLED_HORN, WOODEN_FLUTE,
    WOODEN_HARP,
} from './objects.js';
import { PM_ARCHEOLOGIST, PM_GUARD, S_NYMPH, S_SNAKE } from './monsters.js';
import { incr_itimeout } from './potion.js';
import { create_gas_cloud } from './region.js';
import { d, rn1, rn2, rne, rnl, rnd, rnz } from './rng.js';
import { altarmask_at } from './pray.js';
import { in_rooms } from './rooms.js';
import { set_levltyp } from './terrain.js';
import {
    Flying, Levitation, maketrap, reset_utrap, set_utrap,
    t_at,
} from './trap.js';
import { sleep_monst, slept_monst } from './mhitm.js';
import { ttyNorep, ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';
import { block_point, cansee, does_block, recalc_block_point, unblock_point } from './vision.js';
import { getlin } from './windows.js';
import { flash_str, resist, ubuzz, zapyourself } from './zap.js';
import { canseemon } from './display.js';

const musicRandom = { d, rn1, rn2, rne, rnl, rnd, rnz };
function property(state, index) {
    const p = state.u.uprops[index];
    return Boolean(p?.intrinsic || p?.extrinsic);
}
function Deaf(state) { return property(state, DEAF) || state.u.uroleplay?.deaf; }
function Hallucination(state) {
    return Boolean(state.u.uprops[HALLUC]?.intrinsic) && !property(state, HALLUC_RES);
}

// C ref: music.c awaken_scare() (45-60). The waiting arm excludes scare
// checks, including their resistance draw, even when the sound is scary.
export async function awaken_scare(mon, scary, state = game, env = {}) {
    const random = env.random ?? musicRandom;
    mon.msleeping = 0;
    mon.mcanmove = 1;
    mon.mfrozen = 0;
    if (!unique_corpstat(mon.data) && (mon.mstrategy & STRAT_WAITMASK)) {
        mon.mstrategy &= ~STRAT_WAITMASK;
    } else if (scary && !mindless(mon.data)
        && !await resist(mon, TOOL_CLASS, 0, false, state, random)
        && onscary(0, 0, mon, state)) {
        await monflee(mon, 0, false, true, {
            ...env, state, random,
            canSeeMonster: env.canSeeMonster ?? (subject => canseemon(subject, state)),
            fleeMessage: env.fleeMessage ?? monfleeMessage,
            createGasCloud: env.createGasCloud ?? ((x, y, size, damage, effectEnv) =>
                create_gas_cloud(x, y, size, damage, {
                    ...effectEnv,
                    blockPoint: (cx, cy) => block_point(cx, cy, state),
                    unblockPoint: (cx, cy) => unblock_point(cx, cy, state),
                    doesBlock: (cx, cy, location) => does_block(cx, cy, location, state),
                    canSee: (cx, cy) => cansee(cx, cy, state),
                    newsym: (cx, cy) => newsym(cx, cy, state),
                    message: env.message ?? ttyPline,
                })),
        });
    }
}

// C ref: music.c awaken_monsters() (67-78). Distances are squared and the
// scare subrange uses C integer division, not a floating-point threshold.
export async function awaken_monsters(distance, state = game, env = {}) {
    for (let mon = state.level.monlist; mon; mon = mon.nmon) {
        if (mon.mhp < 1) continue;
        const dist = dist2(mon.mx, mon.my, state.u.ux, state.u.uy);
        if (dist < distance)
            await awaken_scare(mon, dist < Math.trunc(distance / 3), state, env);
    }
}

// C ref: music.c awaken_soldiers() (162-198). Mercenaries (except guards)
// are awakened across the level; other monsters use the bugler's C-squared
// distance and the existing awaken_scare() source behavior.
export async function awaken_soldiers(bugler, state = game, env = {}) {
    const distance = (bugler === state.youmonst
        ? state.u.ulevel
        : bugler.data.mlevel) * 30;
    const message = env.message ?? ttyPline;
    const norep = env.norep ?? ttyNorep;
    const canSeeMonster = env.canSeeMonster
        ?? (monster => canseemon(monster, state));

    for (let mon = state.level.monlist; mon; mon = mon.nmon) {
        if (mon.mhp < 1) continue;
        if (is_mercenary(mon.data) && mon.data.pmidx !== PM_GUARD) {
            if (!mon.mtame) mon.mpeaceful = false;
            mon.msleeping = 0;
            mon.mfrozen = 0;
            mon.mcanmove = 1;
            mon.mstrategy &= ~STRAT_WAITMASK;
            if (canSeeMonster(mon)) {
                await message(`${Monnam(mon, state)} is now ready for battle!`, state);
            } else if (!Deaf(state)) {
                await norep('You hear the rattle of battle gear being readied.', state);
            }
        } else {
            const distm = bugler === state.youmonst
                ? dist2(mon.mx, mon.my, state.u.ux, state.u.uy)
                : dist2(bugler.mx, bugler.my, mon.mx, mon.my);
            if (distm < distance)
                await awaken_scare(mon, distm < Math.trunc(distance / 3), state, env);
        }
    }
}

// C ref: music.c charm_monsters() (194-217). Save nmon before taming because
// tamedog() may change the live monster chain; C discards its return.
export async function charm_monsters(distance, state = game, env = {}) {
    const random = env.random ?? musicRandom;
    if (state.u.uswallow) distance = 0;

    for (let mon = state.level.monlist; mon;) {
        const next = mon.nmon;
        if (mon.mhp >= 1
            && dist2(mon.mx, mon.my, state.u.ux, state.u.uy) <= distance
            && (!await resist(mon, TOOL_CLASS, 0, false, state, random, env)
                || mon.isshk)) {
            await tamedog(mon, null, true, { ...env, state, random });
        }
        mon = next;
    }
}

// C ref: music.c put_monsters_to_sleep() (85-104). The source traverses the
// live fmon chain, draws damage only after the strict range test, and uses
// sleep_monst()'s boolean before setting the separate msleeping flag.
export async function put_monsters_to_sleep(distance, state = game, env = {}) {
    const random = env.random ?? musicRandom;
    for (let mon = state.level.monlist; mon; mon = mon.nmon) {
        if (mon.mhp < 1) continue;
        if (dist2(mon.mx, mon.my, state.u.ux, state.u.uy) < distance
            && await sleep_monst(mon, random.d(10, 10), TOOL_CLASS, {
                ...env,
                state,
                random,
            })) {
            mon.msleeping = true;
            await slept_monst(mon, { ...env, state });
        }
    }
}

// C ref: music.c charm_snakes() (105-132). C's mdistu is the squared
// distance from the hero, and the visible message follows state changes,
// mundetected clearing, and the map redraw in that order.
export async function charm_snakes(distance, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const canSeeMonster = env.canSeeMonster
        ?? (mon => canseemon(mon, state));
    const redraw = env.newsym ?? newsym;

    for (let mon = state.level.monlist; mon; mon = mon.nmon) {
        if (mon.mhp < 1) continue;
        if (mon.data.mlet === S_SNAKE && mon.mcanmove
            && dist2(mon.mx, mon.my, state.u.ux, state.u.uy) < distance) {
            const wasPeaceful = mon.mpeaceful;
            mon.mpeaceful = true;
            mon.mavenge = false;
            mon.mstrategy &= ~STRAT_WAITMASK;
            const couldSeeMonster = canSeeMonster(mon);
            mon.mundetected = false;
            redraw(mon.mx, mon.my, state);
            if (canSeeMonster(mon)) {
                if (!couldSeeMonster) {
                    await message(
                        `You notice ${a_monnam(mon, { state })}, swaying with the music.`,
                        state,
                    );
                } else {
                    await message(
                        `${Monnam(mon, state)} freezes, then sways with the music${wasPeaceful ? '' : ', and now seems quieter'}.`,
                        state,
                    );
                }
            }
        }
    }
}

// C ref: music.c calm_nymphs() (139-158). It shares the strict squared range
// and monster-list filters with charm_snakes, but does not redraw the map.
export async function calm_nymphs(distance, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const canSeeMonster = env.canSeeMonster
        ?? (mon => canseemon(mon, state));

    for (let mon = state.level.monlist; mon; mon = mon.nmon) {
        if (mon.mhp < 1) continue;
        if (mon.data.mlet === S_NYMPH && mon.mcanmove
            && dist2(mon.mx, mon.my, state.u.ux, state.u.uy) < distance) {
            mon.msleeping = 0;
            mon.mpeaceful = true;
            mon.mavenge = false;
            mon.mstrategy &= ~STRAT_WAITMASK;
            if (canSeeMonster(mon)) {
                await message(
                    `${Monnam(mon, state)} listens cheerfully to the music, then seems quieter.`,
                    state,
                );
            }
        }
    }
}

// C refs: hack.h Maybe_Half_Phys() and youprop.h Half_physical_damage.
export function musicMaybeHalfPhys(damage, state) {
    return property(state, HALF_PHDAM)
        ? Math.trunc((damage + 1) / 2) : damage;
}

// C ref: music.c do_pit() (221-338). This file owns the earthquake pit call
// path; its discarded floor/liquid/touch/kill effects remain named gaps at
// their C call sites until those source units are ported.
export async function do_pit(x, y, tuPit, state = game, rawEnv = {}) {
    const env = { ...rawEnv, state };
    const random = env.random ?? musicRandom;
    const message = env.message ?? ttyPline;

    const chasm = await maketrap(x, y, PIT, { ...env, random });
    if (!chasm) return; // C maketrap() refuses a portal at this location.
    chasm.tseen = 1;

    const mtmp = m_at(x, y, state);
    const boulder = sobj_at(BOULDER, x, y, state);
    if (boulder) {
        if (cansee(x, y, state)) {
            await message(`KADOOM!  The boulder falls into a chasm${u_at(x, y, state)
                ? ' below you' : ''}!`, state);
        }
        if (mtmp) mtmp.mtrapped = false;
        obj_extract_self(boulder, { ...env, state });
        // C discards flooreffects()'s return. The partial helper cannot stand
        // in for its missing branch effects or RNG.
        note_unported('do.c flooreffects');
        return;
    }

    // Keep the source order: fill the hole, change its terrain, skip the
    // discarded liquid-flow result, then re-read the possibly deleted trap.
    const fillType = fillholetyp(x, y, false, state, random);
    if (fillType !== ROOM) {
        set_levltyp(x, y, fillType, { state });
        note_unported('dig.c liquid_flow');
        if (!t_at(x, y, state)) return;
    }

    if (mtmp) {
        if (!is_flyer(mtmp.data) && !is_clinger(mtmp.data)) {
            const alreadyTrapped = Boolean(mtmp.mtrapped);
            mtmp.mtrapped = true;
            if (!alreadyTrapped) {
                if (cansee(x, y, state)) {
                    await message(`${Monnam(mtmp, state, env)} falls into a chasm!`, state);
                } else if (humanoid(mtmp.data)) {
                    // Soundeffect(se_scream, 50) is compiled away by the
                    // reference tty backend; You_hear still owns the line.
                    const heard = youHear('a scream!', state);
                    if (heard) await message(heard, state);
                }
            }
            note_unported('trap.c mselftouch'); // C's void call; keep its point.
            if (mtmp.mhp >= 1) {
                mtmp.mhp -= random.rnd(alreadyTrapped ? 4 : 6);
                if (mtmp.mhp < 1) {
                    if (!cansee(x, y, state)) {
                        await message('It is destroyed!', state);
                    } else {
                        const name = mtmp.mtame
                            ? x_monnam(mtmp, ARTICLE_THE, 'poor',
                                has_mgivenname(mtmp) ? SUPPRESS_SADDLE : 0,
                                false, state, env)
                            : mon_nam(mtmp, state, env);
                        await message(`You destroy ${name}!`, state);
                    }
                    note_unported('mon.c xkilled');
                }
            }
        }
    } else if (u_at(x, y, state)) {
        const u = state.u;
        if (u.utrap && u.utraptype === TT_BURIEDBALL) {
            await message('Your chain breaks!', state);
            await reset_utrap(true, state);
        }
        if (Levitation(state) || Flying(state) || is_clinger(state.youmonst.data)) {
            if (!tuPit) {
                await message('A chasm opens up under you!', state);
                await message("You don't fall in!", state);
            }
        } else if (!tuPit || !u.utrap || u.utraptype !== TT_PIT) {
            await message('You fall into a chasm!', state);
            set_utrap(random.rn1(6, 2), TT_PIT, state);
            await losehp(musicMaybeHalfPhys(random.rnd(6), state),
                'fell into a chasm', NO_KILLER_PREFIX, state, env);
            note_unported('trap.c selftouch');
        } else if (u.utrap && u.utraptype === TT_PIT) {
            const fumbling = property(state, FUMBLING);
            const keepFooting = (!fumbling || !random.rn2(5))
                && (!random.rnl(state.urole?.mnum === PM_ARCHEOLOGIST ? 3 : 9)
                    || (acurr(state, A_DEX) > 7 && random.rn2(5)));

            await message('You are jostled around violently!', state);
            set_utrap(random.rn1(6, 2), TT_PIT, state);
            await losehp(musicMaybeHalfPhys(random.rnd(keepFooting ? 2 : 4), state),
                'hurt in a chasm', NO_KILLER_PREFIX, state, env);
            if (keepFooting) {
                await exercise(A_DEX, true, state, random);
            } else {
                // C chooses the selftouch prefix from Upolyd/slithy/nolimbs
                // here; those predicates have no effects and its callee is
                // still a discarded source gap.
                note_unported('trap.c selftouch');
            }
        }
    } else {
        newsym(x, y, state);
    }
}

// C ref: music.c do_earthquake() (344-475). Coordinates scan x-major then
// y-minor; every cell wakes/unhides its monster before the independent
// rn2(14-force) terrain test.
export async function do_earthquake(force, state = game, rawEnv = {}) {
    const env = { ...rawEnv, state };
    const random = env.random ?? musicRandom;
    const message = env.message ?? ttyPline;
    const trapAtU = t_at(state.u.ux, state.u.uy, state);
    const tuPit = trapAtU ? Number(is_pit(trapAtU.ttyp)) : 0;
    force = Math.trunc(force);
    if (force > 13) force = 13;

    const startX = Math.max(state.u.ux - force * 2, 1);
    const startY = Math.max(state.u.uy - force * 2, 0);
    const endX = Math.min(state.u.ux + force * 2, COLNO - 1);
    const endY = Math.min(state.u.uy + force * 2, ROWNO - 1);
    for (let x = startX; x <= endX; x++) {
        for (let y = startY; y <= endY; y++) {
            const mtmp = m_at(x, y, state);
            if (mtmp) {
                await wakeup(mtmp, true, { ...env, random });
                if (mtmp.mundetected) {
                    mtmp.mundetected = false;
                    newsym(x, y, state);
                    if (ceiling_hider(mtmp.data)) {
                        if (cansee(x, y, state)) {
                            await message(`${Amonnam(mtmp, { ...env, state })} is shaken loose from the ceiling!`, state);
                        } else if (!is_flyer(mtmp.data)) {
                            // Soundeffect(se_thump, 50) is a tty no-op.
                            const heard = youHear('a thump.', state);
                            if (heard) await message(heard, state);
                        }
                    }
                }
                const appearance = M_AP_TYPE(mtmp);
                if (appearance !== M_AP_NOTHING && appearance !== M_AP_MONSTER) {
                    seemimic(mtmp, state, {
                        ...env,
                        newsym: (mx, my) => newsym(mx, my, state),
                        unblockPoint: (mx, my) => unblock_point(mx, my, state),
                    });
                }
            }

            if (random.rn2(14 - force)) continue;

            const location = state.level.at(x, y);
            switch (location.typ) {
            case FOUNTAIN:
                if (cansee(x, y, state))
                    await message(`The fountain falls into a chasm.`, state);
                await do_pit(x, y, tuPit, state, { ...env, random, message });
                break;
            case SINK:
                if (cansee(x, y, state))
                    await message(`The kitchen sink falls into a chasm.`, state);
                await do_pit(x, y, tuPit, state, { ...env, random, message });
                break;
            case ALTAR: {
                const altarMask = altarmask_at(x, y, state);
                if (altarMask & AM_SANCTUM) break;
                const alignment = Amask2align(altarMask & AM_MASK);
                if (cansee(x, y, state)) {
                    await message(`The ${align_str(alignment)} altar falls into a chasm.`, state);
                }
                note_unported('pray.c desecrate_altar');
                await do_pit(x, y, tuPit, state, { ...env, random, message });
                break;
            }
            case GRAVE:
                if (cansee(x, y, state))
                    await message('The headstone topples into a chasm.', state);
                await do_pit(x, y, tuPit, state, { ...env, random, message });
                break;
            case THRONE:
                if (cansee(x, y, state))
                    await message('The throne falls into a chasm.', state);
                await do_pit(x, y, tuPit, state, { ...env, random, message });
                break;
            case SCORR:
                location.typ = CORR;
                unblock_point(x, y, state);
                if (cansee(x, y, state)) await message('A secret corridor is revealed.', state);
                // FALLTHROUGH: newly revealed SCORR is processed as CORR.
            case CORR:
            case ROOM:
                await do_pit(x, y, tuPit, state, { ...env, random, message });
                break;
            case SDOOR:
                cvt_sdoor_to_door(location, state);
                if (cansee(x, y, state)) await message('A secret door is revealed.', state);
                // FALLTHROUGH: newly revealed SDOOR is processed as DOOR.
            case DOOR:
                if (location.doormask === D_NODOOR) {
                    await do_pit(x, y, tuPit, state, { ...env, random, message });
                    break;
                }
                location.doormask = D_NODOOR;
                recalc_block_point(x, y, state);
                newsym(x, y, state);
                if (cansee(x, y, state)) await message('The door collapses.', state);
                if (in_rooms(x, y, SHOPBASE, state).length)
                    note_unported('shk.c add_damage');
                break;
            default:
                break;
            }
        }
    }
}

// C ref: music.c generic_lvl_desc() (478-492), using dungeon.h's exact
// level comparisons. Supplying state keeps the pure predicate testable.
export function generic_lvl_desc(state = game) {
    const uz = state.u.uz;
    const sameLevel = level => level && (level.dnum || level.dlevel)
        && uz.dnum === level.dnum && uz.dlevel === level.dlevel;
    if (sameLevel(state.astral_level)) return 'astral plane';
    if (uz.dnum === state.astral_level?.dnum) return 'plane';
    if (sameLevel(state.sanctum_level)) return 'sanctum';
    if (uz.dnum === state.sokoban_dnum) return 'puzzle';
    if (uz.dnum === state.tower_dnum) return 'tower';
    return 'dungeon';
}

// music.c beats[] (493-496): the eight mundane earthquake-drum riffs.
const beats = ['stepper', 'one drop', 'slow two', 'triple stroke roll',
    'double shuffle', 'half-time shuffle', 'second line', 'train'];

// C ref: music.c improvised_notes() (733-753). context.jingle is C's
// svc.context.jingle, saved/restored with the existing context object.
// Return the string and C's boolean out-parameter together.
export function improvised_notes(state = game, random = musicRandom) {
    state.context ??= {};
    if (!(property(state, UNCHANGING) && state.context.jingle)) {
        const count = random.rnd(5); // C char jingle[6], excluding its NUL.
        let notes = '';
        for (let i = 0; i < count; i++) notes += 'ABCDEFG'[random.rn2(7)];
        state.context.jingle = notes;
        return { notes, same: false };
    }
    return { notes: state.context.jingle, same: true };
}

// C ref: music.c do_improvisation() (503-730), every instrument arm.
export async function do_improvisation(instr, state = game, env = {}) {
    const random = env.random ?? musicRandom;
    const message = env.message ?? ttyPline;
    const stunned = Boolean(state.u.uprops[STUNNED]?.intrinsic);
    const confused = Boolean(state.u.uprops[CONFUSION]?.intrinsic);
    let special = !(stunned || confused);
    const itmp = { ...instr, oextra: null };
    let mundane = false;
    if (!special || instr.spe <= 0) {
        while (state.objects[itmp.otyp].oc_magic) {
            itmp.otyp--;
            mundane = true;
        }
    }
    let mode = (stunned ? 1 : 0) | (confused ? 2 : 0) | (Hallucination(state) ? 4 : 0);
    if (!random.rn2(2)) {
        if (mode === 3) mode = !random.rn2(2) ? 1 : 2;
        if (mode & 4) mode = 4;
    }
    switch (mode) {
    case 0: await message(`You start playing ${yname(instr, state)}.`, state); break;
    case 1: await message(!Deaf(state) ? 'You radiate an obnoxious droning sound.'
        : 'You feel a monotonous vibration.', state); break;
    case 2: await message(!Deaf(state) ? 'You generate a raucous noise.'
        : 'You feel a jarring vibration.', state); break;
    case 4: await message('You disseminate a kaleidoscopic display of floating butterflies.', state); break;
    default: await message('What you perform is quite far from music...', state); break;
    }
    const { same } = improvised_notes(state, random);
    switch (itmp.otyp) {
    case MAGIC_FLUTE:
        consume_obj_charge(instr, true, { state });
        await message(`You ${!Deaf(state) ? '' : 'seem to '}produce ${Hallucination(state) ? 'piped' : 'soft'}${same ? ', familiar' : ''} music.`, state);
        await put_monsters_to_sleep(state.u.ulevel * 5, state, {
            ...env,
            message,
            random,
        });
        await exercise(A_DEX, true, state, random);
        break;
    case WOODEN_FLUTE:
        special &= random.rn2(acurr(state, A_DEX)) + state.u.ulevel > 25;
        await message(!Deaf(state)
            ? `${Tobjnam(instr, special ? 'trill' : 'toot', state)}${same ? ' a familiar tune' : ''}.`
            : `You feel ${yname(instr, state)} ${special ? 'trill' : 'toot'}.`, state);
        if (special)
            await charm_snakes(state.u.ulevel * 3, state, { ...env, message, random });
        await exercise(A_DEX, true, state, random);
        break;
    case FIRE_HORN:
    case FROST_HORN: {
        consume_obj_charge(instr, true, { state });
        if (!await getdir(null, state)) {
            await message(`${Tobjnam(instr, 'vibrate', state)}.`, state);
            break;
        } else if (!state.u.dx && !state.u.dy && !state.u.dz) {
            const damage = await zapyourself(instr, true, state);
            if (damage) await losehp(damage,
                `using a magical horn on ${state.flags.female ? 'her' : 'him'}self`, KILLED_BY, state);
        } else {
            // BZ_OFS_AD(AD_COLD/AD_FIRE) = adtyp-1; BZ_U_WAND leaves it unchanged.
            const type = instr.otyp === FROST_HORN ? 2 : 1;
            const blinded = state.u.uprops[BLINDED];
            if (!((blinded?.intrinsic || blinded?.extrinsic) && !blinded?.blocked))
                await message(`A ${flash_str(type, false, state)} blasts out of the horn!`, state);
            // gc.current_wand already lives at state.current_wand in zap.js.
            state.current_wand = instr;
            await ubuzz(type, random.rn1(6, 6), state, random);
            state.current_wand = null;
        }
        discover_object(instr.otyp, true, true, true, state);
        break;
    }
    case TOOLED_HORN:
        await message(!Deaf(state)
            ? `You produce a frightful, grave${same ? ', yet familiar,' : ''} sound.`
            : 'You blow into the horn.', state);
        await awaken_monsters(state.u.ulevel * 30, state, env);
        await exercise(A_WIS, false, state, random);
        break;
    case BUGLE:
        await message(!Deaf(state)
            ? `You extract a loud${same ? ', familiar' : ''} noise from ${yname(instr, state)}.`
            : 'You blow into the bugle.', state);
        await awaken_soldiers(state.youmonst, state, { ...env, message, random });
        await exercise(A_WIS, false, state, random);
        break;
    case MAGIC_HARP:
        consume_obj_charge(instr, true, { state });
        await message(!Deaf(state)
            ? `${Tobjnam(instr, 'produce', state)} very attractive${same ? ' and familiar' : ''} music.`
            : 'You feel very soothing vibrations.', state);
        await charm_monsters(Math.trunc((state.u.ulevel - 1) / 3) + 1, state, {
            ...env, message, random,
        });
        await exercise(A_DEX, true, state, random);
        break;
    case WOODEN_HARP:
        special &= random.rn2(acurr(state, A_DEX)) + state.u.ulevel > 25;
        await message(!Deaf(state)
            ? `${Yname2(instr, state)} ${special ? (same ? 'produces a familiar, lilting melody' : 'produces a lilting melody')
                : (same ? 'twangs a familiar tune' : 'twangs')}.`
            : 'You feel soothing vibrations.', state);
        if (special)
            await calm_nymphs(state.u.ulevel * 3, state, { ...env, message, random });
        await exercise(A_DEX, true, state, random);
        break;
    case DRUM_OF_EARTHQUAKE:
        consume_obj_charge(instr, true, { state });
        await message('You produce a heavy, thunderous rolling!', state);
        await message(`The entire ${generic_lvl_desc(state)} is shaking around you!`, state);
        await do_earthquake(Math.trunc((state.u.ulevel - 1) / 3) + 1,
            state, { ...env, message, random });
        await awaken_monsters(ROWNO * COLNO, state, env);
        discover_object(DRUM_OF_EARTHQUAKE, true, true, true, state);
        break;
    case LEATHER_DRUM:
        if (!mundane) {
            if (!Deaf(state)) {
                await message(`You beat a ${same ? 'familiar ' : ''}deafening row!`, state);
                incr_itimeout(state.u.uprops[DEAF], random.rn1(20, 30));
            } else {
                await message('You pound on the drum.', state);
            }
            await exercise(A_WIS, false, state, random);
        } else {
            const verb = random.rn2(2) ? 'butcher' : random.rn2(2) ? 'manage' : 'pull off';
            await message(`You ${verb} ${an(beats[random.rn2(beats.length)])}.`, state);
        }
        await awaken_monsters(state.u.ulevel * (mundane ? 5 : 40), state, env);
        state.disp.botl = true;
        break;
    default:
        note_unported('pline.c impossible');
        return 0;
    }
    return 2;
}

// C ref: music.c do_play_instrument() (759-899). The drawbridge search
// preserves both loop-coordinate updates made by find_drawbridge().
export async function do_play_instrument(instr, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? musicRandom;
    const ynq = async query => String.fromCharCode(
        await yn_function(query, 'ynq', 'q', true, state));
    let c = 'y';
    if (state.u.uinwater) {
        await message("You can't play music underwater!", state);
        return ECMD_OK;
    } else if ([WOODEN_FLUTE, MAGIC_FLUTE, TOOLED_HORN, FROST_HORN, FIRE_HORN, BUGLE]
        .includes(instr.otyp) && !can_blow(state.youmonst, state)) {
        await message(`You are incapable of playing ${thesimpleoname(instr, state)}.`, state);
        return ECMD_OK;
    }
    if (instr.otyp !== LEATHER_DRUM && instr.otyp !== DRUM_OF_EARTHQUAKE
        && !(state.u.uprops[STUNNED]?.intrinsic || state.u.uprops[CONFUSION]?.intrinsic
            || Hallucination(state))) c = await ynq('Improvise?');
    if (c === 'q') {
        await message('Never mind.', state);
        return ECMD_OK;
    }
    if (c !== 'n') return await do_improvisation(instr, state, env) ? ECMD_TIME : ECMD_OK;
    if (state.u.uevent.uheard_tune === 2) c = await ynq('Play the passtune?');
    if (c === 'q') {
        await message('Never mind.', state);
        return ECMD_OK;
    }
    let tune;
    if (c === 'y') tune = state.tune;
    else {
        tune = mungspaces(await getlin('What tune are you playing? [5 notes, A-G]', state));
        if (tune.startsWith('\x1b')) {
            await message('Never mind.', state);
            return ECMD_OK;
        }
        tune = [...tune].map(highc).join('').replaceAll('H', 'B');
    }
    await message(!Deaf(state)
        ? `You extract a strange sound from ${the(xnameFresh(instr, state))}!`
        : `You can feel ${the(xnameFresh(instr, state))} emitting vibrations.`, state);
    if (state.stronghold_level?.dnum === state.u.uz.dnum
        && state.stronghold_level.dlevel === state.u.uz.dlevel) {
        await exercise(A_WIS, true, state, random);
        if (tune === state.tune) {
            for (let y = state.u.uy - 1; y <= state.u.uy + 1; y++) {
                for (let x = state.u.ux - 1; x <= state.u.ux + 1; x++) {
                    if (!isok(x, y)) continue;
                    const position = { x, y };
                    const found = find_drawbridge(position, state);
                    ({ x, y } = position);
                    if (found) {
                        state.u.uevent.uheard_tune = 2;
                        record_achievement(ACH_TUNE, state);
                        note_unported(state.level.at(x, y).typ === DRAWBRIDGE_DOWN
                            ? 'dbridge.c close_drawbridge' : 'dbridge.c open_drawbridge');
                        return ECMD_TIME;
                    }
                }
            }
        } else if (!Deaf(state)) {
            if (state.u.uevent.uheard_tune < 1) state.u.uevent.uheard_tune = 1;
            let nearby = false;
            for (let y = state.u.uy - 1; y <= state.u.uy + 1 && !nearby; y++) {
                for (let x = state.u.ux - 1; x <= state.u.ux + 1 && !nearby; x++) {
                    if (isok(x, y) && (IS_DRAWBRIDGE(state.level.at(x, y).typ)
                        || is_drawbridge_wall(x, y, state) >= 0)) nearby = true;
                }
            }
            if (nearby) {
                let tumblers = 0, gears = 0;
                const matched = Array(5).fill(false);
                for (let x = 0; x < tune.length; x++) {
                    if (x >= 5) continue;
                    if (tune[x] === state.tune[x]) {
                        gears++;
                        matched[x] = true;
                    } else {
                        for (let y = 0; y < 5; y++) {
                            if (!matched[y] && tune[x] === state.tune[y]
                                && tune[y] !== state.tune[y]) {
                                tumblers++;
                                matched[y] = true;
                                break;
                            }
                        }
                    }
                }
                if (tumblers) {
                    const heard = youHear(gears
                        ? `${tumblers} tumbler${plur(tumblers)} click and ${gears} gear${plur(gears)} turn.`
                        : `${tumblers} tumbler${plur(tumblers)} click.`, state);
                    if (heard) await message(heard, state);
                } else if (gears) {
                    const heard = youHear(`${gears} gear${plur(gears)} turn.`, state);
                    if (heard) await message(heard, state);
                    if (gears === 5) {
                        state.u.uevent.uheard_tune = 2;
                        record_achievement(ACH_TUNE, state);
                    }
                }
            }
        }
    }
    return ECMD_TIME;
}
