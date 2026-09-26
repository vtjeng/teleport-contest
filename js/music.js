// music.c — instrument improvisation, tunes, and waking monsters.
// Hero_playnotes/Soundeffect are empty macros in the reference tty build
// (sndprocs.h:273); their arguments, including obj_to_instr, are not evaluated.
import {
    ACH_TUNE, A_DEX, A_WIS, BLINDED, COLNO, CONFUSION, DEAF, DRAWBRIDGE_DOWN,
    ECMD_OK, ECMD_TIME, HALLUC, HALLUC_RES, IS_DRAWBRIDGE, KILLED_BY,
    ROWNO, STRAT_WAITMASK, STUNNED, UNCHANGING, isok, plur,
} from './const.js';
import { acurr, exercise } from './attrib.js';
import { getdir, yn_function } from './cmd.js';
import { find_drawbridge, is_drawbridge_wall } from './dbridge.js';
import { newsym } from './display.js';
import { game } from './gstate.js';
import { losehp } from './hack.js';
import { dist2, highc, mungspaces } from './hacklib.js';
import { record_achievement } from './insight.js';
import { consume_obj_charge } from './invent.js';
import { mindless, unique_corpstat } from './mondata.js';
import { monflee, monfleeMessage, onscary, youHear } from './monmove.js';
import { can_blow } from './muse.js';
import { discover_object } from './o_init.js';
import { an, the, thesimpleoname, Tobjnam, xnameFresh, yname, Yname2 } from './objnam.js';
import {
    BUGLE, DRUM_OF_EARTHQUAKE, FIRE_HORN, FROST_HORN, LEATHER_DRUM,
    MAGIC_FLUTE, MAGIC_HARP, TOOL_CLASS, TOOLED_HORN, WOODEN_FLUTE, WOODEN_HARP,
} from './objects.js';
import { incr_itimeout } from './potion.js';
import { create_gas_cloud } from './region.js';
import { d, rn1, rn2, rne, rnl, rnd, rnz } from './rng.js';
import { sleep_monst, slept_monst } from './mhitm.js';
import { ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';
import { block_point, cansee, canseemon, does_block, unblock_point } from './vision.js';
import { getlin } from './windows.js';
import { flash_str, resist, ubuzz, zapyourself } from './zap.js';

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
        if (special) note_unported('music.c charm_snakes');
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
        note_unported('music.c awaken_soldiers');
        await exercise(A_WIS, false, state, random);
        break;
    case MAGIC_HARP:
        consume_obj_charge(instr, true, { state });
        await message(!Deaf(state)
            ? `${Tobjnam(instr, 'produce', state)} very attractive${same ? ' and familiar' : ''} music.`
            : 'You feel very soothing vibrations.', state);
        note_unported('music.c charm_monsters');
        await exercise(A_DEX, true, state, random);
        break;
    case WOODEN_HARP:
        special &= random.rn2(acurr(state, A_DEX)) + state.u.ulevel > 25;
        await message(!Deaf(state)
            ? `${Yname2(instr, state)} ${special ? (same ? 'produces a familiar, lilting melody' : 'produces a lilting melody')
                : (same ? 'twangs a familiar tune' : 'twangs')}.`
            : 'You feel soothing vibrations.', state);
        if (special) note_unported('music.c calm_nymphs');
        await exercise(A_DEX, true, state, random);
        break;
    case DRUM_OF_EARTHQUAKE:
        consume_obj_charge(instr, true, { state });
        await message('You produce a heavy, thunderous rolling!', state);
        await message(`The entire ${generic_lvl_desc(state)} is shaking around you!`, state);
        note_unported('music.c do_earthquake');
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
        .includes(instr.otyp) && !can_blow(state.youmonst)) {
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
