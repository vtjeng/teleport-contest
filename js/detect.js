// detect.js — searching and discovery.
// C ref: detect.c dosearch0(), dosearch(), mfind0(), cvt_sdoor_to_door(), and
// find_trap().

import {
    A_WIS,
    BLINDED,
    BURN,
    CORR,
    DOOR,
    D_CLOSED,
    D_LOCKED,
    D_NODOOR,
    ECMD_OK,
    ECMD_TIME,
    ENGRAVE,
    GPCOORDS_COMFULL,
    GPCOORDS_COMPASS,
    GPCOORDS_MAP,
    GPCOORDS_NONE,
    GPCOORDS_SCREEN,
    HALLUC,
    HALLUC_RES,
    HEADSTONE,
    M_AP_TYPE,
    SCORR,
    SDOOR,
    STATUE_TRAP,
    WM_MASK,
    isok,
} from './const.js';
import { SPFX_SEARCH } from './artifacts.js';
import { exercise } from './attrib.js';
import { cmdSafetyPrevention } from './cmd.js';
import {
    cls,
    docrt,
    glyph_is_invisible,
    hero_glyph_info,
    newsym,
    object_glyph_info,
    remembered_glyph_from_presentation,
    show_glyph_cell,
    terrain_glyph,
    trap_glyph_info,
    unmap_invisible,
} from './display.js';
import { on_level } from './dungeon.js';
import { can_reach_floor, engr_at } from './engrave.js';
import { game } from './gstate.js';
import { nomul } from './hack.js';
import { hides_under, is_hider } from './mondata.js';
import { S_EEL } from './monsters.js';
import { m_at } from './monst.js';
import { LENSES } from './objects.js';
import { visible_region_at } from './region.js';
import { rn2, rnl } from './rng.js';
import { canSpotMonster } from './startup_a11y.js';
import { t_at } from './trap.js';
import {
    dismissPendingTtyMessage,
    ttyPline,
} from './tty_message.js';
import { seenv_matrix, vision_reset } from './vision.js';

/**
 * A branch of detect.c dosearch0() or mfind0() which this port does not own
 * yet.  js/cmd.js converts it into the retryable command boundary, which is
 * sound only because every one of these is decided before the search loop
 * draws its first rnl().
 */
export class UnsupportedSearchError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsupportedSearchError';
    }
}

// C's trap names come from defsyms[trap_to_defsym(ttyp)].explanation.
// Index zero is NO_TRAP and is never passed by find_trap().
const TRAP_NAMES = Object.freeze([
    '',
    'arrow trap',
    'dart trap',
    'falling rock trap',
    'squeaky board',
    'bear trap',
    'land mine',
    'rolling boulder trap',
    'sleeping gas trap',
    'rust trap',
    'fire trap',
    'pit',
    'spiked pit',
    'hole',
    'trap door',
    'teleportation trap',
    'level teleporter',
    'magic portal',
    'web',
    'statue trap',
    'magic trap',
    'anti-magic field',
    'polymorph trap',
    'vibrating square',
    'trapped door',
    'trapped chest',
]);

function propertyActiveUnblocked(hero, propertyIndex) {
    const property = hero?.uprops?.[propertyIndex];
    return Boolean(property?.intrinsic || property?.extrinsic)
        && !property?.blocked;
}

function hallucinating(state) {
    return propertyActiveUnblocked(state.u, HALLUC)
        && !propertyActiveUnblocked(state.u, HALLUC_RES);
}

function compassDescription(x, y, state, full) {
    const dx = x - state.u.ux;
    const dy = y - state.u.uy;
    if (!dx && !dy) return '(here)';
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        const vertical = dy < 0 ? 'north' : dy > 0 ? 'south' : '';
        const horizontal = dx < 0 ? 'west' : dx > 0 ? 'east' : '';
        return `(${vertical}${horizontal})`;
    }

    const parts = [];
    if (dy) {
        const direction = dy < 0 ? (full ? 'north' : 'n')
            : (full ? 'south' : 's');
        parts.push(`${Math.abs(dy)}${direction}`);
    }
    if (dx) {
        const direction = dx < 0 ? (full ? 'west' : 'w')
            : (full ? 'east' : 'e');
        parts.push(`${Math.abs(dx)}${direction}`);
    }
    return `(${parts.join(',')})`;
}

