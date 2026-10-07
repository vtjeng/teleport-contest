// artifact.c:set_artifact_intrinsic and display.c:see_monsters source contracts.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {ARTILIST_TEMPLATE, ART_STING, ART_ORCRIST, ART_GRIMTOOTH,
    ART_ORB_OF_DETECTION, ART_MAGIC_MIRROR_OF_MERLIN, ART_EYES_OF_THE_OVERWORLD,
    ART_GRAYSWANDIR, ART_ORB_OF_FATE, init_artifacts, set_artifact_intrinsic, spec_m2}
    from '../js/artifacts.js';
import {see_monsters} from '../js/display.js';
import {LAST_PROP, W_ART, W_WEP, W_TOOL, ANTIMAGIC, TELEPAT, HALF_SPDAM,
    WARN_OF_MON, WARNING, HALLUC, HALLUC_RES, MON_STILL_ARRIVING}
    from '../js/const.js';
import {M2_ORC, M2_ELF, PM_ORC, MONSTER_TEMPLATES} from '../js/monsters.js';
import {roles, races, aligns} from '../js/roles.js';
import {setwornEnv} from '../js/do_wear.js';
import {setworn} from '../js/worn.js';
import {ELVEN_DAGGER, LONG_SWORD, objects_globals_init} from '../js/objects.js';

function subject() {
    const state = { artilist: ARTILIST_TEMPLATE, flags: {}, iflags: {}, disp: {},
        context: {warntype: {obj: 0}}, warn_obj_cnt: 0,
        u: {ux: 2, uy: 3, uprops: Array.from({length: LAST_PROP + 1},
            () => ({intrinsic: 0, extrinsic: 0, blocked: 0}))},
        level: {monlist: null}, invent: null };
    state.flags.initalign = aligns.findIndex(a => a.name === 'neutral');
    state.urole = {...roles.find(r => r.filecode === 'Val')};
    state.urace = {...races.find(r => r.noun === 'human')};
    init_artifacts(state);
    objects_globals_init(state);
    return state;
}

// artilist.h gives Sting/Orcrist M2_ORC and Grimtooth M2_ELF with DFLAG2.
test('spec_m2 pins warning masks to source artifact rows', () => {
    const state = subject();
    assert.equal(spec_m2({oartifact: ART_STING}, state), M2_ORC);
    assert.equal(spec_m2({oartifact: ART_ORCRIST}, state), M2_ORC);
    assert.equal(spec_m2({oartifact: ART_GRIMTOOTH}, state), M2_ELF);
});

test('artifact ESP writes defense and telepathy before repaint, HSPDAM after', async () => {
    const state = subject();
    const during = [];
    await set_artifact_intrinsic({oartifact: ART_ORB_OF_DETECTION}, true,
        W_ART, state, {redraw: () => during.push([
            state.u.uprops[ANTIMAGIC].extrinsic,
            state.u.uprops[TELEPAT].extrinsic,
            state.u.uprops[HALF_SPDAM].extrinsic])});
    assert.deepEqual(during, [[W_ART, W_ART, 0]]); // Source ESP precedes HSPDAM.
    assert.equal(state.u.uprops[HALF_SPDAM].extrinsic, W_ART);
    assert.equal(state.u.unblind_telepat_range, 64); // worn.c BOLT_LIM squared.
});

test('carry removal preserves another artifact sharing defense and ESP', async () => {
    const state = subject();
    const orb = {oartifact: ART_ORB_OF_DETECTION};
    const mirror = {oartifact: ART_MAGIC_MIRROR_OF_MERLIN, nobj: null};
    state.invent = mirror; // freeinv has already extracted orb in C.
    await set_artifact_intrinsic(orb, true, W_ART, state);
    await set_artifact_intrinsic(orb, false, W_ART, state);
    assert.equal(state.u.uprops[ANTIMAGIC].extrinsic, W_ART);
    assert.equal(state.u.uprops[TELEPAT].extrinsic, W_ART);
    assert.equal(state.u.uprops[HALF_SPDAM].extrinsic, 0);
});

test('generic warning artifact does not repaint a species warning', async () => {
    const state = subject();
    let painted = false;
    await set_artifact_intrinsic({oartifact: ART_ORB_OF_FATE}, true, W_ART,
        state, {redraw: () => { painted = true; }});
    assert.equal(state.u.uprops[WARNING].extrinsic, W_ART);
    assert.equal(state.u.uprops[WARN_OF_MON].extrinsic, 0);
    assert.equal(painted, false); // C see_monsters is only in spec_m2 arm.
});

test('xray state is canonical and requests full vision recalculation', async () => {
    const state = subject();
    const eyes = {oartifact: ART_EYES_OF_THE_OVERWORLD};
    await set_artifact_intrinsic(eyes, true, W_TOOL, state);
    assert.equal(state.u.xray_range, 3); // artifact.c fixed active radius.
    assert.equal(state.vision_full_recalc, 1);
    await set_artifact_intrinsic(eyes, false, W_TOOL, state);
    assert.equal(state.u.xray_range, -1); // C inactive sentinel.
});

