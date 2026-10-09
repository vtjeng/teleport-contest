// glyphs.js -- Glyph-ID expansion and glyph-map customizations.
// C refs: glyphs.c glyphrep_to_custom_map_entries(), glyph_find_core(),
// parse_id(), glyph_to_cmap(), add/apply/purge/shuffle_customizations();
// utf8map.c unicode_val().

import {
    H_UTF8,
    MAXEXPCHARS,
    NH_BASIC_COLOR,
    PRIMARYSET,
    ROGUESET,
} from './const.js';
import { game } from './gstate.js';
import { lcase } from './hacklib.js';
import { rgbstr_to_int32 } from './coloratt.js';
import {
    GLYPHREP_CMAP_PARTITIONS,
    SOURCE_GLYPH_IDS,
    sourceSymbolIndex,
    sourceSymbolNamesByIndex,
} from './glyph_ids.js';
import {
    GLYPH_ALTAR_OFF,
    GLYPH_CMAP_A_OFF,
    GLYPH_CMAP_B_OFF,
    GLYPH_CMAP_C_OFF,
    GLYPH_CMAP_GEH_OFF,
    GLYPH_CMAP_KNOX_OFF,
    GLYPH_CMAP_MAIN_OFF,
    GLYPH_CMAP_MINES_OFF,
    GLYPH_CMAP_SOKO_OFF,
    GLYPH_CMAP_STONE_OFF,
    GLYPH_DETECT_FEM_OFF,
    GLYPH_DETECT_MALE_OFF,
    GLYPH_EXPLODE_OFF,
    GLYPH_EXPLODE_FROSTY_OFF,
    GLYPH_MON_FEM_OFF,
    GLYPH_MON_MALE_OFF,
    GLYPH_OBJ_OFF,
    GLYPH_OBJ_PILETOP_OFF,
    GLYPH_PET_FEM_OFF,
    GLYPH_PET_MALE_OFF,
    GLYPH_RIDDEN_FEM_OFF,
    GLYPH_RIDDEN_MALE_OFF,
    GLYPH_SWALLOW_OFF,
    GLYPH_ZAP_OFF,
    MAX_GLYPH,
} from './glyph_offsets.js';
import { MONSTER_TEMPLATES, NUMMONS } from './monsters.js';
import { NUM_OBJECTS, VENOM_CLASS } from './objects.js';
import {
    SYM_OFF_M,
    SYM_OFF_O,
    SYM_OFF_P,
    SYM_OFF_W,
    SYM_OFF_X,
} from './symbol_data.js';

import {
    MAXPCHARS, S_stone, S_vwall, S_trwall, S_ndoor, S_altar, S_grave,
    S_digbeam, S_goodpos, S_vbeam, S_sw_tl, S_expl_tl, S_expl_br,
} from './symbols.js';

// C ref: glyphs.c glyph_to_cmap() (199-231). The five adjacent wall
// ranges share cmap indices; altar variants likewise share S_altar.
export function glyph_to_cmap(glyph) {
    if (glyph === GLYPH_CMAP_STONE_OFF) return S_stone;
    if (glyph >= GLYPH_CMAP_MAIN_OFF && glyph < GLYPH_CMAP_A_OFF)
        return ((glyph - GLYPH_CMAP_MAIN_OFF) % (S_trwall - S_vwall + 1)) + S_vwall;
    if (glyph >= GLYPH_CMAP_A_OFF && glyph < GLYPH_ALTAR_OFF)
        return glyph - GLYPH_CMAP_A_OFF + S_ndoor;
    if (glyph >= GLYPH_ALTAR_OFF && glyph < GLYPH_CMAP_B_OFF) return S_altar;
    if (glyph >= GLYPH_CMAP_B_OFF && glyph < GLYPH_ZAP_OFF)
        return glyph - GLYPH_CMAP_B_OFF + S_grave;
    if (glyph >= GLYPH_CMAP_C_OFF && glyph < GLYPH_CMAP_C_OFF + S_goodpos - S_digbeam + 1)
        return glyph - GLYPH_CMAP_C_OFF + S_digbeam;
    if (glyph >= GLYPH_ZAP_OFF && glyph < GLYPH_CMAP_C_OFF)
        return ((glyph - GLYPH_ZAP_OFF) % 4) + S_vbeam;
    if (glyph >= GLYPH_SWALLOW_OFF && glyph < GLYPH_SWALLOW_OFF + (NUMMONS << 3))
        return ((glyph - GLYPH_SWALLOW_OFF) & 7) + S_sw_tl;
    if (glyph >= GLYPH_EXPLODE_OFF && glyph < GLYPH_EXPLODE_FROSTY_OFF + MAXEXPCHARS)
        return ((glyph - GLYPH_EXPLODE_OFF) % (S_expl_br - S_expl_tl + 1)) + S_expl_tl;
    return MAXPCHARS; // C's legal defsyms fencepost for every other glyph.
}