// C ref: getpos.c coord_desc(), as used by pline.c for set_msg_xy().
function coordinateDescription(x, y, state) {
    const configured = state.iflags?.getpos_coords ?? GPCOORDS_NONE;
    const mode = configured === GPCOORDS_NONE
        ? GPCOORDS_COMFULL : configured;
    if (mode === GPCOORDS_COMPASS)
        return compassDescription(x, y, state, false);
    if (mode === GPCOORDS_COMFULL)
        return compassDescription(x, y, state, true);
    if (mode === GPCOORDS_MAP) return `<${x},${y}>`;
    if (mode === GPCOORDS_SCREEN) {
        return `[${String(y + 2).padStart(2, '0')},${String(x).padStart(2, '0')}]`;
    }
    return '';
}

async function defaultMessage(text, x, y, env) {
    const rendered = env.state.a11y?.accessiblemsg
        ? `${coordinateDescription(x, y, env.state)}: ${text}`
        : text;
    await ttyPline(rendered, env.state);
}

function defaultVisionMutation(x, y, env) {
    if (env.state !== game) {
        throw new Error(
            'automatic search requires an injected vision mutation '
            + 'for non-global state',
        );
    }
    const affectedCurrentVision = Boolean(env.state.viz_array?.[y]?.[x]);
    // vision.c updates its transparent-point index immediately.  The current
    // JS vision owner rebuilds that index as a unit rather than exposing
    // dig_point()/fill_point().
    const oldVisionMin = env.state._viz_rmin;
    const oldVisionMax = env.state._viz_rmax;
    vision_reset();
    // vision_reset() is normally a level-lifecycle operation and clears the
    // previous display bounds.  A point mutation happens mid-level, so retain
    // them for vision_recalc() to erase cells which just left sight.
    env.state._viz_rmin = oldVisionMin;
    env.state._viz_rmax = oldVisionMax;
    if (affectedCurrentVision) env.state.vision_full_recalc = 1;
}

function defaultSearchDisplay(x, y, env) {
    if (env.state !== game) {
        throw new Error(
            'automatic search requires an injected display mutation '
            + 'for non-global state',
        );
    }
    // C's newsym() is side-effect-only. find_trap() then compares levl's
    // canonical remembered glyph, not the presentation currently covering it.
    newsym(x, y);
}

// C ref: display.c _map_location().  Every location admitted by this
// automatic-search owner is a converted adjacent door/corridor or an ordinary
// floor trap, so the reachable layer order is object, seen trap, terrain.
// Keep the trap owner beside its presentation so tactile memory can retain its
// logical identity when custom symbols make two glyphs look identical.
function mappedSearchLayer(x, y, state) {
    const object = state.level.objects?.[x]?.[y] ?? null;
    if (object) {
        return {
            glyph: object_glyph_info(object, state),
            trap: null,
        };
    }
    const trap = t_at(x, y, state);
    if (trap?.tseen) {
        return {
            glyph: trap_glyph_info(trap, state),
            trap,
        };
    }
    return {
        glyph: terrain_glyph(state.level.at(x, y), x, y, state),
        trap: null,
    };
}

