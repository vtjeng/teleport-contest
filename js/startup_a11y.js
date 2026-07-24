// Startup accessibility notices.
// C refs: allmain.c:newgame(); cmd.c:dolookaround();
// hack.c:notice_all_mons(); getpos.c:coord_desc().

import {
    ALTAR,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_MASK,
    AM_NEUTRAL,
    AM_SANCTUM,
    BLINDED,
    COLNO,
    COULD_SEE,
    CORR,
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
    GRAVE,
    HALLUC,
    HALLUC_RES,
    ICE,
    IRONBARS,
    INFRAVISION,
    IS_POOL,
    LADDER,
    LAVAPOOL,
    LAVAWALL,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    MOAT,
    POOL,
    ROOM,
    ROOMOFFSET,
    ROWNO,
    SCORR,
    SDOOR,
    SINK,
    STAIRS,
    STRAT_WAITMASK,
    THRONE,
    TREE,
    DETECT_MONSTERS,
    FIRE_RES,
    SEE_INVIS,
    TELEPAT,
    WARN_OF_MON,
    WATER,
    W_SADDLE,
    def_warnsyms,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    LA_DOWN,
    isok,
} from './const.js';
import { cansee } from './vision.js';
import { engr_at } from './engrave.js';
import { t_at } from './trap.js';
import { visible_region_at } from './region.js';
import { rndmonnam } from './do_name.js';
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
    GEM_CLASS,
    GLASS,
    ILLOBJ_CLASS,
    IRON,
    LIQUID,
    OBJ_DESCR,
    OBJ_NAME,
    POTION_CLASS,
    PLASTIC,
    RING_CLASS,
    ROCK_CLASS,
    SCROLL_CLASS,
    SPBOOK_CLASS,
    STATUE,
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
import { M1_MINDLESS } from './monsters.js';
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
    const configured = state.iflags?.getpos_coords ?? GPCOORDS_NONE;
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

function messageAt(text, x, y, state, forceLocation = false) {
    if (forceLocation || state.a11y?.accessiblemsg) {
        return `${coordinateDescription(x, y, state)}: ${text}`;
    }
    return text;
}

function sameGlyphIdentity(left, right) {
    if (!left || !right) return left === right;
    if (left.a11yIdentity != null || right.a11yIdentity != null)
        return left.a11yIdentity === right.a11yIdentity;
    // Hand-authored presentations have no source glyph number. Matching
    // categories and recorder characters are the best logical identity
    // available; presentation-only color, attribute, UTF-8, and RGB changes
    // do not satisfy display.c's oldglyph != glyph test.
    return left.a11yKind === right.a11yKind && left.ch === right.ch;
}

const GLYPH_BUFFER_FIELDS = Object.freeze([
    'disp_ch',
    'disp_color',
    'disp_decgfx',
    'disp_attr',
    'disp_browser_ch',
    'disp_browser_color',
    'disp_browser_attr',
    'disp_glyph',
    'gnew',
]);

function clonePresentation(glyph) {
    if (!glyph) return glyph;
    const clone = { ...glyph };
    if (glyph.rgb) clone.rgb = [...glyph.rgb];
    for (const field of ['a11yIdentity', 'a11ySubject']) {
        if (glyph[field] !== undefined) {
            Object.defineProperty(clone, field, {
                configurable: true,
                value: glyph[field],
            });
        }
    }
    return clone;
}

function captureGlyphBuffer(state) {
    const snapshot = [];
    for (let x = 1; x < COLNO; ++x) {
        snapshot[x] = [];
        for (let y = 0; y < ROWNO; ++y) {
            const location = state.level?.at(x, y);
            if (!location) continue;
            snapshot[x][y] = {
                disp_ch: location.disp_ch,
                disp_color: location.disp_color,
                disp_decgfx: location.disp_decgfx,
                disp_attr: location.disp_attr,
                disp_browser_ch: location.disp_browser_ch,
                disp_browser_color: location.disp_browser_color,
                disp_browser_attr: location.disp_browser_attr,
                disp_glyph: clonePresentation(location.disp_glyph),
                gnew: location.gnew,
            };
        }
    }
    return snapshot;
}

