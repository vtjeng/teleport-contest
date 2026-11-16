// windows.js — Source-shaped window-port helpers shared by several commands.
// C ref: src/windows.c, the interface-independent layer between the game and
// whichever window port is linked in.

import { cmdq_key_char, cmdq_pop } from './cmd.js';
import {
    CMDQ_KEY,
    MENU_ITEMFLAGS_SKIPMENUCOLORS,
    PICK_ANY,
} from './const.js';
import { map_glyphinfo } from './display.js';
import { def_char_to_objclass } from './drawing.js';
import { tty_getlin } from './getline.js';
import { ttyPline } from './tty_message.js';
import { ucase } from './hacklib.js';
import { game } from './gstate.js';
import { MAXOCLASSES } from './objects.js';
import { OBJCLASS_EXPLANATIONS } from './symbol_data.js';
import {
    menuLineChoiceDescription,
    menuTitleStyle,
    selectTtyMenu,
} from './tty_menu.js';
import { regex_match } from './posixregex.js';
import {
    ATR_BOLD,
    ATR_INVERSE,
    ATR_NONE,
    ATR_UNDERLINE,
    NO_COLOR,
} from './terminal.js';

// C ref: windows.c nhwindows_hangup() (614-640): switch to the no-op
// hup_procs interface. ALTMETA is defined, so ESC no longer waits for a
// second key. The tty's exit routine and getmsghistory() stay reachable:
// js/cmd.js end_of_input() still calls tty_exit_nhwindows(), and the
// message history the save writes is the tty's, unchanged since the swap
// because vpline() returns early once done_hup is set.
export function nhwindows_hangup(state = game) {
    state.iflags ??= {};
    state.iflags.altmeta = false;
    state.nhDisplay?.hangup();
}

// True once nhwindows_hangup() has swapped in hup_procs.
export function windowprocs_hup(state = game) {
    return Boolean(state.nhDisplay?.windowprocsHup);
}

// C ref: decl.c hexdd[]. Each hexadecimal digit appears in lower and upper
// case, so decode_glyph() halves a digit's index to get its value.
const hexdd = '00112233445566778899aAbBcCdDeEfF';

// C's `*str` loop guard: the byte at `index`, or '' at the end of the string
// or at a NUL, where the C string ends.
function cByteAt(str, index) {
    const ch = str[index] ?? '';
    return ch === '\0' ? '' : ch;
}

// C ref: windows.c encglyph() (1427-1434): `\\G%04X%04X` of
// svc.context.rndencode and the glyph. moveloop_preamble() sets rndencode to
// rnd(9000), so each game has its own key and decode_glyph() rejects a
// sequence that a player types without knowing it.
export function encglyph(glyph, state = game) {
    const hex = (value) => ucase((value >>> 0).toString(16))
        .padStart(4, '0');
    return `\\G${hex(state.context?.rndencode ?? 0)}${hex(glyph)}`;
}

// C ref: windows.c decode_glyph() (1438-1463). `str` is the text after the
// `\G`. It reads up to four hexadecimal digits as the rndencode key and, when
// they match svc.context.rndencode, up to four more as the glyph. It returns
// C's retval, the number of digits read, as `count`; 0 means the key did not
// match, or matched with no digits, and the sequence is a forgery. C leaves
// *glyph_ptr unset on a mismatch, so `glyph` is then undefined. Pure: it
// reads only the string and the key.
export function decode_glyph(str, state = game) {
    let rndchk = 0;
    let dcount = 0;
    let retval = 0;
    let index = 0;

    for (; cByteAt(str, index) && ++dcount <= 4; ++index) {
        const dp = hexdd.indexOf(str[index]);
        if (dp >= 0) {
            retval++;
            rndchk = (rndchk * 16) + Math.trunc(dp / 2);
        } else
            break;
    }
    if (rndchk === (state.context?.rndencode ?? 0)) {
        let glyph = dcount = 0;
        for (; cByteAt(str, index) && ++dcount <= 4; ++index) {
            const dp = hexdd.indexOf(str[index]);
            if (dp >= 0) {
                retval++;
                glyph = (glyph * 16) + Math.trunc(dp / 2);
            } else
                break;
        }
        return { count: retval, glyph };
    }
    return { count: 0, glyph: undefined };
}

