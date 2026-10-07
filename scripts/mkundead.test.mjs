import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { COLNO, G_GONE, IN_SIGHT, COULD_SEE, NO_MINVENT, ROOM, ROWNO } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { mkundead } from '../js/mkroom.js';
import { PM_GHOST, PM_HUMAN, PM_NEWT, S_ZOMBIE, monst_globals_init, reset_mvitals } from '../js/monsters.js';
import { mksobj, place_object } from '../js/obj.js';
import { CORPSE, objects_globals_init } from '../js/objects.js';
import { enexto } from '../js/teleport.js';
import { timeout_globals_init } from '../js/timeout.js';
import { rawMonsterGenerationState } from './monster-test-state.mjs';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';

const MKROOM_C = readFileSync('nethack-c/upstream/src/mkroom.c', 'utf8');
const MAKEMON_C = readFileSync('nethack-c/upstream/src/makemon.c', 'utf8');
const APPLY_C = readFileSync('nethack-c/upstream/src/apply.c', 'utf8');
const SPELL_C = readFileSync('nethack-c/upstream/src/spell.c', 'utf8');
const APPLY_JS = readFileSync('js/apply.js', 'utf8');
const SPELL_JS = readFileSync('js/spell.js', 'utf8');

function stateAtDepth(depth = 1) {
    const state = {
        ...rawMonsterGenerationState(),
        context: { ident: 2 }, // Startup-owned next object/monster id.
        level: new GameMap(),
        moves: 0,
        rogue_level: { dnum: 0, dlevel: 15 }, // Outside every tested depth.
        astral_level: { dnum: 9, dlevel: 9 },
        sanctum_level: { dnum: 9, dlevel: 8 },
        urace: { mnum: PM_HUMAN, lovemask: 0, hatemask: 0 },
    };
    state.u.ux = 10; // Interior center leaves all three enexto rings unclipped.
    state.u.uy = 5;
    state.u.uz.dlevel = depth;
    monst_globals_init(state);
    reset_mvitals(state);
    objects_globals_init(state);
    timeout_globals_init(state);
    state.viz_array = Array.from({ length: ROWNO },
        () => new Uint8Array(COLNO).fill(IN_SIGHT | COULD_SEE));
    for (let x = 1; x < COLNO; x++)
        for (let y = 0; y < ROWNO; y++) state.level.at(x, y).typ = ROOM;
    return state;
}

function randomForGhosts() {
    const calls = [];
    const record = (name, args, value) => {
        calls.push([name, ...args]);
        return value;
    };
    return {
        calls,
        random: {
            // rnd(5)=1 makes the count's C integer quotient observable.
            rnd: (bound) => record('rnd', [bound], 1),
            // morguemon rn2(100)=0 selects ghost; all other draws use the
            // last valid index to keep enexto's shuffle deterministic.
            rn2: (bound) => record('rn2', [bound], bound === 100 ? 0 : bound - 1),
            d: (number, sides) => record('d', [number, sides], number),
            rn1: (range, base) => record('rn1', [range, base], base),
            rne: (bound) => record('rne', [bound], 1),
            rnz: (value) => record('rnz', [value], value),
        },
    };
}

function monsters(state) {
    const result = [];
    for (let mon = state.level.monlist; mon; mon = mon.nmon) result.push(mon);
    return result;
}

const quiet = { message: async () => {}, norepMessage: async () => {} };

