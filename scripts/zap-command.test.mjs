import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ADMITTED_COMMANDS, failClosedCommandRefusals } from '../js/cmd.js';
import {
    ECMD_TIME, GETOBJ_EXCLUDE, GETOBJ_SUGGEST, ROOMOFFSET,
} from '../js/const.js';
import { extcmdlist } from '../js/extcmdlist_data.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { Tobjnam } from '../js/objnam.js';
import {
    POTION_CLASS,
    POT_WATER,
    WAND_CLASS,
    WAN_SLEEP,
    objects_globals_init,
} from '../js/objects.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { check_unpaid, UnsupportedShopError } from '../js/shk.js';
import { dozap, UnsupportedZapError, zap_ok, zappable } from '../js/zap.js';
import {
    BLIND,
    ESCAPE_KEY,
    HEALER_WAND,
    PLAIN,
    SPACE_KEY,
    WISHED_WAND,
    ZAP_BY_NAME,
    ZAP_KEY,
    loadZapChargeRecipe,
    loadZapCommandRecipe,
} from './run-zap-command.mjs';

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// The top line a call made outside moveloop_core() produced. Nothing has
// flushed the screen yet, so the grid still holds the previous frame; this is
// the text the next flush would paint onto row 0.
function pendingTopLine() {
    return game._pending_message ?? '';
}

// Locate a segment by the keys it types and the options line it carries, so
// reordering the matrix cannot silently point a test at a different case. Two
// segments type the core keys under PLAIN, one per seed; the first is the one
// every test below wants, and the seed list is pinned separately.
function segmentFor(moves, recipe = loadZapCommandRecipe(), options = PLAIN) {
    const found = recipe.segments.find(
        (segment) => segment.moves === `.${moves}.`
            && segment.nethackrc.includes(`OPTIONS=${options}\n`),
    );
    assert.ok(found,
        `the matrix has a segment typing ${moves} under ${options}`);
    return found;
}

// Replay a matrix segment's character and options with different keys, and
// report the fail-closed boundary it reached, or null when it reached none.
async function boundaryFor(segment, moves) {
    let boundary = null;
    await runSegment({ ...segment, moves }, {
        onBoundary: (error) => { boundary = error; },
    });
    return boundary;
}

// A live game whose display, catalogs and hero are the ones the running port
// builds, so a helper called directly here sees what dozap() would see. The
// wand it answers is a fresh object rather than one out of the pack, because
// zappable() writes to spe and every case below wants its own copy.
async function liveGame(spe) {
    await runSegment({ ...segmentFor(`${ZAP_KEY}${ESCAPE_KEY}`), moves: '.' });
    return { otyp: WAN_SLEEP, oclass: WAND_CLASS, quan: 1, spe };
}

function carriedWand() {
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.oclass === WAND_CLASS) return obj;
    return null;
}

// A Healer one wait into her game, with her wand of sleep put into whatever
// condition the case needs. Three of dozap()'s arms want a wand no starting
// loadout carries and no keystroke can produce, so the pack's own wand is
// edited rather than wished up; the fresh matrix in run-zap-command.mjs
// reaches the same arms through the C recorder, which is what proves the
// edited state is one the game can really be in.
async function heroCarryingWand(changes = {}) {
    await runSegment({ ...segmentFor(`${ZAP_KEY}${ESCAPE_KEY}`), moves: '.' });
    const wand = carriedWand();
    assert.ok(wand, 'the Healer carries a wand');
    Object.assign(wand, changes);
    return wand;
}

// Queue the keys dozap()'s prompts will read, then run it off the command
// loop the way eat-prompt.test.mjs runs doeat().
function typeAtPrompts(...keys) {
    for (const key of keys)
        game.nhDisplay.pushKey(
            typeof key === 'number' ? key : key.charCodeAt(0),
        );
}