test('restoration suppresses HALRES feedback while preserving its timer', async () => {
    const state = subject();
    state.program_state = {restoring: true};
    state.u.uprops[HALLUC].intrinsic = 7; // Active timeout tests mask-only path.
    const said = [];
    await set_artifact_intrinsic({oartifact: ART_GRAYSWANDIR}, true, W_WEP,
        state, {planning: true, message: async text => said.push(text)});
    assert.equal(state.u.uprops[HALLUC_RES].extrinsic, W_WEP);
    assert.equal(state.u.uprops[HALLUC].intrinsic, 7);
    assert.deepEqual(said, []);
});

function orc(next = null) {
    return {mhp: 10, mx: 4, my: 3, data: MONSTER_TEMPLATES[PM_ORC], nmon: next};
}

test('warning glow suspends the count and hero repaint tail', async () => {
    const state = subject();
    state.u.uprops[WARN_OF_MON].extrinsic = W_WEP;
    state.context.warntype.obj = M2_ORC;
    state.uwep = {oartifact: ART_STING, otyp: ELVEN_DAGGER, quan: 1};
    state.level.monlist = orc();
    const events = [];
    let release, entered;
    const messageEntered = new Promise(resolve => { entered = resolve; });
    const pending = see_monsters(state, {
        redraw: (x,y) => events.push([x,y]),
        message: async text => {
            events.push(text);
            entered();
            await new Promise(resolve => { release = resolve; });
        },
    });
    await messageEntered;
    assert.equal(state.warn_obj_cnt, 0); // C assigns only after Sting_effects.
    assert.deepEqual(events, [[4,3], 'Sting flickers light blue!']);
    release(); await pending;
    assert.equal(state.warn_obj_cnt, 1);
    assert.deepEqual(events.at(-1), [2,3]); // Hero repaint follows count write.
});

test('see_monsters defers all work and otherwise skips dead and arriving', async () => {
    const state = subject();
    state.u.usteed = {meverseen: 0};
    state.u.ustuck = {meverseen: 0};
    state.level.monlist = orc(orc(orc()));
    state.level.monlist.mhp = 0; // DEADMONSTER.
    state.level.monlist.nmon.mstate = MON_STILL_ARRIVING;
    state.gd = {defer_see_monsters: true};
    const painted = [];
    await see_monsters(state, {redraw: (x,y) => painted.push([x,y])});
    assert.equal(state.u.usteed.meverseen, 0);
    assert.deepEqual(painted, []);
    state.gd.defer_see_monsters = false;
    await see_monsters(state, {redraw: (x,y) => painted.push([x,y])});
    assert.equal(state.u.usteed.meverseen, 1);
    assert.equal(state.u.ustuck.meverseen, 1);
    assert.deepEqual(painted, [[4,3]]); // Mounted hero is repainted by mon loop.
});

test('setworn finishes old warning effects before installing a new weapon', async () => {
    const state = subject();
    const sting = {oartifact: ART_STING, otyp: ELVEN_DAGGER,
        oclass: state.objects[ELVEN_DAGGER].oc_class, owornmask: W_WEP};
    state.uwep = sting;
    state.u.uprops[WARN_OF_MON].extrinsic = W_WEP;
    state.context.warntype.obj = M2_ORC;
    state.warn_obj_cnt = 1; // Removal generates stop-glowing feedback.
    const sword = {otyp: LONG_SWORD, oclass: state.objects[LONG_SWORD].oc_class,
        owornmask: 0};
    let release;
    const pending = setworn(sword, W_WEP, setwornEnv(state, {
        redraw: () => {}, message: async () => {
            await new Promise(resolve => { release = resolve; });
        },
    }));
    assert.equal(state.uwep, sting);
    assert.equal(sword.owornmask, 0);
    release(); await pending;
    assert.equal(state.uwep, sword);
    assert.equal(state.warn_obj_cnt, 0);
});

test('synchronous slot families cannot suspend on current artifact types', () => {
    // artilist.h has no shields, shirts, coins, balls, chains or stackable
    // artifacts. Startup u_init.c ini_inv calls mksobj with mk_artif FALSE.
    const source = fs.readFileSync('nethack-c/upstream/src/u_init.c','utf8');
    assert.match(source, /mksobj\(otyp, TRUE, FALSE\)/u);
    const excluded = new Set(['SMALL_SHIELD','HAWAIIAN_SHIRT','GOLD_PIECE',
        'HEAVY_IRON_BALL','IRON_CHAIN']);
    const rows = fs.readFileSync('nethack-c/upstream/include/artilist.h','utf8');
    for (const type of excluded) assert.doesNotMatch(rows,
        new RegExp(`A\\("[^"\\n]*", ${type},`, 'u'));
});

// Planner clones preserve warning counts while omitting terminal feedback.
test('planning warning refresh completes its source tail without a message seam', async () => {
    const state = subject();
    state.uwep = {oartifact: ART_STING, otyp: ELVEN_DAGGER, quan: 1};
    state.u.uprops[WARN_OF_MON].extrinsic = W_WEP;
    state.context.warntype.obj = M2_ORC;
    state.level.monlist = orc(); // One source-qualified warning monster.
    const painted = [];
    await see_monsters(state, {planning: true,
        redraw: (x,y) => painted.push([x,y])});
    assert.equal(state.warn_obj_cnt, 1);
    assert.deepEqual(painted, [[4,3], [2,3]]); // Monster, then hero.
});
