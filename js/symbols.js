// symbols.js -- Primary display-symbol initialization and selection.
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
    TRAPNUM,
    SYM_BOULDER,
} from './const.js';
import { game } from './gstate.js';
import { encodeUtf8ByteString } from './hacklib.js';
import { escapes } from './options_escapes.js';
import {
    DEFAULT_PRIMARY_SYMBOLS,
    DEFAULT_ROGUE_SYMBOLS,
    SYMBOL_INDEX_BY_NAME,
    SYMBOL_SET_DEFINITIONS,
    SYM_MAX,
    SYM_OFF_M,
    SYM_OFF_O,
    SYM_OFF_P,
    SYM_OFF_W,
    SYM_OFF_X,
} from './symbol_data.js';

export {
    SYM_MAX,
    SYM_OFF_M,
    SYM_OFF_O,
    SYM_OFF_P,
    SYM_OFF_W,
    SYM_OFF_X,
};

export const MAXPCHARS = SYM_OFF_O - SYM_OFF_P;
export const MAXOCLASSES = SYM_OFF_M - SYM_OFF_O;
export const MAXMCLASSES = SYM_OFF_W - SYM_OFF_M;
export const MAXOTHER = SYM_MAX - SYM_OFF_X;

function requiredSourceSymbol(name) {
    const index = SYMBOL_INDEX_BY_NAME[name];
    if (!Number.isInteger(index))
        throw new Error(`generated symbol data is missing ${name}`);
    return index;
}

// Keep every public defsym index tied to the generated defsym.h table.  These
// are cmap-relative today because SYM_OFF_P is zero, but retaining the offset
// makes that ownership explicit and catches a generator/layout change.
function requiredCmapSymbol(name) {
    const index = requiredSourceSymbol(name) - SYM_OFF_P;
    if (index < 0 || index >= MAXPCHARS)
        throw new Error(`${name} is outside the primary cmap range`);
    return index;
}

export const S_stone = requiredCmapSymbol('s_stone');
export const S_vwall = requiredCmapSymbol('s_vwall');
export const S_hwall = requiredCmapSymbol('s_hwall');
export const S_tlcorn = requiredCmapSymbol('s_tlcorn');
export const S_trcorn = requiredCmapSymbol('s_trcorn');
export const S_blcorn = requiredCmapSymbol('s_blcorn');
export const S_brcorn = requiredCmapSymbol('s_brcorn');
export const S_crwall = requiredCmapSymbol('s_crwall');
export const S_tuwall = requiredCmapSymbol('s_tuwall');
export const S_tdwall = requiredCmapSymbol('s_tdwall');
export const S_tlwall = requiredCmapSymbol('s_tlwall');
export const S_trwall = requiredCmapSymbol('s_trwall');
export const S_ndoor = requiredCmapSymbol('s_ndoor');
export const S_vodoor = requiredCmapSymbol('s_vodoor');
export const S_hodoor = requiredCmapSymbol('s_hodoor');
export const S_vcdoor = requiredCmapSymbol('s_vcdoor');
export const S_hcdoor = requiredCmapSymbol('s_hcdoor');
export const S_bars = requiredCmapSymbol('s_bars');
export const S_tree = requiredCmapSymbol('s_tree');
export const S_room = requiredCmapSymbol('s_room');
export const S_darkroom = requiredCmapSymbol('s_darkroom');
export const S_engroom = requiredCmapSymbol('s_engroom');
export const S_corr = requiredCmapSymbol('s_corr');
export const S_litcorr = requiredCmapSymbol('s_litcorr');
export const S_engrcorr = requiredCmapSymbol('s_engrcorr');
export const S_upstair = requiredCmapSymbol('s_upstair');
export const S_dnstair = requiredCmapSymbol('s_dnstair');
export const S_upladder = requiredCmapSymbol('s_upladder');
export const S_dnladder = requiredCmapSymbol('s_dnladder');
export const S_brupstair = requiredCmapSymbol('s_brupstair');
export const S_brdnstair = requiredCmapSymbol('s_brdnstair');
export const S_brupladder = requiredCmapSymbol('s_brupladder');
export const S_brdnladder = requiredCmapSymbol('s_brdnladder');
export const S_altar = requiredCmapSymbol('s_altar');
export const S_grave = requiredCmapSymbol('s_grave');
export const S_throne = requiredCmapSymbol('s_throne');
export const S_sink = requiredCmapSymbol('s_sink');
export const S_fountain = requiredCmapSymbol('s_fountain');
export const S_pool = requiredCmapSymbol('s_pool');
export const S_ice = requiredCmapSymbol('s_ice');
export const S_lava = requiredCmapSymbol('s_lava');
export const S_lavawall = requiredCmapSymbol('s_lavawall');
export const S_vodbridge = requiredCmapSymbol('s_vodbridge');
export const S_hodbridge = requiredCmapSymbol('s_hodbridge');
export const S_vcdbridge = requiredCmapSymbol('s_vcdbridge');
export const S_hcdbridge = requiredCmapSymbol('s_hcdbridge');
export const S_air = requiredCmapSymbol('s_air');
export const S_cloud = requiredCmapSymbol('s_cloud');
export const S_water = requiredCmapSymbol('s_water');
export const S_poisoncloud = requiredCmapSymbol('s_poisoncloud');
export const S_arrow_trap = requiredCmapSymbol('s_arrow_trap');
// The two ends of defsym.h's zap/effect run. display.h's enum glyph_offsets
// spaces GLYPH_SWALLOW_OFF by ((S_goodpos - S_digbeam) + 1), so both indices
// are inputs to js/glyph_offsets.js.
export const S_digbeam = requiredCmapSymbol('s_digbeam');
export const S_goodpos = requiredCmapSymbol('s_goodpos');
// The base of the four beam directions a zap glyph carries, which
// glyphs.c glyph_to_cmap() (1003-1004) adds its remainder to.
export const S_vbeam = requiredCmapSymbol('s_vbeam');

