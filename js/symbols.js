// symbols.js -- Primary cmap symbol initialization and selection.
// C refs: drawing.c:defsyms; symbols.c:init_symbols(), switch_symbols();
// options.c:sym_val(); dat/symbols.

import {
    H_DEC,
    H_IBM,
    H_MAC,
    H_UTF8,
    H_UNK,
    PRIMARYSET,
    ROGUESET,
} from './const.js';
import { game } from './gstate.js';
import { encodeUtf8ByteString } from './hacklib.js';
import { SYMBOL_SET_DEFINITIONS } from './symbol_data.js';

export const MAXPCHARS = 105;

export const S_stone = 0;
export const S_vwall = 1;
export const S_hwall = 2;
export const S_tlcorn = 3;
export const S_trcorn = 4;
export const S_blcorn = 5;
export const S_brcorn = 6;
export const S_crwall = 7;
export const S_tuwall = 8;
export const S_tdwall = 9;
export const S_tlwall = 10;
export const S_trwall = 11;
export const S_ndoor = 12;
export const S_vodoor = 13;
export const S_hodoor = 14;
export const S_vcdoor = 15;
export const S_hcdoor = 16;
export const S_tree = 18;
export const S_room = 19;
export const S_corr = 22;
export const S_litcorr = 23;
export const S_upstair = 25;
export const S_dnstair = 26;
export const S_brupstair = 29;
export const S_brdnstair = 30;

const CMAP_NAMES = Object.freeze([
    'S_stone', 'S_vwall', 'S_hwall', 'S_tlcorn', 'S_trcorn',
    'S_blcorn', 'S_brcorn', 'S_crwall', 'S_tuwall', 'S_tdwall',
    'S_tlwall', 'S_trwall', 'S_ndoor', 'S_vodoor', 'S_hodoor',
    'S_vcdoor', 'S_hcdoor', 'S_bars', 'S_tree', 'S_room',
    'S_darkroom', 'S_engroom', 'S_corr', 'S_litcorr', 'S_engrcorr',
    'S_upstair', 'S_dnstair', 'S_upladder', 'S_dnladder',
    'S_brupstair', 'S_brdnstair', 'S_brupladder', 'S_brdnladder',
    'S_altar', 'S_grave', 'S_throne', 'S_sink', 'S_fountain', 'S_pool',
    'S_ice', 'S_lava', 'S_lavawall', 'S_vodbridge', 'S_hodbridge',
    'S_vcdbridge', 'S_hcdbridge', 'S_air', 'S_cloud', 'S_water',
    'S_arrow_trap', 'S_dart_trap', 'S_falling_rock_trap',
    'S_squeaky_board', 'S_bear_trap', 'S_land_mine',
    'S_rolling_boulder_trap', 'S_sleeping_gas_trap', 'S_rust_trap',
    'S_fire_trap', 'S_pit', 'S_spiked_pit', 'S_hole', 'S_trap_door',
    'S_teleportation_trap', 'S_level_teleporter', 'S_magic_portal',
    'S_web', 'S_statue_trap', 'S_magic_trap', 'S_anti_magic_trap',
    'S_polymorph_trap', 'S_vibrating_square', 'S_trapped_door',
    'S_trapped_chest', 'S_vbeam', 'S_hbeam', 'S_lslant', 'S_rslant',
    'S_digbeam', 'S_flashbeam', 'S_boomleft', 'S_boomright', 'S_ss1',
    'S_ss2', 'S_ss3', 'S_ss4', 'S_poisoncloud', 'S_goodpos', 'S_sw_tl',
    'S_sw_tc', 'S_sw_tr', 'S_sw_ml', 'S_sw_mr', 'S_sw_bl', 'S_sw_bc',
    'S_sw_br', 'S_expl_tl', 'S_expl_tc', 'S_expl_tr', 'S_expl_ml',
    'S_expl_mc', 'S_expl_mr', 'S_expl_bl', 'S_expl_bc', 'S_expl_br',
]);

