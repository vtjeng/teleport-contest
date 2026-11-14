import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { OBJ_CONTAINED, OBJ_FLOOR, OBJ_MINVENT, W_WEP } from '../js/const.js';
import { newObject } from '../js/obj.js';
import { restmonchn, restobjchn } from '../js/restore.js';
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
        /vfsWriteFile\(savefile, serializeSnapshot\(snapshot\)\)/u);
    assert.match(jsSave, /timers: maybe_write_timer\(RANGE_GLOBAL, state\)/u);
    assert.match(jsSave, /lights: light_sources_in_range\(RANGE_GLOBAL, state\)/u);
    assert.match(jsRestore, /const snapshot = parseSnapshot\(raw\)/u);
    assert.ok(jsRestore.indexOf('restore_timers(snapshot.timers ?? [], state)')
        < jsRestore.indexOf('state.invent = restobjchn(snapshot.invent, state)'));
    assert.ok(jsRestore.indexOf('restore_light_sources(snapshot.lights, state)')
        < jsRestore.indexOf('state.invent = restobjchn(snapshot.invent, state)'));
});

// C ref: restore.c restmonchn() (376-465) and restobjchn() (231-304). The
// JSON round trip keeps struct obj's backing fields but drops the
// non-enumerable accessors newObject() installs, so before the chain walk a
// restored object reads ocarry, ocontainer and the bit-field aliases as
// undefined. The walk is what C's newobj()-then-read sequence gives for free.
test('restmonchn restores object accessors and C back pointers on a saved chain', () => {
    // Catalog entry 0 stands for mons[mnum]; the monster's saved `data` is a
    // detached copy that restore.c:415-416 replaces with the catalog pointer.
    const mons = [{ mlet: 'h' }];
    // apport 0 exercises restmon()'s floor (restore.c:357-360), which prevents
    // rn2(0) in dog_invent().
    const monster = {
        m_id: 5, mnum: 0, data: { mlet: 'h' }, minvent: null, mw: null, nmon: null,
        mextra: { edog: { apport: 0 } },
    };
    // A wielded dagger with bypass set (restobjchn clears it, restore.c:280-281)
    // and a sack holding a gem, as a monster's saved inventory would hold them.
    const dagger = newObject({ o_id: 1, where: OBJ_MINVENT, owornmask: W_WEP, bypass: true });
    dagger.opoisoned = true; // writes the shared otrapped backing field
    const sack = newObject({ o_id: 2, where: OBJ_MINVENT });
    const gem = newObject({ o_id: 3, where: OBJ_CONTAINED });
    dagger.nobj = sack;
    dagger.ocarry = monster;
    sack.ocarry = monster;
    sack.cobj = gem;
    gem.ocontainer = sack;
    monster.minvent = dagger;
    monster.mw = dagger;

    const state = parseSnapshot(serializeSnapshot({ monlist: monster }));
    state.mons = mons;
    const restoredMonster = state.monlist;
    const restoredDagger = restoredMonster.minvent;
    const restoredSack = restoredDagger.nobj;
    assert.equal(restoredDagger.v, restoredMonster, 'the backing field survives the round trip');
    assert.equal(restoredDagger.ocarry, undefined, 'the accessor does not');
    assert.equal(restoredSack.cobj.ocontainer, undefined);
    assert.equal(restoredDagger.opoisoned, undefined);

    assert.equal(restmonchn(restoredMonster, state), restoredMonster);

    assert.equal(restoredDagger.ocarry, restoredMonster);
    assert.equal(restoredSack.ocarry, restoredMonster);
    assert.equal(restoredSack.cobj.ocontainer, restoredSack);
    assert.equal(restoredDagger.opoisoned, true);
    assert.equal(restoredDagger.bypass, false);
    assert.equal(restoredMonster.mw, restoredDagger, 'mw is re-derived from W_WEP');
    assert.equal(restoredMonster.data, mons[0]);
    assert.equal(restoredMonster.mextra.edog.apport, 1);
});

test('restobjchn restores nexthere so a saved floor pile stays walkable', () => {
    // Two objects on one square: the pile links through nexthere (the `v`
    // union) and the level chain through nobj.
    const top = newObject({ o_id: 1, where: OBJ_FLOOR });
    const under = newObject({ o_id: 2, where: OBJ_FLOOR });
    top.nexthere = under;
    top.nobj = under;

    const level = parseSnapshot(serializeSnapshot({ objlist: top }));
    assert.equal(level.objlist.nexthere, undefined);

    restobjchn(level.objlist, {});
    assert.equal(level.objlist.nexthere, level.objlist.nobj);
    assert.equal(level.objlist.nobj.nexthere, null);
});

test('savefruitchn writes non-negative fruits in order and loadfruitchn reverses them', async () => {
    const { loadfruitchn } = await import('../js/restore.js');
    const { savefruitchn } = await import('../js/save.js');
    // A chain as fruitadd() builds it, newest first: fid 3 'cloudberry',
    // fid -2 'kumquat' (negated by bones.c savebones() because no object on
    // the level names it) and fid 1 'slime mold'. The fids and names are
    // arbitrary; only their signs and order matter.
    const slime = { fname: 'slime mold', fid: 1, nextf: null };
    const kumquat = { fname: 'kumquat', fid: -2, nextf: slime };
    const cloudberry = { fname: 'cloudberry', fid: 3, nextf: kumquat };
    const saved = savefruitchn({ gf: { ffruit: cloudberry } });
    // save.c savefruitchn(): `if (f1->fid >= 0 ...) Sfo_fruit(...)` in chain
    // order, so the negated kumquat is left out.
    assert.deepEqual(saved, [
        { fname: 'cloudberry', fid: 3 },
        { fname: 'slime mold', fid: 1 },
    ]);
    // restore.c loadfruitchn(): `fnext->nextf = flist; flist = fnext;` for
    // each fruit read, so the last one written heads the chain.
    const restored = loadfruitchn(saved);
    assert.deepEqual(
        [restored.fname, restored.fid, restored.nextf.fname, restored.nextf.fid],
        ['slime mold', 1, 'cloudberry', 3],
    );
    assert.equal(restored.nextf.nextf, null);
    // An empty chain (save.c writes only the zero terminator) loads as Null.
    assert.equal(loadfruitchn([]), null);
});
