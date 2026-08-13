// windows.js — Source-shaped window-port helpers shared by several commands.
// C ref: src/windows.c, the interface-independent layer between the game and
// whichever window port is linked in.

import { PICK_ANY } from './const.js';
import { def_char_to_objclass } from './drawing.js';
import { tty_getlin } from './getline.js';
import { game } from './gstate.js';
import { MAXOCLASSES } from './objects.js';
import { OBJCLASS_EXPLANATIONS } from './symbol_data.js';
import { selectTtyMenu } from './tty_menu.js';

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
    const reslt = await selectTtyMenu(state, spec);
    state.gb.bot_disabled = old_bot_disabled;
    return reslt;
}

// C ref: windows.c getlin() (1868-1902), the same wrapper for a typed line.
//
// Covers 1897-1900, the arm that reaches the window port.  The command-queue
// arm at 1873-1895 drains cmdq_pop() into the answer and returns before the
// prompt is ever drawn; no ported caller of this function queues keys, and
// js/cmd.js cmdq_pop() has no writer that could feed one, so porting it would
// add a branch nothing can enter.  program_state.in_getlin, set and cleared
// around the same call, has no reader in js/ either -- its C readers are the
// save and hangup paths this port does not run.
//
// The flag matters here for the reason getline.c:19-23 spells out: the prompt
// goes out through custompline(), which reaches flush_screen() and therefore
// bot().  js/getline.js hooked_tty_getlin() ports that flush_screen(1) call,
// so a status update left pending when the prompt opens waits for the answer
// instead of repainting underneath it.
export async function getlin(query, state = game) {
    state.gb ??= {};
    const old_bot_disabled = bot_disabled_is_set(state);

    state.gb.bot_disabled = true;
    const bufp = await tty_getlin(query, state);
    state.gb.bot_disabled = old_bot_disabled;
    return bufp;
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
// options.c initoptions_init() (7279) sets iflags.menuinvertmode to 1, and the
// 'menuinvertmode' option that would change it is unported, so 1 is what a
// running game answers with: a bulk operation never selects a SKIPINVERT entry
// on, but one that is already selected is still deselected and still inverted
// off.
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