// drawing.c:defsyms, in enum cmap_symbols order. Store bytes like C does;
// the tty-specific DEC high bit is interpreted only when a symbol is drawn.
export const DEFAULT_CMAP_SYMBOLS = Object.freeze([
    ' ', '|', '-', '-', '-', '-', '-', '-', '-', '-', '|', '|', '.', '-',
    '|', '+', '+', '#', '#', '.', '.', '`', '#', '#', '#', '<', '>', '<',
    '>', '<', '>', '<', '>', '_', '|', '\\', '{', '{', '}', '.', '}', '}',
    '.', '.', '#', '#', ' ', '#', '}', '^', '^', '^', '^', '^', '^', '^',
    '^', '^', '^', '^', '^', '^', '^', '^', '^', '^', '"', '^', '^', '^',
    '^', '~', '^', '^', '|', '-', '\\', '/', '*', '!', ')', '(', '0', '#',
    '@', '*', '#', '$', '/', '-', '\\', '|', '|', '\\', '-', '/', '/', '-',
    '\\', '|', ' ', '|', '\\', '-', '/',
].map((character) => character.charCodeAt(0)));

const CMAP_INDEX_BY_OPTION = Object.freeze(Object.fromEntries(
    CMAP_NAMES.map((name, index) => [name.toLowerCase(), index]),
));

// Alternate explosion spellings accepted by symbols.c:match_sym().
const CMAP_OPTION_ALIASES = Object.freeze({
    s_explode1: 96,
    s_explode2: 97,
    s_explode3: 98,
    s_explode4: 99,
    s_explode5: 100,
    s_explode6: 101,
    s_explode7: 102,
    s_explode8: 103,
    s_explode9: 104,
});

const HANDLING_BY_NAME = Object.freeze({
    UNKNOWN: H_UNK,
    IBM: H_IBM,
    DEC: H_DEC,
    MAC: H_MAC,
    UTF8: H_UTF8,
});

// IBMgraphics writes OEM bytes to a real tty. The deterministic recorder's
// shadow buffer stores their low seven bits (patch 006), while the browser
// needs the corresponding CP437 glyph.
const CP437_HIGH = Object.freeze(Array.from(
    'ÇüéâäàåçêëèïîìÄÅ'
    + 'ÉæÆôöòûùÿÖÜ¢£¥₧ƒ'
    + 'áíóúñÑªº¿⌐¬½¼¡«»'
    + '░▒▓│┤╡╢╖╕╣║╗╝╜╛┐'
    + '└┴┬├─┼╞╟╚╔╩╦╠═╬╧'
    + '╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀'
    + 'αßΓπΣσµτΦΘΩδ∞φε∩'
    + '≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ',
));

const DEFAULT_ROGUE_CMAP_SYMBOLS = Object.freeze((() => {
    const symbols = [...DEFAULT_CMAP_SYMBOLS];
    symbols[S_ndoor] = '+'.charCodeAt(0);
    symbols[S_vodoor] = '+'.charCodeAt(0);
    symbols[S_hodoor] = '+'.charCodeAt(0);
    symbols[S_upstair] = '%'.charCodeAt(0);
    symbols[S_dnstair] = '%'.charCodeAt(0);
    return symbols;
})());

function graphicsState(state) {
    state.gp ??= {};
    state.gr ??= {};
    state.go ??= {};
    state.gc ??= {};
    state.gs ??= {};
    state.gs.symset ??= [];
    state.gs.symset[PRIMARYSET] ??= {};
    state.gs.symset[ROGUESET] ??= {};
}

function slotArrays(set, state) {
    if (set === ROGUESET) {
        return {
            base: state.gr.rogue_syms,
            baseUtf8: state.gr.rogue_utf8_syms,
            overrides: state.go.ov_rogue_syms,
            overrideUtf8: state.go.ov_rogue_utf8_syms,
        };
    }
    return {
        base: state.gp.primary_syms,
        baseUtf8: state.gp.primary_utf8_syms,
        overrides: state.go.ov_primary_syms,
        overrideUtf8: state.go.ov_primary_utf8_syms,
    };
}

