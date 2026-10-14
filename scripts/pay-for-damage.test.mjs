import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { pay_for_damage } from '../js/shk.js';

const cSource = Object.fromEntries(
    ['shk.c', 'end.c', 'apply.c', 'explode.c', 'zap.c', 'dig.c', 'hack.c', 'dokick.c']
        .map((file) => [file, readFileSync(`nethack-c/upstream/src/${file}`, 'utf8')]),
);
const jsSource = Object.fromEntries(
    ['shk.js', 'end.js', 'apply.js', 'explode.js', 'zap.js', 'dig.js', 'hack.js', 'dokick.js']
        .map((file) => [file, readFileSync(`js/${file}`, 'utf8')]),
);

function cDefinition(source, signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `${signature} is present in C`);
    return source.slice(start);
}

test('home_shk completes the no-message relocation before shop bookkeeping', () => {
    const c = cDefinition(cSource['shk.c'], 'home_shk(struct monst *shkp, boolean killkops)');
    const js = cDefinition(jsSource['shk.js'], 'async function home_shk(');
    assert.match(c, /mnearto\(shkp, x, y, TRUE, RLOC_NOMSG\);[\s\S]*?has_shop = 1;[\s\S]*?after_shk_move\(shkp\);/u);
    assert.match(js, /await mnearto\(shopkeeper,[\s\S]*?RLOC_NOMSG,[\s\S]*?\);[\s\S]*?has_shop = true;[\s\S]*?await after_shk_move\(shopkeeper, state\);/u);

    const endC = cDefinition(cSource['end.c'], 'really_done(int how)');
    const endJs = cDefinition(jsSource['end.js'], 'async function really_done(');
    assert.match(endC, /taken = paybill\([\s\S]*?\);[\s\S]*?paygd\(silently\);/u);
    assert.match(endJs, /const taken = how === PANICKED[\s\S]*?: await paybill\([\s\S]*?\);[\s\S]*?paygd\(silently, state\);/u);
});

test('pay_for_damage follows the C selection, pursuit, and restitution branches', async () => {
    const c = cDefinition(cSource['shk.c'], 'pay_for_damage(const char *dmgstr');
    const js = cDefinition(jsSource['shk.js'], 'export async function pay_for_damage(');
    assert.match(c, /for \(tmp_dam = svl\.level\.damagelist;[\s\S]*?if \(tmp_dam->when != svm\.moves \|\| !tmp_dam->cost\)/u);
    assert.match(c, /if \(shk_distance > nearest_shk\)[\s\S]*?rn2\(\+\+picks\)/u);
    assert.match(c, /if \(ANGRY\(shkp\) \|\| ESHK\(shkp\)->following\)[\s\S]*?hot_pursuit\(shkp\);/u);
    assert.match(c, /!rn2\(50\)/u);
    assert.match(c, /if \(uinshp\) \{[\s\S]*?mnexto\(shkp, RLOC_NOMSG\);[\s\S]*?\n    \} else \{[\s\S]*?mnearto\(shkp, x, y, TRUE, RLOC_MSG\);/u);
    assert.match(c, /check_credit\(cost_of_damage, shkp\)[\s\S]*?money2mon\(shkp, cost_of_damage\)[\s\S]*?home_shk\(shkp, FALSE\)[\s\S]*?pacify_shk\(shkp, FALSE\)/u);
    assert.match(js, /damage\.when !== moves \|\| !damage\.cost/u);
    assert.match(js, /keeperDistance === nearestKeeper && picks[\s\S]*?roll\(\+\+picks\)/u);
    assert.match(js, /if \(!shopkeeper\.mpeaceful \|\| shopkeeper\.mextra\.eshk\.following\)[\s\S]*?hot_pursuit\(shopkeeper, state\)/u);
    assert.match(js, /cant_mollify[\s\S]*?roll\(50\)/u);
    assert.match(js, /if \(inShop\) \{[\s\S]*?await mnexto\(shopkeeper, RLOC_NOMSG, env\);[\s\S]*?\n    \} else \{[\s\S]*?await mnearto\(shopkeeper, x, y, true, RLOC_MSG, env\);\n    \}/u);
    assert.match(js, /await check_credit\(damageCost, shopkeeper, state, env\)[\s\S]*?money2mon\(shopkeeper, damageCost, state\)[\s\S]*?await home_shk\(shopkeeper, false, state, env\)[\s\S]*?pacify_shk\(shopkeeper, false\)/u);

    const state = {
        moves: 9,
        level: { damagelist: { when: 9, cost: 0, place: { x: 3, y: 4 } } },
        u: { ux: 3, uy: 4, ushops: [] },
    };
    const messages = [];
    await pay_for_damage('destroy', false, state, {
        message: async (line) => messages.push(line),
    });
    assert.deepEqual(messages, []);
});

test('every currently owned C pay_for_damage call replaces its prior gap', () => {
    const callsites = [
        ['apply.c', /pay_for_damage\("dig into", FALSE\)/u],
        ['explode.c', /pay_for_damage\(\(adtyp == AD_FIRE\)[\s\S]*?FALSE\);/u],
        ['zap.c', /pay_for_damage\("destroy", FALSE\)/u],
        ['zap.c', /pay_for_damage\(damgtype == ZT_FIRE[\s\S]*?FALSE\);/u],
        ['dig.c', /pay_for_damage\(dmgtxt, FALSE\)/u],
        ['dig.c', /pay_for_damage\(shopdoor \? "destroy" : "dig into", FALSE\)/u],
        ['hack.c', /pay_for_damage\(dmgtxt, FALSE\)/u],
        ['dokick.c', /add_damage\(x, y, SHOP_DOOR_COST\);\s*pay_for_damage\(["]break["], FALSE\);/u],
    ];
    for (const [file, pattern] of callsites)
        assert.match(cSource[file], pattern, `${file} retains the source call`);

    for (const file of ['apply.js', 'explode.js', 'zap.js', 'dig.js', 'hack.js', 'dokick.js'])
        assert.doesNotMatch(jsSource[file], /note_unported\('shk\.c pay_for_damage'\)/u,
            `${file} no longer skips the implemented helper`);
});
