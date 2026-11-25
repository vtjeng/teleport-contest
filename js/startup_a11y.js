// Accessibility notices for startup scans and turn-time glyph updates.
// C refs: allmain.c:newgame(); cmd.c:dolookaround();
// vision.c:vision_recalc()'s notice_all_mons() queue; getpos.c:coord_desc();
// display.c:show_glyph();
// pager.c:do_screen_description(), look_at_monster(), object_from_map().

import { game } from './gstate.js';
import {
    ALTAR,
    AIR,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_MASK,
    AM_NEUTRAL,
    AM_SANCTUM,
    BOLT_LIM,
    COLNO,
    CLOUD,
    CORR,
    DB_FLOOR,
    DB_ICE,
    DB_LAVA,
    DB_MOAT,
    DB_UNDER,
    DBWALL,
    DOOR,
    DRAWBRIDGE_DOWN,
    DRAWBRIDGE_UP,
    FOUNTAIN,
    GPCOORDS_COMPASS,
    GPCOORDS_COMFULL,
    GPCOORDS_MAP,
    GPCOORDS_NONE,
    GPCOORDS_SCREEN,
    GLOC_INTERESTING,
    GRAVE,
    ICE,
    IRONBARS,
    IS_ROOM,
    IS_WALL,
    LADDER,
    LAVAPOOL,
    LAVAWALL,
    M_AP_F_DKNOWN,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    MOAT,
    POOL,
    ROWNO,
    SDOOR,
    SINK,
    STAIRS,
    STONE,
    THRONE,
    TREE,
    FIRE_RES,
    WATER,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_TRAPPED,
    LA_DOWN,
    OBJ_FREE,
    OBJ_FLOOR,
    URGENT_MESSAGE,
} from './const.js';
import { isok } from './cmd_isok.js';
import { cansee } from './vision.js';
import {
    canspotmon, flush_screen, glyph_is_monster, suppress_map_output,
} from './display.js';
import { GLYPH_NOTHING_OFF, GLYPH_UNEXPLORED_OFF } from './glyph_offsets.js';
import {
    do_screen_description,
    mhidden_description,
    waterbody_name,
} from './pager.js';
import { is_drawbridge_wall } from './dbridge.js';
import { tty_status_state } from './wintty.js';
import { gather_locs_interesting } from './getpos.js';
import {
    Monnam,
    hliquid,
} from './do_name.js';
import {
    fruit_from_indx,
    makeplural,
    matching_artifact_fruit,
    makesingular,
} from './fruit.js';
import { notice_all_mons } from './hack.js';
import { m_at } from './monst.js';
import { dealloc_obj, mkobj, mksobj } from './mkobj.js';
import { objectGenerationEnv } from './object_generation.js';
import { just_an } from './objnam.js';
import { observe_object } from './o_init.js';
import { obj_stop_timers } from './timeout.js';
import { locomotion } from './mondata.js';
import { rn2_on_display_rng } from './rng.js';
import {
    glyph_at,
    glyph_buffer_at,
    glyph_is_cmap,
    glyph_to_cmap,
    tty_map_cell_at,
} from './display.js';
import {
    AMULET_CLASS,
    ARMOR_CLASS,
    BALL_CLASS,
    BOULDER,
    CHAIN_CLASS,
    COPPER,
    COIN_CLASS,
    CORPSE,
    FOOD_CLASS,
    FIRST_REAL_GEM,
    FIRST_SPELL,
    GEM_CLASS,
    GLASS,
    ILLOBJ_CLASS,
    IRON,
    LIQUID,
    LAST_GLASS_GEM,
    LAST_SPELL,
    LEASH,
    MINERAL,
    OBJ_DESCR,
    OBJ_NAME,
    POTION_CLASS,
    PLASTIC,
    RING_CLASS,
    ROCK_CLASS,
    SCROLL_CLASS,
    SLIME_MOLD,
    SPBOOK_CLASS,
    STATUE,
    STRANGE_OBJECT,
    TOOL_CLASS,
    DRAGON_HIDE,
    TALLOW_CANDLE,
    VENOM_CLASS,
    WAN_FIRE,
    WAND_CLASS,
    WAX_CANDLE,
    WEAPON_CLASS,
    WOOD,
} from './objects.js';
import {
    S_air,
    S_altar,
    S_bars,
    S_brupstair,
    S_brdnstair,
    S_brupladder,
    S_brdnladder,
    S_cloud,
    S_corr,
    S_darkroom,
    S_dnstair,
    S_dnladder,
    S_engroom,
    S_engrcorr,
    S_fountain,
    S_grave,
    S_hcdoor,
    S_hcdbridge,
    S_hodbridge,
    S_hodoor,
    S_ice,
    S_lava,
    S_lavawall,
    S_litcorr,
    S_ndoor,
    S_pool,
    S_poisoncloud,
    S_room,
    S_sink,
    S_stone,
    S_throne,
    S_tree,
    S_upstair,
    S_upladder,
    S_vcdoor,
    S_vcdbridge,
    S_vodbridge,
    S_vodoor,
    S_water,
} from './symbols.js';
import { Blind, Hallucination } from './youprop.js';
import { lcase, lowc, strncmpi } from './hacklib.js';
import { queuedVpline, ttyPline } from './tty_message.js';
import { impossible } from './pline.js';
import { NH_abort } from './end.js';

// mhidden_description() is owned by pager.c.  Keep this compatibility export
// for status-line and startup callers while pager.js remains the sole JS
// implementation of the source helper.
export { mhidden_description };