// C ref: rm.h trap_to_defsym()/defsym_to_trap().
export function trap_to_defsym(ttyp) {
    if (!Number.isInteger(ttyp) || ttyp <= 0 || ttyp >= TRAPNUM)
        throw new RangeError(`trap type ${ttyp} is outside the source range`);
    return S_arrow_trap + ttyp - 1;
}

export function defsym_to_trap(defsym) {
    const ttyp = defsym - S_arrow_trap + 1;
    if (!Number.isInteger(defsym) || ttyp <= 0 || ttyp >= TRAPNUM)
        throw new RangeError(`defsym ${defsym} is not a trap symbol`);
    return ttyp;
}

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
        state.gr.rogue_syms = [...DEFAULT_ROGUE_SYMBOLS];
        state.gr.rogue_utf8_syms = Array(SYM_MAX).fill(null);
    } else {
        state.gp.primary_syms = [...DEFAULT_PRIMARY_SYMBOLS];
        state.gp.primary_utf8_syms = Array(SYM_MAX).fill(null);
    }
    state.gs.symset[set] = {
        name: null,
        handling: H_UNK,
        // init_rogue_symbols() makes this table colorless after clearing the
        // symset metadata. Named Rogue sets start through that same path.
        nocolor: rogue ? 1 : 0,
        glyphs: Object.freeze({}),
    };
}

// C ref: symbols.c clear_symsetentry().  In particular, this does not restore
// primary_syms[] or showsyms[]: a failed selection after a successful one
// clears the selected name and handling while leaving the earlier byte table
// displayed.  init_primary_symbols() is the separate operation that resets it.
export function clear_symsetentry(set, nameToo, state = game) {
    graphicsState(state);
    const entry = state.gs.symset[set];
    entry.desc = null;
    entry.handling = H_UNK;
    entry.nocolor = 0;
    entry.primary = 0;
    entry.rogue = 0;
    entry.glyphs = Object.freeze({});
    if (nameToo) entry.name = null;
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
            glyphs: Object.freeze({}),
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
    // Concrete G_* customizations come only from the selected symbols file.
    // symbols.c:parsesymbols() validates and saves standalone G_* entries but
    // deliberately does not pass them to glyphrep_to_custom_map_entries().
    entry.glyphs = { ...definition.glyphs };
    if (definition.color !== null) entry.nocolor = definition.color ? 0 : 1;
}

// C ref: symbols.c:init_symbols(), init_primary_symbols(),
// init_rogue_symbols(), and the two override initializers.
export function init_symbols(state = game) {
    graphicsState(state);
    state.go.ov_primary_syms = Array(SYM_MAX).fill(0);
    state.go.ov_primary_utf8_syms = Array(SYM_MAX).fill(null);
    state.go.ov_rogue_syms = Array(SYM_MAX).fill(0);
    state.go.ov_rogue_utf8_syms = Array(SYM_MAX).fill(null);
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
    return escapes(bytes)[0] ?? 0;
}