// C ref: display.c feel_location(), specialized to the reachable-floor,
// adjacent-square branch used by intrinsic searching in a fresh blind game.
// Secret doors and corridors cannot contain floor objects; an ordinary trap
// may be covered by an object, which must remain visible as clutter so
// find_trap() can perform its temporary clear-and-wait sequence.
function defaultFeelSearchLocation(x, y, env) {
    const { state } = env;
    if (state !== game) {
        throw new Error(
            'automatic search requires an injected tactile mapping '
            + 'for non-global state',
        );
    }
    if (!propertyActiveUnblocked(state.u, BLINDED)) {
        defaultSearchDisplay(x, y, env);
        return;
    }
    const dx = x - state.u.ux;
    const dy = y - state.u.uy;
    if (!isok(x, y) || Math.abs(dx) > 1 || Math.abs(dy) > 1
        || (!dx && !dy)) {
        throw new Error(
            'automatic search tactile mapping requires an adjacent square',
        );
    }
    // The ball and chain live on the state root, not on `u`: C's Punished is
    // `(uball != 0)` on the file-scope object (youprop.h:77), and js/worn.js
    // setworn() writes `state.uball`/`state.uchain` through its W_BALL and
    // W_CHAIN slots. Reading `state.u.uball` here answered undefined, so these
    // two clauses never fired and the guard was live only through
    // can_reach_floor(). `u.uinwater` really is a hero field and stays.
    //
    // This refuses three unported blocks of display.c feel_location(): the
    // Levitation Rules at 777-858, the Underwater return at 769-771, and the
    // Punished bc_felt work at 865-891. detect.c:2049 calls feel_location()
    // outside dosearch0()'s `!aflag` tests, so the automatic arm does reach it
    // -- but no running game can be in any of the four states, which is why it
    // stays a bare Error rather than converting:
    //
    //   u.uinwater has one writer, js/hack.js set_uinwater(), and both call
    //     sites pass false (js/do.js goto_level()).
    //   state.uball and state.uchain have one writer, js/worn.js setworn(),
    //     and no call site passes W_BALL or W_CHAIN; js/bury.js only clears
    //     the fields.
    //   can_reach_floor(FALSE) answers false for an engulfed hero, whom
    //     detect.c:2022 returns before the loop for; for a hero held by an
    //     AT_HUGS monster, which needs u.ustuck, and every set_ustuck() call
    //     site in js/ passes null; for a levitating hero, and LEVITATION is
    //     extrinsic-only here, so it needs setworn(), which no ported command
    //     reaches -- js/cmd.js dispatches neither dowear() nor doputon(), and
    //     ini_inv_use_obj() wears role armor alone; for a hero riding below
    //     P_BASIC, which needs a tame saddled steed, and apply.c use_saddle()
    //     is unported while the one tame steed ordinary play offers is the
    //     Knight's pony, whose rider holds P_BASIC already; and for a hiding
    //     ceiling-clinger, which needs polymorph.
    //
    // The test below pins all four terms of the guard.
    if (!can_reach_floor(false, state)
        || state.u.uinwater || state.uball || state.uchain) {
        throw new Error(
            'automatic search reached an unsupported tactile floor state',
        );
    }

    const location = state.level.at(x, y);
    // set_seenv() indexes hero.y - target.y, the opposite of this function's
    // target-relative dy.
    location.seenv = (location.seenv ?? 0)
        | seenv_matrix[1 - dy][dx + 1];
    const engraving = engr_at(x, y, state);
    if (engraving
        && [ENGRAVE, HEADSTONE, BURN].includes(engraving.engr_type)) {
        engraving.erevealed = 1;
    }

    const layer = mappedSearchLayer(x, y, state);
    const { glyph } = layer;
    if (state.level.flags?.hero_memory)
        location.remembered_glyph = remembered_glyph_from_presentation(
            glyph,
            layer.trap,
        );
    show_glyph_cell(x, y, glyph);
    if (state.level.lastseentyp?.[x])
        state.level.lastseentyp[x][y] = location.typ;
}

function defaultFeelSearchNewSym(x, y, env) {
    if (propertyActiveUnblocked(env.state.u, BLINDED)) {
        defaultFeelSearchLocation(x, y, env);
        return;
    }
    defaultSearchDisplay(x, y, env);
}

