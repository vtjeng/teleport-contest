// pager.c -- What-is and farlook descriptions.
// C refs: pager.c self_lookat(), checkfile(), do_screen_description(),
// do_look(), and dowhatis(). The port covers ordinary hero and terrain map
// lookups, typed encyclopedia names, carried-item lookups, map lists,
// repetition, and Escape.

import {
    BLINDED,
    BOLT_LIM,
    COLNO,
    D_BROKEN,
    D_TRAPPED,
    ECMD_OK,
    GRAVE,
    GPCOORDS_MAP,
    GPCOORDS_NONE,
    HALLUC,
    HALLUC_RES,
    Is_airlevel,
    Is_waterlevel,
    NEUTRAL,
    OBJ_FLOOR,
    PICK_ONE,
    ROWNO,
    Upolyd,
    Ugender,
    u_at,
} from './const.js';
import { pmname } from './do_name.js';
import { trapped_chest_at, trapped_door_at } from './detect.js';
import {
    SCORER_DEC_MAP,
    cmap_to_glyph,
    glyph_at,
    glyph_is_cmap,
    glyph_is_monster,
    glyph_is_object,
    glyph_is_trap,
    glyph_to_cmap,
    glyph_to_trap,
    engraving_to_glyph,
    map_glyphinfo,
    trap_to_glyph,
} from './display.js';
import { DATA_BASE_ENTRIES } from './data_base_data.js';
import { engr_at } from './engrave.js';
import { fruit_from_name, makesingular } from './fruit.js';
import { LOOK_TRADITIONAL, getpos } from './getpos.js';
import { game } from './gstate.js';
import { mungspaces } from './hacklib.js';
import { HELP_TEXT_FILES } from './help_data.js';
import { display_inventory } from './invent.js';
import { tty_yn_function } from './getline.js';
import { m_at } from './monst.js';
import {
    an,
    distant_name,
    donameFresh,
    singular,
    xnameFresh,
} from './objnam.js';
import { SLIME_MOLD } from './objects.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import {
    MAXPCHARS,
    S_brupstair,
    S_corr,
    S_darkroom,
    S_engrcorr,
    S_engroom,
    S_grave,
    S_hcdbridge,
    S_litcorr,
    S_ndoor,
    S_room,
    S_stone,
    S_trwall,
    S_upstair,
    S_vwall,
    S_vodbridge,
    cmap_symbol_byte,
} from './symbols.js';
import { NO_COLOR } from './terminal.js';
import { rn2 } from './rng.js';
import { describeMonster } from './startup_a11y.js';
import {
    displayTtyMenuTextWindow,
    displayTtyTextWindow,
    menuTitleStyle,
    ttyMenuLayout,
} from './tty_menu.js';
import { ttyPline, ttyPutmixed } from './tty_message.js';
import { doextversion } from './version.js';
import { t_at, trapname } from './trap.js';
import { couldsee } from './vision.js';
import { getlin, select_menu } from './windows.js';

export const WHAT_IS_A_LOCATION = 'a monster, object or location';

export class UnsupportedWhatisError extends Error {
    constructor(reason) {
        super(`unsupported whatis: ${reason}`);
        this.name = 'UnsupportedWhatisError';
        this.reason = reason;
    }
}

export class UnsupportedHelpError extends Error {
    constructor(reason) {
        super(`unsupported help: ${reason}`);
        this.name = 'UnsupportedHelpError';
        this.reason = reason;
    }
}

function propertyActive(state, index) {
    const property = state.u?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic)
        && !property?.blocked;
}

function heroHallucinating(state) {
    return propertyActive(state, HALLUC)
        && !propertyActive(state, HALLUC_RES);
}

function heroBlind(state) {
    return propertyActive(state, BLINDED)
        || Boolean(state.u?.uroleplay?.blind);
}

function assertOrdinaryWhatisState(state) {
    if (state.flags?.lootabc)
        throw new UnsupportedWhatisError('the lootabc menu');
    if (state.u?.uswallow)
        throw new UnsupportedWhatisError('a swallowed hero');
    if (heroHallucinating(state))
        throw new UnsupportedWhatisError('a hallucinating hero');
    if (heroBlind(state))
        throw new UnsupportedWhatisError('a blind hero');
}