const TRAP_DESCRIPTIONS = Object.freeze([
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

const OBJECT_CLASS_NAMES = Object.freeze({
    [ILLOBJ_CLASS]: 'strange object',
    [WEAPON_CLASS]: 'weapon',
    [ARMOR_CLASS]: 'armor',
    [RING_CLASS]: 'ring',
    [AMULET_CLASS]: 'amulet',
    [TOOL_CLASS]: 'tool',
    [FOOD_CLASS]: 'food',
    [POTION_CLASS]: 'potion',
    [SCROLL_CLASS]: 'scroll',
    [SPBOOK_CLASS]: 'spellbook',
    [WAND_CLASS]: 'wand',
    [COIN_CLASS]: 'coin',
    [GEM_CLASS]: 'gem',
    [ROCK_CLASS]: 'large rock',
    [BALL_CLASS]: 'iron ball',
    [CHAIN_CLASS]: 'iron chain',
    [VENOM_CLASS]: 'venom',
});

function compassDescription(x, y, state, full = true) {
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

function coordinateDescription(x, y, state) {
    const configured = state.iflags?.getpos_coords;
    // pline.c substitutes full compass coordinates for accessible messages
    // when the ordinary whatis coordinate option is disabled.
    const mode = configured === GPCOORDS_NONE ? GPCOORDS_COMFULL : configured;
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

// C ref: pline.c vpline() (175-189) prefixes the location a message
// recorded only when accessiblemsg is on and isok() accepts it, so a
// location off the map, such as zap.c buzz()'s pline_dir() toward the
// square beyond the map edge a bounced ray came from, or the (0, 0) that
// pline_mon() records for the hero, prints no prefix. `forceLocation` is for
// the callers that format a location with getpos.c coord_desc() themselves,
// outside vpline().
export function messageAt(text, x, y, state, forceLocation = false) {
    if (forceLocation || (state.a11y?.accessiblemsg && isok(x, y))) {
        return `${coordinateDescription(x, y, state)}: ${text}`;
    }
    return text;
}

function sameGlyphIdentity(left, right) {
    if (!left || !right) return left === right;
    // Glyph-update metadata is attached only while glyph_updates is on, so a
    // cell drawn before the option was set, or by hero_glyph_info(), carries
    // the glyph number alone. C's gbuf always holds that number, and
    // show_glyph() compares nothing else, so compare it whenever one side
    // lacks the metadata.
    if ((left.a11yIdentity == null || right.a11yIdentity == null)
        && Number.isInteger(left.glyph) && Number.isInteger(right.glyph))
        return left.glyph === right.glyph;
    if (left.a11yIdentity != null || right.a11yIdentity != null)
        return left.a11yIdentity === right.a11yIdentity;
    // Hand-authored presentations have no source glyph number. Matching
    // categories and recorder characters are the best logical identity
    // available; presentation-only color, attribute, UTF-8, and RGB changes
    // do not satisfy display.c's oldglyph != glyph test.
    return left.a11yKind === right.a11yKind && left.ch === right.ch;
}

// The buffered display of one map square replayed around queued notice
// frames: the terminal cell (js/display.js tty_map_cell_at()) and the gbuf
// entry (glyph_buffer_at()), but not the patch 006 shadow cell. Capture,
// restore, and delta application use every field; reconciliation compares
// the display values, including selected nested glyphinfo fields, but
// deliberately excludes the gnew dirty bit.
const GLYPH_FRAME_CELL_FIELDS = Object.freeze([
    'ch',
    'color',
    'decgfx',
    'attr',
    'browser_ch',
    'browser_color',
    'browser_attr',
]);
const GLYPH_BUFFER_FIELDS = Object.freeze([
    ...GLYPH_FRAME_CELL_FIELDS,
    'glyphinfo',
    'gnew',
]);

function clonePresentation(glyph) {
    if (!glyph) return glyph;
    const clone = { ...glyph };
    if (glyph.rgb) clone.rgb = [...glyph.rgb];
    for (const field of [
        'glyph', 'glyphflags', 'a11yIdentity', 'a11ySubject',
    ]) {
        if (glyph[field] !== undefined) {
            Object.defineProperty(clone, field, {
                configurable: true,
                value: glyph[field],
            });
        }
    }
    return clone;
}

function glyphBufferIndex(x, y) {
    return y * COLNO + x;
}

function captureBufferedLocation(x, y, state) {
    const cell = tty_map_cell_at(x, y, state);
    const entry = glyph_buffer_at(x, y, state);
    return {
        ch: cell.ch,
        color: cell.color,
        decgfx: cell.decgfx,
        attr: cell.attr,
        browser_ch: cell.browser_ch,
        browser_color: cell.browser_color,
        browser_attr: cell.browser_attr,
        glyphinfo: clonePresentation(entry.glyphinfo),
        gnew: entry.gnew,
    };
}

function restoreBufferedLocation(x, y, saved, state) {
    const cell = tty_map_cell_at(x, y, state);
    for (const field of GLYPH_FRAME_CELL_FIELDS) cell[field] = saved[field];
    const entry = glyph_buffer_at(x, y, state);
    entry.glyphinfo = clonePresentation(saved.glyphinfo);
    entry.gnew = saved.gnew;
}

function captureGlyphBuffer(state) {
    const snapshot = new Array(COLNO * ROWNO);
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            // A state with no map yet has no frame to keep: a report queued
            // before the first level exists still prints.
            const location = state.level?.at?.(x, y);
            if (!location) continue;
            snapshot[glyphBufferIndex(x, y)]
                = captureBufferedLocation(x, y, state);
        }
    }
    return snapshot;
}

function sameBufferedPresentation(left, right) {
    if (!left || !right) return left === right;
    for (const field of GLYPH_BUFFER_FIELDS) {
        if (field === 'gnew') continue;
        if (field !== 'glyphinfo') {
            if (left[field] !== right[field]) return false;
            continue;
        }
        const leftGlyph = left.glyphinfo;
        const rightGlyph = right.glyphinfo;
        if (!leftGlyph || !rightGlyph) {
            if (leftGlyph !== rightGlyph) return false;
            continue;
        }
        // a11ySubject may point at mutable monster or object state, so comparing
        // it would make frame equality depend on later mutations. a11yIdentity
        // carries the stable logical distinction needed for reconciliation.
        const scalarMatch = [
            'ch',
            'color',
            'dec',
            'glyphflags',
            'displayCh',
            'displayColor',
            'glyph',
            'a11yKind',
            'a11yDescription',
            'a11yIdentity',
        ].every((name) => leftGlyph[name] === rightGlyph[name]);
        const leftRgb = leftGlyph.rgb ?? null;
        const rightRgb = rightGlyph.rgb ?? null;
        const rgbMatch = leftRgb === rightRgb
            || (Array.isArray(leftRgb)
                && Array.isArray(rightRgb)
                && leftRgb.length === rightRgb.length
                && leftRgb.every((channel, index) => (
                    channel === rightRgb[index]
                )));
        if (!scalarMatch || !rgbMatch) return false;
    }
    return true;
}

function restoreGlyphBuffer(state, snapshot) {
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const location = state.level?.at(x, y);
            const saved = snapshot?.[glyphBufferIndex(x, y)];
            if (!location || !saved) continue;
            restoreBufferedLocation(x, y, saved, state);
        }
    }
}

function applyGlyphFrameChanges(state, changes, dirty) {
    for (const [index, saved] of changes ?? []) {
        const y = Math.trunc(index / COLNO);
        const x = index - y * COLNO;
        const location = state.level?.at(x, y);
        if (!location) continue;
        restoreBufferedLocation(x, y, saved, state);
        if (saved.gnew) dirty.add(index);
        else dirty.delete(index);
    }
}