async function defaultFoundTrapDisplay(trap, x, y, env) {
    const layer = await env.feelNewSym(x, y, env);
    if (!env.injected.has('feelNewSym')) {
        const remembered = env.state.level.at(x, y).remembered_glyph;
        return Boolean(
            env.state.level.flags?.hero_memory
            && remembered?.trapType === trap.ttyp,
        );
    }
    if (layer?.kind) {
        return Boolean(
            env.state.level.flags?.hero_memory
            && layer.kind === 'trap'
            && (layer.owner === trap || layer.trapType === trap.ttyp),
        );
    }
    // Preserve the injected-hook fallback contract for focused callers which
    // supply presentation but not a logical layer descriptor.
    const shown = env.state.level.at(x, y);
    const expected = trap_glyph_info(trap, env.state);
    return shown.disp_ch === expected.ch
        && shown.disp_color === expected.color
        && Boolean(shown.disp_decgfx) === Boolean(expected.dec);
}

async function defaultRevealFoundTrap(trap, env) {
    if (env.state !== game) {
        throw new Error(
            'automatic search requires an injected trap reveal '
            + 'for non-global state',
        );
    }
    await cls();
    const trapGlyph = trap_glyph_info(trap, env.state);
    show_glyph_cell(trap.tx, trap.ty, trapGlyph);
    const heroGlyph = hero_glyph_info(env.state);
    show_glyph_cell(env.state.u.ux, env.state.u.uy, heroGlyph);
}

async function defaultWaitFoundTrap(env) {
    if (env.state !== game) {
        throw new Error(
            'automatic search requires an injected trap-map wait '
            + 'for non-global state',
        );
    }
    // C ref: win/tty/wintty.c tty_display_nhwindow(NHW_MAP, TRUE).
    // A pending find_trap() message is presented through more(), whose key
    // wait and topline cleanup are owned by the tty message subsystem.
    // WIN_STOP suppresses that message and therefore the wait, but find_trap()
    // still continues to docrt().
    const messageWasStopped = Boolean(env.state._ttyMessageStopped);
    if (!await dismissPendingTtyMessage(env.state) && !messageWasStopped) {
        throw new Error(
            'automatic search trap-map wait requires its pending tty message',
        );
    }
    await docrt();
}

async function defaultExerciseWisdom(env) {
    await exercise(A_WIS, true, env.state, env.random, env.hooks);
}

function injectedOperation(rawEnv, name) {
    return rawEnv[name] ?? rawEnv.hooks?.[name];
}

function normalizeSearchEnv(rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? (state === game ? { rn2, rnl } : {});

    const injected = new Set();
    const operation = (name, fallback) => {
        const supplied = injectedOperation(rawEnv, name);
        if (typeof supplied === 'function') {
            injected.add(name);
            return supplied;
        }
        return fallback;
    };

    const env = {
        ...rawEnv,
        state,
        random,
        hooks: rawEnv.hooks ?? {},
        injected,
        recalcBlockPoint: operation(
            'recalcBlockPoint',
            defaultVisionMutation,
        ),
        unblockPoint: operation('unblockPoint', defaultVisionMutation),
        feelLocation: operation(
            'feelLocation',
            defaultFeelSearchLocation,
        ),
        feelNewSym: operation(
            'feelNewSym',
            defaultFeelSearchNewSym,
        ),
        // detect.c mfind0()'s bare newsym(), which is not routed through
        // feel_location() the way the two secret-terrain arms are.
        newSym: operation('newSym', defaultSearchDisplay),
        displayFoundTrap: operation(
            'displayFoundTrap',
            defaultFoundTrapDisplay,
        ),
        revealFoundTrap: operation(
            'revealFoundTrap',
            defaultRevealFoundTrap,
        ),
        waitFoundTrap: operation('waitFoundTrap', defaultWaitFoundTrap),
        activateStatueTrap: operation('activateStatueTrap', null),
        exerciseWisdom: operation(
            'exerciseWisdom',
            defaultExerciseWisdom,
        ),
        // detect.c calls nomul(0) at 2048, 2058 and 2080, which js/hack.js
        // owns along with the end_running(TRUE) inside it.
        nomulZero: operation('nomulZero', ({ state }) => nomul(0, state)),
        message: operation('message', defaultMessage),
        trapName: operation(
            'trapName',
            (trap) => TRAP_NAMES[trap.ttyp] ?? 'trap',
        ),
    };
    return env;
}