test('zap_ok suggests every wand and excludes everything else', () => {
    // zap.c:2618-2622. The hands/self choice is the null object, which is the
    // answer that keeps getobj() from advertising a '-' in the prompt.
    assert.equal(zap_ok(null), GETOBJ_EXCLUDE);
    assert.equal(
        zap_ok({ otyp: WAN_SLEEP, oclass: WAND_CLASS }), GETOBJ_SUGGEST,
    );
    assert.equal(
        zap_ok({ otyp: POT_WATER, oclass: POTION_CLASS }), GETOBJ_EXCLUDE,
    );
});

test('zappable refuses a spent wand without drawing', async () => {
    // zap.c:2516's first disjunct. A wand at spe -1 has already been wrested,
    // so the `spe == 0` conjunct beside it is false and no draw is spent. The
    // wand keeps its spe: dozap()'s tail is what crumbles it.
    const wand = await liveGame(-1);
    initRng(1); /* any seed; the arm must not reach the stream at all */
    enableRngLog();
    assert.equal(await zappable(wand, game), 0);
    assert.deepEqual(getRngLog(), []);
    assert.equal(wand.spe, -1);
});

test('zappable draws once for a worn-out wand and usually loses', async () => {
    // zap.c:2516's second disjunct, rn2(WAND_WREST_CHANCE) with
    // WAND_WREST_CHANCE 121 (hack.h:1411). Seed 1 puts 65 at the head of the
    // stream, which is one of the 120 values that refuse the zap.
    const wand = await liveGame(0);
    initRng(1);
    enableRngLog();
    assert.equal(await zappable(wand, game), 0);
    assert.deepEqual(getRngLog(), ['rn2(121)=65']);
    assert.equal(wand.spe, 0);
});

test('zappable wrests a last charge when the draw lands on zero', async () => {
    // The 1-in-121 arm at zap.c:2518-2520, which no starting loadout and no
    // wish can force: seed 49 is the first below 400 that puts 0 at the head
    // of the stream. spe goes to -1, which is what makes dozap()'s tail print
    // "turns to dust" for the same zap.
    const wand = await liveGame(0);
    initRng(49);
    enableRngLog();
    assert.equal(await zappable(wand, game), 1);
    assert.deepEqual(getRngLog(), ['rn2(121)=0']);
    assert.equal(wand.spe, -1);
    assert.equal(
        pendingTopLine(), 'You wrest one last charge from the worn-out wand.',
    );
});

test('zappable spends a charge from a wand that has one', async () => {
    // Both disjuncts false, so zap.c:2521 runs alone: no draw, no message,
    // one charge gone. 4 is the low end of the rn1(5,4) range mksobj() rolls
    // for a wand's UNDEF_SPE.
    const wand = await liveGame(4);
    initRng(1);
    enableRngLog();
    assert.equal(await zappable(wand, game), 1);
    assert.deepEqual(getRngLog(), []);
    assert.equal(wand.spe, 3);
});

function shopState(ushops) {
    const state = { u: { ushops } };
    objects_globals_init(state);
    return state;
}