const MONSTER_GLYPH_OFFSETS = Object.freeze([
    GLYPH_MON_MALE_OFF,
    GLYPH_MON_FEM_OFF,
    GLYPH_PET_MALE_OFF,
    GLYPH_PET_FEM_OFF,
    GLYPH_DETECT_MALE_OFF,
    GLYPH_DETECT_FEM_OFF,
    GLYPH_RIDDEN_MALE_OFF,
    GLYPH_RIDDEN_FEM_OFF,
]);

// Call only after glyphrep has selected at least one glyph, parsed a usable
// detail, and found a named owner.  C allocates each list entry in the
// callback, so empty and unaffiliated fanouts leave all three domains absent.
function ensureCustomizationState(state) {
    state.gs ??= {};
    state.gs.sym_customizations ??= [];
    state.gs.sym_customizations[PRIMARYSET] ??= {
        unicode: { name: null, details: [] },
        color: { name: null, details: [] },
    };
    state.gs.sym_customizations[ROGUESET] ??= {
        unicode: { name: null, details: [] },
        color: { name: null, details: [] },
    };
    state.gg ??= {};
    state.gg.glyph_customizations ??= Array(MAX_GLYPH).fill(null);
    state.iflags ??= {};
}

// utf8map.c unicode_val() consumes at most seven hexadecimal digits and
// ignores the first non-hex suffix. Validation for UTF-8 conversion is the
// callback's separate responsibility.
export function unicode_val(value) {
    const match = /^[Uu]\+([0-9a-f]{1,7})/iu.exec(String(value ?? ''));
    return match ? Number.parseInt(match[1], 16) : 0;
}

function unicodeCharacter(value) {
    const codePoint = unicode_val(value);
    if (!codePoint || codePoint > 0x10FFFF
        || (codePoint >= 0xD800 && codePoint <= 0xDFFF)) return null;
    return String.fromCodePoint(codePoint);
}

function cmapGlyphs(cmap) {
    const partition = GLYPHREP_CMAP_PARTITIONS;
    if (cmap === partition.stone[0]) return [GLYPH_CMAP_STONE_OFF];
    if (cmap >= partition.walls[0] && cmap <= partition.walls[1]) {
        return [
            GLYPH_CMAP_MAIN_OFF,
            GLYPH_CMAP_MINES_OFF,
            GLYPH_CMAP_GEH_OFF,
            GLYPH_CMAP_KNOX_OFF,
            GLYPH_CMAP_SOKO_OFF,
        ].map((offset) => offset + cmap - partition.walls[0]);
    }
    if (cmap >= partition.cmapA[0] && cmap <= partition.cmapA[1])
        return [GLYPH_CMAP_A_OFF + cmap - partition.cmapA[0]];
    if (cmap === partition.altar[0])
        return Array.from({ length: 5 }, (_, index) => GLYPH_ALTAR_OFF + index);
    if (cmap >= partition.cmapB[0] && cmap <= partition.cmapB[1])
        return [GLYPH_CMAP_B_OFF + cmap - partition.cmapB[0]];
    if (cmap >= partition.zap[0] && cmap <= partition.zap[1]) {
        return Array.from(
            { length: 8 },
            (_, index) => GLYPH_ZAP_OFF + (index * 4)
                + cmap - partition.zap[0],
        );
    }
    if (cmap >= partition.cmapC[0] && cmap <= partition.cmapC[1])
        return [GLYPH_CMAP_C_OFF + cmap - partition.cmapC[0]];
    if (cmap >= partition.swallow[0] && cmap <= partition.swallow[1]) {
        return Array.from(
            { length: NUMMONS },
            (_, index) => GLYPH_SWALLOW_OFF + (index * 8)
                + cmap - partition.swallow[0],
        );
    }
    if (cmap >= partition.explosion[0] && cmap <= partition.explosion[1]) {
        return Array.from(
            { length: 7 },
            (_, index) => GLYPH_EXPLODE_OFF + (index * 9)
                + cmap - partition.explosion[0],
        );
    }
    return [];
}

