import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { can_make_bones, resetGhostlyMonsterAttitudes, savebones } from '../js/bones.js';
import { DIED, KILLED_BY_AN, NON_PM, OBJ_FLOOR } from '../js/const.js';
import { getnow } from '../js/calendar.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { bless, mksobj_at } from '../js/obj.js';
import { AMULET_OF_YENDOR, FAKE_AMULET_OF_YENDOR } from '../js/objects.js';
import { InMemoryStorage, setStorageForTesting, vfsReadFile } from '../js/storage.js';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { newMonster } from '../js/monst.js';
import { PM_DWARF, monst_globals_init, reset_mvitals } from '../js/monsters.js';
import { rawMonsterGenerationState } from './monster-test-state.mjs';

test('drop_upon_death uses the canonical burning-object predicate', async () => {
    const cSource = await readFile(
        new URL('../nethack-c/upstream/src/bones.c', import.meta.url), 'utf8',
    );
    const jsSource = await readFile(
        new URL('../js/bones.js', import.meta.url), 'utf8',
    );
    assert.match(cSource,
        /if \(\(cont \|\| artifact_light\(otmp\)\) && obj_is_burning\(otmp\)\)\s*end_burn\(otmp, TRUE\)/u);
    assert.match(jsSource,
        /if \(\(cont \|\| artifact_light\(otmp\)\) && obj_is_burning\(otmp\)\)\s*await end_burn\(otmp, true, \{ state \}\)/u);
    assert.match(jsSource, /import \{ obj_is_burning \} from '\.\/light\.js';/u);
});

test('savebones releases leashes before unpunishing the hero', async () => {
    const cSource = await readFile(
        new URL('../nethack-c/upstream/src/bones.c', import.meta.url), 'utf8',
    );
    const jsSource = await readFile(
        new URL('../js/bones.js', import.meta.url), 'utf8',
    );
    assert.match(cSource,
        /make_bones:\s*unleash_all\(\);[\s\S]*?if \(Punished\)\s*unpunish\(\)/u);
    assert.match(jsSource,
        /\/\/ make_bones:\s*unleash_all\(state\);[\s\S]*?if \(state\.uball\) unpunish\(state\);/u);
    assert.match(jsSource, /import \{ unleash_all \} from '\.\/apply\.js';/u);
    assert.doesNotMatch(jsSource, /unleash_all\(\) -- no leash logic/u);
});

test('bones restoration completes shop catch-up before mklev returns', async () => {
    const cBones = await readFile(
        new URL('../nethack-c/upstream/src/bones.c', import.meta.url), 'utf8',
    );
    const cMklev = await readFile(
        new URL('../nethack-c/upstream/src/mklev.c', import.meta.url), 'utf8',
    );
    const jsBones = await readFile(
        new URL('../js/bones.js', import.meta.url), 'utf8',
    );
    const jsMklev = await readFile(
        new URL('../js/mklev.js', import.meta.url), 'utf8',
    );
    assert.match(cBones,
        /resetobjs\(svl\.level\.buriedobjlist, TRUE\);\s*fix_shop_damage\(\);/u);
    assert.match(cMklev, /if \(getbones\(\)\)\s*return;/u);
    assert.match(jsBones,
        /resetobjs\(state\.level\?\.objlist, true, state\);[\s\S]*?resetobjs\(state\.level\?\.buriedobjlist, true, state\);\s*\/\/ C ref: bones\.c:731 repairs shop damage after restoring the bones level\.\s*await fix_shop_damage\(state\);/u);
    assert.match(jsMklev, /ok = await loadBones\(state\);/u);
});