function dirtyGlyphBufferCells(snapshot) {
    const dirty = new Set();
    for (let index = 0; index < snapshot.length; ++index) {
        if (snapshot[index]?.gnew) dirty.add(index);
    }
    return dirty;
}

function markGlyphFrameFlushed(state, dirty) {
    for (const index of dirty) {
        const y = Math.trunc(index / COLNO);
        const x = index - y * COLNO;
        const location = state.level?.at(x, y);
        if (location) glyph_buffer_at(x, y, state).gnew = 0;
    }
    dirty.clear();
}

function materializeGlyphFrame(notices, throughIndex) {
    const snapshot = [...notices[0].glyphFrame.base];
    for (let index = 1; index <= throughIndex; ++index) {
        for (const [cell, saved] of notices[index].glyphFrame.changes)
            snapshot[cell] = saved;
    }
    return snapshot;
}

// Final restoration and dirty-bit reconciliation are separate state rules:
// a cell already flushed by the last source-ordered notice stays clean only
// when its final presentation is the same as that flushed presentation.
function reconcileFinalGlyphBuffer(state, finalBuffer, flushedBuffer) {
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const index = glyphBufferIndex(x, y);
            const location = state.level?.at(x, y);
            if (location
                && sameBufferedPresentation(
                    finalBuffer[index],
                    flushedBuffer[index],
                )) {
                glyph_buffer_at(x, y, state).gnew = 0;
            }
        }
    }
}

// C ref: display.c show_glyph() and pline.c vpline(). C prints a glyph-update
// notice from inside show_glyph(), and vpline()'s flush_screen() clears every
// gbuf gnew bit before the next show_glyph() call. The port queues the notice
// instead, so while one is pending, a cell's gnew bit as the next
// show_glyph() reads it is set only when show_glyph() has written the cell
// since that notice. Called by display.js:show_glyph_cell() before it
// installs the new presentation; `entry` is the cell's gbuf entry.
export function glyphGnewSinceNotice(x, y, entry, state) {
    const tracker = state._glyphNoticeFrameTracker;
    if (!tracker || state._emittingGlyphUpdateNotices
        || !state._glyphUpdateNotices?.length) {
        return entry.gnew;
    }
    return tracker.pending.has(glyphBufferIndex(x, y)) ? entry.gnew : 0;
}

// Called by display.js:show_glyph_cell(), the local display.c:show_glyph()
// boundary, after the buffered cell has been installed. Once a notice sequence
// starts, retain only cells mutated since its preceding source-order pline
// instead of another full map.
export function noteGlyphBufferMutation(x, y, state) {
    const tracker = state._glyphNoticeFrameTracker;
    if (!tracker || state._emittingGlyphUpdateNotices) return;
    const location = state.level?.at(x, y);
    if (!location) return;
    tracker.pending.set(
        glyphBufferIndex(x, y),
        captureBufferedLocation(x, y, state),
    );
}

// display.c show_glyph() classifies the old glyph only through
// glyph_is_nothing(), glyph_is_unexplored(), and glyph_is_monster(). A
// presentation without glyph-update metadata still carries its glyph number;
// the hero's own glyph from hero_glyph_info() is a monster glyph.
function glyphNumberKind(glyph) {
    if (!Number.isInteger(glyph)) return null;
    if (glyph === GLYPH_NOTHING_OFF) return 'nothing';
    if (glyph === GLYPH_UNEXPLORED_OFF) return 'unexplored';
    if (glyph_is_monster(glyph)) return 'monster';
    return null;
}

// display.c nul_gbuf's glyph, which cls() and level changes leave in gbuf.
const NUL_GBUF_GLYPH = Object.freeze({ glyph: GLYPH_UNEXPLORED_OFF });

// C ref: display.c show_glyph(). The caller invokes this after installing the
// presentation, matching show_glyph()'s gbuf update before
// do_screen_description() and pline_xy(). The first notice saves one complete
// frame; subsequent notices retain only intervening cell mutations.
export function queueGlyphUpdateNotice(
    x,
    y,
    previous,
    current,
    previousGnew,
    state,
) {
    const a11y = state.a11y;
    const program = state.program_state ?? {};
    if (!a11y?.glyph_updates
        || a11y.mon_notices_blocked
        || program.in_docrt
        || program.gameover
        || program.in_getlev
        || program.stopprint
        || suppress_map_output(state)
        // A cell with no presentation since cls() holds C's nul_gbuf: the
        // unexplored glyph with gnew clear, so redrawing it unexplored (as
        // under_water()'s limited update does) is no change.
        || (sameGlyphIdentity(previous ?? NUL_GBUF_GLYPH, current)
            && !previousGnew)) {
        return false;
    }

    const oldKind = previous?.a11yKind
        ?? glyphNumberKind(previous?.glyph)
        ?? (previous ? 'other' : 'unexplored');
    const newKind = current?.a11yKind ?? 'other';
    const eligible = oldKind === 'nothing'
        || oldKind === 'unexplored'
        || newKind === 'furniture';
    if (!eligible
        || newKind === 'wall'
        || newKind === 'room'
        || (a11y.mon_notices && newKind === 'monster')
        || oldKind === 'monster'
        || (state.u?.ux === x && state.u?.uy === y)) {
        return false;
    }

    const description = describeGlyphUpdate(current, x, y, state);
    if (!description) return false;
    const message = description.aborted ? null : messageAt(
        `${description.firstmatch}.`,
        x,
        y,
        state,
        true,
    );
    // An aborted description ends the process inside C's show_glyph(); the
    // port ends it when the queue drains to this notice, after the notices
    // before it have printed.
    queueNoticeLine({
        x,
        y,
        previous,
        current,
        ...(description.aborted ? { abort: true } : { message }),
        visionSpent: true,
    }, state, { nestedLocation: true });
    return true;
}

