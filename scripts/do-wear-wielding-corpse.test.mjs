import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { wielding_corpse } from '../js/do_wear.js';
import { instapetrify } from '../js/trap.js';
import { HeroDeathPlanningError } from '../js/hack.js';
import { nh_timeout_requires_live_state } from '../js/timeout.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { InMemoryStorage } from '../js/storage.js';
import { CXN_ARTICLE, KILLED_BY, LAST_PROP, STONING, STONE_RES } from '../js/const.js';
import {
    CORPSE, LEATHER_GLOVES, GAUNTLETS_OF_DEXTERITY,
    YELLOW_DRAGON_SCALES, objects_globals_init,
} from '../js/objects.js';
import { init_objects } from '../js/o_init.js';
import { PM_COCKATRICE, PM_LICHEN, PM_STONE_GOLEM, PM_WIZARD, monst_globals_init } from '../js/monsters.js';

const C_WEAR = readFileSync(new URL('../nethack-c/upstream/src/do_wear.c', import.meta.url), 'utf8');
const C_TRAP = readFileSync(new URL('../nethack-c/upstream/src/trap.c', import.meta.url), 'utf8');
const JS_WEAR = readFileSync(new URL('../js/do_wear.js', import.meta.url), 'utf8');

function fixture() {
    const state = {
        u: { uprops: Array.from({ length: LAST_PROP + 1 },
            () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 })), twoweap: false },
        flags: {}, iflags: {}, svm: {},
    };
    monst_globals_init(state);
    objects_globals_init(state);
    // Deterministic appearance initialization; naming still uses the C tables.
    init_objects(state, () => 0);
    state.youmonst = { data: state.mons[PM_WIZARD] };
    state.uwep = {
        otyp: CORPSE, corpsenm: PM_COCKATRICE, quan: 1,
        oextra: null, oartifact: 0, dknown: true,
    };
    const lines = [];
    const env = { planning: true, message: async line => lines.push(line),
        urgentMessage: async line => lines.push(line) };
    return { state, lines, env };
}

test('wielding_corpse preserves each source early return', async () => {
    assert.match(C_WEAR, /if \(!obj \|\| obj->otyp != CORPSE \|\| uarmg\)/u);
    assert.match(C_WEAR, /obj != uwep && \(obj != uswapwep \|\| !u\.twoweap\)/u);
    for (const guard of ['null', 'not-corpse', 'gloves', 'not-wielded',
        'inactive-alternate', 'safe-species', 'resistant']) {
        const { state, lines, env } = fixture();
        let obj = state.uwep;
        if (guard === 'null') obj = null;
        if (guard === 'not-corpse') obj.otyp = LEATHER_GLOVES;
        if (guard === 'gloves') state.uarmg = { otyp: LEATHER_GLOVES };
        if (guard === 'not-wielded') state.uwep = null;
        if (guard === 'inactive-alternate') {
            state.uswapwep = obj;
            state.uwep = null;
        }
        if (guard === 'safe-species') obj.corpsenm = PM_LICHEN;
        // A nonzero extrinsic supplies the resistance tested by C.
        if (guard === 'resistant') state.u.uprops[STONE_RES].extrinsic = 1;
        await wielding_corpse(obj, null, false, state, env);
        assert.deepEqual(lines, [], guard);
        assert.equal(state.killer, undefined, guard);
    }
});

test('protection-loss messages and killer naming follow the whole C helper', async () => {
    assert.ok(CXN_ARTICLE, 'source corpse_xname uses CXN_ARTICLE');
    assert.match(C_WEAR, /voluntary \? "removing" : "losing"/u);
    assert.match(C_WEAR, /"resistance timing out"/u);
    for (const [how, voluntary, verb, cause] of [
        [{ otyp: LEATHER_GLOVES, dknown: true }, true, 'now wield', 'removing gloves'],
        [{ otyp: GAUNTLETS_OF_DEXTERITY, dknown: true }, false, 'now wield', 'losing gauntlets'],
        [{ otyp: YELLOW_DRAGON_SCALES, quan: 1, dknown: true }, true,
            'are wielding', 'removing yellow dragon scales'],
        [null, false, 'are wielding', 'resistance timing out'],
    ]) {
        const { state, lines, env } = fixture();
        // Known type names exercise gloves_simple_name/simpleonames rather
        // than the randomly assigned undiscovered armor descriptions.
        if (how) {
            state.objects[how.otyp].oc_name_known = true;
            how.oclass = state.objects[how.otyp].oc_class;
            how.quan = 1; // A single protective armor object, as at the C caller.
        }
        await assert.rejects(wielding_corpse(state.uwep, how, voluntary, state, env), error => {
            assert.ok(error instanceof HeroDeathPlanningError, error.stack);
            assert.equal(error.how, STONING);
            assert.equal(error.killerFormat, KILLED_BY);
            assert.equal(error.killerName, `${cause} while wielding a cockatrice corpse`);
            return true;
        });
        assert.deepEqual(lines, [`You ${verb} a cockatrice corpse in your bare hands.`,
            'You turn to stone...']);
        assert.equal(state.killer.name, `${cause} while wielding a cockatrice corpse`);
    }
});