function requireOperation(env, name, detail) {
    if (typeof env[name] !== 'function') {
        throw new Error(
            `automatic search requires ${name}${detail ? ` for ${detail}` : ''}`,
        );
    }
}

function requireInjected(env, name, detail) {
    if (!env.injected.has(name)) {
        throw new Error(
            `automatic search requires an injected ${name} for ${detail}`,
        );
    }
}

function requireExerciseRandom(env) {
    if (!env.injected.has('exerciseWisdom')
        && typeof env.random.rn2 !== 'function') {
        throw new TypeError(
            'automatic search wisdom exercise requires random.rn2',
        );
    }
}

function validateDisplayCapability(env, name, detail) {
    requireOperation(env, name, detail);
    if (env.state !== game) requireInjected(env, name, 'non-global state');
}

function preflightSecretDoor(env) {
    requireOperation(env, 'recalcBlockPoint', 'a secret door');
    validateDisplayCapability(env, 'feelLocation', 'a secret door');
    requireOperation(env, 'exerciseWisdom', 'a secret door');
    requireExerciseRandom(env);
    requireOperation(env, 'nomulZero', 'a secret door');
    requireOperation(env, 'message', 'a secret door');
}

function preflightSecretCorridor(env) {
    requireOperation(env, 'unblockPoint', 'a secret corridor');
    validateDisplayCapability(env, 'feelNewSym', 'a secret corridor');
    requireOperation(env, 'exerciseWisdom', 'a secret corridor');
    requireExerciseRandom(env);
    requireOperation(env, 'nomulZero', 'a secret corridor');
    requireOperation(env, 'message', 'a secret corridor');
}

function preflightTrap(env, trap) {
    requireOperation(env, 'nomulZero', 'an unseen trap');
    requireOperation(env, 'exerciseWisdom', 'an unseen trap');
    requireExerciseRandom(env);
    if (trap.ttyp === STATUE_TRAP) {
        requireOperation(env, 'activateStatueTrap', 'a statue trap');
        return;
    }
    validateDisplayCapability(env, 'displayFoundTrap', 'an unseen trap');
    requireOperation(env, 'message', 'an unseen trap');
    requireOperation(env, 'trapName', 'an unseen trap');
    if (env.injected.has('message')
        && !env.injected.has('waitFoundTrap')) {
        throw new Error(
            'automatic search requires an injected waitFoundTrap '
            + 'when trap messaging is injected',
        );
    }
    if (env.state !== game) {
        requireInjected(
            env, 'revealFoundTrap', 'non-global trap display',
        );
        requireInjected(
            env, 'waitFoundTrap', 'non-global trap display',
        );
    }
    if (hallucinating(env.state)) {
        requireInjected(
            env, 'displayFoundTrap', 'hallucinatory trap display',
        );
        requireInjected(
            env, 'trapName', 'hallucinatory trap naming',
        );
        requireOperation(
            env, 'revealFoundTrap', 'hallucinatory trap display',
        );
        requireOperation(
            env, 'waitFoundTrap', 'hallucinatory trap display',
        );
    }
}

/**
 * The three discovery arms of detect.c mfind0(), which decide whether a
 * monster on an adjacent square is found rather than merely redrawn.  Each one
 * exercises Wisdom, writes a message and needs a helper this port does not
 * have: seemimic(), map_invisible(), or the mundetected reveal.
 *
 * mfind0() calls this at the square it is looking at and
 * preflightExplicitSearch() calls it at all eight, so a refusal here always
 * happens before the loop's first rnl().
 */