function resetSymbolSlot(set, state) {
    const rogue = set === ROGUESET;
    if (rogue) {
        state.gr.rogue_syms = [...DEFAULT_ROGUE_CMAP_SYMBOLS];
        state.gr.rogue_utf8_syms = Array(MAXPCHARS).fill(null);
    } else {
        state.gp.primary_syms = [...DEFAULT_CMAP_SYMBOLS];
        state.gp.primary_utf8_syms = Array(MAXPCHARS).fill(null);
    }
    state.gs.symset[set] = {
        name: null,
        handling: H_UNK,
        // init_rogue_symbols() makes this table colorless after clearing the
        // symset metadata. Named Rogue sets start through that same path.
        nocolor: rogue ? 1 : 0,
    };
}

function isDefaultSymset(name) {
    const folded = String(name ?? '').toLowerCase().replace(/[ _-]/gu, '');
    return folded === 'default' || folded === 'defaultsymbols';
}

function symbolSetDefinition(name) {
    const folded = String(name).toLowerCase();
    return SYMBOL_SET_DEFINITIONS.find((definition) => (
        definition.name.toLowerCase() === folded
    ));
}

function loadSymbolSet(name, set, state) {
    if (set === ROGUESET && isDefaultSymset(name)) {
        const arrays = slotArrays(set, state);
        // optfn_roguesymset() asks read_sym_file() for "default"; no Start
        // record matches, so clear_symsetentry() clears metadata and UTF-8
        // customizations without re-running init_rogue_symbols(). Preserve
        // the previously loaded byte table, including this source quirk.
        arrays.baseUtf8.fill(null);
        arrays.overrideUtf8.fill(null);
        state.gs.symset[set] = {
            name: null,
            handling: H_UNK,
            nocolor: 0,
        };
        return;
    }

    resetSymbolSlot(set, state);
    // clear_symsetentry() purges UTF-8 glyph customizations associated with
    // the previous set. Byte overrides live in separate ov_* arrays.
    slotArrays(set, state).overrideUtf8.fill(null);
    if (isDefaultSymset(name)) return;

    const definition = symbolSetDefinition(name);
    if (!definition) throw new Error(`unknown symbol set '${name}'`);
    const arrays = slotArrays(set, state);
    for (const [index, byte] of Object.entries(definition.bytes)) {
        arrays.base[Number(index)] = byte;
    }
    for (const [index, symbol] of Object.entries(definition.utf8)) {
        arrays.baseUtf8[Number(index)] = symbol;
    }
    const entry = state.gs.symset[set];
    entry.name = String(name);
    entry.handling = HANDLING_BY_NAME[definition.handling] ?? H_UNK;
    if (definition.color !== null) entry.nocolor = definition.color ? 0 : 1;
}

// C ref: symbols.c:init_symbols(), init_primary_symbols(),
// init_rogue_symbols(), and the two override initializers.
export function init_symbols(state = game) {
    graphicsState(state);
    state.go.ov_primary_syms = Array(MAXPCHARS).fill(0);
    state.go.ov_primary_utf8_syms = Array(MAXPCHARS).fill(null);
    state.go.ov_rogue_syms = Array(MAXPCHARS).fill(0);
    state.go.ov_rogue_utf8_syms = Array(MAXPCHARS).fill(null);
    resetSymbolSlot(PRIMARYSET, state);
    resetSymbolSlot(ROGUESET, state);
    state.gc.currentgraphics = PRIMARYSET;
    state.gs.showsyms = [...state.gp.primary_syms];
    state.gs.showutf8 = [...state.gp.primary_utf8_syms];
}

function isCWhitespace(byte) {
    return byte === 0x09 || byte === 0x0A || byte === 0x0B
        || byte === 0x0C || byte === 0x0D || byte === 0x20;
}

function digitValue(byte, radix) {
    if (byte >= 0x30 && byte <= 0x39) {
        const value = byte - 0x30;
        return value < radix ? value : -1;
    }
    if (radix === 16 && byte >= 0x41 && byte <= 0x46) return byte - 0x37;
    if (radix === 16 && byte >= 0x61 && byte <= 0x66) return byte - 0x57;
    return -1;
}

