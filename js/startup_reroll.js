// Startup attribute-and-inventory reroll menu.
// C refs: invent.c reroll_menu() and win/tty/topl.c tty_yn_function().

import {
    A_CHA,
    A_CON,
    A_DEX,
    A_INT,
    A_STR,
    A_WIS,
    HALLUC,
    HALLUC_RES,
    PICK_ONE,
    TOPLINE_NON_EMPTY,
    TOPLINE_SPECIAL_PROMPT,
} from './const.js';
import {
    get_strength_str as strengthText,
    hallucinated_statue_glyph_info,
    object_glyph_info,
    random_object_glyph_info,
} from './display.js';
import { game } from './gstate.js';
import { nhgetch } from './input.js';
import { donameFresh } from './objnam.js';
import * as O from './objects.js';
import { rn2_on_display_rng } from './rng.js';
import { NO_COLOR } from './terminal.js';
import { menuTitleStyle } from './tty_menu.js';
import { select_menu } from './windows.js';

const REPROMPT = Symbol('reroll menu needs an explicit choice');
const REROLL_QUERY = 'Reroll this character?';
function propertyActive(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function hallucinating(state) {
    // C ref: youprop.h Hallucination. Unlike ordinary properties, HALLUC's
    // extrinsic field does not activate it; only the intrinsic timeout does.
    return Boolean(state.u?.uprops?.[HALLUC]?.intrinsic)
        && !propertyActive(state, HALLUC_RES);
}

// C ref: display.h obj_to_glyph(). The TTY does not print these glyphs for
// reroll rows (their identifiers are zero), but it still computes them and
// therefore consumes the display RNG while hallucinating.
function rerollObjectGlyphInfo(
    obj,
    state,
    displayRandom = rn2_on_display_rng,
) {
    if (typeof displayRandom !== 'function')
        throw new TypeError('reroll displayRandom must be a function');

    if (obj.otyp === O.STATUE && hallucinating(state))
        return hallucinated_statue_glyph_info(state, displayRandom);
    if (!hallucinating(state)) return object_glyph_info(obj, state);
    return random_object_glyph_info(state, displayRandom);
}

function attributeArray(value) {
    return Array.isArray(value) ? value : value?.a;
}

function effectiveAttribute(state, attribute) {
    const u = state.u;
    const total = Math.trunc(u.acurr?.a?.[attribute] ?? 0)
        + Math.trunc(attributeArray(u.abon)?.[attribute] ?? 0)
        + Math.trunc(attributeArray(u.atemp)?.[attribute] ?? 0);
    if (attribute === A_STR) return Math.max(3, Math.min(total, 125));
    return Math.max(3, Math.min(total, 25));
}

function rerollAttributeLine(state) {
    return `St:${strengthText(effectiveAttribute(state, A_STR))}`
        + ` Dx:${effectiveAttribute(state, A_DEX)}`
        + ` Co:${effectiveAttribute(state, A_CON)}`
        + ` In:${effectiveAttribute(state, A_INT)}`
        + ` Wi:${effectiveAttribute(state, A_WIS)}`
        + ` Ch:${effectiveAttribute(state, A_CHA)}`;
}

export function buildRerollMenuSpec(
    state = game,
    { displayRandom = rn2_on_display_rng } = {},
) {
    const lootabc = Boolean(state.flags?.lootabc);
    const items = [
        {
            selector: lootabc ? 'a' : 'p',
            label: 'start the game with this character',
            value: 'n',
        },
        {
            selector: lootabc ? 'b' : 'r',
            label: 'reroll another character',
            value: 'y',
        },
        { text: '' },
    ];
    // C ref: invent.c reroll_menu():2579-2588. Both counters are ints that C
    // raises before the loop and lowers after it, and this is the port's only
    // writer of either. gd.distantname keeps xname() from entering the kit in
    // the discoveries list, because the player has not accepted this character
    // yet; iflags.override_ID makes doname() describe a kit the hero has not
    // identified in full.
    state.gd ??= {};
    state.iflags ??= {};
    state.gd.distantname = (state.gd.distantname ?? 0) + 1;
    state.iflags.override_ID = (state.iflags.override_ID ?? 0) + 1;
    try {
        for (let obj = state.invent; obj; obj = obj.nobj) {
            // reroll_menu() computes the glyph before doname(). Keep the order
            // explicit even though ordinary startup glyphs are pure today.
            const glyphInfo = rerollObjectGlyphInfo(obj, state, displayRandom);
            const text = donameFresh(obj, state);
            items.push({
                text,
                glyphInfo,
            });
        }
    } finally {
        // C's two decrements cannot be skipped. A JavaScript formatter that
        // refuses an unported name branch throws instead of returning, and a
        // counter left raised would silence observe_object() and force full
        // identification for every later name in the same game.
        state.iflags.override_ID -= 1;
        state.gd.distantname -= 1;
    }
    items.push({ text: '' }, { text: rerollAttributeLine(state) });

    return {
        title: REROLL_QUERY,
        ...menuTitleStyle(state),
        items,
        how: PICK_ONE,
        cancelValue: REPROMPT,
        emptyValue: REPROMPT,
        overlay: state.iflags?.menu_overlay !== false,
    };
}

function renderRerollPrompt(state) {
    const display = state.nhDisplay;
    if (!display) throw new Error('reroll prompt requires a tty display');
    const prompt = `${REROLL_QUERY} [yn] (n) `;
    display.clearRow(0);
    display.putstr(0, 0, prompt, NO_COLOR, 0);
    display.setCursor(prompt.length, 0);
    state._ttyToplines = prompt.trimEnd();
    display.topMessage = state._ttyToplines;
    display.toplines = state._ttyToplines;
    display.toplin = TOPLINE_SPECIAL_PROMPT;
    return prompt;
}

async function fallbackRerollChoice(state) {
    const prompt = renderRerollPrompt(state);
    let response;
    for (;;) {
        const code = await nhgetch(state);
        if (code === 0 || code === 10 || code === 13
            || code === 27 || code === 32) {
            response = 'n';
            break;
        }
        const key = String.fromCharCode(code & 0xFF).toLowerCase();
        if (key === 'y' || key === 'n') {
            response = key;
            break;
        }
    }
    // tty_yn_function() keeps the physical prompt un-echoed but appends the
    // accepted key to its logical topline for message history and the next
    // pline() boundary.
    state._ttyToplines = `${prompt}${response}`;
    state.nhDisplay.topMessage = state._ttyToplines;
    state.nhDisplay.toplines = state._ttyToplines;
    state.nhDisplay.toplin = TOPLINE_NON_EMPTY;
    return response;
}

// Returns true and increments numrerolls only when the player explicitly
// chooses to reroll, matching invent.c:reroll_menu().
export async function reroll_menu(state = game, options = {}) {
    const spec = buildRerollMenuSpec(state, options);
    // invent.c reroll_menu() 2552-2614 performs no repair of its own: the whole
    // of it is select_menu() -> tty_dismiss_nhwindow() -> erase_menu_or_text(),
    // whose docrt() and flush_screen(1) run while gb.bot_disabled is still
    // raised, so bot() returns at botl.c:255 before clearing disp.botlx. A
    // second repair here would run with the flag already lowered, repaint the
    // status rows at the moment C leaves them blank, and spend the disp.botlx
    // that C carries forward.
    let choice = await select_menu(
        state,
        spec,
    );
    if (choice === REPROMPT) choice = await fallbackRerollChoice(state);
    if (choice !== 'y') return false;

    const roleplay = state.u?.uroleplay;
    if (!roleplay)
        throw new Error('reroll_menu requires initialized u.uroleplay');
    roleplay.numrerolls = Math.trunc(roleplay.numrerolls ?? 0) + 1;
    return true;
}

export const _startupRerollInternals = Object.freeze({
    effectiveAttribute,
    fallbackRerollChoice,
    rerollAttributeLine,
    rerollObjectGlyphInfo,
    strengthText,
});
