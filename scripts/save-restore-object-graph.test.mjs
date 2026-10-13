import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseSnapshot, serializeSnapshot } from '../js/save.js';

test('save snapshot preserves aliases and cyclic object references', () => {
    const object = { o_id: 23 };
    const state = { first: object, second: object, floor: [object] };
    object.owner = state;

    const encoded = serializeSnapshot(state);
    assert.match(encoded, /__teleport_graph_reference_v1__/u);
    const restored = parseSnapshot(encoded);
    assert.equal(restored.first, restored.second);
    assert.equal(restored.first, restored.floor[0]);
    assert.equal(restored.first.owner, restored);
});

test('save snapshot omits functions while retaining repeated object identity', () => {
    const object = { o_id: 23 };
    const restored = parseSnapshot(serializeSnapshot({
        object,
        sameObject: object,
        callback() {},
    }));

    assert.equal(restored.object, restored.sameObject);
    assert.equal('callback' in restored, false);
});

test('save and restore preserve C floor chains and global timers/lights', () => {
    const cSave = readFileSync(
        new URL('../nethack-c/upstream/src/save.c', import.meta.url), 'utf8',
    );
    const cRestore = readFileSync(
        new URL('../nethack-c/upstream/src/restore.c', import.meta.url), 'utf8',
    );
    const jsSave = readFileSync(new URL('../js/save.js', import.meta.url), 'utf8');
    const jsRestore = readFileSync(new URL('../js/restore.js', import.meta.url), 'utf8');

    const globalSave = cSave.slice(
        cSave.indexOf('savegamestate(NHFILE *nhfp)'),
        cSave.indexOf('\n/* potentially called from goto_level', cSave.indexOf('savegamestate(NHFILE *nhfp)')),
    );
    assert.ok(globalSave.indexOf('save_timers(nhfp, RANGE_GLOBAL)')
        < globalSave.indexOf('save_light_sources(nhfp, RANGE_GLOBAL)'));
    assert.ok(globalSave.indexOf('save_light_sources(nhfp, RANGE_GLOBAL)')
        < globalSave.indexOf('saveobjchn(nhfp, &gi.invent)'));

    const levelSave = cSave.slice(
        cSave.indexOf('savelev_core(NHFILE *nhfp, xint8 lev)'),
        cSave.indexOf('\nvoid\nsave_adjust_levelflags', cSave.indexOf('savelev_core(NHFILE *nhfp, xint8 lev)')),
    );
    assert.ok(levelSave.indexOf('saveobjchn(nhfp, &fobj)') >= 0);

    const globalRestore = cRestore.slice(
        cRestore.indexOf('restgamestate(NHFILE *nhfp)'),
        cRestore.indexOf('\nstaticfn boolean\ndorecover', cRestore.indexOf('restgamestate(NHFILE *nhfp)')),
    );
    assert.ok(globalRestore.indexOf('restore_timers(nhfp, RANGE_GLOBAL, 0L)')
        < globalRestore.indexOf('restore_light_sources(nhfp)'));
    assert.ok(globalRestore.indexOf('restore_light_sources(nhfp)')
        < globalRestore.indexOf('restobjchn(nhfp, FALSE)'));

    assert.match(jsSave,
        /vfsWriteFile\(SAVE_FILE_PATH, serializeSnapshot\(snapshot\)\)/u);
    assert.match(jsSave, /timer_base: state\.gt\?\.timer_base/u);
    assert.match(jsSave, /light_base: state\.gl\?\.light_base/u);
    assert.match(jsRestore, /const snapshot = parseSnapshot\(raw\)/u);
    assert.ok(jsRestore.indexOf('state.gt.timer_base = snapshot.timer_base')
        < jsRestore.indexOf('state.invent = snapshot.invent'));
    assert.ok(jsRestore.indexOf('state.gl.light_base = snapshot.light_base')
        < jsRestore.indexOf('state.invent = snapshot.invent'));
});