function escapedFirstByte(bytes, allowMeta = true) {
    if (!bytes.length) return 0;
    if (bytes[0] === 0x5E) {
        return bytes.length > 1 ? bytes[1] & 0x1F : 0x5E;
    }
    if (bytes[0] !== 0x5C) return bytes[0];
    if (bytes.length === 1) return 0x5C;

    const escape = bytes[1];
    if (allowMeta && (escape === 0x6D || escape === 0x4D)
        && bytes.length > 2) {
        // hacklib.c:escapes() recognizes meta once for this output byte; the
        // following escape is parsed without recursively treating another
        // \m as a second meta prefix.
        return escapedFirstByte(bytes.slice(2), false) | 0x80;
    }

    let radix = 0;
    let start = 0;
    let limit = 0;
    if (escape === 0x78 || escape === 0x58) {
        radix = 16;
        start = 2;
        limit = 2;
    } else if (escape === 0x6F || escape === 0x4F) {
        radix = 8;
        start = 2;
        limit = 3;
    } else if (escape >= 0x30 && escape <= 0x39) {
        radix = 10;
        start = 1;
        limit = 3;
    }
    if (radix) {
        let value = 0;
        let digits = 0;
        while (digits < limit && start + digits < bytes.length) {
            const digit = digitValue(bytes[start + digits], radix);
            if (digit < 0) break;
            value = value * radix + digit;
            ++digits;
        }
        if (digits) return value & 0xFF;
    }

    return {
        0x6E: 0x0A,
        0x74: 0x09,
        0x62: 0x08,
        0x72: 0x0D,
    }[escape] ?? escape;
}

// C ref: options.c:sym_val(). Configuration arrives at C as UTF-8 bytes;
// parsing code units would choose the wrong byte for every non-ASCII value.
export function sym_val(value) {
    let bytes = encodeUtf8ByteString(String(value ?? ''));
    if (bytes.length <= 1) {
        return !bytes.length || isCWhitespace(bytes[0]) ? 0 : bytes[0];
    }
    if (bytes[0] === 0x27) {
        if (bytes.length === 3 && bytes[2] === 0x27) return bytes[1];
        if (bytes.length === 4 && bytes[1] === 0x5C
            && bytes[3] === 0x27
            && [0x27, 0x22, 0x5C].includes(bytes[2])) {
            return bytes[2];
        }
        const closingQuote = bytes.lastIndexOf(0x27);
        if (closingQuote <= 0) return 0;
        bytes = bytes.slice(1, closingQuote);
    }
    return escapedFirstByte(bytes) & 0xFF;
}

function cmapIndex(name) {
    return CMAP_INDEX_BY_OPTION[name] ?? CMAP_OPTION_ALIASES[name];
}

function unicodeOverride(value) {
    const text = String(value);
    if (!/^U\+/iu.test(text)) return undefined;
    const match = text.match(/^U\+([0-9a-f]+)/iu);
    if (!match) return null;
    const codePoint = Number.parseInt(match[1], 16);
    if (!codePoint || codePoint > 0x10FFFF
        || (codePoint >= 0xD800 && codePoint <= 0xDFFF)) {
        return null;
    }
    return String.fromCodePoint(codePoint);
}

function applySymbolAssignments(operation, state) {
    const set = operation.set === 'rogue' ? ROGUESET : PRIMARYSET;
    const arrays = slotArrays(set, state);
    const utf8Handling = state.gs.symset[set].handling === H_UTF8;
    for (const assignment of operation.assignments) {
        const index = cmapIndex(assignment.name);
        if (index === undefined) continue;
        const utf8 = unicodeOverride(assignment.rawValue);
        if (utf8Handling || utf8 !== undefined) {
            // Invalid U+ syntax stays on the custom-glyph path and leaves the
            // existing mapping intact; it never falls back to byte 'U'.
            if (utf8) arrays.overrideUtf8[index] = utf8;
        } else {
            arrays.overrides[index] = sym_val(assignment.rawValue);
        }
    }
}

function selectSymbolSet(operation, state) {
    const set = operation.set === 'rogue' ? ROGUESET : PRIMARYSET;
    if (operation.legacyIBM) {
        let failed = false;
        if (state.gs.symset[PRIMARYSET].name) failed = true;
        else loadSymbolSet('IBMgraphics', PRIMARYSET, state);
        if (state.gs.symset[ROGUESET].name) failed = true;
        else loadSymbolSet('RogueIBM', ROGUESET, state);
        if (!failed) switch_symbols(state, true);
        return;
    }
    if (operation.legacyIfUnset && state.gs.symset[set].name) return;
    loadSymbolSet(operation.name, set, state);
    if (set === PRIMARYSET) {
        switch_symbols(state, !isDefaultSymset(operation.name));
    }
}