function sameBufferedPresentation(left, right) {
    if (!left || !right) return left === right;
    for (const field of GLYPH_BUFFER_FIELDS) {
        if (field === 'gnew') continue;
        if (field !== 'disp_glyph') {
            if (left[field] !== right[field]) return false;
            continue;
        }
        const leftGlyph = left.disp_glyph;
        const rightGlyph = right.disp_glyph;
        if (!leftGlyph || !rightGlyph) {
            if (leftGlyph !== rightGlyph) return false;
            continue;
        }
        const scalarMatch = [
            'ch',
            'color',
            'dec',
            'attr',
            'displayCh',
            'displayColor',
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

function restoreGlyphBuffer(state, snapshot, cleanAgainst = null) {
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const location = state.level?.at(x, y);
            const saved = snapshot?.[x]?.[y];
            if (!location || !saved) continue;
            for (const field of GLYPH_BUFFER_FIELDS) {
                location[field] = field === 'disp_glyph'
                    ? clonePresentation(saved[field])
                    : saved[field];
            }
            if (cleanAgainst
                && sameBufferedPresentation(saved, cleanAgainst[x]?.[y])) {
                location.gnew = 0;
            }
        }
    }
}

// C ref: display.c show_glyph(). The caller invokes this after installing the
// presentation, matching show_glyph()'s gbuf update before
// do_screen_description() and pline_xy(). Saving that buffer preserves an
// intermediate disguise even though JavaScript performs message I/O later.
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
        || (sameGlyphIdentity(previous, current) && !previousGnew)) {
        return false;
    }

    const oldKind = previous?.a11yKind
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
    const notice = {
        x,
        y,
        previous,
        current,
        message: messageAt(
            `${description}.`,
            x,
            y,
            state,
            true,
        ),
        glyphBuffer: captureGlyphBuffer(state),
    };
    (state._glyphUpdateNotices ??= []).push(notice);
    return true;
}

export async function emitGlyphUpdateNotices(state, env = {}) {
    const pline = env.pline;
    if (typeof pline !== 'function') {
        throw new TypeError(
            'emitGlyphUpdateNotices requires a pline callback',
        );
    }
    if (state._emittingGlyphUpdateNotices) return [];
    const pending = state._glyphUpdateNotices?.splice(0) ?? [];
    if (!pending.length) return [];

    const finalBuffer = captureGlyphBuffer(state);
    let lastFlushedBuffer = null;
    state._emittingGlyphUpdateNotices = true;
    try {
        for (const notice of pending) {
            restoreGlyphBuffer(state, notice.glyphBuffer);
            await pline(notice.message, state);
            lastFlushedBuffer = notice.glyphBuffer;
        }
    } finally {
        restoreGlyphBuffer(state, finalBuffer, lastFlushedBuffer);
        state._emittingGlyphUpdateNotices = false;
    }
    return pending.map((notice) => notice.message);
}

function roomFloodAllows(location) {
    if (!location) return false;
    const typ = location.typ;
    return !(typ <= DBWALL
        || typ === DOOR
        || typ === TREE
        || typ === WATER
        || typ === LAVAWALL
        || typ === IRONBARS
        || typ === SCORR
        || typ === SDOOR
        || typ === DRAWBRIDGE_UP);
}

function floodRoom(x, y, state) {
    const selected = new Set();
    const pending = [[x, y]];
    while (pending.length) {
        const [cx, cy] = pending.pop();
        if (!isok(cx, cy)) continue;
        const key = `${cx},${cy}`;
        if (selected.has(key)) continue;
        selected.add(key);

        for (let dx = -1; dx <= 1; ++dx) {
            for (let dy = -1; dy <= 1; ++dy) {
                if (!dx && !dy) continue;
                const nx = cx + dx;
                const ny = cy + dy;
                const nextKey = `${nx},${ny}`;
                if (isok(nx, ny)
                    && !selected.has(nextKey)
                    && roomFloodAllows(state.level?.at(nx, ny))) {
                    pending.push([nx, ny]);
                }
            }
        }
    }
    return selected;
}

