// pager.c -- What-is and farlook descriptions.
// C refs: pager.c self_lookat(), checkfile(), do_screen_description(),
// do_look(), and dowhatis(). The port covers ordinary hero and terrain map
// lookups, declined encyclopedia details, repetition, and Escape.

import {
    BLINDED,
    D_BROKEN,
    D_TRAPPED,
    ECMD_OK,
    HALLUC,
    HALLUC_RES,
    PICK_ONE,
    Upolyd,
    Ugender,
} from './const.js';
import { pmname } from './do_name.js';
import {
    SCORER_DEC_MAP,
    glyph_at,
    glyph_is_cmap,
    glyph_to_cmap,
    map_glyphinfo,
} from './display.js';
import { LOOK_TRADITIONAL, getpos } from './getpos.js';
import { game } from './gstate.js';
import { tty_yn_function } from './getline.js';
import { an } from './objnam.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import {
    MAXPCHARS,
    S_brupstair,
    S_corr,
    S_darkroom,
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
import { menuTitleStyle } from './tty_menu.js';
import { ttyPline, ttyPutmixed } from './tty_message.js';
import { select_menu } from './windows.js';

export const WHAT_IS_A_LOCATION = 'a monster, object or location';

export class UnsupportedWhatisError extends Error {
    constructor(reason) {
        super(`unsupported whatis: ${reason}`);
        this.name = 'UnsupportedWhatisError';
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

// C ref: pager.c checkfile(), for the data.base "human wizard" match and its
// ordinary More-info question. This slice deliberately declines the entry;
// displaying its contents belongs to the later generated-data slice.
async function checkfileDeclined(input, state) {
    const called = input.indexOf(' called ');
    const lookup = called >= 0 ? input.slice(0, called) : input;
    // The current full descriptions for room floor and corridor have no
    // matching data.base record, so checkfile() returns without asking.
    if (lookup === 'floor of a room' || lookup === 'corridor') return false;
    if (lookup !== 'human wizard' && lookup !== 'branch staircase up')
        throw new UnsupportedWhatisError(`checkfile(${JSON.stringify(input)})`);
    const answer = await tty_yn_function(
        `More info about "${lookup}"?`, 'yn', 'n', state,
    );
    if (answer === 'y'.charCodeAt(0))
        throw new UnsupportedWhatisError('accepted encyclopedia details');
    return false;
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
                await checkfileDeclined(description.firstmatch, state);
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