function preflightSearchMonster(monster, env) {
    const { state } = env;
    validateDisplayCapability(env, 'newSym', 'an adjacent monster');
    if (M_AP_TYPE(monster)) {
        throw new UnsupportedSearchError(
            'searching out a mimicking monster needs seemimic()',
        );
    }
    // display.h mon_visible() requires !mundetected, so a hidden monster fails
    // canspotmon() as well and mfind0() reaches both arms. Test the narrower
    // condition first so the refusal names the branch that really applies.
    if (monster.mundetected
        && (is_hider(monster.data) || hides_under(monster.data)
            || monster.data?.mlet === S_EEL)) {
        throw new UnsupportedSearchError(
            'searching out a hidden monster is not ported',
        );
    }
    if (!canSpotMonster(monster, state)) {
        throw new UnsupportedSearchError(
            'searching out an unspotted monster needs map_invisible()',
        );
    }
}

/**
 * C ref: the aflag == 0 arms of detect.c dosearch0(), plus every capability
 * its loop body needs.
 *
 * dosearch0() draws rnl() once per adjacent square inside its loop, so a case
 * this port cannot finish has to be refused over the whole 3x3 before the
 * first draw.  A refusal decided at the fifth square would already have spent
 * randomness on the first four and could not be retried.
 */
function preflightExplicitSearch(env) {
    const { state } = env;
    const { u } = state;
    // detect.c:2020-2022 answers a swallowed hero through Norep().
    if (u.uswallow) {
        throw new UnsupportedSearchError(
            'searching while swallowed is not ported',
        );
    }
    const blind = propertyActiveUnblocked(u, BLINDED);
    for (let x = u.ux - 1; x < u.ux + 2; ++x) {
        for (let y = u.uy - 1; y < u.uy + 2; ++y) {
            if (!isok(x, y) || (x === u.ux && y === u.uy)) continue;
            // detect.c:2038-2039. Explicit searching feels every adjacent
            // square, whatever is on it; js/display.js feel_location() owns
            // only the blind-obstacle subset and detect.js's own tactile
            // mapping only converted secret terrain and ordinary floor traps.
            if (blind || visible_region_at(x, y, state)) {
                throw new UnsupportedSearchError(
                    'explicit searching feels every adjacent square when the '
                    + 'hero is blind or a visible region covers one',
                );
            }
            const location = state.level.at(x, y);
            // detect.c deliberately finds nothing else on an SDOOR or SCORR.
            if (location.typ === SDOOR) {
                preflightSecretDoor(env);
                continue;
            }
            if (location.typ === SCORR) {
                preflightSecretCorridor(env);
                continue;
            }
            const monster = m_at(x, y, state);
            if (monster) {
                preflightSearchMonster(monster, env);
            } else if (glyph_is_invisible(location)) {
                // unmap_invisible()'s TRUE arm needs unmap_object().
                throw new UnsupportedSearchError(
                    'clearing a remembered invisible monster is not ported',
                );
            }
            const trap = t_at(x, y, state);
            if (trap && !trap.tseen) {
                // Two source branches the port does not own. They are refused
                // here, with the class js/cmd.js failClosedCommand() converts
                // into a retryable command boundary, rather than inside
                // preflightTrap(). That function's other checks catch a
                // misconfigured env rather than an unported branch.
                //
                // detect.c:2079-2088 is the one block dosearch0() does not
                // gate on aflag, so the automatic arm reaches these same two
                // branches and refuses them from preflightTrap() as plain
                // Errors, after the rnl(8) that selected the square. Those two
                // escape runSegment() rather than ending a segment, because
                // the turn loop converts nothing; neither is reachable by a
                // case this port can record today, and js/allmain.js records
                // that derivation beside the automatic call.
                if (trap.ttyp === STATUE_TRAP) {
                    throw new UnsupportedSearchError(
                        'detect.c activate_statue_trap() is not ported',
                    );
                }
                if (hallucinating(state)) {
                    throw new UnsupportedSearchError(
                        "detect.c find_trap()'s hallucinatory display is not "
                        + 'ported',
                    );
                }
                preflightTrap(env, trap);
            }
        }
    }
}