// C refs: glyphs.c glyph ID cache (303-455). The one record below owns C's
// glyphid_cache pointer, glyphid_cache_size and glyphid_cache_lsize. It is
// created during configuration or #wizcustom and freed at those source sites.
export function glyph_hash(id) {
    let hash = 0;
    for (const byte of new TextEncoder().encode(id)) {
        if (!byte) break;
        // The reference build uses signed char; its XOR promotes high bytes.
        const ch = byte >= 128 ? byte - 256
            : byte >= 65 && byte <= 90 ? byte + 32 : byte;
        hash = (((hash << 1) | (hash >>> 31)) ^ ch) >>> 0;
    }
    return hash;
}

export function init_glyph_cache(state = game) {
    state.gg ??= {};
    let size = 1, lsize = 0;
    while (size < 2 * MAX_GLYPH) { size <<= 1; ++lsize; }
    state.gg.glyphid_cache = {
        size, lsize,
        entries: Array.from({ length: size }, () => ({ glyphnum: 0, id: null })),
    };
}

export function glyphid_cache_status(state = game) {
    return Boolean(state.gg?.glyphid_cache);
}

export function free_glyphid_cache(state = game) {
    if (!glyphid_cache_status(state)) return;
    state.gg.glyphid_cache = null;
}

export function add_glyph_to_cache(glyphnum, id, state = game) {
    const cache = state.gg.glyphid_cache;
    const hash = glyph_hash(id);
    const mask = cache.size - 1;
    const first = hash & mask;
    const step = ((hash >>> cache.lsize) & mask) | 1;
    let index = first;
    do {
        if (cache.entries[index].id === null) {
            cache.entries[index] = { glyphnum, id };
            return;
        }
        index = (index + step) & mask;
    } while (index !== first);
    throw new Error('glyphid_cache full'); // source panic: no empty bucket.
}

export function find_glyph_in_cache(id, state = game) {
    const cache = state.gg.glyphid_cache;
    const hash = glyph_hash(id);
    const mask = cache.size - 1;
    const first = hash & mask;
    const step = ((hash >>> cache.lsize) & mask) | 1;
    let index = first;
    do {
        const entry = cache.entries[index];
        if (entry.id === null) return -1;
        if (lcase(entry.id) === lcase(id)) return entry.glyphnum;
        index = (index + step) & mask;
    } while (index !== first);
    return -1;
}

export function find_glyphid_in_cache_by_glyphnum(glyphnum, state = game) {
    if (!glyphid_cache_status(state)) return null;
    for (const entry of state.gg.glyphid_cache.entries)
        if (entry.glyphnum === glyphnum && entry.id !== null) return entry.id;
    return null;
}

