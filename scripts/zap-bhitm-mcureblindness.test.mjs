import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const cZap = readFileSync('nethack-c/upstream/src/zap.c', 'utf8');
const cMuse = readFileSync('nethack-c/upstream/src/muse.c', 'utf8');
const jsZap = readFileSync('js/zap.js', 'utf8');
const jsMuse = readFileSync('js/muse.js', 'utf8');

test('bhitm cures monster blindness between healing and the visible improvement line', () => {
    const cHeal = cZap.indexOf('healmon(mtmp, healamt, 0);');
    const cCure = cZap.indexOf('mcureblindness(mtmp, canseemon(mtmp));', cHeal);
    const cImprovement = cZap.indexOf('if (canseemon(mtmp)) {', cCure);
    assert.ok(cHeal >= 0 && cCure > cHeal && cImprovement > cCure);
    assert.match(cZap.slice(cHeal, cCure), /skilled_spell \|\| otyp == SPE_EXTRA_HEALING/u);

    const jsHeal = jsZap.indexOf('healmon(monster, healAmount, 0);');
    const jsCure = jsZap.indexOf('await mcureblindness(', jsHeal);
    const jsImprovement = jsZap.indexOf('if (canseemon(monster, state)) {', jsCure);
    assert.ok(jsHeal >= 0 && jsCure > jsHeal && jsImprovement > jsCure);
    assert.match(jsZap.slice(jsHeal, jsCure), /skilledSpell \|\| otyp === SPE_EXTRA_HEALING/u);
    assert.match(jsZap.slice(jsCure, jsImprovement), /canseemon\(monster, state\)/u);
    assert.doesNotMatch(jsZap.slice(jsHeal, jsImprovement), /note_unported\(['"]mon\.c mcureblindness/u);
});

test('the existing mcureblindness owner clears blindness and only speaks when visible', () => {
    const cStart = cMuse.indexOf('mcureblindness(struct monst *mon, boolean verbos)');
    const cEnd = cMuse.indexOf('\n/*', cStart);
    const jsStart = jsMuse.indexOf('export async function mcureblindness(');
    const jsEnd = jsMuse.indexOf('\n}', jsStart) + 2;
    assert.ok(cStart >= 0 && cEnd > cStart && jsStart >= 0 && jsEnd > jsStart);
    assert.match(cMuse.slice(cStart, cEnd), /if \(!mon->mcansee\)[\s\S]*?mon->mcansee = 1;[\s\S]*?mon->mblinded = 0;[\s\S]*?if \(verbos && haseyes\(mon->data\)\)[\s\S]*?pline_mon/u);
    assert.match(jsMuse.slice(jsStart, jsEnd), /if \(!mon\.mcansee\)[\s\S]*?mon\.mcansee = 1;[\s\S]*?mon\.mblinded = 0;[\s\S]*?if \(verbos && haseyes\(mon\.data\)\)[\s\S]*?await pline_mon/u);
});