// C ref: windows.c decode_mixed()'s replacement for one decoded glyph,
// gs.showsyms[] at map_glyphinfo(0, 0, glyph, 0)'s symidx, which is the
// glyphinfo's ttychar.
function decodedGlyphByte(glyph, state) {
    return String.fromCharCode(map_glyphinfo(glyph, state).ttychar);
}

// C ref: windows.c decode_mixed() (1465-1511). It copies `str`, replaces each
// `\G` sequence that decode_glyph() accepts with the glyph's symbol, and
// drops a backslash before any other character: `\\` becomes one backslash
// and `\x` becomes `x`. A forged `\G` and a backslash that ends the string
// are copied as they are.
//
// `putGlyph(glyph, column)` returns the text that replaces a decoded glyph,
// where `column` is the length of the output before it. Without it, or when
// it returns null, the replacement is C's gs.showsyms[] byte. utf8map.c mixed_to_utf8(), which wintty.c
// tty_putmixed() uses instead under a UTF-8 symbol set, runs this same loop
// and differs only in that replacement, so the tty callers pass their glyph
// rendering here rather than through a second copy of the loop.
export function decode_mixed(str, state = game, putGlyph = undefined) {
    if (str == null) return '';
    let buf = '';
    let index = 0;

    while (cByteAt(str, index)) {
        if (str[index] === '\\') {
            const saveIndex = index++;
            switch (cByteAt(str, index)) {
            case 'G': { /* glyph value \GXXXXNNNN */
                const { count, glyph } = decode_glyph(
                    str.slice(index + 1), state,
                );
                if (count) {
                    index += count + 1;
                    buf += putGlyph?.(glyph, buf.length)
                        ?? decodedGlyphByte(glyph, state);
                    /* 'index' is ready for the next loop iteration and
                       str[index] should not be copied at the end of this
                       iteration */
                    continue;
                }
                /* possible forgery - leave it the way it is */
                index = saveIndex;
                break;
            }
            case '\\':
                break;
            case '':
                /* String ended with '\\', as an object name can. */
                index = saveIndex;
                break;
            }
        }
        buf += str[index++];
    }
    return buf;
}

// C ref: windows.c get_menu_coloring(). The list is newest-first and the
// first matching expression supplies both fields.
export function get_menu_coloring(str, state = game) {
    if (state.iflags?.use_menu_color) {
        for (let rule = state.gm?.menu_colorings; rule; rule = rule.next) {
            if (regex_match(String(str), rule.regex)) {
                return { color: rule.color, attr: rule.attr };
            }
        }
    }
    return null;
}

export function ttyMenuColorAttribute(attr) {
    if (attr === 1) return ATR_BOLD;
    if (attr === 4) return ATR_UNDERLINE;
    if (attr === 7) return ATR_INVERSE;
    // Recorder patch 006 does not capture ATR_DIM, ATR_ITALIC, or ATR_BLINK.
    return ATR_NONE;
}

// C ref: windows.c add_menu(). JavaScript callers already construct the TTY
// item's other fields; this common step applies menu coloring to the original
// description, then clears the one flag no window port receives.  `str` is
// that description when the item's own text is not: a preformatted `lines`
// row carries tty_add_menu()'s "x - " prefix, which get_menu_coloring() never
// saw.
export function add_menu(state, item, str) {
    if (typeof item === 'string') item = { text: item };
    if (typeof item !== 'object' || item === null) return item;
    const itemflags = Number.isInteger(item.itemflags) ? item.itemflags : 0;
    const skip = item.skipMenuColors === true || item.heading === true
        || (itemflags & MENU_ITEMFLAGS_SKIPMENUCOLORS) !== 0;
    if (!skip && state.iflags?.use_menu_color) {
        const text = str ?? item.label ?? item.text ?? '';
        const style = get_menu_coloring(text, state);
        if (style) {
            // Recorder 006 serializes foreground7 (CLR_GRAY) as default SGR.
            // Keep the source value in the coloring node; project at drawing.
            item.color = style.color === 7 ? NO_COLOR : style.color;
            item.attr = ttyMenuColorAttribute(style.attr);
        }
    }
    if (Number.isInteger(item.itemflags)) {
        item.itemflags &= ~MENU_ITEMFLAGS_SKIPMENUCOLORS;
    }
    return item;
}