export function whatisMenuItems(state = game) {
    assertOrdinaryWhatisState(state);
    return [
        { value: '/', selector: '/', label: 'something on the map' },
        { value: 'i', selector: 'i', label: "something you're carrying" },
        { value: '?', selector: '?', label: 'something else (by symbol or name)' },
        { value: 'm', selector: 'm', label: 'nearby monsters' },
        { value: 'M', selector: 'M', label: 'all monsters shown on map' },
        { value: 'o', selector: 'o', label: 'nearby objects' },
        { value: 'O', selector: 'O', label: 'all objects shown on map' },
        { value: 't', selector: 't', label: 'nearby traps' },
        { value: 'T', selector: 'T', label: 'all seen or remembered traps' },
        { value: 'e', selector: 'e', label: 'nearby engravings' },
        { value: 'E', selector: 'E', label: 'all seen or remembered engravings' },
    ];
}

function menuLines(state) {
    const items = whatisMenuItems(state);
    return [...items.slice(0, 3), { text: '' }, ...items.slice(3)];
}

// C ref: pager.c self_lookat() (657-702). The current goal reaches the
// unpolymorphed, unmounted, untrapped, visible human Wizard branch.
export function self_lookat(state = game) {
    if (Upolyd(state.u)
        || state.u?.usteed
        || state.u?.utrap
        || state.u?.uundetected
        || state.u?.ap_type) {
        throw new UnsupportedWhatisError('an exceptional hero description');
    }
    const species = state.mons?.[state.u?.umonnum]
        ?? state.youmonst?.data;
    if (!species?.pmnames)
        throw new UnsupportedWhatisError('a hero form without monster names');
    const race = state.urace?.adj;
    if (!race)
        throw new UnsupportedWhatisError('a hero race without an adjective');
    return `${race} ${pmname(species, Ugender(state))} called ${state.plname}`;
}

// C ref: pager.c look_at_monster(), through the ordinary live-monster branch
// reached by the whatis list commands. startup_a11y.js owns the already-ported
// distant_monnam() description shared with accessibility notices.
function look_at_monster(monster, x, y, state) {
    if (monster.mx !== x || monster.my !== y)
        throw new UnsupportedWhatisError('a long-worm tail');
    return describeMonster(monster, { state });
}

// C ref: pager.c object_from_map(), through an ordinary live floor object.
// Synthetic, buried, generic, and mimic reconstruction remain outside this
// slice because no selected command path reaches them.
function object_from_map(glyph, x, y, state) {
    if (!glyph_is_object(glyph))
        throw new UnsupportedWhatisError('a non-object map glyph');
    const object = state.level?.objects?.[x]?.[y] ?? null;
    if (!object || object.where !== OBJ_FLOOR)
        throw new UnsupportedWhatisError('a reconstructed map object');
    return object;
}

// C ref: pager.c look_at_object(), through ordinary room-floor objects.
function look_at_object(glyph, x, y, state) {
    const object = object_from_map(glyph, x, y, state);
    if (object.quan !== 1 && !object.dknown) {
        throw new UnsupportedWhatisError(
            'a distant stack with an unknown quantity',
        );
    }
    return distant_name(object, donameFresh, state);
}

// C ref: pager.c look_region_nearby(). The x=0 column is not playable, while
// y=0 is, so the two lower bounds deliberately differ.
export function look_region_nearby(nearby, state = game) {
    return {
        loY: nearby ? Math.max(state.u.uy - BOLT_LIM, 0) : 0,
        loX: nearby ? Math.max(state.u.ux - BOLT_LIM, 1) : 1,
        hiY: nearby ? Math.min(state.u.uy + BOLT_LIM, ROWNO - 1) : ROWNO - 1,
        hiX: nearby ? Math.min(state.u.ux + BOLT_LIM, COLNO - 1) : COLNO - 1,
    };
}

function mapCoordinate(x, y) {
    const coordinate = `<${x},${y}>${y < 10 ? ' ' : ''}`;
    return coordinate.padStart(8);
}

function trapOrEngravingMapCoordinate(x, y) {
    // Unlike look_all(), pager.c look_traps() and look_engrs() do not append
    // the single-digit-y alignment space before applying the width-eight pad.
    return `<${x},${y}>`.padStart(8);
}

