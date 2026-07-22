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
    COLNO,
    CORR,
    DBWALL,
    DOOR,
    DRAWBRIDGE_DOWN,
    DRAWBRIDGE_UP,
    FOUNTAIN,
    GRAVE,
    ICE,
    IRONBARS,
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
    WATER,
    W_SADDLE,
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
import { ttyPline } from './tty_message.js';
import {
    AMULET_CLASS,
    ARMOR_CLASS,
    BALL_CLASS,
    BOULDER,
    CHAIN_CLASS,
    COIN_CLASS,
    CORPSE,
    FOOD_CLASS,
    GEM_CLASS,
    ILLOBJ_CLASS,
    OBJ_DESCR,
    OBJ_NAME,
    POTION_CLASS,
    RING_CLASS,
    ROCK_CLASS,
    SCROLL_CLASS,
    SPBOOK_CLASS,
    STATUE,
    TOOL_CLASS,
    VENOM_CLASS,
    WAND_CLASS,
    WEAPON_CLASS,
} from './objects.js';
import {
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

function compassDescription(x, y, state) {
    const dx = x - state.u.ux;
    const dy = y - state.u.uy;
    if (!dx && !dy) return '(here)';

    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        const vertical = dy < 0 ? 'north' : dy > 0 ? 'south' : '';
        const horizontal = dx < 0 ? 'west' : dx > 0 ? 'east' : '';
        return `(${vertical}${horizontal})`;
    }

    const parts = [];
    if (dy) parts.push(`${Math.abs(dy)}${dy < 0 ? 'north' : 'south'}`);
    if (dx) parts.push(`${Math.abs(dx)}${dx < 0 ? 'west' : 'east'}`);
    return `(${parts.join(',')})`;
}

function messageAt(text, x, y, state, forceLocation = false) {
    if (forceLocation || state.a11y?.accessiblemsg) {
        return `${compassDescription(x, y, state)}: ${text}`;
    }
    return text;
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

function describeMonster(monster) {
    let text = monsterBaseName(monster, true);
    if (monster.misc_worn_check & W_SADDLE) text = `saddled ${text}`;
    if (monster.minvis) text = `invisible ${text}`;
    if (monster.mtame) text = `tame ${text}`;
    else if (monster.mpeaceful) text = `peaceful ${text}`;
    if (monster.mfrozen)
        text += ", can't move (paralyzed or sleeping or busy)";
    else if (monster.msleeping) text += ', asleep';
    else if (monster.mstrategy & STRAT_WAITMASK) text += ', meditating';
    if (monster.mleashed) text += ', leashed to you';
    return text;
}

function noticeMonsterName(monster) {
    const given = monster.mextra?.mgivenname ?? monster.mgivenname;
    if (given) return given;
    const base = speciesName(monster);
    if (monster.mtame) return `your ${base}`;
    if (monster.mpeaceful) return `${indefiniteArticle(`peaceful ${base}`)} peaceful ${base}`;
    return `${indefiniteArticle(base)} ${base}`;
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
    const base = objectBaseName(object, state);
    if (quantity !== 1) {
        return `${vagueQuantity ? 'some' : quantity} ${pluralize(base)}`;
    }
    return `${indefiniteArticle(base)} ${base}`;
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

function canSpotMonster(monster, state) {
    if (!monster || monster.mhp < 1 || monster.minvis || monster.mundetected)
        return false;
    const appearance = monster.m_ap_type & M_AP_TYPMASK;
    if (appearance === M_AP_FURNITURE || appearance === M_AP_OBJECT)
        return false;
    return cansee(monster.mx, monster.my, state);
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
        if (monster.mspotted) continue;
        monster.mspotted = true;
        messages.push(messageAt(
            `You see ${noticeMonsterName(monster)}.`,
            monster.mx,
            monster.my,
            state,
        ));
    }
    return messages;
}

export async function emitStartupA11yNotices(state, env = {}) {
    const pline = env.pline ?? ttyPline;
    let messages = [];
    if (state.a11y?.glyph_updates) messages = collectLookaroundMessages(state);
    else if (state.a11y?.mon_notices)
        messages = collectMonsterNoticeMessages(state);
    for (const message of messages) await pline(message, state);
    return messages;
}

export const _startupA11yInternals = Object.freeze({
    compassDescription,
    describeKnownRoom,
    describeMonster,
    describeObject,
    floodRoom,
    terrainDescription,
    visibleSubjectAt,
});