// C ref: glyphs.c parse_id (824-1162). glyph_ids.js generates the complete
// fixed catalog with the source's fix_glyphname and naming branches; its C
// dump comparison pins every ID and hole. Keep parsing/cache control here.
// find_* = nothing/pm/oc/cmap/glyph (0..4), res_* = nothing/dump/fill (0..2).
// A supplied dump sink represents FILE* output, without game filesystem I/O.
export function parse_id(id, findwhat, state = game) {
    let dumping = false, filling = false;
    if (findwhat.findtype === 0 && findwhat.restype) {
        if (findwhat.restype === 1) {
            if (!findwhat.reserved) return 0;
            dumping = true;
        }
        if (findwhat.restype === 2) {
            if (!findwhat.reserved || findwhat.reserved !== state.gg?.glyphid_cache) return 0;
            filling = true;
        }
    }
    const isG = id?.startsWith('G_');
    const isS = id?.startsWith('S_');
    if (isG || filling || dumping) {
        if (!filling && id && glyphid_cache_status(state)) {
            const val = find_glyph_in_cache(id, state);
            if (val < 0) return 0; // source early return leaves findwhat untouched.
            Object.assign(findwhat, { findtype: 4, val, loadsyms_offset: 0 });
            return 1;
        }
        for (let glyph = 0; glyph < MAX_GLYPH; ++glyph) {
            const name = SOURCE_GLYPH_IDS[glyph];
            // Empty catalog holes include deliberately skipped unnamed object
            // entries and the empty piletop venom ID. Only that latter hole is
            // inserted/dumped in C (glyph_is_object excludes it).
            if (!name && glyph !== GLYPH_OBJ_PILETOP_OFF + VENOM_CLASS) continue;
            if (dumping) findwhat.reserved(`(${String(glyph).padStart(4, '0')}) ${name}\n`);
            else if (filling) add_glyph_to_cache(glyph, name, state);
            else if (id && lcase(name) === lcase(id)) {
                Object.assign(findwhat, { findtype: 4, val: glyph, loadsyms_offset: 0 });
                return 1;
            }
        }
    } else if (isS) {
        const absolute = sourceSymbolIndex(id);
        if (absolute !== null
            && `s_${sourceSymbolNamesByIndex()[absolute]}` === lcase(id)) {
            if (absolute >= SYM_OFF_P && absolute < SYM_OFF_O) {
                Object.assign(findwhat, { findtype: 3, val: absolute - SYM_OFF_P, loadsyms_offset: absolute });
                return 1;
            }
            if (absolute >= SYM_OFF_O && absolute < SYM_OFF_M) {
                Object.assign(findwhat, { findtype: 2, val: absolute - SYM_OFF_O, loadsyms_offset: absolute });
                return 1;
            }
            if (absolute > SYM_OFF_M && absolute <= SYM_OFF_X) {
                Object.assign(findwhat, { findtype: 1, val: absolute - SYM_OFF_M, loadsyms_offset: absolute });
                return 1;
            }
        }
    }
    if (dumping || filling) return 1;
    Object.assign(findwhat, { findtype: 0, val: 0, loadsyms_offset: 0 });
    return 0;
}

export function fill_glyphid_cache(state = game) {
    if (!glyphid_cache_status(state)) init_glyph_cache(state);
    const findwhat = { findtype: 0, restype: 2, reserved: state.gg.glyphid_cache };
    if (!parse_id(null, findwhat, state)) free_glyphid_cache(state);
}

export function wizcustom_glyphids(win, callback, state = game) {
    if (!glyphid_cache_status(state)) return;
    for (let glyph = 0; glyph < MAX_GLYPH; ++glyph) {
        const id = find_glyphid_in_cache_by_glyphnum(glyph, state);
        if (id !== null) callback(win, glyph, id, state);
    }
}

/** glyphs.c parse_id()+glyph_find_core(), including all S_* fanout. */
export function glyph_find(id, state = game) {
    const found = { findtype: 0 };
    if (!parse_id(String(id ?? ''), found, state)) return null;
    const text = String(id ?? '');
    if (text.startsWith('G_')) {
        return [found.val];
    }
    if (!text.startsWith('S_')) return null;
    const absolute = sourceSymbolIndex(text);
    if (absolute === null) return null;
    if (absolute >= SYM_OFF_P && absolute < SYM_OFF_O)
        return cmapGlyphs(absolute - SYM_OFF_P);
    if (absolute >= SYM_OFF_O && absolute < SYM_OFF_M) {
        const objectClass = absolute - SYM_OFF_O;
        // glyph_to_obj()==class selects the two generic class glyphs. It does
        // not expand to every concrete object whose oc_class matches.
        const glyphs = [GLYPH_OBJ_OFF + objectClass];
        // display.h glyph_is_object() excludes the piletop venom hole.
        if (objectClass !== VENOM_CLASS)
            glyphs.push(GLYPH_OBJ_PILETOP_OFF + objectClass);
        return glyphs;
    }
    // parse_id()'s inclusive `i <= pm_count` reaches one row beyond the
    // MONSYMS_PARSE block.  That row is S_nothing, which succeeds as an empty
    // monster-class search; no later misc symbol is admitted.
    if (absolute === SYM_OFF_X) return [];
    if (absolute >= SYM_OFF_W) return null;
    // loadsyms[] has a fencepost at SYM_OFF_M; S_ant is the next slot and
    // maps to mlet 1.
    const monsterClass = absolute - SYM_OFF_M;
    if (monsterClass < 1) return null;
    const monsters = MONSTER_TEMPLATES
        .filter((monster) => monster.mlet === monsterClass)
        .map((monster) => monster.pmidx);
    return MONSTER_GLYPH_OFFSETS.flatMap((offset) => (
        monsters.map((mnum) => offset + mnum)
    ));
}