// The one way onto the notice queue: every line C prints from code the port
// runs synchronously joins it here, as the pline.c vpline() call it is.
//
// vpline() (266-274) spends a pending vision recalculation and then
// flushes the screen before it prints the line, and the code after the line
// reads the recalculated vision and may change what the status rows show.
// Neither step can wait for the drain, so tty_message.js queuedVpline() takes
// both now: the recalculation's own notices queue ahead of this one, as C
// prints them first, and the notice keeps the map and the status rows as
// that flush left them. emitGlyphUpdateNotices() prints the line over both.
// scripts/queued-notice-status.test.mjs checks that nothing else pushes.
//
// `recalc` is false for the lines vision_recalc() itself raises.
// `nestedLocation` is display.c show_glyph() (2066-2070) raising
// a11y.accessiblemsg around its pline_xy(): hack.c notice_mon() lines that
// the nested recalculation prints carry their location prefix whether or
// not the option is set.
function queueNoticeLine(
    notice, state, { recalc = true, nestedLocation = false } = {},
) {
    // A line queued while the queue drains (a recalculation inside a
    // drained line's print raises one) would draw its status into the rows
    // the drain has swapped in and then puts back, so its flush is left to
    // its own print.
    const status = !state._emittingGlyphUpdateNotices;
    if (notice.message != null) {
        const last = state._glyphUpdateNotices?.at(-1);
        const a11y = state.a11y;
        const accessiblemsg = a11y?.accessiblemsg;
        if (nestedLocation && a11y) a11y.accessiblemsg = true;
        try {
            queuedVpline(
                notice.message,
                last && !last.impossible ? last.message : null,
                state,
                { recalc, status },
            );
        } finally {
            if (nestedLocation && a11y) a11y.accessiblemsg = accessiblemsg;
        }
    }
    notice.glyphFrame = takeNoticeGlyphFrame(state);
    notice.statusFrame = status ? takeNoticeStatusFrame(state) : null;
    (state._glyphUpdateNotices ??= []).push(notice);
    state._flushAfterQueuedNotice = null;
}

// The terminal's status rows (wintty.js tty_status_state().screen) as the
// notice's own flush left them. wintty.js replaces a cell when it writes
// one, so a copy of each row is a whole snapshot.
function takeNoticeStatusFrame(state) {
    if (state !== game) return null;
    return tty_status_state(state).screen.map((row) => row.slice());
}

function takeNoticeGlyphFrame(state) {
    let glyphFrame;
    const frameTracker = state._glyphNoticeFrameTracker;
    if (frameTracker) {
        glyphFrame = { changes: frameTracker.pending };
        frameTracker.pending = new Map();
    } else {
        glyphFrame = { base: captureGlyphBuffer(state) };
        state._glyphNoticeFrameTracker = { pending: new Map() };
    }
    return glyphFrame;
}

// C vision.c vision_recalc() ends with hack.c notice_all_mons(TRUE).
// Capture its messages on the existing source-ordered TTY frame queue; the
// async emitter drains it before later messages or monster movement.
// Queueing returns nothing, so js/hack.js notice_all_mons() returns
// synchronously here.
export function queueVisionMonsterNotices(state) {
    notice_all_mons(true, state, {
        message: (message) => {
            queueNoticeLine(
                { message, youBuf: NOTICE_MON_YOU_BUF }, state, { recalc: false });
        },
    });
}

// hack.c notice_mon() prints through You("%s %s.", ...), which leaves this
// text in pline.c's gy.you_buf (js/tty_message.js reads it back).
const NOTICE_MON_YOU_BUF = 'You %s %s.';

// C ref: pline.c impossible() (584-633), called from code the port runs
// synchronously: objnam.c doname() reaching shk.c unpaid_cost(), for one.
// C prints the report at once, inside the calling function, and its
// vpline() flushes the map as it stood then. The port cannot wait for the
// print there, so the report joins this queue with the frame of that moment,
// and emitGlyphUpdateNotices() prints it through impossible() at the next
// drain: before the next message, menu, text window or prompt
// (js/tty_message.js emitQueuedNotices()), and at the command loop's turn
// boundaries. A synchronous port of C code that calls impossible() reports
// through source_steps.js sync_impossible(), which calls this.
// The notice fields of a projected copy of the game state, one that plans
// an action without performing it (invent.js preflight_addinv_sequence(),
// hack.js's projected arrival pickup). C runs that code once, for real; a
// report the projection's synchronous code raises, such as shk.c
// same_price()'s for an unpaid stack on no bill, goes to this queue of its
// own and is discarded with the copy instead of printing twice.
export function projectionNoticeFields() {
    return { _glyphUpdateNotices: [], _glyphNoticeFrameTracker: null };
}

export function queueImpossibleNotice(text, state) {
    // impossible() prints its first line through pline() with
    // gp.pline_flags = URGENT_MESSAGE (pline.c:603-605), and that vpline()
    // (266-272) spends a pending vision recalculation before it prints, as
    // queueGlyphUpdateNotice()'s does: the code after the report reads the
    // recalculated vision, and the recalculation's own notices queue first.
    const gp = state.gp ??= {};
    const pline_flags = gp.pline_flags;
    gp.pline_flags = URGENT_MESSAGE;
    try {
        queueNoticeLine(
            { message: text, impossible: true, visionSpent: true }, state);
    } finally {
        gp.pline_flags = pline_flags;
    }
}

export async function emitGlyphUpdateNotices(state, env = {}) {
    const pline = env.pline ?? ttyPline;
    if (state._emittingGlyphUpdateNotices) return [];
    const pending = state._glyphUpdateNotices?.splice(0) ?? [];
    if (!pending.length) return [];

    const finalBuffer = captureGlyphBuffer(state);
    state._glyphNoticeFrameTracker = null;
    let lastFlushedIndex = -1;
    const dirty = dirtyGlyphBufferCells(pending[0].glyphFrame.base);
    // Each line prints over the status rows its own flush left when it was
    // queued; the rows the terminal holds now come back when the queue is
    // empty, and the status marked dirty since waits for the next flush.
    const status = state === game ? tty_status_state(state) : null;
    const finalStatus = status?.screen.slice();
    state._emittingGlyphUpdateNotices = true;
    try {
        restoreGlyphBuffer(state, pending[0].glyphFrame.base);
        for (let index = 0; index < pending.length; ++index) {
            const notice = pending[index];
            if (index)
                applyGlyphFrameChanges(state, notice.glyphFrame.changes, dirty);
            if (status && notice.statusFrame) {
                notice.statusFrame.forEach((row, at) => {
                    status.screen[at] = row;
                });
            }
            if (notice.abort) await NH_abort(state);
            if (notice.youBuf) (state.gy ??= {}).you_buf = notice.youBuf;
            // queueGlyphUpdateNotice() ran this line's vpline() vision
            // recalculation when it queued the line.
            state._queuedNoticeVisionSpent = Boolean(notice.visionSpent);
            // queueNoticeLine() took this line's status step too
            // (display.js flush_screen() reads the mark).
            state._queuedNoticeStatusSpent = Boolean(notice.statusFrame);
            if (notice.impossible) await impossible(notice.message, state);
            else await pline(notice.message, state);
            state._queuedNoticeVisionSpent = false;
            state._queuedNoticeStatusSpent = false;
            lastFlushedIndex = index;
            // ttyPline() normally performed this flush itself. Keep injected
            // callbacks and subsequent sparse frames source-equivalent too.
            markGlyphFrameFlushed(state, dirty);
        }
    } finally {
        restoreGlyphBuffer(state, finalBuffer);
        if (lastFlushedIndex >= 0) {
            reconcileFinalGlyphBuffer(
                state,
                finalBuffer,
                materializeGlyphFrame(pending, lastFlushedIndex),
            );
        }
        if (finalStatus) {
            finalStatus.forEach((row, at) => {
                status.screen[at] = row;
            });
        }
        state._emittingGlyphUpdateNotices = false;
        state._queuedNoticeVisionSpent = false;
        state._queuedNoticeStatusSpent = false;
    }
    // The notices' own lines flushed the map as it stood when each arose.
    // C then flushed the later map again before this point; do the same.
    const flushMode = state._flushAfterQueuedNotice;
    state._flushAfterQueuedNotice = null;
    // flush_screen() draws the live game only.
    if (flushMode != null && state === game) await flush_screen(flushMode);
    return pending.map((notice) => notice.message);
}

