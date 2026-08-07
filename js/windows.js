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
            bulkSelectable: false,
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