test('check_unpaid bills only for unpaid merchandise used in a shop', () => {
    // shk.c:5694-5696, the guard check_unpaid() reaches through
    // check_unpaid_usage(otmp, FALSE). Each case below flips one conjunct.
    // ROOMOFFSET is the lowest room number in_rooms() will report, so it is
    // the smallest value hack.c move_update() can put at the head of the shop
    // list; js/rooms.js keeps the list as a fixed-size array, so an empty list
    // is a leading 0 rather than an empty string.
    const IN_SHOP = [ROOMOFFSET, 0, 0, 0, 0];
    const NO_SHOP = [0, 0, 0, 0, 0];
    const charged = (extra) => ({
        otyp: WAN_SLEEP, oclass: WAND_CLASS, spe: 4, ...extra,
    });

    // Paid for, so nothing is owed however deep in the shop the hero stands.
    check_unpaid(charged({ unpaid: false }), shopState(IN_SHOP));
    // Unpaid, but carried outside the shop it came from.
    check_unpaid(charged({ unpaid: true }), shopState(NO_SHOP));
    // Unpaid and inside the shop, but with no charge left to be billed for.
    // objects[WAN_SLEEP].oc_charged is 1, which is what makes this arm apply.
    check_unpaid(charged({ unpaid: true, spe: 0 }), shopState(IN_SHOP));

    // All three conjuncts false: C charges a usage fee, which needs
    // cost_per_charge(), verbalize() and the shopkeeper's debit. spe 1 is the
    // boundary the `<= 0` sits on -- the last charge is still worth billing
    // for -- and spe 4 is an ordinary wand well clear of it.
    for (const spe of [1, 4]) {
        assert.throws(
            () => check_unpaid(
                charged({ unpaid: true, spe }), shopState(IN_SHOP),
            ),
            UnsupportedShopError,
            `spe ${spe}`,
        );
    }
});

test('Tobjnam prepends The and agrees the verb with the object', async () => {
    // objnam.c:2288-2299. The verb arrives in the plural and comes back
    // agreeing with xname(), which is the difference from aobjnam(): no count
    // is prepended and "The" replaces the article.
    await runSegment({ ...segmentFor(`${ZAP_KEY}${ESCAPE_KEY}`), moves: '.' });
    let wand = null;
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.oclass === WAND_CLASS) wand = obj;
    assert.ok(wand, 'the Healer carries a wand');
    // u_init.c ini_inv() identifies what it hands out, so xname() answers the
    // wand's type name rather than its randomized appearance.
    assert.equal(Tobjnam(wand, null, game), 'The wand of sleep');
    assert.equal(Tobjnam(wand, 'turn', game), 'The wand of sleep turns');
    // A stack takes the plural verb; C's otense() reads quan through
    // is_plural(). Restored afterwards so the naming test leaves the pack
    // exactly as the segment built it.
    wand.quan = 2;
    try {
        assert.equal(Tobjnam(wand, 'turn', game), 'The wands of sleep turn');
    } finally {
        wand.quan = 1;
    }
});

test('the zap command is admitted and shares its extcmdlist row with dozap',
    () => {
    assert.ok(ADMITTED_COMMANDS.includes('zap'));
    const row = extcmdlist.find(({ ef_txt }) => ef_txt === 'zap');
    assert.ok(row, 'extcmdlist[] has a zap row');
    assert.equal(row.ef_funct, 'dozap');
    // cmd.c:2004 binds the row to 'z' and gives it no flags, so no prefix
    // accepts it and rhack()'s movement tests cannot divert it.
    assert.equal(row.key, ZAP_KEY.charCodeAt(0));
    assert.equal(row.flags, 0);
    // failClosedCommand() has to convert the class dozap() raises, or the
    // segment would lose the prompts it already matched.
    assert.ok(failClosedCommandRefusals().includes(UnsupportedZapError));
});

test('the zap command asks for an object and then for a direction',
    async () => {
    const segment = segmentFor(`${ZAP_KEY}${HEALER_WAND}${ESCAPE_KEY}`);

    // getobj() advertises the one letter zap_ok() suggests, then the fixed
    // " or ?*]" tail. The cursor sits one column past the trailing space
    // tty_yn_function() appends.
    await runSegment({ ...segment, moves: `.${ZAP_KEY}` });
    assert.equal(topLine(), 'What do you want to zap? [g or ?*]');
    assert.deepEqual(
        [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow], [35, 0],
    );

    // The answered object prompt is cleared and getdir() writes its own.
    await runSegment({ ...segment, moves: `.${ZAP_KEY}${HEALER_WAND}` });
    assert.equal(topLine(), 'In what direction?');
    assert.deepEqual(
        [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow], [19, 0],
    );

    // The same prompt through doextcmd()'s dispatch rather than rhack()'s.
    await runSegment({ ...segment, moves: `.${ZAP_BY_NAME}` });
    assert.equal(topLine(), 'What do you want to zap? [g or ?*]');
});

