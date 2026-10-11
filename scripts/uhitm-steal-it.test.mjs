import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const cSource = readFileSync('nethack-c/upstream/src/uhitm.c', 'utf8');
const jsSource = readFileSync('js/uhitm.js', 'utf8');

function functionBody(source, signature) {
    const start = source.indexOf(signature);
    assert.notEqual(start, -1, `missing source signature: ${signature}`);
    const end = source.indexOf('\n}\n', start);
    assert.notEqual(end, -1, `missing function end: ${signature}`);
    return source.slice(start, end + 3);
}

test('uhitm.c stolen-item helpers preserve the source return and death ordering', () => {
    const cTheftPetrifies = functionBody(
        cSource,
        'theft_petrifies(struct obj *otmp)',
    );
    const jsTheftPetrifies = functionBody(
        jsSource,
        'async function theft_petrifies(',
    );

    assert.match(cTheftPetrifies, /uarmg[\s\S]*?touch_petrifies[\s\S]*?Stone_resistance/);
    assert.match(cTheftPetrifies, /instapetrify\(corpse_xname[\s\S]*?return TRUE;/);
    assert.match(jsTheftPetrifies, /state\.uarmg[\s\S]*?touch_petrifies[\s\S]*?heroStoneResistance/);
    assert.match(jsTheftPetrifies, /await instapetrify\([\s\S]*?return true;/);
});

test('uhitm.c steal_it keeps monster gold outside the stolen-object selection', () => {
    const cStealIt = functionBody(cSource, 'steal_it(struct monst *mdef');
    const jsStealIt = functionBody(jsSource, 'async function steal_it(');
    const cSteps = [
        cStealIt.indexOf('findgold(mdef->minvent)'),
        cStealIt.indexOf('obj_extract_self(gold)'),
        cStealIt.indexOf('hold_another_object('),
        cStealIt.indexOf('theft_petrifies(otmp)'),
        cStealIt.lastIndexOf('mpickobj(mdef, gold)'),
    ];
    const jsSteps = [
        jsStealIt.indexOf('findgold(mdef.minvent)'),
        jsStealIt.indexOf('obj_extract_self(gold, env)'),
        jsStealIt.indexOf('hold_another_object('),
        jsStealIt.indexOf('theft_petrifies(otmp, state, env)'),
        jsStealIt.lastIndexOf('mpickobj(mdef, gold, env)'),
    ];

    assert.ok(cSteps.every((index) => index >= 0));
    assert.ok(jsSteps.every((index) => index >= 0));
    assert.deepEqual(cSteps, [...cSteps].sort((a, b) => a - b));
    assert.deepEqual(jsSteps, [...jsSteps].sort((a, b) => a - b));
    assert.match(
        jsStealIt,
        /encumberMessage:[\s\S]*?encumber_msg\(currentState, \{ message \}\)/,
    );
});

test('mhitm_ad_sedu wires the hero attack arm to steal_it', () => {
    const cSedu = functionBody(cSource, 'mhitm_ad_sedu(');
    const jsSedu = functionBody(jsSource, 'async function mhitm_ad_sedu(');

    assert.match(cSedu, /if \(magr == &gy\.youmonst\)[\s\S]*?steal_it\(mdef, mattk\);[\s\S]*?mhm->damage = 0;/);
    assert.match(jsSedu, /if \(magr === state\.youmonst\)[\s\S]*?await steal_it\(mdef, mattk, state,[\s\S]*?mhm\.damage = 0;/);
    assert.doesNotMatch(jsSedu, /note_unported\(['"]uhitm\.c steal_it/);
});
