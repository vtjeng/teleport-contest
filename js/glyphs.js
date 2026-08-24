// glyphs.js -- Glyph-ID expansion and glyph-map customizations.
// C refs: glyphs.c glyphrep_to_custom_map_entries(), glyph_find_core(),
// parse_id(), add/apply/purge/shuffle_customizations(); utf8map.c unicode_val().

import {
    H_UTF8,
    NH_BASIC_COLOR,
    PRIMARYSET,
    ROGUESET,
} from './const.js';
import { rgbstr_to_int32 } from './coloratt.js';
import {
    sourceGlyphNumber,
    sourceSymbolIndex,
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
import { NUM_OBJECTS } from './objects.js';
import {
    SYM_OFF_M,
    SYM_OFF_O,
    SYM_OFF_P,
    SYM_OFF_W,
    SYM_OFF_X,
} from './symbol_data.js';

const NONZERO_BLACK = NH_BASIC_COLOR;
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

function customizationState(state) {
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
    const match = /^[Uu]\+([0-9a-f]{1,7})/u.exec(String(value ?? ''));
    return match ? Number.parseInt(match[1], 16) : 0;
}

function unicodeCharacter(value) {
    const codePoint = unicode_val(value);
    if (!codePoint || codePoint > 0x10FFFF
        || (codePoint >= 0xD800 && codePoint <= 0xDFFF)) return null;
    return String.fromCodePoint(codePoint);
}

function cmapGlyphs(cmap) {
    if (cmap === 0) return [GLYPH_CMAP_STONE_OFF];
    if (cmap >= 1 && cmap <= 11) {
        return [
            GLYPH_CMAP_MAIN_OFF,
            GLYPH_CMAP_MINES_OFF,
            GLYPH_CMAP_GEH_OFF,
            GLYPH_CMAP_KNOX_OFF,
            GLYPH_CMAP_SOKO_OFF,
        ].map((offset) => offset + cmap - 1);
    }
    if (cmap >= 12 && cmap <= 32)
        return [GLYPH_CMAP_A_OFF + cmap - 12];
    if (cmap === 33)
        return Array.from({ length: 5 }, (_, index) => GLYPH_ALTAR_OFF + index);
    if (cmap >= 34 && cmap <= 73)
        return [GLYPH_CMAP_B_OFF + cmap - 34];
    if (cmap >= 74 && cmap <= 77) {
        return Array.from(
            { length: 8 },
            (_, index) => GLYPH_ZAP_OFF + (index * 4) + cmap - 74,
        );
    }
    if (cmap >= 78 && cmap <= 87)
        return [GLYPH_CMAP_C_OFF + cmap - 78];
    if (cmap >= 88 && cmap <= 95) {
        return Array.from(
            { length: NUMMONS },
            (_, index) => GLYPH_SWALLOW_OFF + (index * 8) + cmap - 88,
        );
    }
    if (cmap >= 96 && cmap <= 104) {
        return Array.from(
            { length: 7 },
            (_, index) => GLYPH_EXPLODE_OFF + (index * 9) + cmap - 96,
        );
    }
    return [];
}

/** glyphs.c parse_id()+glyph_find_core(), including all S_* fanout. */
export function glyph_find(id) {
    const text = String(id ?? '');
    if (text.startsWith('G_')) {
        const glyph = sourceGlyphNumber(text);
        return glyph === null ? null : [glyph];
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
        return [
            GLYPH_OBJ_OFF + objectClass,
            GLYPH_OBJ_PILETOP_OFF + objectClass,
        ];
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
    bucket.details.push({ glyph, value });
}

function parsedComponents(raw) {
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
    const components = parsedComponents(raw);
    const glyphs = glyph_find(components.id);
    const unicodeCh = unicodeCharacter(components.unicode);
    const parsedColor = components.color === null
        ? -1 : rgbstr_to_int32(components.color);
    return {
        valid: glyphs !== null,
        hasUnicode: Boolean(unicodeCh),
        hasColor: parsedColor >= 0,
    };
}

/** Parse one already-munged options.c glyph value and append its records. */
export function glyphrep_to_custom_map_entries(raw, state, whichSet = null) {
    const { id, unicode, color } = parsedComponents(raw);
    const glyphs = glyph_find(id);
    if (glyphs === null) return false;
    const unicodeCh = unicodeCharacter(unicode);
    const parsedColor = color === null ? -1 : rgbstr_to_int32(color);
    const nhcolor = parsedColor < 0
        ? 0 : parsedColor === 0 ? NONZERO_BLACK : parsedColor;
    if (!unicodeCh && !nhcolor) return true;
    customizationState(state);
    const set = whichSet ?? state.gs.symset_which_set ?? PRIMARYSET;
    const name = state.gs.symset?.[set]?.name ?? null;
    for (const glyph of glyphs) {
        if (unicodeCh) {
            if (name) {
                addDetail(
                    state.gs.sym_customizations[set].unicode,
                    name,
                    glyph,
                    unicodeCh,
                );
            } else if (!state.gs.glyph_unicode_nagged) {
                state.gs.glyph_unicode_nagged = true;
                state.gs.glyph_config_errors ??= [];
                state.gs.glyph_config_errors.push(
                    'Unimplemented customization feature, ignoring for now',
                );
            }
        }
        if (nhcolor) {
            if (name) {
                addDetail(
                    state.gs.sym_customizations[set].color,
                    name,
                    glyph,
                    nhcolor,
                );
            } else if (!state.gs.glyph_color_nagged) {
                state.gs.glyph_color_nagged = true;
                state.gs.glyph_config_errors ??= [];
                state.gs.glyph_config_errors.push(
                    'Unimplemented customization feature, ignoring for now',
                );
            }
        }
    }
    return true;
}

export function purge_custom_entries(whichSet, state) {
    // An absent list is the JS representation of C's zero-initialized empty
    // list.  Keep ordinary startup state compact until a glyph row exists.
    if (!state.gs?.sym_customizations) return;
    customizationState(state);
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
    customizationState(state);
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

export function glyph_customization(glyph, state) {
    const entry = state.gg?.glyph_customizations?.[glyph];
    if (!entry) return null;
    const result = {};
    if (entry.displayCh && state.iflags?.customsymbols !== false)
        result.displayCh = entry.displayCh;
    if (entry.nhcolor && state.iflags?.customcolors !== false) {
        if ((entry.nhcolor & NH_BASIC_COLOR) !== 0) {
            result.basicColor = entry.nhcolor & ~NH_BASIC_COLOR;
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

// allmain.c invokes this once, after init_objects() has shuffled description
// indices and after the initial map, immediately before the first command.
export function maybe_shuffle_customizations(state) {
    if (!state.iflags?.pending_customizations) return;
    customizationState(state);
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
