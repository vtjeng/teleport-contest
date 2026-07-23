// detect.js — searching and discovery.
// C ref: detect.c dosearch0(), cvt_sdoor_to_door(), and find_trap().

import {
    A_WIS,
    BLINDED,
    BURN,
    CORR,
    DOOR,
    D_CLOSED,
    D_LOCKED,
    D_NODOOR,
    ENGRAVE,
    GPCOORDS_COMFULL,
    GPCOORDS_COMPASS,
    GPCOORDS_MAP,
    GPCOORDS_NONE,
    GPCOORDS_SCREEN,
    HALLUC,
    HALLUC_RES,
    HEADSTONE,
    SCORR,
    SDOOR,
    STATUE_TRAP,
    SV0,
    SV1,
    SV2,
    SV3,
    SV4,
    SV5,
    SV6,
    SV7,
    WM_MASK,
    isok,
} from './const.js';
import { SPFX_SEARCH } from './artifacts.js';
import { exercise } from './attrib.js';
import {
    cls,
    docrt,
    flush_screen,
    hero_glyph_info,
    newsym,
    object_glyph_info,
    show_glyph_cell,
    terrain_glyph,
    trap_glyph_info,
} from './display.js';
import { on_level } from './dungeon.js';
import { can_reach_floor, engr_at } from './engrave.js';
import { game } from './gstate.js';
import { LENSES } from './objects.js';
import { rn2, rnl } from './rng.js';
import { t_at } from './trap.js';
import { ttyPline } from './tty_message.js';
import { vision_reset } from './vision.js';
import { nhgetch } from './input.js';

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
    newsym(x, y);
}

const FELT_SEENV = Object.freeze([
    Object.freeze([SV2, SV1, SV0]),
    Object.freeze([SV3, 0, SV7]),
    Object.freeze([SV4, SV5, SV6]),
]);

function rememberedSearchGlyph(glyph) {
    const remembered = {
        ch: glyph.ch,
        color: glyph.color,
        decgfx: glyph.dec,
        displayCh: glyph.displayCh ?? null,
    };
    if (glyph.attr) remembered.attr = glyph.attr;
    if (glyph.displayColor)
        remembered.displayColor = glyph.displayColor;
    if (glyph.rgb) remembered.rgb = [...glyph.rgb];
    return remembered;
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
    if (!can_reach_floor(false, state)
        || state.u.uinwater || state.u.uball || state.u.uchain) {
        throw new Error(
            'automatic search reached an unsupported tactile floor state',
        );
    }

    const location = state.level.at(x, y);
    location.seenv = (location.seenv ?? 0)
        | FELT_SEENV[dy + 1][dx + 1];
    const engraving = engr_at(x, y, state);
    if (engraving
        && [ENGRAVE, HEADSTONE, BURN].includes(engraving.engr_type)) {
        engraving.erevealed = 1;
    }

    const object = state.level.objects?.[x]?.[y] ?? null;
    const trap = t_at(x, y, state);
    const glyph = object
        ? object_glyph_info(object, state)
        : trap?.tseen
            ? trap_glyph_info(trap, state)
            : terrain_glyph(location, x, y, state);
    if (state.level.flags?.hero_memory)
        location.remembered_glyph = rememberedSearchGlyph(glyph);
    show_glyph_cell(
        x,
        y,
        glyph.ch,
        glyph.color,
        glyph.dec,
        glyph.attr ?? 0,
        glyph.displayCh ?? null,
        glyph.displayColor ?? null,
    );
    if (state.level.lastseentyp?.[x])
        state.level.lastseentyp[x][y] = location.typ;
}

function defaultFeelSearchNewSym(x, y, env) {
    if (propertyActiveUnblocked(env.state.u, BLINDED))
        defaultFeelSearchLocation(x, y, env);
    else
        defaultSearchDisplay(x, y, env);
}

