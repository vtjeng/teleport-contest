import assert from 'node:assert/strict';
import test from 'node:test';

import {
    OBJ_CONTAINED,
    ROT_CORPSE,
    ZOMBIFY_MON,
} from '../js/const.js';
import { populateContainer } from '../js/mkobj_container.js';
import { init_objects } from '../js/o_init.js';
import { mksobj } from '../js/obj.js';
import {
    PM_HUMAN,
    PM_JACKAL,
    PM_KOBOLD,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import {
    BAG_OF_HOLDING,
    CHEST,
    GOLD_PIECE,
    ICE_BOX,
    LARGE_BOX,
    LOADSTONE,
    WAN_CANCELLATION,
    WAN_LIGHT,
    objects_globals_init,
} from '../js/objects.js';
import {
    peek_timer,
    timeout_globals_init,
} from '../js/timeout.js';

// At ordinary dungeon depth 1 and hero level 1, rndmonnum() visits these
// cumulative reservoir weights in mons[] order.
const DEPTH_ONE_RESERVOIR_BOUNDS = [3, 4, 5, 7, 8, 11, 15, 16, 21];

function call(name, args, result) {
    return { name, args, result };
}

function scriptedRandom(script) {
    const pending = [...script];
    const draw = (name, args) => {
        const expected = pending.shift();
        assert.ok(expected, `unexpected ${name}(${args.join(',')})`);
        assert.equal(name, expected.name, 'random function order');
        assert.deepEqual(args, expected.args, `${name} arguments`);
        const result = expected.result;
        if (name === 'rn2')
            assert.ok(result >= 0 && result < args[0], 'rn2 result range');
        else if (name === 'rnd')
            assert.ok(result >= 1 && result <= args[0], 'rnd result range');
        else if (name === 'rn1') {
            assert.ok(
                result >= args[1] && result < args[0] + args[1],
                'rn1 result range',
            );
        } else {
            assert.ok(result >= 1, `${name} result range`);
        }
        return result;
    };
    return {
        random: {
            rn1: (...args) => draw('rn1', args),
            rn2: (...args) => draw('rn2', args),
            rnd: (...args) => draw('rnd', args),
            rne: (...args) => draw('rne', args),
            rnz: (...args) => draw('rnz', args),
        },
        done() {
            assert.deepEqual(pending, [], 'all scripted random calls consumed');
        },
    };
}

function containerState() {
    const state = {
        astral_level: { dnum: 0, dlevel: 0 },
        branches: [],
        context: { current_fruit: 1, ident: 2, mon_moving: false },
        dungeons: [{
            depth_start: 1,
            dunlev_ureached: 1,
            entry_lev: 1,
            flags: { align: 0, hellish: false },
            num_dunlevs: 20,
        }],
        flags: {},
        gz: { zombify: false },
        in_mklev: true,
        level: { flags: { temperature: 0 } },
        moves: 2,
        program_state: { gameover: false },
        quest_dnum: 1,
        rogue_level: { dnum: 0, dlevel: 0 },
        sanctum_level: { dnum: 0, dlevel: 0 },
        specialLevels: [],
        u: {
            uhave: { amulet: 0 },
            ulevel: 1,
            uz: { dnum: 0, dlevel: 1 },
        },
        urole: { mnum: PM_HUMAN },
    };
    objects_globals_init(state);
    // Zero choices initialize and shuffle the complete catalog without
    // consuming any RNG from the behavior under test.
    init_objects(state, () => 0);
    monst_globals_init(state);
    reset_mvitals(state);
    timeout_globals_init(state);
    return state;
}

function idDraw() {
    // next_ident() advances this fixture's nonzero object id by one.
    return call('rnd', [2], 1);
}

function retainJackalDraws() {
    return DEPTH_ONE_RESERVOIR_BOUNDS.map(
        (bound) => call('rn2', [bound], bound - 1),
    );
}

function selectKoboldDraws() {
    // Keep the initial jackal, reject the fox, select the third candidate
    // (kobold), then reject every remaining candidate.
    const results = [2, 3, 0, 6, 7, 10, 14, 15, 20];
    return DEPTH_ONE_RESERVOIR_BOUNDS.map(
        (bound, index) => call('rn2', [bound], results[index]),
    );
}

function containerHooks() {
    return { populateContainer };
}

test('chest contents preserve coin and rock-replacement RNG order', () => {
    const state = containerState();
    const rng = scriptedRandom([
        idDraw(),
        call('rn2', [5], 0), // leave the chest unlocked
        call('rn2', [10], 1), // leave it untrapped, skipping tknown
        call('rn2', [6], 2), // an unlocked chest can contain zero through five items

        call('rnd', [100], 82), // boxiprobs selects the 7% coin interval
        call('rnd', [1000], 1), // the coin class contains only gold
        idDraw(),
        call('rnd', [3], 2), // depth-one coin quantity's first factor
        call('rnd', [75], 3), // its second factor makes a six-coin stack

        call('rnd', [100], 1), // boxiprobs selects the leading gem interval
        call('rnd', [1000], 1000), // the final gem weight selects ROCK
        idDraw(),
        call('rn1', [6, 6], 8), // make a rock stack large enough to trim
        call('rnd', [882], 882), // replacement range ends at LOADSTONE
    ]);

    const chest = mksobj(CHEST, true, false, {
        state,
        random: rng.random,
        hooks: containerHooks(),
    });
    const stone = chest.cobj;
    const gold = stone.nobj;

    assert.equal(chest.olocked, false);
    assert.equal(stone.otyp, LOADSTONE);
    assert.equal(stone.quan, 1);
    assert.equal(stone.cursed, false);
    assert.equal(gold.otyp, GOLD_PIECE);
    assert.equal(gold.quan, 6);
    for (const item of [stone, gold]) {
        assert.equal(item.where, OBJ_CONTAINED);
        assert.equal(item.ocontainer, chest);
    }
    assert.equal(
        chest.owt,
        state.objects[CHEST].oc_weight + stone.owt + gold.owt,
    );
    rng.done();
});

test('locked large box uses its five-item maximum before population', () => {
    const state = containerState();
    const rng = scriptedRandom([
        idDraw(),
        call('rn2', [5], 1), // nonzero locks the large box
        call('rn2', [10], 1), // keep the box untrapped
        call('rn2', [6], 1), // locked LARGE_BOX maximum five means rn2(6)
        call('rnd', [100], 82), // select a coin-class content item
        call('rnd', [1000], 1),
        idDraw(),
        call('rnd', [3], 1), // one times one leaves a single gold piece
        call('rnd', [75], 1),
    ]);

    const box = mksobj(LARGE_BOX, true, false, {
        state,
        random: rng.random,
        hooks: containerHooks(),
    });

    assert.equal(box.olocked, true);
    assert.equal(box.cobj.otyp, GOLD_PIECE);
    assert.equal(box.cobj.quan, 1);
    assert.equal(box.cobj.where, OBJ_CONTAINED);
    assert.equal(box.cobj.ocontainer, box);
    assert.equal(
        box.owt,
        state.objects[LARGE_BOX].oc_weight + box.cobj.owt,
    );
    rng.done();
});

test('bag of holding replaces cancellation wands without regenerating them', () => {
    const state = containerState();
    const rng = scriptedRandom([
        idDraw(),
        call('rn2', [2], 1), // put one item in the bag
        call('rnd', [100], 89), // boxiprobs selects the wand interval
        // Cancellation occupies cumulative wand probability 556 through 600.
        call('rnd', [1000], 556),
        idDraw(),
        call('rn1', [5, 4], 4), // cancellation starts with four charges
        call('rn2', [17], 1), // leave the wand uncursed
        // The replacement loop may choose cancellation again; its next draw
        // selects light without constructing a new wand or rerolling charges.
        call('rnd', [1000], 556),
        call('rnd', [1000], 1),
    ]);

    const bag = mksobj(BAG_OF_HOLDING, true, false, {
        state,
        random: rng.random,
        hooks: containerHooks(),
    });
    const wand = bag.cobj;

    assert.notEqual(wand.otyp, WAN_CANCELLATION);
    assert.equal(wand.otyp, WAN_LIGHT);
    // A freshly generated wand of light uses rn1(5, 11); retaining four
    // proves that mkbox_cnts() changed only otyp, as the source does.
    assert.equal(wand.spe, 4);
    assert.equal(wand.where, OBJ_CONTAINED);
    assert.equal(wand.ocontainer, bag);
    assert.equal(wand.nobj, null);
    rng.done();
});

test('ice-box corpses stop rot timers and merge as contained objects', () => {
    const state = containerState();
    const corpseDraws = () => [
        idDraw(),
        ...retainJackalDraws(),
        call('rn2', [2], 0), // choose male for a variable-sex jackal corpse
        call('rnz', [25], 25), // in-mklev rot adjustment leaves ROT_AGE unchanged
    ];
    const rng = scriptedRandom([
        idDraw(),
        call('rn2', [21], 2), // ice boxes choose zero through twenty corpses
        ...corpseDraws(),
        ...corpseDraws(),
    ]);

    const iceBox = mksobj(ICE_BOX, true, false, {
        state,
        random: rng.random,
        hooks: containerHooks(),
    });
    const corpse = iceBox.cobj;

    assert.equal(corpse.corpsenm, PM_JACKAL);
    assert.equal(corpse.age, 0);
    assert.equal(corpse.quan, 2);
    assert.equal(corpse.where, OBJ_CONTAINED);
    assert.equal(corpse.ocontainer, iceBox);
    assert.equal(corpse.nobj, null);
    assert.equal(corpse.timed, 0);
    assert.equal(peek_timer(ROT_CORPSE, corpse, state), 0);
    assert.equal(state.gt.timer_base, null);
    assert.equal(
        iceBox.owt,
        state.objects[ICE_BOX].oc_weight + corpse.owt,
    );
    rng.done();
});

test('ice-box source stops leave a zombification timer intact', () => {
    const state = containerState();
    state.gz.zombify = true;
    const rng = scriptedRandom([
        idDraw(),
        call('rn2', [21], 1), // create exactly one refrigerated corpse
        idDraw(),
        ...selectKoboldDraws(),
        call('rn2', [2], 0), // choose male for a variable-sex kobold corpse
        call('rnz', [25], 25), // consumed before zombification overrides rot
        call('rn1', [15, 5], 5), // earliest zombification timeout
    ]);

    const iceBox = mksobj(ICE_BOX, true, false, {
        state,
        random: rng.random,
        hooks: containerHooks(),
    });
    const corpse = iceBox.cobj;

    assert.equal(corpse.corpsenm, PM_KOBOLD);
    assert.equal(corpse.age, 0);
    assert.equal(corpse.timed, 1);
    assert.equal(peek_timer(ROT_CORPSE, corpse, state), 0);
    assert.equal(
        peek_timer(ZOMBIFY_MON, corpse, state),
        state.moves + 5,
    );
    rng.done();
});
