import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ART_EXCALIBUR, ART_MAGICBANE } from '../js/artifacts.js';
import { ANTIMAGIC, BLINDED, HALF_SPDAM, OBJ_INVENT, ONAME_WISH, W_SADDLE } from '../js/const.js';
import { oname } from '../js/do_name.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import { DAGGER, GOLD_PIECE, LONG_SWORD, OBJECT_TEMPLATES, SADDLE, SPBOOK_CLASS, TOOL_CLASS, WEAPON_CLASS, COIN_CLASS } from '../js/objects.js';
import { rndcurse } from '../js/sit.js';

async function setup(values) {
    // Independent Wizard startup shared with the C monster-caller recipe.
    await runSegment({ seed: 7135101, datetime: '20381104142000',
        nethackrc: 'OPTIONS=role:Wizard,race:human,gender:female,align:neutral,playmode:debug\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!debug_mongen\n', moves: '' });
    game.invent = null;
    game.uwep = null;
    game.u.usteed = null;
    game.flags.sparkle = false; // Source shieldeff has no frames with sparkle disabled.
    for (const property of [ANTIMAGIC, HALF_SPDAM, BLINDED])
        game.u.uprops[property] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    const draws = [];
    const messages = [];
    const take = (kind, bound) => {
        draws.push(`${kind}(${bound})`);
        assert.ok(values.length, `unexpected ${kind}(${bound})`);
        return values.shift();
    };
    return { draws, messages, env: { message: async text => messages.push(text),
        random: { rnd: bound => take('rnd', bound), rn2: bound => take('rn2', bound) } } };
}

test('rndcurse Magicbane gate stops before aura, inventory and saddle draws', async () => {
    // sit.c:576-578: only wielded Magicbane consumes rn2(20); a nonzero
    // result returns before even counting inventory or touching the steed.
    const { draws, messages, env } = await setup([1]);
    game.uwep = newObject({ otyp: DAGGER, oartifact: ART_MAGICBANE });
    game.u.usteed = newMonster();
    await rndcurse(game, env);
    assert.deepEqual(draws, ['rn2(20)']);
    assert.deepEqual(messages, ['You feel a malignant aura surround the magic-absorbing blade.']);
});

test('rndcurse excludes coins and preserves selection, BUC and artifact-resistance order', async () => {
    // sit.c:586-617. Three attempts choose blessed, already-cursed and
    // intelligent-artifact targets; a resistance roll7 is below threshold8.
    const { draws, messages, env } = await setup([3, 1, 2, 3, 7]);
    const plain = newObject({ otyp: DAGGER, oclass: WEAPON_CLASS, quan: 1, where: OBJ_INVENT });
    const artifact = newObject({ otyp: LONG_SWORD, oclass: WEAPON_CLASS, quan: 1, where: OBJ_INVENT, nobj: plain });
    // Canonical naming creates and registers the unique artifact before its
    // resistance message discovers it; setting only oartifact is invalid.
    oname(artifact, 'Excalibur', ONAME_WISH, { state: game });
    assert.equal(artifact.oartifact, ART_EXCALIBUR);
    const cursed = newObject({ otyp: DAGGER, oclass: WEAPON_CLASS, cursed: true, quan: 1, where: OBJ_INVENT, nobj: artifact });
    const blessed = newObject({ otyp: DAGGER, oclass: WEAPON_CLASS, blessed: true, quan: 1, where: OBJ_INVENT, nobj: cursed });
    const coins = newObject({ otyp: GOLD_PIECE, oclass: COIN_CLASS, quan: 1, where: OBJ_INVENT, nobj: blessed });
    game.invent = coins;
    await rndcurse(game, env);
    assert.deepEqual(draws, ['rnd(6)', 'rnd(4)', 'rnd(4)', 'rnd(4)', 'rn2(10)']);
    assert.equal(blessed.blessed, false);
    assert.equal(blessed.cursed, false, 'one attempt only unblesses');
    assert.equal(cursed.cursed, true);
    assert.equal(artifact.cursed, false);
    assert.equal(plain.cursed, false);
    assert.equal(coins.cursed, false);
    assert.equal(messages[0], 'You feel a malignant aura surround you.');
    assert.match(messages[1], /resists!$/u);
});

test('rndcurse draws a reduced count even with no non-gold inventory', async () => {
    const { draws, env } = await setup([2]);
    // youprop.h:57,295 use intrinsic OR extrinsic without blocked filtering.
    game.u.uprops[ANTIMAGIC] = { intrinsic: 1, extrinsic: 0, blocked: 1 };
    game.u.uprops[HALF_SPDAM] = { intrinsic: 0, extrinsic: 1, blocked: 1 };
    await rndcurse(game, env);
    assert.deepEqual(draws, ['rnd(2)']); // C6/(1+1+1), no selection draw.
});

test('rndcurse saddle tail changes BUC before visibility and knowledge', async () => {
    for (const blind of [false, true]) {
        const { draws, messages, env } = await setup([1, 0]);
        const saddle = newObject({ otyp: SADDLE, oclass: TOOL_CLASS, quan: 1, blessed: true, owornmask: W_SADDLE, bknown: true });
        game.u.usteed = newMonster({ minvent: saddle });
        if (blind) game.u.uprops[BLINDED].intrinsic = 1;
        await rndcurse(game, env);
        assert.deepEqual(draws, ['rnd(6)', 'rn2(4)']);
        assert.equal(saddle.blessed, false);
        assert.equal(saddle.cursed, false);
        assert.equal(saddle.bknown, blind ? 0 : 1);
        assert.equal(messages.length, blind ? 1 : 2);
        if (!blind) assert.match(messages[1], /glows brown\.$/u);
    }
});

test('cursed_book default caller is unreachable with current upstream spellbook levels', () => {
    // spell.c switch(rn2(lev)) handles all0..6; objects.h SPELL and the two
    // special book definitions put every level at<=7. This defensive source
    // caller is wired, but no valid reference input can execute its default.
    const source = fs.readFileSync(new URL('../nethack-c/upstream/src/spell.c', import.meta.url), 'utf8');
    const start = source.indexOf('cursed_book(struct obj *bp)');
    const body = source.slice(start, source.indexOf('confused_book(struct obj *spellbook)', start));
    assert.match(body, /switch \(rn2\(lev\)\)/u);
    for (let index = 0; index <= 6; ++index) assert.ok(body.includes(`case ${index}:`));
    assert.ok(body.includes('default:\n        rndcurse();'));
    const levels = OBJECT_TEMPLATES.filter(type => type.oc_class === SPBOOK_CLASS).map(type => type.oc_oc2);
    assert.equal(Math.max(...levels), 7);
    assert.ok(levels.every(level => level >= 0 && level <= 7));
});