test('only a zap that chose a wand spends the turn', async () => {
    // rhack()'s result handling at cmd.c:3810-3818 over dozap()'s two
    // completed results. One wait has already passed in each case, so the
    // baseline is the turn counter after the opening '.' alone.
    const segment = segmentFor(`${ZAP_KEY}${HEALER_WAND}${ESCAPE_KEY}`);
    await runSegment({ ...segment, moves: '.' });
    const waited = game.moves;

    // ECMD_CANCEL: getobj() was escaped, so no charge is spent and no turn
    // passes. flags.verbose is on by default, which is what prints the line.
    await runSegment({ ...segment, moves: `.${ZAP_KEY}${ESCAPE_KEY}` });
    assert.equal(pendingTopLine(), 'Never mind.');
    assert.equal(game.moves, waited);

    // ECMD_TIME: the direction prompt was escaped instead, which C calls
    // making the hero "pay for knowing !NODIR". The charge is gone and the
    // turn is spent even though nothing was aimed at.
    await runSegment({
        ...segment, moves: `.${ZAP_KEY}${HEALER_WAND}${ESCAPE_KEY}`,
    });
    assert.equal(pendingTopLine(), 'The wand of sleep glows and fades.');
    assert.equal(game.moves, waited + 1);
});

test('an aimed zap stops at the effect the port has not ported', async () => {
    const segment = segmentFor(`${ZAP_KEY}${HEALER_WAND}${ESCAPE_KEY}`);
    // dozap()'s self arm: getdir()'s NHKF_GETDIR_SELF key writes <0,0,0>, so
    // the test at zap.c:2666 holds and C would call zapyourself().
    const self = await boundaryFor(segment, `.${ZAP_KEY}${HEALER_WAND}.`);
    assert.match(self?.message ?? '', /zapyourself\(\) for object type 432/u);
    // A real direction instead, which is C's `else` at zap.c:2670.
    const aimed = await boundaryFor(segment, `.${ZAP_KEY}${HEALER_WAND}h`);
    assert.match(aimed?.message ?? '', /weffects\(\) for object type 432/u);
    // Up and down leave u.dx and u.dy at 0 and set u.dz, so only the third
    // conjunct of zap.c:2666 separates them from the self arm above.
    for (const key of ['<', '>']) {
        const vertical =
            await boundaryFor(segment, `.${ZAP_KEY}${HEALER_WAND}${key}`);
        assert.match(
            vertical?.message ?? '', /weffects\(\) for object type 432/u, key,
        );
    }
    // WAN_SLEEP is the wand both arms name; the refusals carry the type so a
    // session that reaches one says which wand it wanted.
    assert.equal(WAN_SLEEP, 432);
});

test('a wand with no charge left says so and crumbles', async () => {
    // zap.c:2655-2656 and the tail at 2679-2681. zappable() answers 0 for a
    // wand already past its last charge, so the direction prompt never opens:
    // one keystroke drives the whole command, and useupall() takes the wand
    // out of the pack.
    const wand = await heroCarryingWand({ spe: -1 });
    typeAtPrompts(HEALER_WAND);
    initRng(1);
    enableRngLog();
    assert.equal(await dozap(game), ECMD_TIME);
    assert.equal(
        pendingTopLine(),
        'Nothing happens.  The wand of sleep turns to dust.',
    );
    assert.equal(carriedWand(), null);
    assert.equal(wand.spe, -1);
    // Neither arm draws: zappable() returns at its first disjunct and the
    // backfire test below it is never reached.
    assert.deepEqual(getRngLog(), []);
});