function selectionBounds(selection) {
    let lx = COLNO;
    let ly = ROWNO;
    let hx = 0;
    let hy = 0;
    for (const key of selection) {
        const [x, y] = key.split(',').map(Number);
        lx = Math.min(lx, x);
        ly = Math.min(ly, y);
        hx = Math.max(hx, x);
        hy = Math.max(hy, y);
    }
    return { lx, ly, hx, hy };
}

function everySelected(selection, predicate) {
    for (const key of selection) {
        const [x, y] = key.split(',').map(Number);
        if (!predicate(x, y)) return false;
    }
    return true;
}

function selectionBoundsSeen(selection, bounds, state) {
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (const y of [bounds.ly, bounds.hy]) {
            if (selection.has(`${x},${y}`)
                && !state.level.at(x, y)?.remembered_glyph) return false;
        }
    }
    for (let y = bounds.ly; y <= bounds.hy; ++y) {
        for (const x of [bounds.lx, bounds.hx]) {
            if (selection.has(`${x},${y}`)
                && !state.level.at(x, y)?.remembered_glyph) return false;
        }
    }
    return true;
}

function selectionDescription(selection) {
    const bounds = selectionBounds(selection);
    const width = bounds.hx - bounds.lx + 1;
    const height = bounds.hy - bounds.ly + 1;
    let irregular = false;
    for (let x = bounds.lx; x <= bounds.hx && !irregular; ++x) {
        for (let y = bounds.ly; y <= bounds.hy; ++y) {
            if (isok(x, y) && !selection.has(`${x},${y}`)) {
                irregular = true;
                break;
            }
        }
    }
    const shape = irregular
        ? 'irregularly shaped' : width === height ? 'square' : 'rectangular';
    return { bounds, text: `${shape} ${width} by ${height}` };
}

function indefiniteArticle(text) {
    if (/^(?:uni(?:corn|form)|use|ewe|one\b)/iu.test(text)) return 'a';
    if (/^(?:hour|honest|heir)/iu.test(text)) return 'an';
    return /^[aeiou]/iu.test(text) ? 'an' : 'a';
}

function describeKnownRoom(x, y, state) {
    const selection = floodRoom(x, y, state);
    const { bounds, text } = selectionDescription(selection);
    const wholeSeen = everySelected(selection, (sx, sy) => (
        Boolean(state.level.at(sx, sy)?.remembered_glyph)
    ));
    const room = (state.u?.urooms?.[0] ?? 0) - ROOMOFFSET >= 0
        ? 'room' : 'area';
    const article = indefiniteArticle(text);
    const heroHere = state.u.ux === x && state.u.uy === y;
    if (wholeSeen) {
        const canSeeWhole = everySelected(
            selection,
            (sx, sy) => cansee(sx, sy, state),
        );
        const relation = heroHere && canSeeWhole
            ? 'are in' : heroHere ? 'remember this as' : 'remember that as';
        const message = `You ${relation} ${article} ${text} ${room}.`;
        return heroHere ? message : messageAt(message, x, y, state, true);
    }
    if (selectionBoundsSeen(selection, bounds, state)) {
        const message = `You guess ${heroHere ? 'this' : 'that'} to be ${article} ${text} ${room}.`;
        return heroHere ? message : messageAt(message, x, y, state, true);
    }
    const message = `You can't guess the size of ${heroHere ? 'this' : 'that'} area.`;
    return heroHere ? message : messageAt(message, x, y, state, true);
}

function speciesName(monster) {
    const names = monster.data?.pmnames ?? [];
    return names[monster.female ? 1 : 0] ?? names[2] ?? 'monster';
}

function monsterBaseName(monster, called) {
    const given = monster.mextra?.mgivenname ?? monster.mgivenname;
    if (given) return called ? `${speciesName(monster)} called ${given}` : given;
    return speciesName(monster);
}