function indefiniteArticle(text) {
    const lower = lcase(text);
    if (/^(?:uni(?:corn|form)|use|ewe|one\b)/u.test(lower)) return 'a';
    if (/^(?:hour|honest|heir)/u.test(lower)) return 'an';
    return /^[aeiou]/u.test(lower) ? 'an' : 'a';
}

function speciesName(monster) {
    const names = monster.data?.pmnames ?? [];
    return names[monster.female ? 1 : 0] ?? names[2] ?? 'monster';
}


export function monsterSurfaceDescription(monster, state) {
    const x = monster.mx;
    const y = monster.my;
    const location = state.level?.at(x, y);
    if (!location) return 'floor';
    const typ = surfaceType(location);
    if (typ === AIR || typ === CLOUD) {
        if (sameLevel(state.u?.uz, state.water_level)) return 'air bubble';
        return typ === CLOUD ? 'cloud' : 'air';
    }
    if ([POOL, MOAT, WATER].includes(typ))
        return state.u?.uinwater
            && !sameLevel(state.u?.uz, state.water_level)
            ? 'bottom' : hliquid('water', { state });
    if (typ === ICE) return 'ice';
    if ([LAVAPOOL, LAVAWALL].includes(typ))
        return hliquid('lava', { state });
    if (typ === DRAWBRIDGE_DOWN) return 'bridge';
    if (typ === ALTAR) return 'altar';
    if (typ === GRAVE) return 'headstone';
    if (typ === FOUNTAIN) return 'fountain';
    if ([STAIRS, LADDER].includes(typ)) return 'stairs';
    if (IS_WALL(typ) || typ === SDOOR) return 'wall';
    if (typ === DOOR) return 'doorway';
    return IS_ROOM(typ) && !sameLevel(state.u?.uz, state.earth_level)
        ? 'floor' : 'ground';
}

// Distinguish three buffered-subject states. Present null or non-object
// metadata blocks inference. With hero memory, absent remembered data or a
// remembered glyph without the sidecar permits the legacy mimic fallback. A
// live glyph in no-memory mode never falls back because it is the current
// display source.
export function bufferedGlyphSubjectAt(monster, state) {
    const location = state.level?.at(
        monster.mx,
        monster.my,
    );
    const glyph = state.level?.flags?.hero_memory === false
        ? glyph_buffer_at(monster.mx, monster.my, state)?.glyphinfo
        : location?.remembered_glyph;
    return {
        hasGlyph: Boolean(glyph),
        hasSubject: Boolean(glyph)
            && Object.hasOwn(glyph, 'a11ySubject'),
        subject: glyph?.a11ySubject ?? null,
    };
}

export function bufferedObjectSubjectAt(monster, state) {
    const bufferedGlyph = bufferedGlyphSubjectAt(monster, state);
    const buffered = bufferedGlyph.subject;
    if (buffered?.type === 'object') return buffered;
    if (bufferedGlyph.hasSubject) return null;
    // pager.c:mhidden_description() only enters object_from_map() when the
    // remembered glyph is an object. An unexplored square is represented by
    // no remembered glyph in this port, so its source fallback is literally
    // `something`, not an object synthesized from mappearance.
    if (!bufferedGlyph.hasGlyph) return null;
    if (state.level?.flags?.hero_memory === false) return null;

    // display_monster() sends a zeroobj through obj_to_glyph(). Gems and
    // ordinary spellbooks satisfy obj_is_generic() by type, but zeroobj's
    // class is zero, so their buffered glyph decodes as STRANGE_OBJECT.
    const mappearance = monster.mappearance;
    const zeroClassGeneric = (mappearance >= FIRST_REAL_GEM
            && mappearance <= LAST_GLASS_GEM)
        || (mappearance >= FIRST_SPELL && mappearance <= LAST_SPELL);
    const otyp = zeroClassGeneric ? STRANGE_OBJECT : mappearance;
    return {
        type: 'object',
        generic: false,
        otyp,
        oclass: state.objects?.[otyp]?.oc_class,
        corpsenm: monster.mextra?.mcorpsenm,
    };
}

// describe is synchronous and may return derived data but must not retain its
// argument. Synthetic objects are deallocated as soon as it returns; live
// objects remain owned by the level.
export function withBufferedObject(subject, x, y, state, describe) {
    const resolved = objectFromBufferedGlyph(subject, x, y, state);
    try {
        return describe(resolved.object);
    } finally {
        if (resolved.ownership === 'synthetic') {
            resolved.object.where = OBJ_FREE;
            dealloc_obj(resolved.object, resolved.env);
        }
    }
}

function simpleObjectName(object, state) {
    const name = minimalObjectBaseName(object, state);
    return Math.trunc(object.quan ?? 1) === 1
        ? name : pluralObjectName(object, name);
}

export function hiddenObjectPhrase(object, state, { includeArticle = true } = {}) {
    const name = simpleObjectName(object, state);
    if (!includeArticle || Math.trunc(object.quan ?? 1) !== 1) return name;
    return `${just_an(name)}${name}`;
}