// C ref: pager.c look_all(), for live monster and floor-object glyphs under
// the default map-coordinate mode. The scan is y-major, then x-minor.
export async function look_all(nearby, doMons, state = game) {
    const coordinateMode = state.iflags?.getpos_coords ?? GPCOORDS_NONE;
    if (coordinateMode !== GPCOORDS_NONE
        && coordinateMode !== GPCOORDS_MAP) {
        throw new UnsupportedWhatisError('alternate list coordinates');
    }
    const { loX, loY, hiX, hiY } = look_region_nearby(nearby, state);
    const lines = [];
    for (let y = loY; y <= hiY; ++y) {
        for (let x = loX; x <= hiX; ++x) {
            const glyph = glyph_at(x, y, state);
            let description = '';
            if (doMons && glyph_is_monster(glyph)) {
                if (u_at(x, y, state)) {
                    description = self_lookat(state);
                } else {
                    const monster = m_at(x, y, state);
                    if (monster)
                        description = look_at_monster(monster, x, y, state);
                }
            } else if (!doMons && glyph_is_object(glyph)) {
                description = look_at_object(glyph, x, y, state);
            }
            if (!description) continue;

            if (!lines.length) {
                const which = doMons ? 'monsters' : 'objects';
                lines.push({
                    text: nearby
                        ? `${which[0].toUpperCase()}${which.slice(1)} currently shown near <${state.u.ux},${state.u.uy}>:`
                        : `All ${which} currently shown on the map:`,
                });
                lines.push({ text: '    ' });
            }
            const location = state.level?.at(x, y);
            const symbol = location?.disp_ch
                ?? visibleGlyphCharacter(map_glyphinfo(glyph, state));
            lines.push({
                text: `${mapCoordinate(x, y)}  ${symbol}  ${description}`,
            });
        }
    }

    if (lines.length) {
        await displayTtyTextWindow(state, lines);
    } else {
        await ttyPline(
            `No ${doMons ? 'monsters' : 'objects'} are currently shown ${
                nearby ? 'nearby' : 'on the map'
            }.`,
            state,
        );
    }
}

// C ref: pager.c trap_description().
export function trap_description(ttyp, x, y, state = game) {
    if (trapped_chest_at(ttyp, x, y, state)) return 'trapped chest';
    if (trapped_door_at(ttyp, x, y, state)) return 'trapped door';
    return trapname(ttyp);
}

// C ref: pager.c add_quoted_engraving(). JavaScript returns the extended
// string because strings are immutable; an ineligible engraving returns the
// original string, matching C's untouched buffer.
export function add_quoted_engraving(x, y, buffer, force, state = game) {
    const engraving = engr_at(x, y, state);
    const floorEngraving = buffer === ' (engraving';
    const headstone = buffer === ' (grave';
    if (!engraving || (!floorEngraving && !headstone && !force)) return buffer;
    if (engraving.eread) {
        const label = headstone ? 'headstone reading' : 'remembered text';
        const text = engraving.engr_txt?.[1] ?? '';
        return `${buffer} with ${label}: "${text}"`;
    }
    const unread = headstone ? 'whose headstone' : 'that';
    return `${buffer} ${unread} you haven't read`;
}

function assertDefaultListCoordinates(state) {
    const coordinateMode = state.iflags?.getpos_coords ?? GPCOORDS_NONE;
    if (coordinateMode !== GPCOORDS_NONE
        && coordinateMode !== GPCOORDS_MAP) {
        throw new UnsupportedWhatisError('alternate list coordinates');
    }
}

function encodedGlyphCharacter(glyph, state) {
    return visibleGlyphCharacter(map_glyphinfo(glyph, state));
}

function displayedGlyphCharacter(glyph, x, y, state) {
    const location = state.level?.at(x, y);
    if (location?.disp_browser_ch) return location.disp_browser_ch;
    if (location?.disp_decgfx) {
        return SCORER_DEC_MAP[location.disp_ch] ?? location.disp_ch;
    }
    return location?.disp_ch ?? encodedGlyphCharacter(glyph, state);
}

// C ref: pager.c look_traps(). The scan is y-major, then x-minor.
export async function look_traps(nearby, state = game) {
    assertDefaultListCoordinates(state);
    const { loX, loY, hiX, hiY } = look_region_nearby(nearby, state);
    const lines = [];
    for (let y = loY; y <= hiY; ++y) {
        for (let x = loX; x <= hiX; ++x) {
            let glyph = glyph_at(x, y, state);
            let description = '';
            let obscuring = '';
            if (glyph_is_trap(glyph)) {
                description = trap_description(
                    glyph_to_trap(glyph), x, y, state,
                );
            } else {
                const trap = t_at(x, y, state);
                if (trap?.tseen
                    && ((!Is_waterlevel(state.u?.uz)
                        && !Is_airlevel(state.u?.uz))
                        || couldsee(x, y, state))) {
                    obscuring = displayedGlyphCharacter(
                        glyph, x, y, state,
                    );
                    description = `${trapname(trap.ttyp)}, obscured by `
                        + obscuring;
                    glyph = trap_to_glyph(trap, state);
                }
            }
            if (!description) continue;
            if (!lines.length) {
                lines.push({
                    text: nearby
                        ? 'Nearby seen or remembered traps:'
                        : 'Seen or remembered traps on this level:',
                });
                lines.push({ text: '    ' });
            }
            const symbol = encodedGlyphCharacter(glyph, state);
            const prefix = trapOrEngravingMapCoordinate(x, y);
            const text = `${prefix}  ${symbol}  ${description}`;
            const glyphCells = [{ column: 10, ch: symbol }];
            if (obscuring) {
                glyphCells.push({
                    column: text.length - obscuring.length,
                    ch: obscuring,
                });
            }
            lines.push({ text, glyphCells });
        }
    }
    if (lines.length) {
        await displayTtyTextWindow(state, lines);
    } else {
        await ttyPline(
            `No traps seen or remembered${nearby ? ' nearby' : ''}.`, state,
        );
    }
}