/**
 * C ref: detect.c mfind0(), restricted to via_warning == 0 and to the
 * found_something == FALSE result.  warnreveal() is the only caller that
 * passes 1, and preflightSearchMonster() refuses every input that would set
 * found_something, so what remains is the redraw and the 0 return.
 */
async function mfind0(monster, via_warning, env) {
    if (via_warning) {
        throw new UnsupportedSearchError(
            'mfind0 danger-sense discovery is not ported',
        );
    }
    preflightSearchMonster(monster, env);
    await env.newSym(monster.mx, monster.my, env);
    return 0;
}

function artifactSearchAbility(object, state) {
    if (!object?.oartifact) return false;
    const artifact = state.artilist?.[object.oartifact];
    if (!artifact) {
        throw new Error(
            `automatic search cannot resolve artifact ${object.oartifact}`,
        );
    }
    return Boolean(artifact.spfx & SPFX_SEARCH);
}

function searchFund(state) {
    let fund = artifactSearchAbility(state.uwep, state)
        ? Math.trunc(state.uwep.spe ?? 0) : 0;
    if (state.ublindf?.otyp === LENSES
        && !propertyActiveUnblocked(state.u, BLINDED)) {
        fund += 2;
    }
    return Math.min(fund, 5);
}

// C ref: detect.c cvt_sdoor_to_door(). `flags` is struct rm's canonical
// union slot; doormask is updated with it for older JS state fixtures.
export function cvt_sdoor_to_door(location, state = game) {
    if (!location || location.typ !== SDOOR) {
        throw new TypeError('cvt_sdoor_to_door requires a secret door');
    }
    const oldmask = location.flags || location.doormask || 0;
    let newmask = oldmask & ~WM_MASK;
    if (on_level(state.u?.uz, state.rogue_level)) {
        newmask = D_NODOOR;
    } else if (!(newmask & D_LOCKED)) {
        newmask |= D_CLOSED;
    }
    location.typ = DOOR;
    location.flags = newmask;
    location.doormask = newmask;
    location.candig = false;
    return location;
}