export function furnitureDescription(symbol) {
    switch (symbol) {
    case S_ndoor: return 'doorway';
    case S_vodoor:
    case S_hodoor: return 'open door';
    case S_vcdoor:
    case S_hcdoor: return 'closed door';
    case S_upstair: return 'staircase up';
    case S_dnstair: return 'staircase down';
    case S_upladder: return 'ladder up';
    case S_dnladder: return 'ladder down';
    case S_brupstair: return 'branch staircase up';
    case S_brdnstair: return 'branch staircase down';
    case S_brupladder: return 'branch ladder up';
    case S_brdnladder: return 'branch ladder down';
    case S_altar: return 'altar';
    case S_grave: return 'grave';
    case S_throne: return 'opulent throne';
    case S_sink: return 'sink';
    case S_fountain: return 'fountain';
    case S_vodbridge:
    case S_hodbridge: return 'lowered drawbridge';
    case S_vcdbridge:
    case S_hcdbridge: return 'raised drawbridge';
    case S_engroom:
    case S_engrcorr: return 'engraving';
    default: return null;
    }
}

function drawbridgeMask(location) {
    return location?.flags ?? 0;
}

function doorDescription(location, x, y, state) {
    if (is_drawbridge_wall(x, y, state) >= 0)
        return 'open drawbridge portcullis';
    const mask = location.flags;
    if ((mask & ~D_TRAPPED) === D_BROKEN) return 'broken door';
    if (!mask) return 'doorway';
    if (mask & D_ISOPEN) return 'open door';
    if (mask & (D_CLOSED | D_LOCKED)) return 'closed door';
    return 'doorway';
}

function sameLevel(left, right) {
    return Boolean(left && right
        && left.dnum === right.dnum
        && left.dlevel === right.dlevel);
}

function adjacentToHero(x, y, state) {
    const dx = x - (state.u?.ux ?? 0);
    const dy = y - (state.u?.uy ?? 0);
    return dx * dx + dy * dy <= 2;
}

function surfaceType(location) {
    if (location?.typ !== DRAWBRIDGE_UP) return location?.typ;
    switch (drawbridgeMask(location) & DB_UNDER) {
    case DB_ICE: return ICE;
    case DB_LAVA: return LAVAPOOL;
    case DB_MOAT: return MOAT;
    case DB_FLOOR:
    default:
        return STONE;
    }
}

function altarDescription(location, x, y, state) {
    const mask = location.flags ?? 0;
    const hiddenAstralAlignment = (mask & AM_SANCTUM)
        && sameLevel(state.u?.uz, state.astral_level)
        && !adjacentToHero(x, y, state);
    const alignment = hiddenAstralAlignment ? 'aligned'
        : (mask & AM_MASK) === AM_LAWFUL ? 'lawful'
        : (mask & AM_MASK) === AM_NEUTRAL ? 'neutral'
            : (mask & AM_MASK) === AM_CHAOTIC ? 'chaotic' : 'unaligned';
    return `${alignment} ${mask & AM_SANCTUM ? 'high ' : ''}altar`;
}

function waterbodyDescription(x, y, state) {
    return waterbody_name(x, y, state);
}

function terrainDescription(location, x, y, state) {
    switch (location.typ) {
    case DOOR: return doorDescription(location, x, y, state);
    case STAIRS: return location.flags & LA_DOWN
        ? 'staircase down' : 'staircase up';
    case LADDER: return location.flags & LA_DOWN ? 'ladder down' : 'ladder up';
    case ALTAR: return altarDescription(location, x, y, state);
    case GRAVE: return 'grave';
    case THRONE: return 'opulent throne';
    case SINK: return 'sink';
    case FOUNTAIN: return 'fountain';
    case DRAWBRIDGE_DOWN: return 'lowered drawbridge';
    case DRAWBRIDGE_UP: return 'raised drawbridge';
    case POOL:
    case MOAT:
    case ICE:
    case LAVAPOOL:
    case LAVAWALL:
    case WATER:
        return waterbodyDescription(x, y, state);
    case IRONBARS: return 'iron bars';
    case TREE: return 'tree';
    case CORR: return 'corridor';
    default: return null;
    }
}

function cmapDescription(symbol, x, y, state) {
    const location = state.level?.at(x, y);
    if (symbol === S_altar && location?.typ === ALTAR)
        return altarDescription(location, x, y, state);
    if (symbol === S_ndoor
        && [DOOR, DBWALL].includes(location?.typ)) {
        return doorDescription(location, x, y, state);
    }
    if ([S_vodoor, S_hodoor, S_vcdoor, S_hcdoor].includes(symbol)
        && location?.typ === DOOR) {
        return [S_vodoor, S_hodoor].includes(symbol)
            ? 'open door' : 'closed door';
    }
    if ([S_pool, S_water, S_lava, S_lavawall, S_ice].includes(symbol)) {
        return waterbodyDescription(x, y, state);
    }
    const furniture = furnitureDescription(symbol);
    if (furniture) return furniture;
    switch (symbol) {
    case S_bars: return 'iron bars';
    case S_tree: return 'tree';
    case S_room: return 'floor of a room';
    case S_darkroom:
    case S_stone: return 'dark part of a room';
    case S_corr: return 'corridor';
    case S_litcorr: return 'lit corridor';
    case S_pool:
    case S_ice:
    case S_lava:
    case S_lavawall:
    case S_water:
        return waterbodyDescription(x, y, state);
    case S_air: return 'air';
    case S_cloud: return sameLevel(state.u?.uz, state.air_level)
        ? 'cloudy area' : 'fog/vapor cloud';
    case S_poisoncloud: return 'poison cloud';
    default: return null;
    }
}

