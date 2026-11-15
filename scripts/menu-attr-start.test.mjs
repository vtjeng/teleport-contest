// wintty.c process_menu_window() (1436-1445) starts a menu line's attribute
// and color at attr_n: 4 when curr->str has the shape
// "[0]=letter, [1]=space, [2]=[-+#], [3]=space", else 0.  windows.c
// add_menu() (1803-1806) matches MENUCOLOR against the caller's str, which
// tty_add_menu() (2594-2605) only afterwards prefixes with "%c - ".
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    menuAttrStart,
    menuLineChoiceDescription,
} from '../js/tty_menu.js';

test('menuAttrStart follows the attr_n test in process_menu_window()', () => {
    // tty_add_menu()'s stored "%c - %s" form: highlighting skips the prefix.
    assert.equal(menuAttrStart('y - Yes; start game'), 4);
    // '+' and '#' are the other two markers strchr("-+#", ...) accepts.
    assert.equal(menuAttrStart('a + item'), 4);
    assert.equal(menuAttrStart('a # item'), 4);
    // '*' is a drawn marker only; C never stores it, so a zero-identifier
    // string spelled this way is highlighted from its first character.
    assert.equal(menuAttrStart('a * item'), 0);
    // Headers and other zero-identifier text start at column 0.
    assert.equal(menuAttrStart('Pick a role or profession'), 0);
    assert.equal(menuAttrStart(''), 0);
    // str[3] must be a space: "a -x" fails the last test.
    assert.equal(menuAttrStart('a -x'), 0);
    // Exactly four characters still satisfies str[0..3]; the description is
    // empty.
    assert.equal(menuAttrStart('q - '), 4);
});

test('menuLineChoiceDescription returns add_menu() str for a selectable row', () => {
    // role.c:2659-2660 adds "Yes; start game" with selector 'y' and
    // MENU_ITEMFLAGS_SELECTED, which the preformatted row draws with '*'.
    const choices = new Map([['y', 'y'], ['n', 'n']]);
    assert.equal(
        menuLineChoiceDescription('y * Yes; start game', choices),
        'Yes; start game',
    );
    assert.equal(
        menuLineChoiceDescription({ text: 'n - No; choose role again' }, choices),
        'No; choose role again',
    );
    // A row whose selector no choice maps is display-only text.
    assert.equal(menuLineChoiceDescription('q - Quit', choices), null);
    // A header has no selector shape at all.
    assert.equal(
        menuLineChoiceDescription('Hilde the lawful female dwarven Valkyrie', choices),
        null,
    );
});