function symbolIndex(name) {
    return SYMBOL_INDEX_BY_NAME[name];
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
        if (assignment.kind === 'glyph') {
            // C ref: symbols.c parsesymbols().  match_glyph() validates this
            // name and savedsym_add() retains it for config serialization,
            // but the mutation block is guarded by symp and G_* has none.
            continue;
        }
        const index = symbolIndex(assignment.name);
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

function applyBoulderOverride(operation, state) {
    const index = SYM_OFF_X + SYM_BOULDER;
    state.go.ov_primary_syms[index] = operation.byte;
    state.go.ov_rogue_syms[index] = operation.byte;
}

function applyLegacyBoulderOverride(operation, state) {
    state.go.ov_primary_syms[SYM_OFF_X + SYM_BOULDER] = operation.byte;
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
        .filter(([name]) => symbolIndex(name) !== undefined)
        .map(([name, rawValue]) => ({ name, rawValue }));
    if (primary.length) {
        operations.push({ kind: 'override', set: 'primary', assignments: primary });
    }
    const rogue = Object.entries(options.rogueSymbols ?? {})
        .filter(([name]) => symbolIndex(name) !== undefined)
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
        switch (operation.kind) {
        case 'select':
            selectSymbolSet(operation, state);
            break;
        case 'clear': {
            const set = operation.set === 'rogue' ? ROGUESET : PRIMARYSET;
            clear_symsetentry(set, operation.nameToo, state);
            break;
        }
        case 'override':
            applySymbolAssignments(operation, state);
            // Both SYMBOLS and ROGUESYMBOLS call switch_symbols(TRUE).
            switch_symbols(state, true);
            break;
        case 'boulder':
            // options.c optfn_boulder() defers the active showsyms write
            // during initial parsing, but owns both override tables now.
            applyBoulderOverride(operation, state);
            break;
        case 'legacy-boulder':
            // cfgfiles.c cnf_line_BOULDER() predates the compound option and
            // changes only the primary override table.
            applyLegacyBoulderOverride(operation, state);
            break;
        default:
            throw new Error(
                `unknown symbol operation '${String(operation.kind)}'`,
            );
        }
    }
}

// C ref: symbols.c get_othersym().  DEFAULT_* already contains the four
// fallback symbols that the source switch supplies when an override and the
// selected set both have zero; the other two miscellaneous slots remain zero.
export function get_othersym(index, set = PRIMARYSET, state = game) {
    if (!Number.isInteger(index) || index < 0 || index >= MAXOTHER)
        throw new RangeError(`other symbol ${index} is outside MAXOTHER`);
    const absolute = SYM_OFF_X + index;
    const arrays = slotArrays(set === ROGUESET ? ROGUESET : PRIMARYSET, state);
    return arrays.overrides[absolute]
        || arrays.base[absolute]
        || DEFAULT_PRIMARY_SYMBOLS[absolute]
        || 0;
}

// This is the symbol-owned portion of options.c initoptions_finish().  It
// runs after every symset and S_* operation, so the final primary override is
// the byte the first ordinary or tutorial map displays.
export function finish_boulder_symbol(state = game) {
    const symbol = get_othersym(SYM_BOULDER, PRIMARYSET, state);
    if (symbol) state.gs.showsyms[SYM_OFF_X + SYM_BOULDER] = symbol;
}

function rawSymbol(index, state) {
    return state.gs?.showsyms?.[index]
        ?? state.gp?.primary_syms?.[index]
        ?? DEFAULT_PRIMARY_SYMBOLS[index]
        ?? '?'.charCodeAt(0);
}

// display.c:reset_glyphmap() compares gs.showsyms bytes before the tty port
// interprets their high bit. Keep that comparison distinct from presentation.
export function cmap_symbol_byte(index, state = game) {
    if (!Number.isInteger(index) || index < 0 || index >= MAXPCHARS)
        throw new RangeError(`cmap index ${index} is outside MAXPCHARS`);
    return rawSymbol(SYM_OFF_P + index, state);
}