function objectBaseName(object, state) {
    const type = state.objects?.[object.otyp];
    if (!type) return 'strange object';
    if (object.otyp === SLIME_MOLD)
        return fruit_from_indx(object.spe, state)?.fname ?? 'fruit';
    const identifiableWithoutCloseLook = object.oclass === COIN_CLASS
        || object.otyp === BOULDER
        || object.otyp === CORPSE
        || object.otyp === STATUE;
    if (!object.dknown && object.oclass === GEM_CLASS)
        return type.oc_material === MINERAL ? 'stone' : 'gem';
    if (!object.dknown && !identifiableWithoutCloseLook)
        return OBJECT_CLASS_NAMES[object.oclass] ?? 'object';

    const actual = OBJ_NAME(type, state) ?? 'object';
    const appearance = OBJ_DESCR(type, state);
    const nameKnown = Boolean(type.oc_name_known);
    switch (object.oclass) {
    case POTION_CLASS:
        return nameKnown ? `potion of ${actual}`
            : appearance ? `${appearance} potion` : 'potion';
    case SCROLL_CLASS:
        return nameKnown ? `scroll of ${actual}`
            : appearance ? `scroll labeled ${appearance}` : 'scroll';
    case SPBOOK_CLASS:
        return nameKnown ? `spellbook of ${actual}`
            : appearance ? `${appearance} spellbook` : 'spellbook';
    case WAND_CLASS:
        return nameKnown ? `wand of ${actual}`
            : appearance ? `${appearance} wand` : 'wand';
    case RING_CLASS:
        return nameKnown ? `ring of ${actual}`
            : appearance ? `${appearance} ring` : 'ring';
    case AMULET_CLASS:
        return nameKnown ? actual : appearance ? `${appearance} amulet` : 'amulet';
    case GEM_CLASS:
        if (nameKnown) return actual;
        if (!appearance) return 'gem';
        return object.otyp >= FIRST_REAL_GEM
            && object.otyp <= LAST_GLASS_GEM
            ? `${appearance} gem` : `${appearance} stone`;
    case FOOD_CLASS:
        if (object.otyp === CORPSE && state.mons?.[object.corpsenm])
            return `${state.mons[object.corpsenm].pmnames?.[2] ?? 'monster'} corpse`;
        return actual;
    case ROCK_CLASS:
        if (object.otyp === STATUE && state.mons?.[object.corpsenm])
            return `statue of ${indefiniteArticle(
                state.mons[object.corpsenm].pmnames?.[2] ?? 'monster',
            )} ${state.mons[object.corpsenm].pmnames?.[2] ?? 'monster'}`;
        return actual;
    default:
        return nameKnown || !appearance ? actual : appearance;
    }
}

// C ref: objnam.c minimal_xname(). Hidden-monster descriptions deliberately
// suppress corpse and statue species while retaining a slime mold's fruit.
function minimalObjectBaseName(object, state) {
    if (object.otyp === CORPSE || object.otyp === STATUE) {
        const type = state.objects?.[object.otyp];
        return OBJ_NAME(type, state)
            ?? (object.otyp === CORPSE ? 'corpse' : 'statue');
    }
    return objectBaseName(object, state);
}

function pluralObjectName(object, name) {
    return makeplural(
        object.otyp === SLIME_MOLD ? makesingular(name) : name,
    );
}

function objectDamageModifiers(object, type) {
    if (!type) return '';
    const material = type?.oc_material ?? 0;
    const rustProne = material === IRON;
    const crackable = material === GLASS && object.oclass === ARMOR_CLASS;
    const corrodeable = material === COPPER || material === IRON;
    const candle = object.otyp === TALLOW_CANDLE || object.otyp === WAX_CANDLE;
    const flammable = !candle && type?.oc_oprop !== FIRE_RES
        && object.otyp !== WAN_FIRE
        && ((material <= WOOD && material !== LIQUID) || material === PLASTIC);
    const rottable = (material <= WOOD && material !== LIQUID)
        || material === DRAGON_HIDE;
    const damageable = rustProne || crackable || corrodeable
        || flammable || rottable;
    if (!damageable) return '';

    const severity = (amount) => amount === 2 ? 'very '
        : amount === 3 ? 'thoroughly ' : '';
    let result = '';
    if (object.oeroded) {
        result += severity(object.oeroded);
        result += rustProne ? 'rusty ' : crackable ? 'cracked ' : 'burnt ';
    }
    if (object.oeroded2) {
        result += severity(object.oeroded2);
        result += corrodeable ? 'corroded ' : 'rotted ';
    }
    return result;
}

// pager.c:object_from_map() matches live floor and buried objects by otyp only;
// the buffered corpse species or other instance fields do not refine lookup.
function objectMatchesBufferedObjectType(object, subject) {
    if (!object) return false;
    // Generic glyphs encode their class in glyph_to_obj(), and no live
    // object uses those reserved pre-FIRST_OBJECT type slots.
    if (subject.generic) return false;
    return object.otyp === subject.otyp;
}

function observeBufferedObject(object, synthetic, x, y, state) {
    const dx = x - state.u.ux;
    const dy = y - state.u.uy;
    if (dx * dx + dy * dy <= 2
        && !Blind(state.u)
        && !Hallucination(state.u)
        && (synthetic || object.where === OBJ_FLOOR)
        && !state.iflags?.terrainmode) {
        observe_object(object, state);
    }
}

// C ref: pager.c object_from_map(). The rendered object used to choose a
// glyph is not necessarily the semantic object being described: hallucination
// and object-shaped mimics reconstruct from buffered identity and map state.
// The ownership tag mirrors object_from_map()'s fakeobj return and lets
// withBufferedObject() clean up synthetic results instead of treating them as
// linked game state.
function objectFromBufferedGlyph(subject, x, y, state) {
    let object = state.level?.objects?.[x]?.[y] ?? null;
    while (object && !objectMatchesBufferedObjectType(object, subject))
        object = object.nexthere;
    if (!object) {
        for (let buried = state.level?.buriedobjlist
                ?? state.buriedobjlist ?? null;
            buried;
            buried = buried.nobj) {
            if (buried.ox === x && buried.oy === y
                && objectMatchesBufferedObjectType(buried, subject)) {
                object = buried;
                break;
            }
        }
    }

    const monster = m_at(x, y, state);
    const mimicMatches = Boolean(
        monster
        && (monster.m_ap_type & M_AP_TYPMASK) === M_AP_OBJECT
        && !subject.generic
        && monster.mappearance === subject.otyp,
    );
    const mimicCorpsenm = mimicMatches
        && Number.isInteger(monster.mextra?.mcorpsenm)
        && monster.mextra.mcorpsenm >= 0
        ? monster.mextra.mcorpsenm
        : null;
    if (mimicMatches) object = null;
    if (object) {
        observeBufferedObject(object, false, x, y, state);
        return { object, ownership: 'live' };
    }

    const env = objectGenerationEnv({ state });
    object = subject.generic
        ? mkobj(subject.oclass, false, env)
        : mksobj(subject.otyp, false, false, env);
    if (object.timed) obj_stop_timers(object, state, env);
    if (object.oclass === COIN_CLASS) object.quan = 2;
    else if (object.otyp === SLIME_MOLD)
        object.spe = state.context?.current_fruit ?? 0;
    if (mimicCorpsenm != null) {
        if (object.otyp === SLIME_MOLD)
            object.spe = mimicCorpsenm;
        else
            object.corpsenm = mimicCorpsenm;
    } else if ((object.otyp === CORPSE || object.otyp === STATUE)
               && subject.corpsenm != null) {
        object.corpsenm = subject.corpsenm;
    }
    if (object.otyp === LEASH) object.leashmon = 0;
    object.where = OBJ_FLOOR;
    object.ox = x;
    object.oy = y;
    observeBufferedObject(object, true, x, y, state);
    if (mimicMatches
        && (object.dknown || (monster.m_ap_type & M_AP_F_DKNOWN))) {
        monster.m_ap_type |= M_AP_F_DKNOWN;
        observe_object(object, state);
    }
    return { object, ownership: 'synthetic', env };
}

