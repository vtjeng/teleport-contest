import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const MHITU_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8',
);
const MHITU_JS = readFileSync(new URL('../js/mhitu.js', import.meta.url), 'utf8');

// C refs: mhitu.c:doseduce() and its private mayberem() helper.
test('doseduce wires the source-ordered mayberem armor path', () => {
    const doseduceC = MHITU_C.match(
        /int\s+doseduce\(struct monst \*mon\)\s*\{[\s\S]*?\n\}\n\n\/\* 'mon' tries to remove/u,
    )?.[0];
    assert.ok(doseduceC, 'mhitu.c contains the complete doseduce body');
    assert.match(doseduceC,
        /if \(mon->mcan \|\| mon->mspec_used\)[\s\S]*?return 0;[\s\S]*?if \(unresponsive\(\)\)[\s\S]*?return 0;[\s\S]*?stop_donning\([\s\S]*?for \(ring = gi\.invent; ring; ring = nring\)[\s\S]*?naked = \(!uarmc && !uarmf && !uarmg && !uarms && !uarmh && !uarmu\);[\s\S]*?mayberem\(mon, Who, uarmc,[\s\S]*?if \(uarm \|\| uarmc\)[\s\S]*?return 1;[\s\S]*?rn2\(35\)[\s\S]*?switch \(rn2\(5\)\)[\s\S]*?rn2\(20\)[\s\S]*?if \(!rn2\(25\)\)[\s\S]*?rloc\(mon, RLOC_MSG\)[\s\S]*?return 1;/u);

    const mayberemC = MHITU_C.match(
        /staticfn void\s+mayberem\(struct monst \*mon,[\s\S]*?\n\}/u,
    )?.[0];
    assert.ok(mayberemC, 'mhitu.c defines the complete mayberem helper');
    assert.match(mayberemC,
        /if \(!obj \|\| !obj->owornmask\)\s*return;[\s\S]*?if \(u\.utotype \|\| !m_next2u\(mon\)\)\s*return;[\s\S]*?if \(Deaf\)[\s\S]*?else if \(rn2\(20\) < ACURR\(A_CHA\)\)[\s\S]*?!rn2\(2\) \? "lover"[\s\S]*?if \(y_n\(qbuf\) == 'n'\)\s*return;[\s\S]*?body_part\(HAIR\)[\s\S]*?verbalize\([\s\S]*?remove_worn_item\(obj, TRUE\);/u);
    // The admitted v41 replay removes uarmc and reaches C's cloak-specific
    // "it's in the way" verbalization branch.
    assert.match(mayberemC,
        /\(obj == uarmc \|\| obj == uarms\)\s*\? "it's in the way"/u,
    );

    const doseduceJs = MHITU_JS.match(
        /export async function doseduce\([\s\S]*?\n\}/u,
    )?.[0];
    assert.ok(doseduceJs, 'mhitu.js contains the complete doseduce port');
    assert.match(doseduceJs,
        /await mayberem\(\s*mon, who, state\.uarmc, cloak_simple_name\(state\.uarmc, state\),[\s\S]*?if \(!state\.uarmc\) \{\s*await mayberem\(\s*mon, who, state\.uarm, suit_simple_name\(state\.uarm, state\),[\s\S]*?await mayberem\(mon, who, state\.uarmf, 'boots',[\s\S]*?if \(!triedGloves\)\s*await mayberem\(mon, who, state\.uarmg, 'gloves',[\s\S]*?await mayberem\(mon, who, state\.uarms, 'shield',[\s\S]*?await mayberem\([\s\S]*?state\.uarmh, helm_simple_name\(state\.uarmh, state\)[\s\S]*?if \(!state\.uarmc && !state\.uarm\) \{\s*await mayberem\(mon, who, state\.uarmu, 'shirt'/u);
    assert.match(doseduceJs,
        /const encumberMessage = rawEnv\.encumberMessage\s*\?\? \(\(currentState\) => encumber_msg\(currentState, \{ message \}\)\);\s*const effectEnv = \{\s*\.\.\.rawEnv, state, random, message, encumberMessage,\s*\};/u,
        'doseduce supplies the source encumber_msg callback to attribute effects',
    );
    assert.match(doseduceJs,
        /await adjattrib\(A_CON, 1, true, state, effectEnv\);/u,
        'the C adjattrib caller receives the callback-bearing environment',
    );

    const mayberemJs = MHITU_JS.match(
        /async function mayberem\([\s\S]*?\n\}/u,
    )?.[0];
    assert.ok(mayberemJs, 'mhitu.js contains the complete mayberem port');
    assert.match(mayberemJs,
        /if \(!obj \|\| !obj\.owornmask\) return;[\s\S]*?if \(state\.utotype \|\| !m_next2u\(mon, state\)\) return;[\s\S]*?if \(heroDeaf\(state\)\)[\s\S]*?else if \(random\.rn2\(20\) < acurr\(state, A_CHA\)\)[\s\S]*?const endearment = !random\.rn2\(2\)[\s\S]*?await y_n\(query, state\)[\s\S]*?body_part\(HAIR, state\.youmonst\)[\s\S]*?await verbalize\([\s\S]*?await remove_worn_item\(obj, true, state, rawEnv\);/u);
    // C's uarmc predicate must select the same text in JavaScript.
    assert.match(mayberemJs,
        /obj === state\.uarmc \|\| obj === state\.uarms\s*\? "it's in the way"/u,
    );
    assert.doesNotMatch(MHITU_JS, /note_unported\('mhitu\.c mayberem'\)/u);
});
