import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    CHOKING,
    DIED,
    KILLED_BY,
    KILLED_BY_AN,
    NO_KILLER_PREFIX,
    PANICKED,
    QUIT,
} from '../js/const.js';
import { formatkiller } from '../js/topten.js';

const TOPTEN_C = readFileSync(
    new URL('../nethack-c/upstream/src/topten.c', import.meta.url), 'utf8',
);

test('killed_by_prefix matches C topten.c definition order', () => {
    // topten.c:96-105 killed_by_prefix[].  Parse the C string literals to
    // confirm the JS table has the right content and order.
    const [, body] = /killed_by_prefix\[\] = \{([^}]*)\}/u.exec(TOPTEN_C);
    const rows = [...body.matchAll(/"([^"]*)"/gu)].map(([, text]) => text);
    // DIED=0 through ASCENDED=15: 16 entries.
    assert.equal(rows.length, 16, 'killed_by_prefix has 16 entries');
    // Verify a representative set to pin content without duplicating the table.
    assert.equal(rows[DIED], 'killed by ', 'DIED prefix');
    assert.equal(rows[CHOKING], 'choked on ', 'CHOKING prefix');
    assert.equal(rows[PANICKED], '', 'PANICKED prefix is empty');
    assert.equal(rows[QUIT], '', 'QUIT prefix is empty');
});

test('formatkiller with KILLED_BY_AN prepends article and prefix', () => {
    // C: a hero killed by a falling rock trap produces
    // "killed by a falling rock trap".
    const state = {
        killer: { name: 'falling rock trap', format: KILLED_BY_AN },
        multi: 0,
    };
    const result = formatkiller(DIED, true, state);
    assert.equal(result, 'killed by a falling rock trap');
});

test('formatkiller with KILLED_BY uses prefix without article', () => {
    // C: KILLED_BY adds the prefix but skips the article.  The hero choked
    // on food, producing "choked on food ration" (no article).
    const state = {
        killer: { name: 'food ration', format: KILLED_BY },
        multi: 0,
    };
    const result = formatkiller(CHOKING, false, state);
    assert.equal(result, 'choked on food ration');
});

test('formatkiller with NO_KILLER_PREFIX uses killer name only', () => {
    // C: how >= PANICKED uses NO_KILLER_PREFIX. Quit has no prefix.
    const state = {
        killer: { name: 'quit', format: NO_KILLER_PREFIX },
        multi: 0,
    };
    const result = formatkiller(QUIT, false, state);
    assert.equal(result, 'quit');
});

test('formatkiller sanitizes commas and equals in killer name', () => {
    // topten.c:137-143.  Commas become semicolons and equals become
    // underscores so that the score file's field splitting is preserved.
    const state = {
        killer: { name: 'named,danger=extreme', format: NO_KILLER_PREFIX },
        multi: 0,
    };
    const result = formatkiller(QUIT, false, state);
    assert.equal(result, 'named;danger_extreme');
});

test('formatkiller appends helpless reason when multi < 0', () => {
    // topten.c:152-156. When the hero was paralyzed (multi < 0) at death,
    // append ", while <reason>" for the tombstone and score file.
    // killer.name omits the article; KILLED_BY_AN's an() call adds "a".
    const state = {
        killer: { name: 'gnome', format: KILLED_BY_AN },
        multi: -3,
        multi_reason: 'sleeping',
    };
    const result = formatkiller(DIED, true, state);
    assert.equal(result, 'killed by a gnome, while sleeping');
});

test('formatkiller appends generic helpless when multi_reason is missing', () => {
    // topten.c:158. When multi_reason is null, the fallback is
    // ", while helpless".
    // killer.name omits the article; KILLED_BY_AN's an() call adds "a".
    const state = {
        killer: { name: 'troll', format: KILLED_BY_AN },
        multi: -1,
        multi_reason: null,
    };
    const result = formatkiller(DIED, true, state);
    assert.equal(result, 'killed by a troll, while helpless');
});

test('formatkiller omits helpless when incl_helpless is false', () => {
    // topten.c:361 calls formatkiller with FALSE, which skips the helpless
    // suffix even when multi < 0.
    // killer.name omits the article; KILLED_BY_AN's an() call adds "a".
    const state = {
        killer: { name: 'troll', format: KILLED_BY_AN },
        multi: -1,
        multi_reason: 'sleeping',
    };
    const result = formatkiller(DIED, false, state);
    assert.equal(result, 'killed by a troll');
});

test('formatkiller default case falls through to NO_KILLER_PREFIX', () => {
    // C topten.c:110-116: default: impossible(...); FALLTHROUGH;
    // case NO_KILLER_PREFIX: break;
    // An invalid format value produces just the killer name, no prefix.
    const state = {
        killer: { name: 'mysterious force', format: 99 },
    };
    const result = formatkiller(DIED, false, state);
    assert.equal(result, 'mysterious force');
});