test('a worn-out wand that loses its draw is kept, not crumbled', async () => {
    // The `else` at zap.c:2681-2682, which is what separates `spe < 0` from
    // `spe <= 0`: a wand whose wrest draw missed still reads 0, and C keeps
    // it. Seed 1 is the same losing draw the zappable() test above uses.
    await heroCarryingWand({ spe: 0 });
    typeAtPrompts(HEALER_WAND);
    initRng(1);
    enableRngLog();
    assert.equal(await dozap(game), ECMD_TIME);
    assert.deepEqual(getRngLog(), ['rn2(121)=65']);
    assert.equal(pendingTopLine(), 'Nothing happens.');
    assert.equal(carriedWand()?.spe, 0);
});

test('a blind hero is told nothing when the direction prompt is cancelled',
    async () => {
    // zap.c:2663's `if (!Blind)`. OPTIONS:blind is the one source of blindness
    // the port can reach today, and it raises HBlinded alone, so the helper
    // that reads it has to take either source rather than both.
    const segment = segmentFor(`${ZAP_KEY}${HEALER_WAND}${ESCAPE_KEY}`,
        loadZapCommandRecipe(), BLIND);
    // The starting charge count is rn1(5,4), and OPTIONS:blind moves the whole
    // stream, so it is read rather than assumed.
    await runSegment({ ...segment, moves: '.' });
    const charges = carriedWand().spe;
    const waited = game.moves;

    await runSegment({
        ...segment, moves: `.${ZAP_KEY}${HEALER_WAND}${ESCAPE_KEY}`,
    });
    assert.equal(pendingTopLine(), '');
    // The charge and the turn are spent all the same: C calls this making the
    // hero pay for knowing the wand needs a direction.
    assert.equal(carriedWand().spe, charges - 1);
    assert.equal(game.moves, waited + 1);
});

test('a cursed wand spends the backfire draw before the direction prompt',
    async () => {
    // zap.c:2657. The draw sits inside the condition, so it is spent whether
    // or not it selects backfire(), and only a cursed wand spends it.
    // WAND_BACKFIRE_CHANCE is 100 (hack.h:1410); seed 1 puts 45 at the head of
    // the stream and seed 167 is the first below 200 that puts 0 there.
    await heroCarryingWand({ cursed: true, spe: 4 });
    typeAtPrompts(HEALER_WAND, ESCAPE_KEY);
    initRng(1);
    enableRngLog();
    assert.equal(await dozap(game), ECMD_TIME);
    assert.deepEqual(getRngLog(), ['rn2(100)=45']);
    assert.equal(pendingTopLine(), 'The wand of sleep glows and fades.');
    // zappable() took the charge before the draw, which is the order C fixes
    // by testing zappable() first.
    assert.equal(carriedWand().spe, 3);

    const wand = await heroCarryingWand({ cursed: true, spe: 4 });
    typeAtPrompts(HEALER_WAND);
    initRng(167);
    enableRngLog();
    await assert.rejects(
        () => dozap(game), /backfire\(\) for a cursed wand/u,
    );
    assert.deepEqual(getRngLog(), ['rn2(100)=0']);
    assert.equal(wand.spe, 3);
});

test('zapping unpaid merchandise inside a shop stops at the usage fee',
    async () => {
    // zap.c:2653's check_unpaid(obj), which sits between the object prompt and
    // the charge. A wand the hero has not paid for still has charges, so
    // shk.c:5694-5696 falls through to the fee C would bill.
    await heroCarryingWand({ unpaid: true });
    game.u.ushops[0] = ROOMOFFSET;
    typeAtPrompts(HEALER_WAND);
    await assert.rejects(
        () => dozap(game), UnsupportedShopError,
    );
});

test('a zap under perm_invent stops at the inventory window', async () => {
    // zap.c:2682's update_inventory(), whose comment reads "maybe used a
    // charge". It does nothing while the permanent-inventory window is off,
    // so the only way to show the call happens is to turn the window on: the
    // port has no owner for it and must stop rather than skip the redraw.
    await heroCarryingWand();
    game.iflags.perm_invent = true;
    typeAtPrompts(HEALER_WAND, ESCAPE_KEY);
    try {
        await assert.rejects(
            () => dozap(game), /updateInventory/u,
        );
    } finally {
        game.iflags.perm_invent = false;
    }
});