// C ref: windows.c add_menu_heading() (1816-1828). Inserts a non-selectable,
// highlighted heading into a menu, using iflags.menu_headings for attr and
// color. C suppresses highlighting during end-of-game disclosure
// (program_state.gameover).
//
// Returns a menu item object with `heading: true` so that windows.js
// add_menu() skips menu coloring (MENU_ITEMFLAGS_SKIPMENUCOLORS), and with
// the attr/color fields set from iflags.menu_headings unless gameover has
// suppressed heading highlighting.
export function add_menu_heading(text, state = game) {
    const style = state.iflags?.menu_headings;
    const gameover = state.program_state?.gameover;
    const attr = gameover ? ATR_NONE
        : Number.isInteger(style?.attr) ? ttyMenuColorAttribute(style.attr) : ATR_INVERSE;
    const color = gameover ? NO_COLOR
        : Number.isInteger(style?.color) ? style.color : NO_COLOR;
    return {
        text,
        heading: true,
        attr,
        color,
    };
}

// C ref: decl.c:233, which initializes gb.bot_disabled to FALSE, and
// include/decl.h:218, which declares it.  Only select_menu() and getlin()
// below raise it in a running game; end.c panic() (403) raises it for good on
// the way out, which this port has no counterpart for because a refusal ends
// the segment instead of unwinding through a shutdown path.
//
// The field lives on `state.gb` and nothing else owns it.  js/gstate.js
// resetGame() builds a fresh game object for every segment, so a field that
// was never assigned reads as undefined; both writers below normalize that to
// C's initial FALSE, and botl.c bot() and timebot() in js/display.js read it
// with `=== true` so the unset state cannot be mistaken for a raised flag.
function bot_disabled_is_set(state) {
    return state.gb?.bot_disabled === true;
}

// C ref: windows.c select_menu() (1856-1866), the interface-independent
// wrapper every core caller of a menu goes through -- options.c, cmd.c,
// pickup.c and role.c among them, none of which calls the window port's
// tty_select_menu() directly.
//
// C's `winid window` names a window this port does not create; its `how` rides
// in `spec.how`, which js/tty_menu.js selectTtyMenu() already reads; and its
// `menu_item **menu_list` out-parameter is the return value here, so C's
// returned count has no separate carrier.
//
// The body is the whole point: gb.bot_disabled stays raised for as long as the
// menu owns the screen, so the status rows a full-screen menu covered stay
// blank until the menu is gone.  wintty.c erase_menu_or_text() (966-984) runs
// inside win_select_menu(), and its docrt()+flush_screen(1) repair reaches
// bot() while the flag is up.
export async function select_menu(state, spec) {
    state.gb ??= {};
    const old_bot_disabled = bot_disabled_is_set(state);

    state.gb.bot_disabled = true;
    // Core callers model calls to add_menu() as item objects or display-only
    // strings. Apply the interface-independent adjustment once before the
    // TTY port stores or draws them.
    // wintty.c tty_end_menu() draws every menu prompt in
    // tty_menu_promptstyle, which windows.c adjust_menu_promptstyle() copies
    // from iflags.menu_headings.
    const titleStyle = menuTitleStyle(state);
    const adjustedSpec = {
        ...spec,
        titleAttr: spec.titleAttr ?? titleStyle.titleAttr,
        titleColor: spec.titleColor ?? titleStyle.titleColor,
        items: spec.items?.map((item) => add_menu(state, item)),
        lines: spec.lines?.map((line) => add_menu(
            state,
            line,
            menuLineChoiceDescription(line, spec.choices) ?? undefined,
        )),
    };
    const reslt = await selectTtyMenu(state, adjustedSpec);
    state.gb.bot_disabled = old_bot_disabled;
    return reslt;
}