test('supporting instapetrify honors resistance before output or killer changes', async () => {
    assert.match(C_TRAP, /if \(Stone_resistance\)\s*return;/u);
    const { state, lines, env } = fixture();
    // An intrinsic source also prevents this immediate petrification helper.
    state.u.uprops[STONE_RES].intrinsic = 1;
    await instapetrify('unused killer', state, env);
    assert.deepEqual(lines, []);
    assert.equal(state.killer, undefined);
});

test('temporary stoning resistance expiry uses the existing live timeout handoff', () => {
    const { state } = fixture();
    // C decrements one remaining turn to zero before its wielding_corpse call.
    state.u.uprops[STONE_RES].intrinsic = 1;
    assert.equal(nh_timeout_requires_live_state(state), true);
    // Earlier countdown turns cannot invoke the protection-loss callback.
    state.u.uprops[STONE_RES].intrinsic = 2;
    assert.equal(nh_timeout_requires_live_state(state), false);
});

test('Gloves_off captures voluntary state before cleanup and awaits both corpse calls', () => {
    assert.match(C_WEAR, /on_purpose = !svc\.context\.mon_moving && !uarmg->in_use/u);
    const glovesOff = JS_WEAR.slice(JS_WEAR.indexOf('export async function Gloves_off('),
        JS_WEAR.indexOf('// C ref: do_wear.c Shield_on()'));
    assert.ok(glovesOff.indexOf('const on_purpose') < glovesOff.indexOf('await setworn'));
    assert.match(glovesOff, /await wielding_corpse\(state\.uwep, gloves, on_purpose, state, env\)/u);
    assert.match(glovesOff, /await wielding_corpse\(state\.uswapwep, gloves, on_purpose, state, env\)/u);
});

test('the hypothetical active alternate corpse follows the source slot condition', async () => {
    const { state, env } = fixture();
    const corpse = state.uwep;
    state.uwep = null;
    state.uswapwep = corpse;
    // Ordinary two-weapon admission rejects corpses. This artificial state
    // pins the C guard's fallback without calling it a reachable entry point.
    state.u.twoweap = true;
    await assert.rejects(wielding_corpse(corpse, null, false, state, env),
        error => error instanceof HeroDeathPlanningError && error.how === STONING);
});

test('recorded recovery clears the corpse weapon while stone-golem recovery retains it', async () => {
    for (const name of ['yellow-dragon-corpse-removal',
        'temporary-stone-resistance-corpse-expiry', 'glove-removal-life-saving-variation',
        'iron-golem-corpse-protection-loss']) {
        const recording = JSON.parse(readFileSync(
            new URL(`../recordings/do_wear.c/${name}.session.json`, import.meta.url), 'utf8'));
        await runSegment({ ...recording.segments[0], storage: new InMemoryStorage() });
        if (name === 'iron-golem-corpse-protection-loss') {
            assert.equal(game.u.umonnum, PM_STONE_GOLEM);
            assert.equal(game.uwep?.otyp, CORPSE);
            assert.notEqual(game.u.uprops[STONE_RES].intrinsic, 0,
                'C skips remove_worn_item after the successful golem transition');
        } else {
            assert.equal(game.uwep, null,
                'C removes the wielded corpse after non-resistant survival');
        }
        if (name === 'glove-removal-life-saving-variation')
            assert.equal(game.uamul, null, 'done(STONING) consumed the life-saving amulet');
    }
});