function fallbackOperations(options) {
    const operations = [];
    if (options.symset) {
        operations.push({
            kind: 'select', set: 'primary', name: options.symset,
        });
    } else if (options.flags?.decgraphics) {
        operations.push({
            kind: 'select', set: 'primary', name: 'DECgraphics',
            legacyIfUnset: true,
        });
    } else if (options.flags?.ibmgraphics) {
        operations.push({
            kind: 'select', set: 'primary', name: 'IBMgraphics',
            legacyIfUnset: true, legacyIBM: true,
        });
    }
    if (options.roguesymset) {
        operations.push({
            kind: 'select', set: 'rogue', name: options.roguesymset,
        });
    }
    const primary = Object.entries(options.flags ?? {})
        .filter(([name]) => cmapIndex(name) !== undefined)
        .map(([name, rawValue]) => ({ name, rawValue }));
    if (primary.length) {
        operations.push({ kind: 'override', set: 'primary', assignments: primary });
    }
    const rogue = Object.entries(options.rogueSymbols ?? {})
        .filter(([name]) => cmapIndex(name) !== undefined)
        .map(([name, rawValue]) => ({ name, rawValue }));
    if (rogue.length) {
        operations.push({ kind: 'override', set: 'rogue', assignments: rogue });
    }
    return operations;
}

// C ref: symbols.c:switch_symbols(). A false useOverrides value is distinct
// from clearing overrides: symset:default can hide and a later assignment can
// reveal the same stored customization.
export function switch_symbols(state = game, useOverrides = true) {
    graphicsState(state);
    const set = state.gc.currentgraphics ?? PRIMARYSET;
    const arrays = slotArrays(set, state);
    state.gs.showsyms = arrays.base.map((symbol, index) => (
        useOverrides && arrays.overrides[index]
            ? arrays.overrides[index] : symbol
    ));
    state.gs.showutf8 = arrays.baseUtf8.map((symbol, index) => {
        if (!useOverrides) return symbol;
        // UTF-8 glyph customizations are independent of the byte override
        // table. A byte override retained from a previous non-UTF8 set does
        // not suppress the selected UTF-8 set's glyph mapping.
        return arrays.overrideUtf8[index] ?? symbol;
    });
}

export function initialize_symbols_from_options(options, state = game) {
    init_symbols(state);
    const operations = Array.isArray(options.symbolOperations)
        ? options.symbolOperations : fallbackOperations(options);
    for (const operation of operations) {
        if (operation.kind === 'select') selectSymbolSet(operation, state);
        else if (operation.kind === 'override') {
            applySymbolAssignments(operation, state);
            // Both SYMBOLS and ROGUESYMBOLS call switch_symbols(TRUE).
            switch_symbols(state, true);
        }
    }
}

export function cmap_symbol(index, state = game) {
    const activeSet = state.gc?.currentgraphics ?? PRIMARYSET;
    const handling = state.gs?.symset?.[activeSet]?.handling ?? H_UNK;
    const unicode = handling === H_UTF8
        && state.iflags?.customsymbols !== false
        ? state.gs?.showutf8?.[index]
        : null;
    if (unicode) {
        // NOMUX_CAPTURE doesn't intercept g_pututf8(). A null capture
        // character leaves the recorder-facing cell untouched while the
        // browser still receives the source glyph.
        return { ch: null, dec: false, displayCh: unicode };
    }
    const byte = state.gs?.showsyms?.[index]
        ?? state.gp?.primary_syms?.[index]
        ?? DEFAULT_CMAP_SYMBOLS[index]
        ?? '?'.charCodeAt(0);
    const high = (byte & 0x80) !== 0;
    const low = byte & 0x7F;
    const eightBit = Boolean(state.iflags?.wc_eight_bit_input);
    const dec = high && handling !== H_IBM && handling !== H_UTF8
        && !(eightBit && (handling !== H_DEC || low < 0x60));
    const result = { ch: String.fromCharCode(high ? low : byte), dec };
    if (high && handling === H_IBM) result.displayCh = CP437_HIGH[low];
    return result;
}