function isCmapEngraving(index) {
    return index === S_engroom || index === S_engrcorr;
}

// C ref: pager.c look_engrs(). The scan is y-major, then x-minor.
export async function look_engrs(nearby, state = game) {
    assertDefaultListCoordinates(state);
    const { loX, loY, hiX, hiY } = look_region_nearby(nearby, state);
    const lines = [];
    for (let y = loY; y <= hiY; ++y) {
        for (let x = loX; x <= hiX; ++x) {
            const location = state.level?.at(x, y);
            if (!location?.seenv) continue;
            const engraving = engr_at(x, y, state);
            if (!engraving) continue;
            const lastSeenType = state.level?.lastseentyp?.[x]?.[y]
                ?? location.typ;
            const headstone = lastSeenType === GRAVE;
            let description = add_quoted_engraving(
                x, y, ` (${headstone ? 'grave' : 'engraving'}`, true, state,
            );
            if (headstone) {
                description = description
                    .replace('(grave with ', '')
                    .replace('(grave whose ', '');
            } else {
                description = description
                    .replace('(engraving with ', '')
                    .replace('(engraving ', 'engraving ');
            }

            let glyph = glyph_at(x, y, state);
            const symbol = glyph_is_cmap(glyph)
                ? glyph_to_cmap(glyph) : null;
            let obscuring = '';
            if (!isCmapEngraving(symbol) && symbol !== S_grave) {
                obscuring = displayedGlyphCharacter(
                    glyph, x, y, state,
                );
                description += `, obscured by ${obscuring}`;
                glyph = headstone
                    ? cmap_to_glyph(S_grave, state)
                    : engraving_to_glyph(engraving, state);
            }
            if (!lines.length) {
                lines.push({
                    text: nearby
                        ? 'Nearby seen or remembered engravings:'
                        : 'Seen or remembered engravings on this level:',
                });
                lines.push({ text: '    ' });
            }
            const renderedSymbol = encodedGlyphCharacter(glyph, state);
            const prefix = trapOrEngravingMapCoordinate(x, y);
            const text = `${prefix}  ${renderedSymbol} ${description}`;
            const glyphCells = [{ column: 10, ch: renderedSymbol }];
            if (obscuring) {
                glyphCells.push({
                    column: text.length - obscuring.length,
                    ch: obscuring,
                });
            }
            lines.push({ text, glyphCells });
        }
    }
    if (lines.length) {
        await displayTtyTextWindow(state, lines);
    } else {
        await ttyPline(
            `No engravings seen or remembered${nearby ? ' nearby' : ''}.`,
            state,
        );
    }
}

function appendDescription(out, description) {
    // pager.c append_str() treats a case-insensitive substring as an existing
    // match. That collapses the eleven wall indices to one "wall" entry.
    if (out.toLowerCase().includes(description.toLowerCase())) return out;
    return `${out} or ${description}`;
}

function cmapDescriptionWithArticle(index, explanation) {
    if (index === S_stone || explanation === 'air'
        || explanation === 'land' || explanation === 'ice') {
        return explanation;
    }
    if (explanation.includes(' of a room')) return `the ${explanation}`;
    return an(explanation);
}

function visibleGlyphCharacter(glyphinfo) {
    if (glyphinfo.displayCh) return glyphinfo.displayCh;
    if (glyphinfo.dec)
        return SCORER_DEC_MAP[glyphinfo.ch] ?? glyphinfo.ch;
    return glyphinfo.ch;
}

// C ref: pager.c lookat() (657-801), ordinary cmap branches reached by the
// whatis cursor-terrain witness. Other glyph families remain later slices.
function lookatOrdinaryTerrain(x, y, glyph, state) {
    const index = glyph_to_cmap(glyph);
    const supported = index === S_stone
        || (index >= S_vwall && index <= S_trwall)
        || index === S_ndoor
        || index === S_room || index === S_darkroom
        || index === S_corr || index === S_litcorr
        || index === S_upstair || index === S_brupstair;
    if (!supported) {
        throw new UnsupportedWhatisError(
            `terrain ${CMAP_EXPLANATIONS[index] ?? index}`,
        );
    }
    if (index === S_ndoor) {
        const location = state.level?.at(x, y);
        const mask = location?.flags ?? location?.doormask ?? 0;
        return (mask & ~D_TRAPPED) === D_BROKEN ? 'broken door' : 'doorway';
    }
    return CMAP_EXPLANATIONS[index];
}

