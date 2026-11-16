import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    BUFSZ,
    CHOKING,
    DIED,
    KILLED_BY,
    KILLED_BY_AN,
    NO_KILLER_PREFIX,
    PANICKED,
    QUIT,
} from '../js/const.js';
import { DTHSZ, formatkiller } from '../js/topten.js';

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
    const result = formatkiller(DIED, true, state, BUFSZ);
    assert.equal(result, 'killed by a falling rock trap');
});

test('formatkiller with KILLED_BY uses prefix without article', () => {
    // C: KILLED_BY adds the prefix but skips the article.  The hero choked
    // on food, producing "choked on food ration" (no article).
    const state = {
        killer: { name: 'food ration', format: KILLED_BY },
        multi: 0,
    };
    const result = formatkiller(CHOKING, false, state, BUFSZ);
    assert.equal(result, 'choked on food ration');
});

test('formatkiller with NO_KILLER_PREFIX uses killer name only', () => {
    // C: how >= PANICKED uses NO_KILLER_PREFIX. Quit has no prefix.
    const state = {
        killer: { name: 'quit', format: NO_KILLER_PREFIX },
        multi: 0,
    };
    const result = formatkiller(QUIT, false, state, BUFSZ);
    assert.equal(result, 'quit');
});

test('formatkiller sanitizes commas and equals in killer name', () => {
    // topten.c:137-143.  Commas become semicolons and equals become
    // underscores so that the score file's field splitting is preserved.
    const state = {
        killer: { name: 'named,danger=extreme', format: NO_KILLER_PREFIX },
        multi: 0,
    };
    const result = formatkiller(QUIT, false, state, BUFSZ);
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
    const result = formatkiller(DIED, true, state, BUFSZ);
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
    const result = formatkiller(DIED, true, state, BUFSZ);
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
    const result = formatkiller(DIED, false, state, BUFSZ);
    assert.equal(result, 'killed by a troll');
});

test('formatkiller default case falls through to NO_KILLER_PREFIX', () => {
    // C topten.c:110-116: default: impossible(...); FALLTHROUGH;
    // case NO_KILLER_PREFIX: break;
    // An invalid format value produces just the killer name, no prefix.
    const state = {
        killer: { name: 'mysterious force', format: 99 },
    };
    const result = formatkiller(DIED, false, state, BUFSZ);
    assert.equal(result, 'mysterious force');
});

// A 61-letter name, "a dog called " plus it is 74 bytes: the longest a
// #name-d dog's killer text gets before the reason cannot fit.  The values
// below are worked through topten.c 119-161 by hand for a DTHSZ + 1 (101)
// byte buffer, the size topten() (694) and savebones() (bones.c 585) pass.
const LONG_NAME = 'B'.repeat(61);

test('formatkiller drops a reason that does not fit a topten entry', () => {
    // After "killed by " siz is 91; copying 74 bytes and meeting the
    // terminator leaves 91 - 75 = 16.  "sleeping" needs 8 + 9 = 17 and
    // ", while helpless" needs 17, so C appends nothing.  Before the fix
    // the port appended ", while sleeping" and cut the result at 100.
    const state = {
        killer: { name: `dog called ${LONG_NAME}`, format: KILLED_BY_AN },
        multi: -5,
        multi_reason: 'sleeping',
    };
    assert.equal(
        formatkiller(DIED, true, state, DTHSZ + 1),
        `killed by a dog called ${LONG_NAME}`,
    );
});

test('formatkiller falls back to "while helpless" when the reason is long', () => {
    // A 47-letter name makes the copied text 60 bytes, so 91 - 61 = 30 is
    // left.  "fainted from lack of food" (eat.c) needs 25 + 9 = 34 > 30, but
    // ", while helpless" needs 17 <= 30.  The port used to print the
    // reason itself, cut to "...lack of foo".
    const name = 'C'.repeat(47);
    const state = {
        killer: { name: `dog called ${name}`, format: KILLED_BY_AN },
        multi: -3,
        multi_reason: 'fainted from lack of food',
    };
    assert.equal(
        formatkiller(DIED, true, state, DTHSZ + 1),
        `killed by a dog called ${name}, while helpless`,
    );
});

test('formatkiller keeps a reason that fits exactly', () => {
    // A 60-letter name: 73 bytes copied leaves 91 - 74 = 17, and
    // "sleeping" needs exactly 17, so C keeps it; the text is 99 bytes.
    const name = 'D'.repeat(60);
    const state = {
        killer: { name: `dog called ${name}`, format: KILLED_BY_AN },
        multi: -5,
        multi_reason: 'sleeping',
    };
    assert.equal(
        formatkiller(DIED, true, state, DTHSZ + 1),
        `killed by a dog called ${name}, while sleeping`,
    );
});

test('formatkiller cuts an over-long name at siz - 1 bytes', () => {
    // A 120-byte NO_KILLER_PREFIX name in a 101-byte buffer: the copy loop
    // stops when --siz reaches 0, after 100 bytes, and no suffix fits.
    const state = {
        killer: { name: 'E'.repeat(120), format: NO_KILLER_PREFIX },
        multi: -1,
        multi_reason: 'sleeping',
    };
    assert.equal(formatkiller(DIED, true, state, DTHSZ + 1), 'E'.repeat(100));
});

test('formatkiller refuses a call without C\'s buffer size', () => {
    // Every C caller passes its buffer's size; a JS caller that omits it
    // would silently keep text C cuts, which is the defect fixed here.
    const state = { killer: { name: 'newt', format: KILLED_BY_AN }, multi: 0 };
    assert.throws(() => formatkiller(DIED, false, state), TypeError);
});