function describeObject(object, state) {
    const quantity = Math.trunc(object.quan ?? 1);
    const dx = Math.trunc(object.ox ?? 0) - state.u.ux;
    const dy = Math.trunc(object.oy ?? 0) - state.u.uy;
    const near = dx * dx + dy * dy <= 6;
    const vagueQuantity = quantity !== 1 && !object.dknown && !near;
    if (near) object.dknown = true;
    const type = state.objects?.[object.otyp];
    const modifiers = `${object.greased ? 'greased ' : ''}`
        + objectDamageModifiers(object, type);
    const name = objectBaseName(object, state);
    const base = `${modifiers}${name}`;
    if (quantity !== 1) {
        const plural = `${modifiers}${pluralObjectName(object, name)}`;
        return `${vagueQuantity ? 'some' : quantity} ${plural}`;
    }
    const artifactFruit = object.otyp === SLIME_MOLD
        ? matching_artifact_fruit(name, state) : null;
    if (artifactFruit?.forceThe)
        return `the ${modifiers}${strncmpi(name, 'the ', 4) === 0 ? name.slice(4) : name}`;
    if (artifactFruit) return base;
    return `${indefiniteArticle(base)} ${base}`;
}

// Stateful pager.c:do_screen_description() boundary. Object reconstruction can
// consume gameplay RNG and update discoveries; hallucinated descriptions can
// consume display RNG. queueGlyphUpdateNotice() must call this exactly once
// while queuing and cache the resulting notice text for later emission.
function describeGlyphUpdate(glyph, x, y, state) {
    // display.c show_glyph() asks do_screen_description() for firstmatch
    // after installing the new glyph. Keep that call single and source-order
    // aligned so generic aliases and location refinement share the same
    // object/display-RNG effects as ordinary farlook.
    const description = do_screen_description(
        { x, y }, true, 0, state,
    );
    return description.aborted || description.found ? description : null;
}

function visibleSubjectAt(x, y, state) {
    const location = state.level?.at(x, y);
    if (!location || !cansee(x, y, state)) return null;
    if (!Number.isInteger(glyph_buffer_at(x, y, state).glyphinfo?.glyph))
        return null;
    // C cmd.c:dolookaround() filters the displayed glyph through
    // getpos.c:gather_locs_interesting(), regardless of live objects,
    // traps, engravings, or monster furniture at the square.  In particular,
    // a hidden object under water must not force waterbody_name() or display
    // RNG merely because the live object list is nonempty.
    if (!gather_locs_interesting(x, y, GLOC_INTERESTING, state)) return null;

    // cmd.c:dolookaround() asks do_screen_description() for each interesting
    // square. Keep the visibility and interest filter local to this scan,
    // then use the pager's complete generic collection and lookat refinement
    // so this caller cannot drift from the ordinary what-is path.
    const description = do_screen_description({ x, y }, true, 0, state);
    return description.aborted || description.found ? description : null;
}

export function collectLookaroundMessages(state) {
    const messages = [];
    const { ux, uy } = state.u;
    const heroLocation = state.level?.at(ux, uy);
    // cmd.c dolookaround() 1318-1337 sets this in a corridor and in a
    // doorway. Its room descriptions are js/cmd.js lookaround_known_room().
    const mentionAdjacentCorridors
        = heroLocation?.typ === CORR || heroLocation?.typ === DOOR;

    for (let y = 0; y < ROWNO; ++y) {
        for (let x = 1; x < COLNO; ++x) {
            if (x === ux && y === uy) continue;
            let description = visibleSubjectAt(x, y, state);
            if (!description && mentionAdjacentCorridors) {
                const glyph = glyph_at(x, y, state);
                const cmap = glyph_is_cmap(glyph)
                    ? glyph_to_cmap(glyph) : -1;
                if (cmap === S_corr || cmap === S_litcorr) {
                    const corridorDescription = do_screen_description(
                        { x, y }, true, 0, state,
                    );
                    if (corridorDescription.aborted
                        || corridorDescription.found)
                        description = corridorDescription;
                }
            }
            // C prints each square's line before describing the next, so
            // an abort there follows the lines already collected; the
            // caller prints them, then calls NH_abort().
            if (description?.aborted) {
                messages.aborted = true;
                return messages;
            }
            if (description) {
                messages.push(messageAt(
                    `${description.firstmatch}.`, x, y, state, true,
                ));
            }
        }
    }
    return messages;
}


function singularMovementVerb(species) {
    const verb = locomotion(species, 'move');
    const last = lcase(verb.at(-1));
    const prior = lowc(verb.at(-2) ?? '');
    if ('zxs'.includes(last)
        || (last === 'h' && 'cs'.includes(prior))) {
        return `${verb}es`;
    }
    if (last === 'y' && !'aeiou'.includes(prior))
        return `${verb.slice(0, -1)}ies`;
    return `${verb}s`;
}

// C ref: monmove.c msg_mon_movement(). The old and new squared distances
// are measured from the hero's current square after the command.
export function collectMonsterMovementMessage(
    monster,
    oldX,
    oldY,
    state,
) {
    if (!state.a11y?.mon_movement
        || !canspotmon(monster, state)
        || !monster.mspotted) {
        return null;
    }

    const dx = monster.mx - state.u.ux;
    const dy = monster.my - state.u.uy;
    const distance = dx * dx + dy * dy;
    const oldDx = oldX - state.u.ux;
    const oldDy = oldY - state.u.uy;
    const oldDistance = oldDx * oldDx + oldDy * oldDy;
    const nextToHero = distance <= 2;
    const close = !nextToHero && distance <= BOLT_LIM * BOLT_LIM;
    const suffix = nextToHero
        ? ' next to you'
        : close
            ? distance <= oldDistance ? ' closer' : ' further away'
            : ' in the distance';
    // C Monnam draws from the active cosmetic stream, that of the state the
    // message is about.
    return messageAt(
        `${Monnam(monster, state, {
            displayRandom: bound => rn2_on_display_rng(bound, state),
        })} `
            + `${singularMovementVerb(monster.data)}${suffix}.`,
        monster.mx,
        monster.my,
        state,
    );
}

export const _startupA11yInternals = Object.freeze({
    compassDescription,
    coordinateDescription,
    describeObject,
    terrainDescription,
    visibleSubjectAt,
});
