// pager.c -- What-is and farlook descriptions.
// C refs: pager.c self_lookat(), checkfile(), do_screen_description(),
// do_look(), and dowhatis(). This first slice covers an ordinary hero map
// lookup, declined encyclopedia details, repetition, and Escape.

import {
    BLINDED,
    ECMD_OK,
    HALLUC,
    HALLUC_RES,
    PICK_ONE,
    Upolyd,
    Ugender,
} from './const.js';
import { pmname } from './do_name.js';
import { LOOK_TRADITIONAL, getpos } from './getpos.js';
import { game } from './gstate.js';
import { tty_yn_function } from './getline.js';
import { menuTitleStyle } from './tty_menu.js';
import { ttyPline } from './tty_message.js';
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

// C ref: pager.c do_screen_description() and lookat(), for a looked-at hero
// whose displayed class is S_HUMAN. The symbol prefix comes from the live map
// buffer, while the specific description comes from self_lookat().
export function do_screen_description(cc, looked, sym, state = game) {
    if (!looked || sym)
        throw new UnsupportedWhatisError('a typed symbol');
    if (cc.x !== state.u.ux || cc.y !== state.u.uy)
        throw new UnsupportedWhatisError('a non-hero map location');
    const location = state.level?.at(cc.x, cc.y);
    const glyph = location?.disp_ch ?? '@';
    if (glyph !== '@')
        throw new UnsupportedWhatisError('a non-human hero glyph');
    const detail = self_lookat(state);
    return {
        found: 1,
        out: `${glyph}        a human or elf (${detail})`,
        firstmatch: 'human wizard',
    };
}

// C ref: pager.c checkfile(), for the data.base "human wizard" match and its
// ordinary More-info question. This slice deliberately declines the entry;
// displaying its contents belongs to the later generated-data slice.
async function checkfileHumanWizard(input, state) {
    if (input !== 'human wizard')
        throw new UnsupportedWhatisError(`checkfile(${JSON.stringify(input)})`);
    const answer = await tty_yn_function(
        'More info about "human wizard"?', 'yn', 'n', state,
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
            await ttyPline(description.out, state);
            if (description.found === 1
                && answer === LOOK_TRADITIONAL
                && state.flags.help) {
                await checkfileHumanWizard(description.firstmatch, state);
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
