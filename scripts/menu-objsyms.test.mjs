import assert from 'node:assert/strict';
import test from 'node:test';

import { resetGame, game } from '../js/gstate.js';
import { GameDisplay } from '../js/game_display.js';
import { let_to_name } from '../js/invent.js';
import {
    ARMOR_CLASS,
    FOOD_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';
import { parseNethackrc } from '../js/options.js';
import { renderTtyMenu } from '../js/tty_menu.js';
import { NO_COLOR } from '../js/terminal.js';

const MODES = Object.freeze([
    ['none', 0, false, false],
    ['headers', 1, true, false],
    ['entries', 2, false, true],
    ['both', 3, true, true],
    ['conditional', 4, false, true],
    ['one-or-other', 5, true, true],
]);

function modeFields(parsed) {
    return [
        parsed.iflags.menuobjsyms,
        parsed.iflags.menu_head_objsym,
        parsed.iflags.use_menu_glyphs,
    ];
}

function renderState(mode) {
    resetGame();
    game.nhDisplay = new GameDisplay(null);
    game.iflags = {
        menuobjsyms: mode,
        menu_head_objsym: (mode & 1) !== 0,
        use_menu_glyphs: (mode & (2 | 4)) !== 0,
    };
    return game;
}

test('startup menu_objsyms installs the complete six-mode flag table', () => {
    assert.deepEqual(modeFields(parseNethackrc('')), [4, false, true]);
    for (const [name, mode, headings, entries] of MODES) {
        for (const value of [name, `${mode}`]) {
            const parsed = parseNethackrc(
                `OPTIONS=menu_objsyms:${value}\n`,
            );
            assert.deepEqual(
                modeFields(parsed), [mode, headings, entries], value,
            );
            assert.equal(parsed.flags.menu_objsyms, undefined, value);
        }
    }
});

test('startup menu_objsyms keeps source abbreviations and fallback rules', () => {
    for (const [value, expected] of [
        ['head', 1],
        ['ENTR', 2],
        ['both', 3],
        ['cond', 4],
        ['one-', 5],
        ['one-or-the-other', 5],
        // The alternate is compared for its own full length, so a suffix is
        // ignored even though canonical names reject suffixes.
        ['one-or-the-other-tail', 5],
        ['hea', 0],
        ['conditional-tail', 0],
        ['zqxj', 0],
        ['3tail', 3],
    ]) {
        const parsed = parseNethackrc(
            `OPTIONS=menu_objsyms:${value}\n`,
        );
        assert.equal(parsed.iflags.menuobjsyms, expected, value);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
    }
});

test('bare, empty, alias, and negated menu_objsyms spellings match source', () => {
    for (const [statement, expected] of [
        ['menu_objsyms', 1],
        ['menu_objsyms:', 1],
        ['use_menu_glyphs', 2],
        ['use_menu_glyphs:', 2],
        // Alias matching is case-insensitive, but the legacy bare-value test
        // in the handler is not.
        ['USE_MENU_GLYPHS', 1],
        ['!menu_objsyms', 0],
        ['!use_menu_glyphs', 0],
        ['!menu_objsyms:both', 0],
    ]) {
        const parsed = parseNethackrc(`OPTIONS=${statement}\n`);
        assert.equal(parsed.iflags.menuobjsyms, expected, statement);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
    }
});

test('an illegal numeric menu_objsyms value reports and keeps prior flags', () => {
    const statement = 'OPTIONS=menu_objsyms:6';
    const parsed = parseNethackrc(
        `OPTIONS=menu_objsyms:both\n${statement}\n`,
    );
    assert.deepEqual(modeFields(parsed), [3, true, true]);
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${statement}`,
        ' * Line 2: compound option specified multiple times: menu_objsyms.',
        " * Line 2: Illegal menu_objsyms parameter '6'.",
    ]);
});

test('let_to_name appends the compiled-in class symbol at source padding', () => {
    assert.equal(let_to_name(WEAPON_CLASS, false, true), "Weapons  (')')");
    assert.equal(let_to_name(ARMOR_CLASS, false, true), "Armor    ('[')");
    assert.equal(
        let_to_name(FOOD_CLASS, false, true),
        "Comestibles  ('%')",
    );
    assert.equal(let_to_name(ARMOR_CLASS, false, false), 'Armor');
});

test('TTY entry glyphs obey all six modes and selected-marker precedence', () => {
    const glyphInfo = { ch: ')', ttychar: ')'.charCodeAt(0), color: 6 };
    for (const [name, mode] of MODES) {
        const state = renderState(mode);
        const rendered = renderTtyMenu(state, {
            title: null,
            items: [
                { text: 'Weapons', heading: true },
                { selector: 'a', label: 'a dart', value: 'a', glyphInfo },
            ],
        });
        const { startColumn } = rendered.layout;
        const marker = state.nhDisplay.grid[1][startColumn + 2];
        const expectedGlyph = mode === 2 || mode === 3;
        assert.equal(marker.ch, expectedGlyph ? ')' : '-', name);
        assert.equal(marker.color, expectedGlyph ? 6 : NO_COLOR, name);
        assert.equal(marker.attr, 0, name);
    }

    const selected = renderState(3);
    const rendered = renderTtyMenu(selected, {
        title: null,
        items: [{
            selector: 'a', label: 'a dart', value: 'a', glyphInfo,
            selected: true, count: -1,
        }],
    });
    const marker = selected.nhDisplay.grid[0][rendered.layout.startColumn + 2];
    assert.equal(marker.ch, '*');
    assert.equal(marker.color, NO_COLOR);
});

test('TTY entry glyphs preserve each high-bit tty byte boundary', () => {
    for (const ttychar of [0x80, 0xF8]) {
        const state = renderState(2);
        const rendered = renderTtyMenu(state, {
            title: null,
            items: [{
                selector: 'a',
                label: 'a scalpel',
                value: 'a',
                glyphInfo: { ch: 'x', ttychar, color: 6 },
            }],
        });
        const marker = state.nhDisplay.grid[0][
            rendered.layout.startColumn + 2
        ];
        assert.equal(marker.ch, '\uFFFD', ttychar);
        assert.equal(marker.color, 6, ttychar);
        assert.equal(marker.attr, 0, ttychar);
    }
});

test('TTY entry glyphs drop control tty bytes to a blank default cell', () => {
    for (const ttychar of [0x00, 0x0A, 0x0E, 0x1B, 0x1F]) {
        const state = renderState(2);
        const rendered = renderTtyMenu(state, {
            title: null,
            items: [{
                selector: 'a',
                label: 'a scalpel',
                value: 'a',
                glyphInfo: { ch: '?', ttychar, color: 6 },
            }],
        });
        const marker = state.nhDisplay.grid[0][
            rendered.layout.startColumn + 2
        ];
        assert.deepEqual(marker, {
            ch: ' ', color: NO_COLOR, attr: 0,
        }, ttychar);
    }
});

test('TTY entry glyphs preserve a space byte as a colored glyph cell', () => {
    const state = renderState(2);
    const rendered = renderTtyMenu(state, {
        title: null,
        items: [{
            selector: 'a',
            label: 'a scalpel',
            value: 'a',
            glyphInfo: { ch: '?', ttychar: 0x20, color: 6 },
        }],
    });
    const marker = state.nhDisplay.grid[0][rendered.layout.startColumn + 2];
    assert.deepEqual(marker, { ch: ' ', color: 6, attr: 0 });
});

test('conditional glyph scan includes headers on later pages', () => {
    const state = renderState(4);
    const items = Array.from({ length: 23 }, (_, index) => ({
        selector: String.fromCharCode(65 + (index % 26)),
        label: `item ${index}`,
        value: index,
        glyphInfo: { ch: ')', ttychar: ')'.charCodeAt(0), color: 6 },
    }));
    // The first page has 23 selectable entries; this header begins page two.
    items.push({ text: 'Weapons', heading: true });
    const rendered = renderTtyMenu(state, { title: null, items }, 0);
    assert.equal(rendered.layout.pageCount, 2);
    assert.equal(
        state.nhDisplay.grid[0][rendered.layout.startColumn + 2].ch,
        '-',
    );

    const noHeader = renderState(4);
    const withoutHeader = renderTtyMenu(noHeader, {
        title: null,
        items: items.slice(0, -1),
    });
    assert.equal(
        noHeader.nhDisplay.grid[0][withoutHeader.layout.startColumn + 2].ch,
        ')',
    );
});