// C ref: windows.c getlin() (1868-1902), the same wrapper for a typed line.
//
// The command-queue arm (1873-1895) drains cmdq_pop() before the prompt is
// drawn. Queued keys up to a newline become the answer, which is echoed after
// the query; the newline ends the answer and is dropped. The first entry that
// is not a key is popped and discarded, and the loop stops there: with keys
// already taken the answer is those keys, and with none the prompt follows.
// The keys come from #repeat (cmd.c do_repeat()), whose CQ_REPEAT can still
// hold a key that the first run gave an earlier prompt the repeat skips, such
// as the yn answer doengrave() asked when the square had an engraving.
// program_state.in_getlin, set and cleared around the window-port call, has
// no reader in js/ -- its C readers are the save and hangup paths this port
// does not run.
//
// gb.bot_disabled matters for the reason getline.c:19-23 spells out: the
// prompt goes out through custompline(), which reaches flush_screen() and
// therefore bot().  js/getline.js hooked_tty_getlin() ports that
// flush_screen(1) call, so a status update left pending when the prompt opens
// waits for the answer instead of repainting underneath it.
export async function getlin(query, state = game) {
    // C writes each key into bufp, a newline as its NUL; the answer ends at
    // the first NUL, so a queued '\0' key cuts it short there too.
    let buf = '';
    let got_cmdq = false;
    let cmdq;
    while ((cmdq = cmdq_pop(state)) !== null) {
        if (cmdq.typ !== CMDQ_KEY) break;
        got_cmdq = true;
        const key = cmdq_key_char(cmdq);
        buf += key !== '\n' ? key : '\0';
        if (key === '\n') break;
    }
    if (got_cmdq) {
        const answer = buf.split('\0')[0];
        await ttyPline(`${query} ${answer}`, state);
        return answer;
    }

    state.gb ??= {};
    const old_bot_disabled = bot_disabled_is_set(state);

    state.gb.bot_disabled = true;
    try {
        return await tty_getlin(query, state);
    } finally {
        state.gb.bot_disabled = old_bot_disabled;
    }
}