// C ref: pager.c do_screen_description() and lookat(), for the ordinary hero
// and cmap branches exercised by the current whatis goal. The generic list is
// built in defsym.h order before lookat() refines an ambiguous map symbol.
export function do_screen_description(cc, looked, sym, state = game) {
    if (!looked || sym)
        throw new UnsupportedWhatisError('a typed symbol');
    if (cc.x === state.u.ux && cc.y === state.u.uy) {
        const location = state.level?.at(cc.x, cc.y);
        const displayCharacter = location?.disp_ch ?? '@';
        if (displayCharacter !== '@')
            throw new UnsupportedWhatisError('a non-human hero glyph');
        const detail = self_lookat(state);
        return {
            found: 1,
            out: `${displayCharacter}        a human or elf (${detail})`,
            firstmatch: detail,
        };
    }

    const glyph = glyph_at(cc.x, cc.y, state);
    if (!glyph_is_cmap(glyph))
        throw new UnsupportedWhatisError('a non-terrain map glyph');
    const glyphinfo = map_glyphinfo(glyph, state);
    const symbolByte = glyphinfo.ttychar;
    let found = 0;
    let firstmatch = 'unknown';
    let out = `${visibleGlyphCharacter(glyphinfo)}        `;
    for (let index = 0; index < MAXPCHARS; ++index) {
        const explanation = CMAP_EXPLANATIONS[index];
        if (!explanation || cmap_symbol_byte(index, state) !== symbolByte)
            continue;
        // pager.c add_cmap_descr() omits drawbridge variants once three
        // earlier matches already explain this heavily overloaded symbol.
        if (found >= 3 && index >= S_vodbridge && index <= S_hcdbridge)
            continue;
        const described = cmapDescriptionWithArticle(index, explanation);
        if (!found) {
            out += described;
            firstmatch = explanation;
            found = 1;
        } else {
            const appended = appendDescription(out, described);
            if (appended !== out) {
                out = appended;
                ++found;
            }
        }
    }
    if (found > 4)
        out = `${visibleGlyphCharacter(glyphinfo)}        can be many things`;

    if (found > 1) {
        const detail = lookatOrdinaryTerrain(cc.x, cc.y, glyph, state);
        firstmatch = detail;
        out += ` (${detail})`;
        found = 1;
    }
    return { found, out, firstmatch };
}

export const CHKFIL_USR_TYPED = 1;
export const CHKFIL_DONT_ASK = 2;
export const CHKFIL_IA_CHECK = 4;