/** Convert any absolute symbols.c index to recorder/browser presentation. */
export function symbol_at(
    index,
    state = game,
    { allowUnicode = true } = {},
) {
    if (!Number.isInteger(index) || index < 0 || index >= SYM_MAX)
        throw new RangeError(`symbol index ${index} is outside SYM_MAX`);
    const activeSet = state.gc?.currentgraphics ?? PRIMARYSET;
    const handling = state.gs?.symset?.[activeSet]?.handling ?? H_UNK;
    const unicode = allowUnicode && handling === H_UTF8
        && state.iflags?.customsymbols !== false
        ? state.gs?.showutf8?.[index]
        : null;
    if (unicode) {
        // NOMUX_CAPTURE doesn't intercept g_pututf8(). A null capture
        // character leaves the recorder-facing cell untouched while the
        // browser still receives the source glyph.
        const result = { ch: null, dec: false, displayCh: unicode };
        Object.defineProperty(result, 'ttychar', {
            value: rawSymbol(index, state),
        });
        return result;
    }
    const byte = rawSymbol(index, state);
    const high = (byte & 0x80) !== 0;
    const low = byte & 0x7F;
    const eightBit = Boolean(state.iflags?.wc_eight_bit_input);
    const dec = high && handling !== H_IBM && handling !== H_UTF8
        && !(eightBit && (handling !== H_DEC || low < 0x60));
    const result = { ch: String.fromCharCode(high ? low : byte), dec };
    if (high && handling === H_IBM) result.displayCh = CP437_HIGH[low];
    Object.defineProperty(result, 'ttychar', { value: byte });
    return result;
}

export function cmap_symbol(index, state = game) {
    if (!Number.isInteger(index) || index < 0 || index >= MAXPCHARS)
        throw new RangeError(`cmap index ${index} is outside MAXPCHARS`);
    return symbol_at(SYM_OFF_P + index, state);
}

export function monster_class_symbol(mlet, state = game) {
    if (!Number.isInteger(mlet) || mlet < 0 || mlet >= MAXMCLASSES)
        throw new RangeError(`monster class ${mlet} is outside MAXMCLASSES`);
    return symbol_at(SYM_OFF_M + mlet, state);
}

// glyphs.c's find_oc() applies an S_* Unicode customization to a concrete
// object only when the glyph's object index is the generic class entry.  Byte
// symbol tables still apply class-wide, as they do in showsyms[].
export function object_class_symbol(oclass, state = game, otyp = oclass) {
    if (!Number.isInteger(oclass) || oclass < 0 || oclass >= MAXOCLASSES)
        throw new RangeError(`object class ${oclass} is outside MAXOCLASSES`);
    return symbol_at(SYM_OFF_O + oclass, state, {
        allowUnicode: otyp === oclass,
    });
}

export function misc_symbol(index, state = game) {
    if (!Number.isInteger(index) || index < 0 || index >= MAXOTHER)
        throw new RangeError(`misc symbol ${index} is outside MAXOTHER`);
    return symbol_at(SYM_OFF_X + index, state);
}

export function optional_misc_symbol(index, state = game) {
    const absolute = SYM_OFF_X + index;
    const symbol = symbol_at(absolute, state);
    if (!symbol.displayCh && rawSymbol(absolute, state) === 0) return null;
    return symbol;
}

function parseGlyphCustomization(raw) {
    if (typeof raw !== 'string') return null;
    const [symbolPart, colorPart] = raw.split('/', 2);
    let displayCh = null;
    if (symbolPart) {
        const match = symbolPart.match(/^U\+([0-9a-f]{1,6})$/iu);
        if (!match) return null;
        const codePoint = Number.parseInt(match[1], 16);
        if (!codePoint || codePoint > 0x10FFFF
            || (codePoint >= 0xD800 && codePoint <= 0xDFFF)) return null;
        displayCh = String.fromCodePoint(codePoint);
    }
    let rgb = null;
    if (colorPart && /^\d{1,3}-\d{1,3}-\d{1,3}$/u.test(colorPart)) {
        const channels = colorPart.split('-').map(Number);
        if (channels.every((channel) => channel >= 0 && channel <= 255))
            rgb = channels;
    }
    return displayCh || rgb ? { displayCh, rgb } : null;
}

/** Named G_* customization for a concrete glyph family. */
export function glyph_customization(name, state = game) {
    const activeSet = state.gc?.currentgraphics ?? PRIMARYSET;
    const parsed = parseGlyphCustomization(
        state.gs?.symset?.[activeSet]?.glyphs?.[name],
    );
    if (!parsed) return null;

    // glyphs.c:apply_customizations() gates the two halves independently.
    // A color customization still applies when customsymbols is disabled,
    // and a Unicode representation still applies when customcolors is off.
    const displayCh = state.gs?.symset?.[activeSet]?.handling === H_UTF8
        && state.iflags?.customsymbols !== false
        ? parsed.displayCh : null;
    const rgb = state.iflags?.customcolors !== false ? parsed.rgb : null;
    return displayCh || rgb ? { displayCh, rgb } : null;
}
