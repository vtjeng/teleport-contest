import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { OBJ_CONTAINED, OBJ_INVENT, ER_DAMAGED } from '../js/const.js';
import { newObject, weight } from '../js/obj.js';
import { init_objects } from '../js/o_init.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { SACK, SPE_BLANK_PAPER, SPE_NOVEL, SPBOOK_CLASS } from '../js/objects.js';
import { water_damage } from '../js/trap_water_damage.js';
import { blank_novel } from '../js/zap.js';

function fixture() {
    const state = { u: { uprops: [] }, flags: {}, context: {}, objects: [] };
    init_objects(state, () => 0); // Deterministic catalog; blanking itself makes no draw.
    const obj = newObject({
        otyp: SPE_BLANK_PAPER, oclass: SPBOOK_CLASS, quan: 1, where: OBJ_INVENT,
        corpsenm: 7, // A nonzero title index proves the canonical novelidx alias resets.
        oextra: { oname: 'A former title', omid: 23 }, // Unrelated oextra survives free_oname.
        owt: 0, // A stale weight must be recalculated after the caller changes type.
    });
    return { state, obj };
}

test('blank_novel resets the shared novel index and title before recalculating weight', () => {
    const { state, obj } = fixture();
    blank_novel(obj, { state });
    assert.equal(obj.novelidx, 0); // zap.c:1371.
    assert.equal(obj.corpsenm, 0); // obj.h novelidx aliases corpsenm.
    assert.equal(obj.oextra.oname, undefined); // do_name.c:free_oname.
    assert.equal(obj.oextra.omid, 23); // The unrelated extra field remains allocated.
    assert.equal(obj.owt, state.objects[SPE_BLANK_PAPER].oc_weight);
});

test('blank_novel updates each enclosing container without replacing the object', () => {
    const { state, obj } = fixture();
    const inner = newObject({ otyp: SACK, quan: 1, where: OBJ_CONTAINED, cobj: obj });
    const outer = newObject({ otyp: SACK, quan: 1, where: OBJ_INVENT, cobj: inner });
    obj.where = OBJ_CONTAINED;
    obj.ocontainer = inner;
    inner.ocontainer = outer;
    blank_novel(obj, { state });
    assert.equal(inner.cobj, obj);
    assert.equal(outer.cobj, inner);
    assert.equal(inner.owt, weight(inner, { state }));
    assert.equal(outer.owt, weight(outer, { state }));
});

test('water_damage uses the same blank_novel owner without an injected operation', async () => {
    const { state, obj } = fixture();
    obj.otyp = SPE_NOVEL;
    const events = [];
    const result = await water_damage(obj, null, true, {
        state, message: line => events.push(line), hooks: { updateInventory: () => {} },
        random: Object.fromEntries(['rn2', 'rnd', 'rn1', 'rne'].map(name =>
            [name, () => assert.fail('forced novel blanking needs no random draw')])),
    });
    assert.equal(result, ER_DAMAGED);
    assert.equal(obj.otyp, SPE_BLANK_PAPER);
    assert.equal(obj.corpsenm, 0);
    assert.equal(obj.oextra.oname, undefined);
    assert.equal(obj.owt, state.objects[SPE_BLANK_PAPER].oc_weight);
    assert.equal(events.length, 1); // trap.c prints the fade message before blank_novel.
});

test('both source callers change type before calling the canonical blank_novel', async () => {
    const zap = await readFile(new URL('../js/zap.js', import.meta.url), 'utf8');
    const water = await readFile(new URL('../js/trap_water_damage.js', import.meta.url), 'utf8');
    assert.match(zap, /obj\.otyp = SPE_BLANK_PAPER;\s*if \(otyp === SPE_NOVEL\)\s*blank_novel\(obj, alterationEnv\)/u);
    assert.match(water, /if \(oldType === objects\.SPE_NOVEL\) blank_novel\(obj, env\)/u);
    assert.doesNotMatch(water, /function blankNovel|env\.blankNovel/u);
});

for (const name of [
    'blank-novel-water-dip', 'blank-novel-named-water-dip',
    'blank-novel-self-cancellation', 'blank-novel-floor-cancellation',
]) {
    test(`${name} clears title/index and restores spellbook weight in production`, async () => {
        const recording = JSON.parse(await readFile(new URL(
            `../recordings/zap.c/${name}.session.json`, import.meta.url), 'utf8'));
        await runSegment(recording.segments[0]);
        // Neither Valkyrie starts with a spellbook; the sole blank book is the wished novel.
        const books = [];
        const floor = name === 'blank-novel-floor-cancellation';
        const head = floor ? game.level.objects[game.u.ux][game.u.uy] : game.invent;
        for (let obj = head; obj; obj = floor ? obj.nexthere : obj.nobj)
            if (obj.otyp === SPE_BLANK_PAPER) books.push(obj);
        assert.equal(books.length, 1);
        assert.equal(books[0].novelidx, 0);
        assert.equal(books[0].oextra?.oname, undefined);
        assert.equal(books[0].owt, game.objects[SPE_BLANK_PAPER].oc_weight);
    });
}
