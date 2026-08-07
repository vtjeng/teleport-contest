// windows.js — Source-shaped window-port helpers shared by several commands.
// C ref: src/windows.c, the interface-independent layer between the game and
// whichever window port is linked in.

import { def_char_to_objclass } from './drawing.js';
import { MAXOCLASSES } from './objects.js';
import { OBJCLASS_EXPLANATIONS } from './symbol_data.js';

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
    const pick_list = await helpers.menu(items, prompt);
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
