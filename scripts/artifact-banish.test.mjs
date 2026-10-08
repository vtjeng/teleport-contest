import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { invoke_banish } from '../js/artifacts.js';
import { ECMD_TIME, MS_NEMESIS } from '../js/const.js';
import { PM_IMP, PM_KITTEN, PM_ASMODEUS, PM_JUIBLEX } from '../js/monsters.js';
import { initRng, enableRngLog, getRngLog } from '../js/rng.js';

// artifact.c:invoke_banish saves fmon's next pointer before a migration can
// unlink it, initializes the consumed destination outside the loop, and uses
// the canonical Quest status. Pin those C contracts before exercising play.
test('invoke_banish preserves canonical chain, destination and Quest source order', () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/artifact.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/artifacts.js', import.meta.url), 'utf8');
    const source = c.slice(c.indexOf('invoke_banish(struct obj *obj UNUSED)'), c.indexOf('invoke_fling_poison(struct obj *obj)'));
    const port = js.slice(js.indexOf('async function invoke_banish'), js.indexOf('// C ref: artifact.c invoke_fling_poison'));
    assert.match(source, /find_hell\(&dest\);[\s\S]*for \(mtmp = fmon; mtmp; mtmp = mtmp2\)/u);
    assert.match(source, /mtmp2 = mtmp->nmon;[\s\S]*migrate_mon\(mtmp, ledger_no\(&dest\), MIGR_RANDOM\)/u);
    assert.match(port, /state\.level\.monlist/u);
    assert.match(port, /next = mtmp\.nmon/u);
    assert.match(port, /mtmp = next/u);
    assert.ok(port.indexOf('find_hell(dest, state)') < port.indexOf('for ('));
    assert.match(port, /state\.svq\?\.quest_status\?\.killed_nemesis/u);
    assert.match(port, /await u_teleport_mon\(mtmp, false, \{ state \}\)/u);
    assert.equal(port.includes("note_unported('dungeon.c find_hell')"), false);
    assert.equal(port.includes("note_unported('teleport.c u_teleport_mon')"), false);
});

// Construct canonical game state through the independent wizard setup;
// only species/gate values are varied to pin artifact.c's rare conditions.
const RECIPE = JSON.parse(readFileSync(new URL(
    '../recipes/artifact.c/invoke-banish-imp.session.json', import.meta.url), 'utf8'));
async function targetFixture() {
    const segment = RECIPE.segments[0];
    // Stop after the source wizard monster setup, before the command prompt.
    await runSegment({ ...segment, moves: segment.moves.slice(0, segment.moves.indexOf('#invoke')) });
    let target = game.level.monlist;
    while (target && target.data !== game.mons[PM_IMP]) target = target.nmon;
    assert.ok(target, 'the independent setup has a live imp');
    return target;
}

test('banishment filters dead, off-map, non-demon, unseen and nemesis targets', async () => {
    const original = await targetFixture();
    // Positive sleep, tame and peaceful values make an unexpected reset visible.
    // Tameness10 is an ordinary pet value; sleep/peaceful1 are C boolean flags.
    const target = overrides => ({ ...original, nmon: null,
        msleeping: 1, mtame: 10, mpeaceful: 1, ...overrides });
    // DEADMONSTER is hp<1; isok rejects x0; COULD_SEE at (1,0) is clear
    // in this generated room. A kitten is neither a demon nor S_IMP.
    assert.equal(game.viz_array[0][1], 0);
    const monsters = [target({ mhp: 0 }), target({ mx: 0 }),
        target({ data: game.mons[PM_KITTEN] }), target({ mx: 1, my: 0 }),
        target({ data: { ...game.mons[PM_IMP], msound: MS_NEMESIS } })];
    monsters.forEach((monster, i) => { monster.nmon = monsters[i + 1] ?? null; });
    game.level.monlist = monsters[0];
    const migrating = game.gm.migrating_mons;
    enableRngLog();
    assert.equal(await invoke_banish(null, game), ECMD_TIME);
    assert.deepEqual(getRngLog(), [], 'all five gates precede chance and destination draws');
    assert.equal(game.gm.migrating_mons, migrating);
    for (const monster of monsters) {
        assert.equal(monster.msleeping, 1);
        assert.equal(monster.mtame, 10);
        assert.equal(monster.mpeaceful, 1);
    }
});

test('lord, prince and active Quest chance use canonical status and awaken stayed targets', async () => {
    for (const [species, quest, killed, seed, draw] of [
        // C adds one for a lord and two for a prince. These seeded first
        // draws are nonzero, so no migration obscures the chance assertion.
        [PM_JUIBLEX, false, false, 1, 'rn2(2)=1'],
        [PM_ASMODEUS, false, false, 2, 'rn2(3)=1'],
        // Quest adds ten only until its nemesis is killed. Seed1 gives a
        // nonzero draw both at 11 (imp) and 13 (prince plus Quest).
        [PM_IMP, true, false, 1, 'rn2(11)=10'],
        [PM_ASMODEUS, true, false, 1, 'rn2(13)=9'],
        [PM_ASMODEUS, true, true, 2, 'rn2(3)=1'],
    ]) {
        const target = await targetFixture();
        target.data = game.mons[species];
        // Positive flags and ordinary tameness10 must all clear before chance.
        target.msleeping = 1;
        target.mtame = 10;
        target.mpeaceful = 1;
        // Dungeon -1 cannot match the current nonnegative dungeon number.
        game.quest_dnum = quest ? game.u.uz.dnum : -1;
        game.svq.quest_status.killed_nemesis = killed;
        // A contradictory obsolete field must not control the C value.
        game.quest_status = { killed_nemesis: !killed };
        initRng(seed);
        enableRngLog();
        assert.equal(await invoke_banish(null, game), ECMD_TIME);
        assert.deepEqual(getRngLog(), [draw]);
        assert.equal(target.msleeping, 0);
        assert.equal(target.mtame, 0);
        assert.equal(target.mpeaceful, 0);
        assert.ok(target.mx > 0, 'a failed chance leaves the target on the level');
        delete game.quest_status;
    }
});

test('a leashed target retains the named discarded migration gap', async () => {
    const target = await targetFixture();
    target.mleashed = true;
    const before = { x: target.mx, y: target.my, migrating: game.gm.migrating_mons };
    // A plain imp has chance1, so C skips the chance draw, chooses a
    // destination, then calls the unavailable leashed migration branch.
    enableRngLog();
    // A space acknowledges a possible disappearance message page.
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    assert.equal(await invoke_banish(null, game), ECMD_TIME);
    assert.equal(getRngLog().length, 1);
    // This independent map has23 Gehennom levels; only its destination is drawn.
    assert.match(getRngLog()[0], /^rn2\(23\)=/u);
    assert.ok(game.unported.has('dog.c migrate_to_level leashed monster migration'));
    assert.equal(target.mx, before.x);
    assert.equal(target.my, before.y);
    assert.equal(game.gm.migrating_mons, before.migrating);
    assert.equal(target.mleashed, true, 'the gap does not fabricate leash removal');
});