function heroHallucinating(state) {
    return Boolean(state?.u?.uprops?.[HALLUC]?.intrinsic)
        && !propertyActive(state.u, HALLUC_RES);
}

// C ref: pager.c look_at_monster() and do_name.c distant_monnam(). The
// optional species is the actual buffered monster glyph (including a
// monster-shaped mimic appearance); hallucination replaces the name through
// rndmonnam() but retains invisible and mobility suffixes.
export function describeMonster(monster, env = {}) {
    const state = env.state;
    const hallucinating = env.hallucinating
        ?? (state ? heroHallucinating(state) : false);
    const namedMonster = env.species
        ? { ...monster, data: env.species }
        : monster;
    let text = hallucinating
        ? rndmonnam({
            state,
            random: env.random,
            files: env.files,
        })
        : monsterBaseName(namedMonster, true);
    if (!hallucinating
        && !heroIsBlind(state ?? {})
        && (monster.misc_worn_check & W_SADDLE)) {
        text = `saddled ${text}`;
    }
    if (monster.minvis) text = `invisible ${text}`;
    if (!hallucinating && monster.mtame) text = `tame ${text}`;
    else if (!hallucinating && monster.mpeaceful) text = `peaceful ${text}`;
    if (monster.mfrozen)
        text += ", can't move (paralyzed or sleeping or busy)";
    else if (monster.msleeping) text += ', asleep';
    else if (monster.mstrategy & STRAT_WAITMASK) text += ', meditating';
    if (monster.mleashed) text += ', leashed to you';
    if (monster.mtrapped
        && state
        && cansee(monster.mx, monster.my, state)) {
        const trap = t_at(monster.mx, monster.my, state);
        const description = TRAP_DESCRIPTIONS[trap?.ttyp];
        if (description
            && ['bear trap', 'pit', 'spiked pit', 'web'].includes(
                description,
            )) {
            text += `, trapped in ${indefiniteArticle(description)} ${description}`;
            trap.tseen = true;
        }
    }
    return text;
}

function noticeMonsterName(monster) {
    const given = monster.mextra?.mgivenname ?? monster.mgivenname;
    if (given) return given;
    const base = speciesName(monster);
    const saddled = monster.misc_worn_check & W_SADDLE ? 'saddled ' : '';
    if (monster.mtame) return `your ${saddled}${base}`;
    if (monster.mpeaceful) {
        const described = `peaceful ${saddled}${base}`;
        return `${indefiniteArticle(described)} ${described}`;
    }
    const described = `${saddled}${base}`;
    return `${indefiniteArticle(described)} ${described}`;
}

