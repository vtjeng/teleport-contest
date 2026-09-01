// The `t` command driven end to end through js/jsmain.js runSegment(), over
// the same recipes scripts/run-throw-command.mjs records against the C
// reference. The differential compares screens and random-number calls; this
// file asserts the prompt those screens carry and the game state behind them,
// so a change that keeps the screens and moves an object, a slot or a turn
// fails here.
//
// The recipe assertions come first. They read the recipe rather than the
// recording, so a silent re-recording that stopped covering an arm of
// dothrow.c throw_ok() fails here instead of passing a differential against a
// weaker case.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CANCEL_CASE,
    CANCEL_MOVES,
    ROGUE_MOVES,
    SAMURAI_MOVES,
    THROW_CASES,
    WIZARD_MOVES,
    loadThrowCancelRecipe,
    loadThrowCommandRecipe,
} from './run-throw-command.mjs';
import { ADMITTED_COMMANDS } from '../js/cmd.js';
import { extcmdlist } from '../js/extcmdlist_data.js';
import { SCR_IDENTIFY, SCR_MAGIC_MAPPING, YUMI } from '../js/objects.js';
import { W_SWAPWEP, W_WEP } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

function segments() {
    return loadThrowCommandRecipe().segments;
}

function segmentFor(seed) {
    const found = segments().find((segment) => segment.seed === seed);
    assert.ok(found, `no segment for seed ${seed}`);
    return found;
}

function role(segment) {
    return /role:([A-Za-z]+)/u.exec(segment.nethackrc)[1];
}

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// The floor pile at <x,y>, head first, as js/obj.js place_object() links it.
function pileAt(x, y) {
    const found = [];
    for (let obj = game.level.objects[x]?.[y]; obj; obj = obj.nexthere)
        found.push(obj);
    return found;
}

function slotAt(invlet) {
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.invlet === invlet) return obj;
    return null;
}

// Everything of type `otyp` lying anywhere on the level.
function countOnFloor(otyp) {
    let total = 0;
    for (let x = 0; x < game.level.objects.length; x++) {
        for (let y = 0; y < (game.level.objects[x]?.length ?? 0); y++) {
            for (const obj of pileAt(x, y)) {
                if (obj.otyp === otyp) total += obj.quan;
            }
        }
    }
    return total;
}

test('the throw command is admitted and shares its extcmdlist row with '
    + 'dothrow', () => {
    assert.ok(ADMITTED_COMMANDS.includes('throw'));
    const row = extcmdlist.find(({ ef_txt }) => ef_txt === 'throw');
    assert.ok(row, 'extcmdlist[] has a throw row');
    assert.equal(row.ef_funct, 'dothrow');
    // cmd.c:1901 gives the row no flags, which is what keeps rhack()'s prefix
    // and MOVEMENTCMD tests from diverting the command.
    assert.equal(row.flags, 0);
    assert.equal(row.key, 't'.charCodeAt(0));
});

test('the throw matrix separates four throw_ok() classifications', () => {
    const recipe = loadThrowCommandRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    // The Samurai is the only starting role with a weapon in neither the
    // primary, secondary nor quiver slot, so he is the only one whose throw
    // does not need remove_worn_item(); the Rogue is the stack; the Wizard is
    // the empty suggestion set. The seed list is the separate tripwire for a
    // silent re-recording.
    assert.deepEqual(
        recipe.segments.map(role), ['Samurai', 'Rogue', 'Wizard'],
    );
    assert.deepEqual(
        recipe.segments.map(({ seed }) => seed), [3140358, 3140183, 3140224],
    );
    assert.deepEqual(THROW_CASES.map(({ letter }) => letter),
        ['c', 'b', 'j']);
    // The Wizard throws twice: once east and once at himself.
    assert.equal(SAMURAI_MOVES, '.tcl.');
    assert.equal(ROGUE_MOVES, '.tbl.');
    assert.equal(WIZARD_MOVES, '.tjl.tk..');
    assert.equal(WIZARD_MOVES.split('t').length - 1, 2);
});

test('the cancel recipe answers the object prompt two ways', () => {
    const recipe = loadThrowCancelRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    assert.equal(recipe.segments[0].seed, CANCEL_CASE.seed);
    // A letter no slot holds keeps the loop going, a quit character leaves it.
    // The space between them dismisses the --More-- the redrawn prompt raises.
    assert.equal(CANCEL_MOVES, '.tz \u001B');
    assert.ok(CANCEL_MOVES.endsWith('\u001B'), 'no quit-character answer');
});