test('mkundead preserves the whole C loop and both production caller modes', () => {
    const source = MKROOM_C.slice(MKROOM_C.indexOf('mkundead(\n'), MKROOM_C.indexOf('\nstaticfn struct permonst *\nmorguemon'));
    assert.match(source, /\(level_difficulty\(\) \+ 1\) \/ 10 \+ rnd\(5\)/u);
    assert.match(source, /mdat = morguemon\(\);[\s\S]*mdat && enexto[\s\S]*!revive_corpses[\s\S]*sobj_at\(CORPSE[\s\S]*!revive\(otmp, FALSE\)[\s\S]*makemon\(mdat, cc\.x, cc\.y, mm_flags\)[\s\S]*flags\.graveyard = TRUE/u);
    assert.match(APPLY_C, /mkundead\(&mm, FALSE, NO_MINVENT\)/u);
    assert.match(SPELL_C, /unturn_dead\(&gy\.youmonst\)[\s\S]*mkundead\(&mm, TRUE, NO_MINVENT\)/u);
    assert.match(APPLY_JS, /await mkundead\([\s\S]*?false,\s*NO_MINVENT/u);
    assert.match(SPELL_JS, /await unturn_dead\([\s\S]*?await mkundead\([\s\S]*?true,\s*NO_MINVENT/u);
    assert.match(MAKEMON_C, /allow_minvent = \(\(mmflags & NO_MINVENT\) == 0\)/u);
});

test('mkundead counts the integer depth quotient and awaits each creation message', async () => {
    // C's (difficulty+1)/10 changes from zero to one at depth nine.
    for (const [depth, count] of [[8, 1], [9, 2]]) {
        const state = stateAtDepth(depth);
        const rng = randomForGhosts();
        let messages = 0;
        const message = async () => {
            await Promise.resolve();
            messages++;
            // C does not set graveyard until the last makemon tail finishes.
            assert.equal(Boolean(state.level.flags.graveyard), false);
        };
        await mkundead({ x: state.u.ux, y: state.u.uy }, false,
            NO_MINVENT, state, { ...quiet, random: rng.random, message, norepMessage: message });
        assert.equal(monsters(state).length, count);
        assert.equal(messages, count);
        assert.equal(state.level.flags.graveyard, true);
        assert.deepEqual(rng.calls.slice(0, 3), [['rnd', 5], ['rn2', 100], ['rn2', depth]]);
        assert.equal(rng.calls.filter(call => call[0] === 'rnd' && call[1] === 5).length, 1);
        assert.equal(rng.calls.filter(call => call[0] === 'rn2' && call[1] === 100).length, count);
        for (const mon of monsters(state)) {
            assert.equal(mon.data, state.mons[PM_GHOST]);
            assert.equal(mon.minvent, null); // Exact caller NO_MINVENT contract.
        }
    }
});

test('mkundead always marks graveyard after null selection or failed placement', async () => {
    for (const failSelection of [false, true]) {
        const state = stateAtDepth();
        const rng = randomForGhosts();
        if (failSelection) {
            // All zombie species are unavailable, so mkclass returns null.
            for (const species of state.mons)
                if (species.mlet === S_ZOMBIE) state.mvitals[species.pmidx].mvflags |= G_GONE;
            const original = rng.random.rn2;
            rng.random.rn2 = bound => bound === 100
                ? (rng.calls.push(['rn2', bound]), 99) : original(bound);
        } else {
            // Ghost placement fails when every legal map cell is occupied;
            // occupying cells preserves terrain suitable for ghost goodpos.
            for (let x = 1; x < COLNO; x++)
                for (let y = 0; y < ROWNO; y++)
                    state.level.monsters[x][y] = { data: state.mons[PM_GHOST] };
        }
        await mkundead({ x: state.u.ux, y: state.u.uy }, false,
            NO_MINVENT, state, { ...quiet, random: rng.random });
        assert.equal(state.level.monlist, null);
        assert.equal(state.level.flags.graveyard, true);
        assert.equal(state.context.ident, 2); // No creation or object id consumed.
        assert.equal(rng.calls.some(call => call[0] === 'rnd' && call[1] === 2), false);
    }
});

test('mkundead consumes a successful floor revival and honors the false mode', async () => {
    for (const reviveCorpses of [false, true]) {
        const state = stateAtDepth();
        // Predict the chosen square using the existing enexto owner and the
        // same independent fixture stream; the implementation uses no hook.
        const placement = enexto(state.u.ux, state.u.uy, state.mons[PM_GHOST],
            { state, random: randomForGhosts().random });
        const corpse = mksobj(CORPSE, false, false,
            { state, random: randomForGhosts().random });
        corpse.corpsenm = PM_NEWT; // Ordinary non-reviver with no saved traits.
        place_object(corpse, placement.x, placement.y, { state });
        const rng = randomForGhosts();
        await mkundead({ x: state.u.ux, y: state.u.uy }, reviveCorpses,
            NO_MINVENT, state, { ...quiet, random: rng.random });
        const created = monsters(state);
        assert.equal(created.length, 1); // Revival must replace, not add to, creation.
        assert.equal(created[0].mnum, reviveCorpses ? PM_NEWT : PM_GHOST);
        assert.equal(Boolean(created[0].mrevived), reviveCorpses);
        assert.equal(state.level.objects[placement.x][placement.y], reviveCorpses ? null : corpse);
        assert.equal(state.mvitals[PM_GHOST].born, reviveCorpses ? 0 : 1);
        assert.equal(state.level.flags.graveyard, true);
    }
});

test('mkundead leaves a non-revivable floor corpse and creates its selected monster', async () => {
    const state = stateAtDepth();
    const placement = enexto(state.u.ux, state.u.uy, state.mons[PM_GHOST],
        { state, random: randomForGhosts().random });
    const corpse = mksobj(CORPSE, false, false,
        { state, random: randomForGhosts().random });
    corpse.corpsenm = PM_NEWT;
    corpse.norevive = true; // zap.c:revive rejects this bit without consuming it.
    place_object(corpse, placement.x, placement.y, { state });
    // Make the square unseen to avoid invoking the tty message sink in this
    // constructed state; independent recordings cover the visible message.
    state.viz_array[placement.y][placement.x] = 0;
    await mkundead({ x: state.u.ux, y: state.u.uy }, true,
        NO_MINVENT, state, { ...quiet, random: randomForGhosts().random });
    assert.equal(monsters(state)[0].mnum, PM_GHOST);
    assert.equal(state.level.objects[placement.x][placement.y], corpse);
    assert.equal(corpse.norevive, true);
    assert.equal(state.level.flags.graveyard, true);
});


test('Book carried revival keeps C Norep appearance boundaries after unturn_dead', async () => {
    // The independently recorded Book route creates a master lich, stops
    // studying, revives the carried corpse, and selects repeated zombies.
    // makemon.c:1497 Norep suppresses the repeated appearance rather than
    // adding another More prompt after unturn_dead's messages.
    const recording = JSON.parse(readFileSync(
        'recordings/mkroom.c/mkundead-book-carried-revive.session.json', 'utf8'));
    assert.match(MAKEMON_C, /Norep\("%s%s %s%s%c"/u);
    assert.match(SPELL_JS, /norepMessage: env\.norepMessage[\s\S]*?env\.message === ttyPline \? ttyNorep : env\.message/u);
    assert.equal(compareSessionOutputs(recording,
        await runJsSession(recording, process.cwd())).passed, true);
});