test('the zap matrix covers both prompts, both dispatch routes and no wand',
    () => {
    const recipe = loadZapCommandRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    // Every segment opens and closes with a wait, so a turn dozap() wrongly
    // spent or wrongly saved moves a cell in the screen after it.
    assert.ok(recipe.segments.every(
        ({ moves }) => moves.startsWith('.') && moves.endsWith('.'),
    ));
    const typed = recipe.segments.map(({ moves }) => moves);
    // The two dispatch routes to one handler: the bound key through rhack(),
    // and the typed name through doextcmd().
    assert.ok(typed.includes(`.${ZAP_KEY}${HEALER_WAND}${ESCAPE_KEY}.`));
    assert.ok(typed.includes(`.${ZAP_BY_NAME}${HEALER_WAND}${ESCAPE_KEY}.`));
    // Both quitchars a recording can send, at the object prompt.
    assert.ok(typed.includes(`.${ZAP_KEY}${ESCAPE_KEY}.`));
    assert.ok(typed.includes(`.${ZAP_KEY}${SPACE_KEY}.`));
    // The seed list is the separate tripwire for a silent re-recording.
    assert.deepEqual(recipe.segments.map(({ seed }) => seed),
        [7830001, 7830011, 7830001, 7830001, 7830001, 7830002, 7830031,
            7830001, 7830021]);
    // Exactly one segment carries a role with no wand, and it is the only one
    // whose keys stop at the command byte.
    assert.deepEqual(
        recipe.segments.filter(({ moves }) => moves === `.${ZAP_KEY}.`)
            .map(({ nethackrc }) => /role:(\w+)/u.exec(nethackrc)[1]),
        ['Valkyrie'],
    );
});

test('the charge matrix reaches every arm of zappable and the dust tail',
    () => {
    const recipe = loadZapChargeRecipe();
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    // Every segment needs debug mode, because the wands they zap have to be
    // wished up: no starting loadout carries a wand at 0 or fewer charges, a
    // cursed one, or two wands at once.
    assert.ok(recipe.segments.every(
        ({ nethackrc }) => nethackrc.includes('playmode:debug'),
    ));
    // The three wishes that set spe, one per arm of zap.c:2516-2521, plus the
    // cursed wand that makes dozap() spend its backfire draw.
    const wishes = recipe.segments.map(
        ({ moves }) => /\x17([^\n]*)\n/u.exec(moves)[1],
    );
    assert.deepEqual(wishes, [
        '-1 wand of sleep', '+0 wand of sleep', '+0 wand of sleep',
        'cursed wand of sleep', 'wand of digging',
    ]);
    // The wrest segment is the only one that dismisses a --More-- before
    // answering the direction prompt, because it is the only one whose zap
    // puts two lines on the top row.
    assert.deepEqual(
        recipe.segments.filter(
            ({ moves }) => moves.includes(
                `${ZAP_KEY}${WISHED_WAND}${SPACE_KEY}${ESCAPE_KEY}`,
            ),
        ).map(({ seed }) => seed),
        [7840124],
    );
});

test('every zap refusal names a zap.c function the port has not ported',
    () => {
    const source = readFileSync(
        new URL('../js/zap.js', import.meta.url), 'utf8',
    );
    // The three effect arms, and nothing else: an extra refusal in dozap()
    // would mean an arm that C runs and this port does not.
    assert.deepEqual(
        [...source.matchAll(/new UnsupportedZapError\(\s*[`']([^`']*)/gu)]
            .map(([, text]) => text.split('(')[0]),
        ['backfire', 'zapyourself', 'weffects'],
    );
});