test('every throw segment starts from the same fixed clock', () => {
    const all = [
        ...loadThrowCommandRecipe().segments,
        ...loadThrowCancelRecipe().segments,
    ];
    // A varying datetime would change moon phase and Friday-the-13th
    // behavior, neither of which this matrix is measuring.
    assert.ok(all.every(({ datetime }) => datetime === '20000110090000'));
    // pettype:none is what keeps a pet out of the flight path; without it a
    // missile could reach thitmonst(), which no segment here is allowed to do.
    assert.ok(all.every(
        ({ nethackrc }) => nethackrc.includes('pettype:none'),
    ));
});

test('the prompt lists exactly what throw_ok() suggests', async () => {
    // Each segment is replayed up to its `t`, which leaves getobj()'s prompt
    // on the top line with the answer still unread.
    //
    // The Samurai downplays only the katana in his hand (dothrow.c:330-331)
    // and the splint mail he wears (:347); the wakizashi is uswapwep with
    // u.twoweap false, so it reaches the WEAPON_CLASS arm at :336-337 with the
    // yumi and the ya.
    await runSegment({ ...segmentFor(3140358), moves: '.t' });
    assert.equal(topLine(), 'What do you want to throw? [bcd or ?*]');

    // The Rogue's short sword is in hand and his six daggers are not.
    await runSegment({ ...segmentFor(3140183), moves: '.t' });
    assert.equal(topLine(), 'What do you want to throw? [b or ?*]');

    // Nothing the Wizard carries is suggested, which is invent.c:1932's other
    // branch: ` [*]` rather than ` [<letters> or ?*]`.
    await runSegment({ ...segmentFor(3140224), moves: '.t' });
    assert.equal(topLine(), 'What do you want to throw? [*]');
});

test('the full inventory menu selects a downplayed throw object', async () => {
    const segment = segmentFor(3140224);
    await runSegment({ ...segment, moves: '.' });
    const scroll = slotAt('j');
    assert.equal(scroll.otyp, SCR_IDENTIFY);
    const beforeMoves = game.moves;

    // invent.c:getobj() redo_menu (1966-1998) sends '*' through
    // display_pickinv(NULL, ..., TRUE, ...).  The Wizard has no suggested
    // throwables, so this exercises the full two-page menu rather than the
    // prompt's direct-letter path; selecting j must return to throw_obj()'s
    // direction question without consuming a turn or changing the object.
    await runSegment({ ...segment, moves: '.t*j' });
    assert.equal(topLine(), 'In what direction?');
    assert.equal(game.moves, beforeMoves);
    assert.equal(slotAt('j').otyp, scroll.otyp);
    assert.equal(slotAt('j').quan, scroll.quan);
});

test('the suggested throw menu filters to throw_ok() candidates', async () => {
    const segment = segmentFor(3140358);
    await runSegment({ ...segment, moves: '.' });
    const yumi = slotAt('c');
    assert.equal(yumi.otyp, YUMI);
    const beforeMoves = game.moves;

    // invent.c:getobj() redo_menu (1966-1998) passes `lets`, the nonempty
    // GETOBJ_SUGGEST set from throw_ok(), to display_pickinv(). The Samurai's
    // b/c/d weapon choices make this the multi-item filtered menu path;
    // selecting c must return to throw_obj()'s direction question without
    // spending a turn or changing the object before the direction is read.
    await runSegment({ ...segment, moves: '.t?c' });
    assert.equal(topLine(), 'In what direction?');
    assert.equal(game.moves, beforeMoves);
    assert.equal(slotAt('c').otyp, yumi.otyp);

    await runSegment({ ...segment, moves: '.t?cl' });
    assert.equal(slotAt('c'), null);
    assert.equal(countOnFloor(YUMI), 1);
    assert.equal(game.moves, beforeMoves + 1);
});

test('a suggested weapon leaves the pack and lands east of the hero',
    async () => {
        const segment = segmentFor(3140358);
        await runSegment({ ...segment, moves: '.' });
        const beforeMoves = game.moves;
        const yumi = slotAt('c');
        assert.equal(yumi.otyp, YUMI);
        // u_init.c fills uwep and uswapwep with the first two weapons and the
        // quiver with the ammunition, so the yumi is the one Samurai weapon
        // with no worn mask -- which is why throw_obj():262-263 does not need
        // remove_worn_item() for it.
        assert.equal(yumi.owornmask, 0);
        assert.equal(game.uwep.owornmask & W_WEP, W_WEP);
        assert.equal(game.uswapwep.owornmask & W_SWAPWEP, W_SWAPWEP);

        await runSegment({ ...segment, moves: '.tcl' });
        assert.equal(slotAt('c'), null, 'the yumi is still in the pack');
        assert.equal(countOnFloor(YUMI), 1);
        // The throw spends the turn; the prompt and the direction question do
        // not, so exactly one turn passes over the whole command.
        assert.equal(game.moves, beforeMoves + 1);
        // It flew east along the hero's own row.
        for (let x = 0; x < game.level.objects.length; x++) {
            for (const obj of pileAt(x, game.u.uy)) {
                if (obj.otyp !== YUMI) continue;
                assert.ok(x > game.u.ux, 'the yumi landed west of the hero');
            }
        }
    });