// C ref: windows.c choose_classes_menu() (1644-1761).
//
// Covers category 1 with `way` TRUE -- object classes offered as PICK_ANY --
// which is the only combination options.c:3360 passes, and that call is this
// function's only caller in the build:
// `grep -rn choose_classes_menu nethack-c/upstream/src/*.c` names windows.c's
// own definition and panics plus that one call. The category 0 monster-class
// arm (1668-1676) and the PICK_ONE arm are therefore unported, and so are the
// `category` and `way` parameters that select them.
//
// C returns the number selected into `class_select`, a caller-owned buffer.
// JavaScript strings do not alias, so the new selection is the return value
// instead; options.c:3360 casts the count to void, so nothing reads it.
export async function choose_classes_menu(
    state, prompt, class_list, class_select, helpers,
) {
    const items = [];
    let next_accelerator = 'a';
    for (const sym of class_list) {
        const idx = def_char_to_objclass(sym);
        // IndexOk(idx, def_oc_syms): def_char_to_objclass() answers
        // MAXOCLASSES for a character no class owns, which C panics on.
        if (idx >= MAXOCLASSES) {
            throw new Error(
                `choose_classes_menu: invalid objclass '${sym}'`,
            );
        }
        items.push({
            // any.a_int = *class_list, read back as a character below.
            value: sym,
            selector: next_accelerator,
            // add_menu()'s groupacc, `category ? *class_list : 0`.
            groupSelector: sym,
            label: `${sym}  ${OBJCLASS_EXPLANATIONS[idx]}`,
            // `way && *class_select` guards a strchr() that answers NULL for
            // an empty buffer anyway, so the guard changes no result.
            selected: class_select.includes(sym),
        });
        // windows.c:1701-1707. flags.inv_order holds at most MAXOCLASSES - 1
        // classes and optfn_pickup_types() appends only venom, so a list long
        // enough to reach 'z' and wrap, or to reach 'Z' and stop, cannot be
        // built here; the advance is ported whole because a caller supplies
        // the list and a wrong accelerator would be silent.
        if (next_accelerator === 'Z') break;
        next_accelerator = next_accelerator === 'z'
            ? 'A'
            : String.fromCharCode(next_accelerator.charCodeAt(0) + 1);
    }
    // Bounded by the same argument as the break above: the loop leaves
    // next_accelerator at 'Z' at the very most.
    if (next_accelerator <= 'z') {
        /* for objects, add "A - ' '  all classes", after a separator */
        items.push({ text: '' });
        items.push({
            value: ' ',
            selector: 'A',
            label: '   All classes of objects',
            // MENU_ITEMFLAGS_SKIPINVERT: we won't preselect this even if the
            // incoming list is empty; having it selected means that it would
            // have to be explicitly de-selected in order to select anything
            // else.
            skipinvert: true,
        });
        if (prompt === 'Autopickup what?') {
            items.push({
                text: 'Note: when no choices are selected, '
                    + '"all" is implied.',
            });
            /* for 'O', "toggle" should be intuitive; for 'm O', it would
               probably be better to say "Set 'autopickup' to true|false" */
            items.push({
                text: state.flags.pickup
                    ? "Toggle off 'autopickup' to not pick up anything."
                    : "Toggle on 'autopickup' to automatically pick these "
                        + 'things up.',
            });
        }
    }
    const pick_list = await helpers.menu(items, prompt, PICK_ANY);
    if (!Array.isArray(pick_list)) {
        // n == -1. C advances the write pointer to eos(class_select) and
        // terminates it there, which leaves the incoming selection standing.
        return class_select;
    }
    const picked = pick_list.map((pick) => pick.value);
    // For object classes, first check for 'all'; it means 'use a blank list'
    // rather than 'collect every possible choice'. C rewrites pick_list[0]
    // and sets n = 1, which also ends the loop it sits in.
    if (picked.includes(' ')) return ' ';
    return picked.join('');
}

// C ref: windows.c menuitem_invert_test() (1560-1589), the decision the bulk
// select, deselect and invert routines of every window port share; the tty
// port calls it from set_all_on_page(), unset_all_on_page(), invert_all_on_page
// and invert_all() (wintty.c:1209, 1229, 1253, 1299).
//
// C is handed the whole MENU_ITEMFLAGS_* word.  MENU_ITEMFLAGS_SKIPINVERT is
// the only bit the body reads and the only one this port's menu items carry,
// so the bit itself is the parameter.  C's first parameter, the mode, is
// declared UNUSED: which bulk operation is running reaches the decision
// through `is_selected` alone, so js/tty_menu.js names its mode in a comment
// at each call site rather than passing it.
//
// options.c initoptions_init() (7279) sets iflags.menuinvertmode to 1, and
// optfn_menuinvertmode() can replace it with 0, 1, or 2 while the configuration
// file is read.  js/jsmain.js installs that iflags value before any menu opens.
export function menuitem_invert_test(skipinvert, is_selected, state) {
    if (!skipinvert) /* if not flagged SKIPINVERT, always pass test */
        return true;
    /*
     * menuinvertmode 0: treat entries flagged with skipinvert as ordinary
     *                   (same as if not flagged);
     * menuinvertmode 1: don't toggle bulk invert or bulk select entries On;
     *                   allow toggling to Off (for invert and deselect;
     *                   select doesn't do Off);
     * menuinvertmode 2: don't toggle skipinvert entries either On or Off
     *                   when any bulk change is performed.
     */
    if (state.iflags?.menuinvertmode === 2) {
        return false;
    } else if (state.iflags?.menuinvertmode === 1) {
        return is_selected;
    }
    return true;
}