function furnitureDescription(symbol) {
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

function furnitureIsInteresting(symbol) {
    return ![
        S_stone,
        S_bars,
        S_tree,
        S_room,
        S_darkroom,
        S_corr,
        S_litcorr,
        S_pool,
        S_ice,
        S_lava,
        S_lavawall,
        S_cloud,
        S_water,
    ].includes(symbol);
}

function doorDescription(location) {
    const mask = location.flags || location.doormask || 0;
    if (!mask || (mask & D_BROKEN)) return 'doorway';
    if (mask & D_ISOPEN) return 'open door';
    if (mask & (D_CLOSED | D_LOCKED)) return 'closed door';
    return 'doorway';
}

function altarDescription(location) {
    const mask = location.altarmask ?? location.flags ?? 0;
    const alignment = (mask & AM_MASK) === AM_LAWFUL ? 'lawful'
        : (mask & AM_MASK) === AM_NEUTRAL ? 'neutral'
            : (mask & AM_MASK) === AM_CHAOTIC ? 'chaotic' : 'unaligned';
    return `${alignment} ${mask & AM_SANCTUM ? 'high ' : ''}altar`;
}

function terrainDescription(location) {
    switch (location.typ) {
    case DOOR: return doorDescription(location);
    case STAIRS: return location.ladder & LA_DOWN
        ? 'staircase down' : 'staircase up';
    case LADDER: return location.ladder & LA_DOWN ? 'ladder down' : 'ladder up';
    case ALTAR: return altarDescription(location);
    case GRAVE: return 'grave';
    case THRONE: return 'opulent throne';
    case SINK: return 'sink';
    case FOUNTAIN: return 'fountain';
    case DRAWBRIDGE_DOWN: return 'lowered drawbridge';
    case DRAWBRIDGE_UP: return 'raised drawbridge';
    case POOL: return 'pool of water';
    case MOAT: return 'moat';
    case ICE: return 'ice';
    case LAVAPOOL: return 'molten lava';
    case LAVAWALL: return 'wall of lava';
    case WATER: return 'wall of water';
    case IRONBARS: return 'iron bars';
    case TREE: return 'tree';
    case CORR: return 'corridor';
    default: return null;
    }
}

function cmapDescription(symbol, x, y, state) {
    const location = state.level?.at(x, y);
    if (symbol === S_altar && location?.typ === ALTAR)
        return altarDescription(location);
    if ([S_ndoor, S_vodoor, S_hodoor, S_vcdoor, S_hcdoor].includes(
        symbol,
    ) && location?.typ === DOOR) {
        return doorDescription(location);
    }
    if (symbol === S_pool
        && [POOL, MOAT].includes(location?.typ)) {
        return terrainDescription(location);
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
    case S_pool: return 'pool';
    case S_ice: return 'ice';
    case S_lava: return 'molten lava';
    case S_lavawall: return 'wall of lava';
    case S_air: return 'air';
    case S_cloud: return 'cloud';
    case S_water: return location?.typ === WATER
        ? 'wall of water' : 'water';
    case S_poisoncloud: return 'poison cloud';
    default: return null;
    }
}

function objectBaseName(object, state) {
    const type = state.objects?.[object.otyp];
    if (!type) return 'strange object';
    const identifiableWithoutCloseLook = object.oclass === COIN_CLASS
        || object.otyp === BOULDER
        || object.otyp === CORPSE
        || object.otyp === STATUE;
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
        return nameKnown ? actual : appearance ?? 'gem';
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

function pluralize(text) {
    if (/(?:s|x|z|ch|sh)$/iu.test(text)) return `${text}es`;
    if (/[^aeiou]y$/iu.test(text)) return `${text.slice(0, -1)}ies`;
    return `${text}s`;
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
    const base = `${modifiers}${objectBaseName(object, state)}`;
    if (quantity !== 1) {
        return `${vagueQuantity ? 'some' : quantity} ${pluralize(base)}`;
    }
    return `${indefiniteArticle(base)} ${base}`;
}

function describeGlyphUpdate(glyph, x, y, state) {
    const subject = glyph?.a11ySubject;
    switch (subject?.type) {
    case 'monster':
        return describeMonster(subject.monster, {
            state,
            species: subject.species,
        });
    case 'object':
        return describeObject(subject.object, state);
    case 'trap':
        return TRAP_DESCRIPTIONS[subject.trap?.ttyp]
            ?? TRAP_DESCRIPTIONS[subject.ttyp]
            ?? 'trap';
    case 'warning':
        return def_warnsyms[subject.index]?.desc ?? null;
    case 'cmap':
        return cmapDescription(subject.symbol, x, y, state);
    default:
        return glyph?.a11yDescription ?? null;
    }
}

function floorCovered(location) {
    return [POOL, MOAT, WATER, LAVAPOOL, LAVAWALL].includes(location.typ);
}

function visibleSubjectAt(x, y, state) {
    const location = state.level?.at(x, y);
    if (!location || !cansee(x, y, state)) return null;
    if (visible_region_at(x, y, state)) return null;

    const monster = state.level?.monsters?.[x]?.[y] ?? null;
    if (monster && !monster.minvis && !monster.mundetected) {
        const appearance = monster.m_ap_type & M_AP_TYPMASK;
        if (appearance === M_AP_FURNITURE) {
            return furnitureIsInteresting(monster.mappearance)
                ? furnitureDescription(monster.mappearance) : null;
        }
        if (appearance === M_AP_OBJECT) {
            return describeObject({
                otyp: monster.mappearance,
                oclass: state.objects?.[monster.mappearance]?.oc_class ?? 0,
                corpsenm: monster.mextra?.mcorpsenm,
                dknown: false,
                quan: 1,
                ox: x,
                oy: y,
            }, state);
        }
        return describeMonster(monster);
    }

    if (!floorCovered(location)) {
        const object = state.level?.objects?.[x]?.[y] ?? null;
        if (object) return describeObject(object, state);
        const trap = t_at(x, y, state);
        if (trap?.tseen) return TRAP_DESCRIPTIONS[trap.ttyp] ?? 'trap';
        const engraving = engr_at(x, y, state);
        if (engraving?.erevealed
            && [ROOM, ICE, CORR].includes(location.typ)) return 'engraving';
    }
    return terrainDescription(location);
}

export function collectLookaroundMessages(state) {
    const messages = [];
    const { ux, uy } = state.u;
    const heroLocation = state.level?.at(ux, uy);
    let mentionAdjacentCorridors = false;

    if (heroLocation?.typ === CORR) {
        mentionAdjacentCorridors = true;
    } else if (heroLocation?.typ === DOOR) {
        const cardinals = [[-1, 0], [0, -1], [1, 0], [0, 1]];
        for (const [dx, dy] of cardinals) {
            const x = ux + dx;
            const y = uy + dy;
            if (state.level?.at(x, y)?.typ >= ROOM)
                messages.push(describeKnownRoom(x, y, state));
        }
        mentionAdjacentCorridors = true;
    } else {
        messages.push(describeKnownRoom(ux, uy, state));
    }

    for (let y = 0; y < ROWNO; ++y) {
        for (let x = 1; x < COLNO; ++x) {
            if (x === ux && y === uy) continue;
            let description = visibleSubjectAt(x, y, state);
            if (!description && mentionAdjacentCorridors) {
                const typ = state.level?.at(x, y)?.typ;
                if (typ === CORR) description = 'corridor';
            }
            if (description)
                messages.push(messageAt(`${description}.`, x, y, state, true));
        }
    }
    return messages;
}

function propertyActive(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function heroIsBlind(state) {
    const property = state.u?.uprops?.[BLINDED];
    return Boolean(property?.intrinsic || property?.extrinsic)
        && !property?.blocked;
}

// C ref: display.h mon_visible(). This tests the monster itself, assuming that
// its map location is physically visible; canSeeMonster() adds that location
// check.
export function monsterVisible(monster, state) {
    const hero = state.u;
    return Boolean(
        monster
        && (!monster.minvis || propertyActive(hero, SEE_INVIS))
        && !monster.mundetected,
    );
}

export function canSeeMonster(monster, state) {
    if (!monster || monster.mhp < 1 || !monsterVisible(monster, state))
        return false;
    const hero = state.u;
    const couldSee = Boolean(
        state.viz_array?.[monster.my]?.[monster.mx] & COULD_SEE,
    );
    const infrared = !heroIsBlind(state)
        && propertyActive(hero, INFRAVISION)
        && Boolean(monster.data?.mflags3 & 0x0200) // monflag.h:M3_INFRAVISIBLE
        && couldSee;
    return cansee(monster.mx, monster.my, state) || infrared;
}

function matchesWarnOfMonster(monster, state) {
    if (!propertyActive(state.u, WARN_OF_MON)) return false;
    const flags = monster.data?.mflags2 ?? 0;
    const warned = state.context?.warntype ?? {};
    return Boolean((warned.obj & flags) || (warned.polyd & flags)
        || (warned.species && warned.species === monster.data));
}

function monsterSensingContext(monster, state) {
    const hero = state.u;
    const dx = monster.mx - hero.ux;
    const dy = monster.my - hero.uy;
    const distance = dx * dx + dy * dy;
    const blocked = (hero.uswallow && monster !== hero.ustuck)
        || (hero.uinwater
        && !(distance <= 2
            && IS_POOL(state.level?.at(monster.mx, monster.my)?.typ)));
    return { blocked, distance };
}

// C ref: display.h sensemon(), excluding only its Detect_monsters operand.
// This shares sensesMonster()'s swallowed and underwater gates. Ordinary
// consumers should call sensesMonster(); display code uses this narrower
// result solely to choose PHYSICALLY_SEEN versus DETECTED sightflags.
function sensesMonsterCore(monster, state, includeDetection) {
    const hero = state.u;
    const { blocked, distance } = monsterSensingContext(monster, state);
    if (blocked) return false;
    if (includeDetection && propertyActive(hero, DETECT_MONSTERS)) return true;
    const mindless = Boolean(monster.data?.mflags1 & M1_MINDLESS);
    if (!mindless) {
        const telepathy = hero.uprops?.[TELEPAT] ?? {};
        if (heroIsBlind(state)
            && Boolean(telepathy.intrinsic || telepathy.extrinsic)) return true;
        if (telepathy.extrinsic
            && distance <= Math.trunc(hero.unblind_telepat_range ?? 0)) {
            return true;
        }
    }
    return matchesWarnOfMonster(monster, state);
}

export function sensesMonsterWithoutDetection(monster, state) {
    return sensesMonsterCore(monster, state, false);
}

export function sensesMonster(monster, state) {
    return sensesMonsterCore(monster, state, true);
}

// C ref: display.h canspotmon(). Hiding and mimicry do not block sensing;
// callers such as hack.c notice_mon() and monster_nearby() apply their own
// source-specific concealment predicates.
export function canSpotMonster(monster, state) {
    if (!monster || monster.mhp < 1) return false;
    return canSeeMonster(monster, state) || sensesMonster(monster, state);
}

function canNoticeMonster(monster, state) {
    if (!canSpotMonster(monster, state)) return false;
    const appearance = monster.m_ap_type & M_AP_TYPMASK;
    const hider = Boolean(monster.data?.mflags1 & 0x00000100); // M1_HIDE
    if (hider && (monster.mundetected
        || appearance === M_AP_FURNITURE || appearance === M_AP_OBJECT)) {
        return false;
    }
    return true;
}

export function collectMonsterNoticeMessages(state) {
    const monsters = [];
    for (let monster = state.level?.monlist; monster; monster = monster.nmon) {
        if (canSpotMonster(monster, state)) monsters.push(monster);
        else monster.mspotted = false;
    }
    monsters.sort((left, right) => {
        const ldx = left.mx - state.u.ux;
        const ldy = left.my - state.u.uy;
        const rdx = right.mx - state.u.ux;
        const rdy = right.my - state.u.uy;
        return ldx * ldx + ldy * ldy - (rdx * rdx + rdy * rdy);
    });

    const messages = [];
    for (const monster of monsters) {
        if (!canNoticeMonster(monster, state)) {
            monster.mspotted = false;
            continue;
        }
        if (monster.mspotted) continue;
        monster.mspotted = true;
        messages.push(messageAt(
            `You ${canSeeMonster(monster, state) ? 'see' : 'notice'} ${noticeMonsterName(monster)}.`,
            monster.mx,
            monster.my,
            state,
        ));
    }
    return messages;
}

export async function emitStartupA11yNotices(state, env = {}) {
    const pline = env.pline;
    if (typeof pline !== 'function') {
        throw new TypeError(
            'emitStartupA11yNotices requires a pline callback',
        );
    }
    let messages = [];
    if (state.a11y?.glyph_updates) messages = collectLookaroundMessages(state);
    else if (state.a11y?.mon_notices
             && !state.a11y?.mon_notices_blocked)
        messages = collectMonsterNoticeMessages(state);
    for (const message of messages) await pline(message, state);
    return messages;
}

export const _startupA11yInternals = Object.freeze({
    compassDescription,
    coordinateDescription,
    canSeeMonster,
    describeKnownRoom,
    describeMonster,
    describeObject,
    floodRoom,
    terrainDescription,
    visibleSubjectAt,
});