test('a thrown stack is split rather than emptied', async () => {
    const segment = segmentFor(3140183);
    await runSegment({ ...segment, moves: '.' });
    const daggers = slotAt('b');
    const before = daggers.quan;
    // The Rogue's dagger bonus in multishot_class_bonus() makes the volley
    // rnd(2); C recorded 2 for this seed, and the screens the differential
    // compares carry "You throw 2 daggers." for it.
    assert.equal(before, 6);
    const otyp = daggers.otyp;

    await runSegment({ ...segment, moves: '.tbl' });
    // throw_obj():258-259 splits one dagger off per shot, so the slot survives
    // the volley with the rest of the stack in it and keeps its letter.
    const left = slotAt('b');
    assert.ok(left, 'the dagger slot was emptied');
    assert.equal(before - left.quan, 2);
    assert.equal(countOnFloor(otyp), 2);
    // The split stack is still the alternate weapon: throw_obj() splits the
    // missile off rather than unwearing the slot.
    assert.equal(left.owornmask & W_SWAPWEP, W_SWAPWEP);
    assert.equal(game.uswapwep, left);
});

test('a letter the prompt did not offer is still thrown', async () => {
    const segment = segmentFor(3140224);
    await runSegment({ ...segment, moves: '.' });
    assert.equal(slotAt('j').otyp, SCR_IDENTIFY);
    const beforeMoves = game.moves;

    // dothrow.c:347 downplays the scroll, so `j` is behind the `?*` rather
    // than in the brackets; getobj() accepts it all the same.
    await runSegment({ ...segment, moves: '.tjl' });
    assert.equal(slotAt('j'), null);
    assert.equal(countOnFloor(SCR_IDENTIFY), 1);
    assert.equal(game.moves, beforeMoves + 1);
});

test('a throw aimed at the hero costs neither the object nor a turn',
    async () => {
        const segment = segmentFor(3140224);
        // WIZARD_MOVES' second command answers the direction prompt with `.`,
        // which cmd.c getdir() reads as the hero's own square.
        await runSegment({ ...segment, moves: '.tjl.' });
        const beforeMoves = game.moves;
        assert.equal(slotAt('k').otyp, SCR_MAGIC_MAPPING);

        await runSegment({ ...segment, moves: '.tjl.tk.' });
        // dothrow.c:133-136 returns ECMD_OK, so no turn elapses and the
        // scroll never leaves the pack.
        assert.equal(topLine(), 'You cannot throw an object at yourself.');
        assert.equal(slotAt('k').otyp, SCR_MAGIC_MAPPING);
        assert.equal(countOnFloor(SCR_MAGIC_MAPPING), 0);
        assert.equal(game.moves, beforeMoves);
    });

test('an escaped prompt spends nothing and keeps the pack', async () => {
    const segment = loadThrowCancelRecipe().segments[0];
    await runSegment({ ...segment, moves: '.' });
    const beforeMoves = game.moves;
    const dagger = slotAt('b');
    assert.ok(dagger, 'the Valkyrie carries no spare dagger');

    // A letter no slot holds prints the complaint and goes round again.
    await runSegment({ ...segment, moves: '.tz' });
    assert.equal(topLine(), "You don't have that object.--More--");

    // The space dismisses that --More--, which redraws the prompt unchanged.
    await runSegment({ ...segment, moves: '.tz ' });
    assert.equal(topLine(), 'What do you want to throw? [b or ?*]');

    // Escape is a quitchar, so getobj() answers null and dothrow() returns
    // ECMD_CANCEL without asking for a direction.
    await runSegment({ ...segment, moves: CANCEL_MOVES });
    assert.equal(topLine(), 'Never mind.');
    assert.equal(slotAt('b').quan, dagger.quan);
    assert.equal(game.moves, beforeMoves);
    assert.equal(game.context.move, 0);
});
