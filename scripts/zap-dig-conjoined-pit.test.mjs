import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseCFunctions } from './c-functions.mjs';

const cDig = readFileSync('nethack-c/upstream/src/dig.c', 'utf8');
const cZap = readFileSync('nethack-c/upstream/src/zap.c', 'utf8');
const jsDig = readFileSync('js/dig.js', 'utf8');
const jsZap = readFileSync('js/zap.js', 'utf8');

test('zap_dig creates the adjacent pit before linking conjoined pits', () => {
    const cFunction = parseCFunctions(cDig).find(({ name }) => name === 'zap_dig');
    assert.ok(cFunction, 'dig.c defines zap_dig');
    const cBody = cDig.split('\n')
        .slice(cFunction.line - 1, cFunction.endLine).join('\n');
    const cChecks = cBody.indexOf('adj_pit_checks(&cc, buf)');
    const cCreation = cBody.indexOf('dighole(TRUE, TRUE, &cc)');
    const cRefresh = cBody.indexOf('adjpit = t_at(zx, zy)', cCreation);
    const cLinks = cBody.indexOf('trap_with_u->conjoined |=', cRefresh);
    assert.ok(cChecks >= 0 && cChecks < cCreation,
        'C checks whether the adjacent tile can become a pit first');
    assert.ok(cCreation < cRefresh && cRefresh < cLinks,
        'C creates and reloads the adjacent pit before linking the pair');

    const jsStart = jsDig.indexOf('export async function zap_dig(');
    const jsEnd = jsDig.indexOf('\n// C ref: dig.c adj_pit_checks()', jsStart);
    assert.ok(jsStart >= 0 && jsEnd > jsStart,
        'dig.js owns the source-matched zap_dig function');
    const jsBody = jsDig.slice(jsStart, jsEnd);
    const jsChecks = jsBody.indexOf('adj_pit_checks({ x: zx, y: zy }, state)');
    // C TRUE, TRUE map to JavaScript true, true; the coordinate object mirrors &cc.
    const jsCreation = jsBody.search(
        /await dighole\(true, true, \{ x: zx, y: zy \}, \{\s*state,\s*random,\s*\}\)/u,
    );
    const jsRefresh = jsBody.indexOf('nextPit = t_at(zx, zy, state)', jsCreation);
    const jsLinks = jsBody.indexOf('nextPit.conjoined', jsRefresh);
    assert.ok(jsChecks >= 0 && jsChecks < jsCreation,
        'JavaScript performs the same source permission check before dighole');
    assert.ok(jsCreation < jsRefresh && jsRefresh < jsLinks,
        'the existing dighole owner runs before the refreshed pit is linked');
    assert.doesNotMatch(jsBody, /note_unported\(['"]dig\.c dighole/u,
        'the obsolete skipped call is removed');
});

test('weffects keeps the dig.c caller bound to zap_dig in the dig module', () => {
    const cFunction = parseCFunctions(cZap).find(({ name }) => name === 'weffects');
    assert.ok(cFunction, 'zap.c defines weffects');
    const cBody = cZap.split('\n')
        .slice(cFunction.line - 1, cFunction.endLine).join('\n');
    assert.match(cBody, /if\s*\(otyp\s*==\s*WAN_DIGGING\s*\|\|\s*otyp\s*==\s*SPE_DIG\)\s*zap_dig\(\)/u);
    assert.match(jsZap, /import\s*\{[^}]*\bzap_dig\b[^}]*\}\s*from '\.\/dig\.js'/su);
    assert.match(jsZap, /if\s*\(otyp\s*===\s*WAN_DIGGING\s*\|\|\s*otyp\s*===\s*SPE_DIG\)\s*\{\s*await zap_dig\(state, random\);/su);
});
