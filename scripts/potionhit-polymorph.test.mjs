import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const cSource = readFileSync(
    new URL('../nethack-c/upstream/src/potion.c', import.meta.url),
    'utf8',
);
const jsSource = readFileSync(
    new URL('../js/potion.js', import.meta.url),
    'utf8',
);

test('potionhit delegates the C polymorph effect and discards bhitm result', () => {
    const cStart = cSource.indexOf(
        'potionhit(struct monst *mon, struct obj *obj, int how)',
    );
    const cEnd = cSource.indexOf('\n}\n\n/* vapors are inhaled', cStart);
    assert.ok(cStart >= 0 && cEnd > cStart,
        'find the complete potionhit definition in potion.c');
    const cBody = cSource.slice(cStart, cEnd);
    assert.match(cBody,
        /case POT_POLYMORPH:\s*\(void\) bhitm\(mon, obj\);/u);

    const jsStart = jsSource.indexOf('export async function potionhit(');
    const jsEnd = jsSource.indexOf(
        '\n}\n\n// C ref: potion.c potionbreathe', jsStart,
    );
    assert.ok(jsStart >= 0 && jsEnd > jsStart,
        'find the complete potionhit implementation in potion.js');
    const jsBody = jsSource.slice(jsStart, jsEnd);
    assert.match(jsBody,
        /const random = \{\s*d, rn1, rn2, rnd, rnl, rne, rnz,\s*\.\.\.\(rawEnv\.random \?\? \{\}\),\s*\};/u,
        'potionhit fills omitted process RNG methods and preserves caller overrides');
    const armStart = jsBody.lastIndexOf('case POT_POLYMORPH:');
    assert.ok(armStart >= 0, 'find the monster-effect polymorph arm');
    assert.match(jsBody.slice(armStart),
        /case POT_POLYMORPH:\s*\/\/ C discards bhitm\(\)'s return after applying its effects\.\s*await bhitm\(mon, obj, state, random, env\);\s*break;/u);
    assert.doesNotMatch(jsBody,
        /note_unported\('zap\.c bhitm potion polymorph'\)/u);
});