function addDetail(bucket, name, glyph, value) {
    if (bucket.name === null) bucket.name = name;
    if (bucket.name === name) {
        const old = bucket.details.find((detail) => detail.glyph === glyph);
        if (old) {
            old.value = value;
            return;
        }
    }
    // C allocates a new list node for every callback; the last entry for a glyph wins in apply_customizations
    bucket.details.push({ glyph, value });
}

// glyphs.c glyphrep_to_custom_map_entries() replaces every delimiter with NUL
// while retaining pointers after the last ':' and '/'.  This is not ordinary
// splitting: repeated or mixed delimiters terminate earlier pointed-to text.
function parseGlyphrepDelimiterPointers(raw) {
    const text = String(raw ?? '');
    const delimiterPositions = [];
    for (let index = 0; index < text.length; ++index) {
        if (text[index] === ':' || text[index] === '/')
            delimiterPositions.push(index);
    }
    const first = delimiterPositions[0] ?? text.length;
    const segmentAfter = (delimiter) => {
        if (delimiter < 0) return null;
        const end = delimiterPositions.find((index) => index > delimiter)
            ?? text.length;
        return text.slice(delimiter + 1, end);
    };
    const colon = text.lastIndexOf(':');
    const slash = text.lastIndexOf('/');
    let id = text.slice(0, first);
    let unicode = segmentAfter(colon);
    let color = segmentAfter(slash);
    if (id.startsWith(' ')) id = id.slice(1);
    if (color?.startsWith(' ')) color = color.slice(1);
    if (unicode !== null) unicode = unicode.replace(/^ +/u, '') || null;
    return { id, unicode, color };
}

export function inspect_glyphrep(raw) {
    const components = parseGlyphrepDelimiterPointers(raw);
    const glyphs = glyph_find(components.id);
    const unicodeCh = unicodeCharacter(components.unicode);
    const parsedColor = components.color === null
        ? -1 : rgbstr_to_int32(components.color);
    return {
        valid: glyphs !== null,
        hasUnicode: Boolean(unicodeCh) && glyphs?.length > 0,
        hasColor: parsedColor !== -1 && glyphs?.length > 0,
    };
}

/** Parse one already-munged options.c glyph value and append its records. */
export function glyphrep_to_custom_map_entries(raw, state, whichSet = null) {
    const { id, unicode, color } = parseGlyphrepDelimiterPointers(raw);
    const glyphs = glyph_find(id, state);
    if (glyphs === null) return false;
    // parse_id() can succeed for S_nothing while glyph_find_core() invokes no
    // callback.  It therefore emits no nag and allocates no state.
    if (!glyphs.length) return true;
    const unicodeCh = unicodeCharacter(unicode);
    const parsedColor = color === null ? -1 : rgbstr_to_int32(color);
    // NH_BASIC_COLOR marks color-index 0 (black) as present, so 0 means "no color customization"
    const nhcolor = parsedColor === -1
        ? 0 : parsedColor === 0 ? NH_BASIC_COLOR : parsedColor >>> 0;
    if (!unicodeCh && !nhcolor) return true;
    const set = whichSet ?? state.gs?.symset_which_set ?? PRIMARYSET;
    const name = state.gs?.symset?.[set]?.name ?? null;
    // options.c owns the one-time configuration diagnostic before replay.
    // Without a symset name, C's callback creates no customization record.
    if (!name) return true;
    ensureCustomizationState(state);
    for (const glyph of glyphs) {
        if (unicodeCh) {
            addDetail(
                state.gs.sym_customizations[set].unicode,
                name,
                glyph,
                unicodeCh,
            );
        }
        if (nhcolor) {
            addDetail(
                state.gs.sym_customizations[set].color,
                name,
                glyph,
                nhcolor,
            );
        }
    }
    return true;
}