async function defaultFoundTrapDisplay(trap, x, y, env) {
    await env.feelNewSym(x, y, env);
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
    show_glyph_cell(
        trap.tx,
        trap.ty,
        trapGlyph.ch,
        trapGlyph.color,
        trapGlyph.dec,
        trapGlyph.attr ?? 0,
        trapGlyph.displayCh ?? null,
        trapGlyph.displayColor ?? null,
    );
    const heroGlyph = hero_glyph_info(env.state);
    show_glyph_cell(
        env.state.u.ux,
        env.state.u.uy,
        heroGlyph.ch,
        heroGlyph.color,
        heroGlyph.dec,
        heroGlyph.attr ?? 0,
        heroGlyph.displayCh ?? null,
        heroGlyph.displayColor ?? null,
    );
}

async function defaultWaitFoundTrap(env) {
    if (env.state !== game) {
        throw new Error(
            'automatic search requires an injected trap-map wait '
            + 'for non-global state',
        );
    }
    await flush_screen(1);
    await nhgetch(env.state);
    await docrt();
}

// C ref: hack.c nomul(0), including end_running(TRUE)'s state effects which
// matter when automatic searching interrupts a repeated movement command.
function defaultNomulZero(env) {
    const { state } = env;
    if ((state.multi ?? 0) < 0) return;
    state.disp ??= {};
    state.context ??= {};
    state.disp.botl = true;
    if (state.u) {
        state.u.uinvulnerable = false;
        state.u.usleep = 0;
    }
    state.multi = 0;
    state.multi_reason = null;
    state.multireasonbuf = '';
    state.context.run = 0;
    state.context.travel = 0;
    state.context.travel1 = 0;
    state.context.mv = 0;
    state.travelmap = null;
}

function defaultExerciseWisdom(env) {
    exercise(A_WIS, true, env.state, env.random, env.hooks);
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
        nomulZero: operation('nomulZero', defaultNomulZero),
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
    trap.tseen = true;
    env.exerciseWisdom(env);
    const trapVisible = await env.displayFoundTrap(
        trap,
        trap.tx,
        trap.ty,
        env,
    );
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
 * C ref: detect.c dosearch0(1).
 *
 * This owner deliberately accepts only intrinsic automatic searching.
 * Explicit #search (aflag == 0) also searches for monsters, reconciles
 * invisible glyphs, and feels every adjacent square; that is a separate
 * command boundary.
 */
export async function dosearch0(aflag, rawEnv = {}) {
    if (aflag !== 1 && aflag !== true) {
        throw new RangeError(
            'this dosearch0 owner implements intrinsic automatic search only',
        );
    }

    const env = normalizeSearchEnv(rawEnv);
    const { state } = env;
    const { u } = state;
    if (!u || !state.level?.at) {
        throw new Error('automatic search requires initialized hero and level');
    }
    if (u.uswallow) return 1;
    if (typeof env.random.rnl !== 'function') {
        throw new TypeError('automatic search requires random.rnl');
    }

    const fund = searchFund(state);

    // Preserve detect.c's x-major, then y-minor traversal and its continue
    // boundaries. Discovery-only owners are resolved after the source rnl()
    // succeeds, so an unsupported hit cannot suppress or reorder a miss.
    for (let x = u.ux - 1; x < u.ux + 2; ++x) {
        for (let y = u.uy - 1; y < u.uy + 2; ++y) {
            if (!isok(x, y) || (x === u.ux && y === u.uy)) continue;
            const location = state.level.at(x, y);
            if (location.typ === SDOOR) {
                if (env.random.rnl(7 - fund)) continue;
                preflightSecretDoor(env);
                cvt_sdoor_to_door(location, state);
                env.recalcBlockPoint(x, y, env);
                env.exerciseWisdom(env);
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
                env.exerciseWisdom(env);
                env.nomulZero(env);
                await env.feelNewSym(x, y, env);
                await env.message(
                    'You find a hidden passage.', x, y, env,
                );
            } else {
                const trap = t_at(x, y, state);
                if (!trap || trap.tseen || env.random.rnl(8)) continue;
                preflightTrap(env, trap);
                env.nomulZero(env);
                if (trap.ttyp === STATUE_TRAP) {
                    const animated = await env.activateStatueTrap(
                        trap, x, y, false, env,
                    );
                    if (animated) env.exerciseWisdom(env);
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

export const _detectInternals = Object.freeze({
    artifactSearchAbility,
    coordinateDescription,
    defaultNomulZero,
    searchFund,
});