function indefinite(name) {
    return /^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`;
}

async function findTrap(trap, env) {
    // displayFoundTrap mutates the live display and reports semantic identity:
    // true means the remembered top layer is this trap, not merely that its
    // projected character and color resemble the trap. False (or
    // hallucination) owns reveal -> message -> acknowledgement -> redraw;
    // WIN_STOP may suppress the acknowledgement while retaining the redraw.
    trap.tseen = true;
    await env.exerciseWisdom(env);
    const trapVisible = await env.displayFoundTrap(
        trap,
        trap.tx,
        trap.ty,
        env,
    );
    if (typeof trapVisible !== 'boolean') {
        throw new TypeError(
            'automatic search displayFoundTrap must return a Boolean',
        );
    }
    const cleared = hallucinating(env.state) || trapVisible === false;
    if (cleared) {
        requireOperation(env, 'revealFoundTrap', 'a cluttered trap');
        requireOperation(env, 'waitFoundTrap', 'a cluttered trap');
        await env.revealFoundTrap(trap, env);
    }
    const name = env.trapName(trap, env);
    await env.message(
        `You find ${indefinite(name)}.`,
        trap.tx,
        trap.ty,
        env,
    );
    if (cleared) await env.waitFoundTrap(env);
}

/**
 * C ref: detect.c dosearch0().
 *
 * aflag == 1 is intrinsic automatic searching, driven by moveloop_core().
 * aflag == 0 is the explicit `s` command, which additionally feels every
 * adjacent square, searches out adjacent monsters through mfind0(), and
 * reconciles a remembered invisible monster through unmap_invisible().
 *
 * The two flags resolve their unported cases at opposite ends of the loop, and
 * deliberately so.  Automatic searching cannot be retried, because the turn
 * that ran it is already spent, so it refuses inside the loop after the source
 * rnl() has already succeeded, which keeps the draw sequence intact.  The
 * explicit command can be retried, so preflightExplicitSearch() decides every
 * refusal over all eight squares before the first draw.
 */
export async function dosearch0(aflag, rawEnv = {}) {
    const explicit = aflag === 0 || aflag === false;
    if (!explicit && aflag !== 1 && aflag !== true) {
        throw new RangeError(
            'dosearch0 takes the automatic (1) or explicit (0) search flag',
        );
    }

    const env = normalizeSearchEnv(rawEnv);
    const { state } = env;
    const { u } = state;
    if (!u || !state.level?.at) {
        throw new Error('searching requires an initialized hero and level');
    }
    if (explicit) preflightExplicitSearch(env);
    // detect.c prints "What are you looking for?  The exit?" through Norep()
    // for an explicit search; the preflight above has already refused that.
    if (u.uswallow) return 1;
    if (typeof env.random.rnl !== 'function') {
        throw new TypeError('searching requires random.rnl');
    }

    const fund = searchFund(state);

    // Preserve detect.c's x-major, then y-minor traversal and its continue
    // boundaries.
    for (let x = u.ux - 1; x < u.ux + 2; ++x) {
        for (let y = u.uy - 1; y < u.uy + 2; ++y) {
            if (!isok(x, y) || (x === u.ux && y === u.uy)) continue;
            const location = state.level.at(x, y);
            // detect.c:2038-2039 calls feel_location() here for an explicit
            // search when Blind or a visible region covers the square. The
            // preflight refuses both, so nothing reaches it.
            if (location.typ === SDOOR) {
                if (env.random.rnl(7 - fund)) continue;
                preflightSecretDoor(env);
                cvt_sdoor_to_door(location, state);
                env.recalcBlockPoint(x, y, env);
                await env.exerciseWisdom(env);
                env.nomulZero(env);
                await env.feelLocation(x, y, env);
                await env.message(
                    'You find a hidden door.', x, y, env,
                );
            } else if (location.typ === SCORR) {
                if (env.random.rnl(7 - fund)) continue;
                preflightSecretCorridor(env);
                location.typ = CORR;
                env.unblockPoint(x, y, env);
                await env.exerciseWisdom(env);
                env.nomulZero(env);
                await env.feelNewSym(x, y, env);
                await env.message(
                    'You find a hidden passage.', x, y, env,
                );
            } else {
                // "Be careful not to find anything in an SCORR or SDOOR."
                const monster = explicit ? m_at(x, y, state) : null;
                if (monster) {
                    const found = await mfind0(monster, 0, env);
                    if (found === -1) continue;
                    if (found > 0) return found;
                }
                // See if an invisible monster has moved; when Blind,
                // feel_location() has already done it. The preflight refuses a
                // blind explicit search, so that arm never applies here.
                if (explicit && !monster
                    && !propertyActiveUnblocked(u, BLINDED)) {
                    unmap_invisible(x, y, state);
                }
                const trap = t_at(x, y, state);
                if (!trap || trap.tseen || env.random.rnl(8)) continue;
                preflightTrap(env, trap);
                env.nomulZero(env);
                if (trap.ttyp === STATUE_TRAP) {
                    const animated = await env.activateStatueTrap(
                        trap, x, y, false, env,
                    );
                    if (animated) await env.exerciseWisdom(env);
                    return 1;
                }
                await findTrap(trap, env);
            }
        }
    }
    return 1;
}

export async function automatic_search(rawEnv = {}) {
    return dosearch0(1, rawEnv);
}

/**
 * C ref: detect.c dosearch(), the handler behind the `s` key and `#search`.
 *
 * already_found_flag is C's ga.already_found_flag, the repeat counter
 * cmd_safety_prevention() keeps for this command alone; it lives beside
 * did_nothing_flag on the game state, which is what donull() passes for its
 * own counter.
 */
export async function dosearch(state = game, rawEnv = {}) {
    const prevented = await cmdSafetyPrevention(
        'Searching',
        'another search',
        'You already found a monster.',
        'already_found_flag',
        state,
    );
    if (prevented) return ECMD_OK;
    return await dosearch0(0, { state, ...rawEnv }) ? ECMD_TIME : ECMD_OK;
}