test('drop_upon_death awaits container insertion before updating container weight', async () => {
    const cBones = await readFile(
        new URL('../nethack-c/upstream/src/bones.c', import.meta.url), 'utf8',
    );
    const jsBones = await readFile(
        new URL('../js/bones.js', import.meta.url), 'utf8',
    );
    const cStart = cBones.indexOf('\ndrop_upon_death(');
    const cEnd = cBones.indexOf('\nstaticfn boolean\nfixuporacle', cStart);
    const jsStart = jsBones.indexOf('export async function drop_upon_death(');
    const jsEnd = jsBones.indexOf('\nexport ', jsStart + 1);
    assert.ok(cStart >= 0 && cEnd > cStart, 'C drop_upon_death definition is present');
    assert.ok(jsStart >= 0 && jsEnd > jsStart, 'JavaScript drop_upon_death definition is present');
    const cFunction = cBones.slice(cStart, cEnd);
    const jsFunction = jsBones.slice(jsStart, jsEnd);
    assert.match(cFunction,
        /else if \(cont\)\s*\(void\) add_to_container\(cont, otmp\);[\s\S]*?cont->owt = weight\(cont\);/u);
    assert.match(jsFunction,
        /else if \(cont\)\s*\{\s*await add_to_container\(cont, otmp\);\s*\}[\s\S]*?if \(cont\) cont\.owt = weight\(cont/u);
});

test('ghostly restoration recomputes monster attitude for the new hero', () => {
    // restore.c:getlev() resets peacefulness after loading a bones level. A
    // dwarf that was peaceful for a lawful dead hero is hostile to this
    // neutral human, and its malign value must follow the new attitude.
    const state = {
        ...rawMonsterGenerationState(),
        level: { monlist: null },
    };
    monst_globals_init(state);
    reset_mvitals(state);
    const dwarf = newMonster({
        data: state.mons[PM_DWARF],
        mnum: PM_DWARF,
        mpeaceful: true,
    });
    state.level.monlist = dwarf;

    resetGhostlyMonsterAttitudes(state);

    assert.equal(dwarf.mpeaceful, false);
    assert.equal(dwarf.malign, Math.abs(dwarf.data.maligntyp));
});

function jsonWithBigInts(value) {
    return JSON.stringify(value, (_key, entry) => typeof entry === 'bigint'
        ? { $bigint: entry.toString() } : entry);
}

test('savebones converts a real floor Amulet to its fake cursed bones form', async () => {
    const runner = await runSegment({
        seed: 12310633,
        datetime: '20910317101200',
        nethackrc: 'OPTIONS=name:RevivalSchedule,role:Wizard,race:human,'
            + 'gender:female,align:neutral,playmode:debug\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,'
            + '!autopickup,!acoustics,!debug_mongen\n',
        moves: '',
    });
    const storage = new InMemoryStorage();
    setStorageForTesting(storage);
    try {
        assert.equal(game.wizard, true);
        assert.ok(game.u.uz && Number.isInteger(game.u.uz.dnum)
            && Number.isInteger(game.u.uz.dlevel));
        // end.done initializes svk.killer before a normal savebones call.
        // This direct production-caller fixture supplies that same default.
        game.killer = { name: '', format: KILLED_BY_AN };
        game.flags.bones = true;
        game.discover = false;
        game.u.uswallow = 0;
        game.u.usteed = null;
        game.uball = null;
        game.u.ugrave_arise = NON_PM;

        // This is the reviewed pre-save entry snapshot, not a simulation of
        // inventory removal. Preserve initialized role/race intrinsic fields.
        game.invent = null;
        for (const slot of ['uarm', 'uarmc', 'uarmh', 'uarms', 'uarmg',
            'uarmf', 'uarmu', 'uleft', 'uright', 'uwep', 'uswapwep',
            'uquiver', 'uamul', 'ublindf', 'uball', 'uchain'])
            game[slot] = null;
        game.u.twoweap = false;
        for (const property of game.u.uprops) {
            property.extrinsic = 0;
            property.blocked = 0;
        }
        game.u.moreluck = 0;
        assert.equal(game.u.uspellprot ?? 0, 0, 'no active spell protection in the entry snapshot');
        assert.equal(game.u.umonnum, game.urole.mnum, 'retain the initialized human role form');
        assert.equal(game.invent, null);

        // The reviewed snapshot has empty canonical level object/monster
        // owners. Clear their roots and grids together before object creation.
        game.level.monlist = null;
        for (const column of game.level.monsters) column.fill(null);
        game.level.objlist = null;
        for (const column of game.level.objects) column.fill(null);
        game.level.buriedobjlist = null;
        game.level.traps = [];
        assert.equal(game.level.monlist, null);
        assert.ok(can_make_bones(game), 'the actual can_make_bones guards accept this initialized level');

        const x = game.u.ux;
        const y = game.u.uy;
        const amulet = mksobj_at(AMULET_OF_YENDOR, x, y, true, false,
            objectGenerationEnv({ state: game }));
        assert.equal(amulet.where, OBJ_FLOOR);
        assert.equal(amulet.otyp, AMULET_OF_YENDOR);
        assert.equal(amulet.ox, x);
        assert.equal(amulet.oy, y);
        assert.equal(game.level.objects[x][y], amulet);
        assert.equal(game.level.objlist, amulet);
        assert.equal(amulet.nexthere, null);
        // Make the source's curse effect observable independently of the
        // Amulet type while preserving a canonical ordinary floor object.
        bless(amulet, { state: game });
        assert.equal(amulet.blessed, true);
        assert.equal(amulet.cursed, false);

        const path = `bones_D${game.u.uz.dnum}.${game.u.uz.dlevel}`;
        assert.equal(vfsReadFile(path), null, 'private VFS starts without a bones file');
        const snapshot = () => ({
            id: amulet.o_id,
            otyp: amulet.otyp,
            cursed: amulet.cursed,
            blessed: amulet.blessed,
            where: amulet.where,
            ox: amulet.ox,
            oy: amulet.oy,
            inObjlist: game.level.objlist === amulet,
            inSquare: game.level.objects[x][y] === amulet,
            rng: structuredClone(runner.getRngLog()),
            input: {
                queueLength: game.nhDisplay.inputQueueLength,
                waitEpoch: game.nhDisplay.waitEpoch,
                waiting: game.nhDisplay.isWaitingForInput,
            },
            screen: game.nhDisplay.serialize(),
        });
        const before = snapshot();
        const phase = 'before savebones';
        try {
            await savebones(DIED, getnow(game), null, game);
        } catch (error) {
            console.log(`BONES_AMULET_RECEIPT ${jsonWithBigInts({ phase,
                before, error: { name: error?.name, message: error?.message },
                after: snapshot() })}`);
            throw error;
        }
        const savedText = vfsReadFile(path);
        assert.equal(typeof savedText, 'string', 'production savebones wrote the private VFS file');
        const savedData = JSON.parse(savedText);
        const saved = savedData.floorObjects.find(object => object.o_id === amulet.o_id);
        const after = snapshot();
        console.log(`BONES_AMULET_RECEIPT ${jsonWithBigInts({ phase: 'after savebones',
            before, after, saved: saved && { o_id: saved.o_id, otyp: saved.otyp,
                cursed: saved.cursed, blessed: saved.blessed, ox: saved.ox, oy: saved.oy },
            inputExhausted: runner._inputExhausted })}`);
        assert.ok(saved, 'serialized floor list contains the same canonical object ID');
        assert.equal(saved.otyp, FAKE_AMULET_OF_YENDOR,
            'C save normalization converts the real Amulet before serialization');
        assert.equal(saved.cursed, true);
        assert.equal(saved.blessed, false);
        assert.equal(saved.ox, x);
        assert.equal(saved.oy, y);
        assert.equal(amulet.otyp, FAKE_AMULET_OF_YENDOR);
        assert.equal(amulet.cursed, true);
        assert.equal(amulet.blessed, false);
        assert.equal(amulet.where, OBJ_FLOOR);
        assert.equal(game.level.objects[x][y], amulet);
    } finally {
        setStorageForTesting(null);
    }
});