export function purge_custom_entries(whichSet, state) {
    // An absent list is the JS representation of C's zero-initialized empty
    // list.  Keep ordinary startup state compact until a glyph row exists.
    if (!state.gs?.sym_customizations) return;
    ensureCustomizationState(state);
    state.gs.sym_customizations[whichSet] = {
        unicode: { name: null, details: [] },
        color: { name: null, details: [] },
    };
}

export function clear_all_glyphmap_colors(state) {
    const entries = state.gg?.glyph_customizations;
    if (!entries) return;
    for (const entry of entries) {
        if (entry) delete entry.nhcolor;
    }
}

export function clear_all_glyphmap_unicode(state) {
    const entries = state.gg?.glyph_customizations;
    if (!entries) return;
    for (const entry of entries) {
        if (entry) delete entry.displayCh;
    }
}

/** glyphs.c apply_customizations(); reset_glyphmap itself preserves these. */
export function apply_customizations(
    whichSet,
    state,
    { symbols = true, colors = true } = {},
) {
    const customizations = state.gs?.sym_customizations?.[whichSet];
    if (!customizations) return;
    ensureCustomizationState(state);
    const hasAny = customizations.unicode.details.length > 0
        || customizations.color.details.length > 0;
    if (symbols && state.iflags.customsymbols !== false
        && state.gs.symset?.[whichSet]?.handling === H_UTF8) {
        for (const { glyph, value } of customizations.unicode.details) {
            state.gg.glyph_customizations[glyph] ??= {};
            state.gg.glyph_customizations[glyph].displayCh = value;
        }
    }
    if (colors && state.iflags.customcolors !== false) {
        for (const { glyph, value } of customizations.color.details) {
            state.gg.glyph_customizations[glyph] ??= {};
            state.gg.glyph_customizations[glyph].nhcolor = value;
        }
    }
    state.iflags.pending_customizations = hasAny;
}

export function numeric_glyph_customization(glyph, state) {
    if (!Number.isInteger(glyph)) return null;
    if (glyph < 0 || glyph >= MAX_GLYPH)
        throw new RangeError(`glyph ${glyph} is outside MAX_GLYPH`);
    const entry = state.gg?.glyph_customizations?.[glyph];
    if (!entry) return null;
    const result = {};
    if (entry.displayCh && state.iflags?.customsymbols !== false)
        result.displayCh = entry.displayCh;
    if (entry.nhcolor && state.iflags?.customcolors !== false) {
        if ((entry.nhcolor & NH_BASIC_COLOR) !== 0) {
            result.basicColor = entry.nhcolor & 0xFFFFFF;
        } else {
            result.rgb = [
                (entry.nhcolor >>> 16) & 0xFF,
                (entry.nhcolor >>> 8) & 0xFF,
                entry.nhcolor & 0xFF,
            ];
        }
    }
    return Object.keys(result).length ? result : null;
}

// moveloop_core calls this every turn; pending_customizations ensures it runs
// only once, after init_objects() has shuffled description indices.
export function maybe_shuffle_customizations(state) {
    if (!state.iflags?.pending_customizations) return;
    ensureCustomizationState(state);
    for (const offset of [GLYPH_OBJ_OFF, GLYPH_OBJ_PILETOP_OFF]) {
        const before = state.gg.glyph_customizations.slice(
            offset,
            offset + NUM_OBJECTS,
        );
        for (let index = 0; index < NUM_OBJECTS; ++index) {
            const description = state.objects?.[index]?.oc_descr_idx ?? index;
            const source = before[description];
            state.gg.glyph_customizations[offset + index] = source
                ? { ...source } : null;
        }
    }
    state.iflags.pending_customizations = false;
}