function stripPrefix(value, prefix) {
    return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

// C ref: pager.c checkfile() (830-964), through the two lookup strings used by
// its ordered data.base passes. The returned `alt` is searched before `base`.
export function normalizeDataBaseLookup(input, state = game) {
    if (typeof input !== 'string' || input.length > 255)
        throw new TypeError('checkfile input must be a BUFSZ-sized string');

    let base = input.toLowerCase();
    base = stripPrefix(base, 'interior of ');
    if (base.startsWith('a ')) base = base.slice(2);
    else if (base.startsWith('an ')) base = base.slice(3);
    else if (base.startsWith('the ')) base = base.slice(4);
    else if (base.startsWith('some ')) base = base.slice(5);
    else if (/^[0-9]/u.test(base)) {
        base = base.replace(/^[0-9]+ ?/u, '');
    }
    base = stripPrefix(base, 'pair of ');
    if (base.startsWith('tame ')) base = base.slice(5);
    else if (base.startsWith('peaceful ')) base = base.slice(9);
    base = stripPrefix(base, 'invisible ');
    base = stripPrefix(base, 'saddled ');
    if (base.startsWith('blessed ')) base = base.slice(8);
    else if (base.startsWith('uncursed ')) base = base.slice(9);
    else if (base.startsWith('cursed ')) base = base.slice(7);
    base = stripPrefix(base, 'empty ');
    if (base.startsWith('partly used ')) base = base.slice(12);
    else if (base.startsWith('partly eaten ')) base = base.slice(13);
    if (base.startsWith('statue of ')) base = 'statue';
    else if (base.startsWith('figurine of ')) base = 'figurine';
    if (/^[+-][0-9]/u.test(base))
        base = base.replace(/^[+-][0-9]+ ?/u, '');
    if (base.startsWith('moist towel')) base = `wet${base.slice(5)}`;

    let alt = null;
    const named = base.indexOf(' named ');
    const called = base.indexOf(' called ');
    if (named >= 0) {
        alt = base.slice(named + 7);
        const cut = called >= 0 && called < named ? called : named;
        base = base.slice(0, cut);
    } else if (called >= 0) {
        alt = base.slice(called + 8);
        base = base.slice(0, called);
    } else {
        const comma = base.indexOf(', ');
        if (comma > 0) base = base.slice(0, comma);
    }
    if (alt) {
        if (alt.startsWith('a ')) alt = alt.slice(2);
        else if (alt.startsWith('an ')) alt = alt.slice(3);
        else if (alt.startsWith('the ')) alt = alt.slice(4);
    }
    const baseDetails = base.indexOf(' (');
    if (baseDetails > 0) base = base.slice(0, baseDetails);
    if (alt) {
        const altDetails = alt.indexOf(' (');
        if (altDetails > 0) alt = alt.slice(0, altDetails);
    }
    if (!alt && fruit_from_name(base, true, state)) {
        alt = state.obj_descr?.[SLIME_MOLD]?.oc_name ?? 'slime mold';
    } else if (!alt) {
        alt = makesingular(base);
    }
    return { base, alt };
}

// C ref: strutil.c pmatch(). checkfile() lowercases the lookup term but keeps
// data.base keys unchanged, so matching itself remains case-sensitive.
function wildcardMatch(pattern, value) {
    let previous = new Array(value.length + 1).fill(false);
    previous[0] = true;
    for (const character of pattern) {
        const current = new Array(value.length + 1).fill(false);
        if (character === '*') current[0] = previous[0];
        for (let index = 1; index <= value.length; ++index) {
            if (character === '*') {
                current[index] = previous[index] || current[index - 1];
            } else if (character === '?' || character === value[index - 1]) {
                current[index] = previous[index - 1];
            }
        }
        previous = current;
    }
    return previous[value.length];
}

// Preserve key order within each entry: a matching '~' key suppresses every
// positive key after it, exactly like checkfile()'s skipping_entry flag.
export function dataBaseEntry(term) {
    for (const entry of DATA_BASE_ENTRIES) {
        for (const key of entry.keys) {
            const excluded = key.startsWith('~');
            if (!wildcardMatch(excluded ? key.slice(1) : key, term)) continue;
            if (excluded) break;
            return entry;
        }
    }
    return null;
}

// C ref: pager.c checkfile() (830-1129). This port covers every generated
// key and text entry, the user-typed and no-question flags used by do_look(),
// and the ordinary question used by map lookup.
export async function checkfile(input, pm = null, chkflags = 0, state = game) {
    const userTyped = (chkflags & CHKFIL_USR_TYPED) !== 0;
    const dontAsk = (chkflags & CHKFIL_DONT_ASK) !== 0;
    const iaChecking = (chkflags & CHKFIL_IA_CHECK) !== 0;
    const source = pm && !userTyped
        ? pm.pmnames?.[NEUTRAL] ?? input
        : input;
    const { base, alt } = normalizeDataBaseLookup(source, state);
    if (!base) return false;

    const terms = alt === base ? [base] : [alt, base];
    let firstEntry = null;
    let passOneFound = false;
    let result = false;
    for (let pass = 0; pass < terms.length; ++pass) {
        const entry = dataBaseEntry(terms[pass]);
        if (!entry) continue;
        if (pass === 0 && terms.length === 2) {
            firstEntry = entry;
            passOneFound = true;
        } else if (entry === firstEntry) {
            return result;
        }

        let show = userTyped || dontAsk;
        if (!show) {
            const answer = await tty_yn_function(
                `More info about "${terms[pass]}"?`, 'yn', 'n', state,
            );
            show = answer === 'y'.charCodeAt(0);
        }
        if (show) {
            result = true;
            if (iaChecking) return true;
            await displayTtyMenuTextWindow(
                state, entry.lines.map((text) => ({ text })),
            );
        }
    }
    if (userTyped && !result && !passOneFound) {
        await ttyPline(
            "You don't have any information on those things.", state,
        );
    }
    return result;
}

export async function do_look(mode, clickCc = null, state = game) {
    if (mode !== 0 || clickCc)
        throw new UnsupportedWhatisError('quick, click, or queued look mode');
    assertOrdinaryWhatisState(state);

    const choice = await select_menu(state, {
        how: PICK_ONE,
        title: 'What do you want to look at:',
        ...menuTitleStyle(state),
        items: menuLines(state),
        overlay: state.iflags?.menu_overlay !== false,
    });
    if (choice === null) return ECMD_OK;
    if (choice === 'i') {
        let inventoryRepairLayout = null;
        const invlet = await display_inventory(null, true, state, {
            // invent.c display_pickinv() uses the same PICK_ONE menu and
            // heading style as the ordinary inventory command.
            menu: (items) => {
                const spec = {
                    items: items.map((item) => (item.heading
                        ? {
                            ...item,
                            attr: menuTitleStyle(state).titleAttr,
                            color: menuTitleStyle(state).titleColor,
                        }
                        : item)),
                    how: PICK_ONE,
                    cancelValue: null,
                    overlay: state.iflags?.menu_overlay !== false,
                };
                inventoryRepairLayout = ttyMenuLayout(state.nhDisplay, spec);
                return select_menu(state, spec);
            },
        });
        // wintty.c tty_dismiss_nhwindow() repairs the inventory menu with
        // docorner(offx, maxrow + 1, 0). Clear exactly the suffixes where that
        // vertical rectangle intersects the configured status window; a
        // shorter overlay never reaches status, while a three-line status can
        // intersect two rows. Full-screen menus own their complete redraw.
        if (inventoryRepairLayout && !inventoryRepairLayout.fullScreen) {
            const statusLines = state.iflags?.wc2_statuslines === 3 ? 3 : 2;
            const firstStatusRow = state.nhDisplay.rows - statusLines;
            const lastRepairRow = Math.min(
                state.nhDisplay.rows - 1,
                inventoryRepairLayout.maxrow,
            );
            for (let row = firstStatusRow; row <= lastRepairRow; ++row) {
                for (let column = inventoryRepairLayout.repairColumn;
                    column < state.nhDisplay.cols; ++column) {
                    state.nhDisplay.setCell(column, row, ' ', NO_COLOR, 0);
                }
            }
        }
        if (!invlet || invlet === '\x1b') return ECMD_OK;
        for (let invobj = state.invent; invobj; invobj = invobj.nobj) {
            if (invobj.invlet !== invlet) continue;
            const name = singular(invobj, xnameFresh, state);
            await checkfile(
                name, null, CHKFIL_USR_TYPED | CHKFIL_DONT_ASK, state,
            );
            break;
        }
        return ECMD_OK;
    }
    if (choice === '?') {
        let answer = await getlin('Specify what? (type the word)', state);
        if (answer !== ' ') answer = mungspaces(answer);
        if (!answer || answer.startsWith('\x1b')) return ECMD_OK;
        if (answer.length === 1)
            throw new UnsupportedWhatisError('a typed symbol');
        await checkfile(
            answer, null, CHKFIL_USR_TYPED | CHKFIL_DONT_ASK, state,
        );
        return ECMD_OK;
    }
    if (choice === 'm' || choice === 'M'
        || choice === 'o' || choice === 'O') {
        await look_all(choice === choice.toLowerCase(),
            choice.toLowerCase() === 'm', state);
        return ECMD_OK;
    }
    if (choice === 't' || choice === 'T') {
        await look_traps(choice === 't', state);
        return ECMD_OK;
    }
    if (choice === 'e' || choice === 'E') {
        await look_engrs(choice === 'e', state);
        return ECMD_OK;
    }
    if (choice !== '/')
        throw new UnsupportedWhatisError(`menu choice ${JSON.stringify(choice)}`);

    const savedVerbose = state.flags.verbose;
    state.flags.verbose = Boolean(savedVerbose);
    const cc = { x: state.u.ux, y: state.u.uy };
    try {
        for (;;) {
            await ttyPline(
                `${state.flags.verbose ? 'Please move the cursor to' : 'Pick'} ${WHAT_IS_A_LOCATION}.`,
                state,
            );
            const answer = await getpos(
                cc, false, WHAT_IS_A_LOCATION, state,
            );
            if (answer < 0 || cc.x < 0) break;
            state.flags.verbose = false;

            const description = do_screen_description(cc, true, 0, state);
            const location = state.level?.at(cc.x, cc.y);
            if (location?.disp_decgfx) {
                await ttyPutmixed(
                    `${location.disp_ch}${description.out.slice(1)}`,
                    description.out[0], state,
                );
            } else {
                await ttyPline(description.out, state);
            }
            if (description.found === 1
                && answer === LOOK_TRADITIONAL
                && state.flags.help) {
                await checkfile(description.firstmatch, null, 0, state);
            }
        }
    } finally {
        state.flags.verbose = savedVerbose;
    }
    return ECMD_OK;
}

export async function dowhatis(state = game) {
    return do_look(0, null, state);
}

// C ref: pager.c setopt_cmd() (2902-2957). The current help boundary has the
// recorder's compiled-in bindings: #optionsfull has no key, reqmenu is `m`,
// and the simple options command is `O`. Later binding work must replace this
// bounded result with cmd_from_func()/cmdname_from_func() lookups.
export function setopt_cmd() {
    return "'#optionsfull' or 'm O'";
}

// C refs: pager.c dispfile_*(), hmenu_dohistory(), and dohistory(), plus
// win/tty/wintty.c tty_display_file() (2424-2516). The generator has already
// removed newlines and applied hacklib.c tabexpand(), so the runtime builds
// the NHW_TEXT lines without filesystem access.
async function display_file(filename, state) {
    const text = HELP_TEXT_FILES[filename];
    if (!text)
        throw new UnsupportedHelpError(`missing static file ${filename}`);
    await displayTtyTextWindow(state, text.map((line) => ({ text: line })));
}

async function dispfile_help(state) {
    await display_file('help', state);
}

async function dispfile_shelp(state) {
    await display_file('hh', state);
}

async function dispfile_optionfile(state) {
    await display_file('opthelp', state);
}

async function dispfile_optmenu(state) {
    await display_file('optmenu', state);
}

async function dispfile_license(state) {
    await display_file('license', state);
}

async function dispfile_usagehelp(state) {
    await display_file('usagehlp', state);
}

export async function dohistory(state = game) {
    await display_file('history', state);
    return ECMD_OK;
}

async function hmenu_dohistory(state) {
    await dohistory(state);
}

// C ref: pager.c help_menu_items[] (2829-2858). This build has no PORT_HELP
// row, normal play omits dispfile_debughelp(), and hideusage is off. Keep the
// numeric value from the source-table index so filtering a future row cannot
// silently dispatch the wrong handler.
export function helpMenuItems() {
    return [
        { value: 1, selector: 'a', label: 'About NetHack (version information).' },
        { value: 2, selector: 'b', label: 'Long description of the game and commands.' },
        { value: 3, selector: 'c', label: 'List of game commands.' },
        { value: 4, selector: 'd', label: 'Concise history of NetHack.' },
        { value: 5, selector: 'e', label: 'Info on a character in the game display.' },
        { value: 6, selector: 'f', label: 'Info on what a given key does.' },
        { value: 7, selector: 'g', label: 'List of game options.' },
        { value: 8, selector: 'h', label: 'Longer explanation of game options.' },
        {
            value: 9,
            selector: 'i',
            label: `Using the ${setopt_cmd()} command to set options.`,
        },
        { value: 10, selector: 'j', label: 'Full list of keyboard commands.' },
        { value: 11, selector: 'k', label: 'List of extended commands.' },
        { value: 12, selector: 'l', label: 'List menu control keys.' },
        { value: 13, selector: 'm', label: "Description of NetHack's command line." },
        { value: 14, selector: 'n', label: 'The NetHack license.' },
        { value: 15, selector: 'o', label: 'Support information.' },
    ];
}

// C ref: pager.c hmenu_dowhatis() and dohelp() (2802-2805, 2860-2898).
// The dispatch includes version information, the static display-file family,
// history, and the already-ported whatis row. Dynamic rows stop after their
// menu selection until their source owners are ported.
export async function dohelp(state = game) {
    if (state.wizard)
        throw new UnsupportedHelpError('the wizard-mode help row');
    if (state.sysopt?.hideusage)
        throw new UnsupportedHelpError('a help menu with usage hidden');

    const choice = await select_menu(state, {
        how: PICK_ONE,
        title: 'Select one item:',
        ...menuTitleStyle(state),
        items: helpMenuItems(),
        overlay: state.iflags?.menu_overlay !== false,
        cancelValue: null,
    });
    if (choice === null) return ECMD_OK;
    if (choice === 1) {
        await doextversion(state, {
            displayTextWindow: displayTtyTextWindow,
            random: rn2,
        });
        return ECMD_OK;
    }
    if (choice === 2) {
        await dispfile_help(state);
        return ECMD_OK;
    }
    if (choice === 3) {
        await dispfile_shelp(state);
        return ECMD_OK;
    }
    if (choice === 4) {
        await hmenu_dohistory(state);
        return ECMD_OK;
    }
    if (choice === 5) {
        await dowhatis(state);
        return ECMD_OK;
    }
    if (choice === 8) {
        await dispfile_optionfile(state);
        return ECMD_OK;
    }
    if (choice === 9) {
        await dispfile_optmenu(state);
        return ECMD_OK;
    }
    if (choice === 13) {
        await dispfile_usagehelp(state);
        return ECMD_OK;
    }
    if (choice === 14) {
        await dispfile_license(state);
        return ECMD_OK;
    }
    throw new UnsupportedHelpError(`menu target ${choice}`);
}
