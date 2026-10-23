import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {A_LAWFUL, A_NEUTRAL} from '../js/const.js';
import {mongets} from '../js/makemon_create.js';
import {newMonster} from '../js/monst.js';
import {monst_globals_init, PM_ANGEL, PM_HUMAN, PM_ORCUS} from '../js/monsters.js';
import {objects_globals_init, LONG_SWORD, POT_BLINDNESS} from '../js/objects.js';
import {rawMonsterGenerationState} from './monster-test-state.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';

function inventoryCase(species, alignment, otyp, weapon = false) {
    const state = {...rawMonsterGenerationState(), context: {ident: 2}, moves: 0};
    monst_globals_init(state);
    objects_globals_init(state);
    const monster = newMonster({data: state.mons[species], mnum: species,
        isminion: species === PM_ANGEL, mextra: {emin: {min_align: alignment}}});
    // Use the actual mksobj initialization to create a cursed potion or a
    // negatively enchanted sword, then pass it through real minvent insertion.
    const random = {rn2: bound => weapon && bound === 11 ? 1 : 0,
        rnd: () => 1, rn1: (_bound, base) => base, rne: () => 2};
    return {monster, obj: mongets(monster, otyp, {state, random})};
}

for (const [name, species, alignment, uncursed] of [
    ['lawful Angel', PM_ANGEL, A_LAWFUL, true],
    ['neutral Angel with lawful species', PM_ANGEL, A_NEUTRAL, false],
    ['ordinary human', PM_HUMAN, A_LAWFUL, false],
]) {
    test('mongets potion quality for ' + name, () => {
        const {monster, obj} = inventoryCase(species, alignment, POT_BLINDNESS);
        assert.equal(obj.cursed, !uncursed);
        assert.equal(Boolean(obj.oerodeproof), uncursed);
        assert.equal(monster.minvent, obj);
    });
}
test('lawful minion sword is nonnegative and proofed before insertion', () => {
    const {obj} = inventoryCase(PM_ANGEL, A_LAWFUL, LONG_SWORD, true);
    assert.equal(obj.spe, 0);
    assert.equal(obj.cursed, false);
    assert.equal(obj.oerodeproof, true);
    assert.equal(obj.oeroded, 0);
    assert.equal(obj.oeroded2, 0);
});
test('ordinary monster keeps generated negative sword quality', () => {
    const {obj} = inventoryCase(PM_HUMAN, A_LAWFUL, LONG_SWORD, true);
    assert.equal(obj.spe, -2);
    assert.equal(obj.cursed, true);
    assert.equal(obj.oerodeproof, false);
});
test('demon prince receives the independent source weapon-quality floor', () => {
    const {obj} = inventoryCase(PM_ORCUS, A_LAWFUL, LONG_SWORD, true);
    assert.equal(obj.spe, 1);
    assert.equal(obj.cursed, true);
});
for (const name of ['lawful', 'monochrome', 'before-control']) {
    test('lawful minion inventory matches independent public C ' + name, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/makemon.c/lawful-minion-inventory-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {removeScoringWorkspace(root);}
    });
}
