import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ART_EXCALIBUR } from '../js/artifacts.js';
import { ADMITTED_COMMANDS, failClosedCommandRefusals } from '../js/cmd.js';
import {
    ECMD_OK,
    ECMD_TIME,
    EXT_ENCUMBER,
    FROMOUTSIDE,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    M_SEEN_SLEEP,
    ROOMOFFSET,
    SDOOR,
    SLEEP_RES,
    W_ARMH,
} from '../js/const.js';
import { extcmdlist } from '../js/extcmdlist_data.js';
import { game } from '../js/gstate.js';
import { inv_weight, near_capacity, weight_cap } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { PM_FOX } from '../js/monsters.js';
import { Tobjnam } from '../js/objnam.js';
import {
    NODIR,
    POTION_CLASS,
    POT_WATER,
    WAND_CLASS,
    WAN_DIGGING,
    WAN_LIGHT,
    WAN_SECRET_DOOR_DETECTION,
    WAN_SLEEP,
    objects_globals_init,
} from '../js/objects.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { check_unpaid, UnsupportedShopError } from '../js/shk.js';
import { m_canseeu } from '../js/vision.js';
import { dozap, UnsupportedZapError, zap_ok, zappable } from '../js/zap.js';
import {
    BLIND,
    ESCAPE_KEY,
    HEALER_WAND,
    PLAIN,
    SELF_KEY,
    SPACE_KEY,
    WISHED_WAND,
    ZAP_BY_NAME,
    ZAP_KEY,
    loadZapChargeRecipe,
    loadZapCommandRecipe,
    loadZapDeathRayRecipe,
    loadZapDiscoveryRecipe,
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

// Load the pack to a chosen encumbrance, the way eat-prompt.test.mjs does.
// hack.c capacity_from_excess() answers `trunc(excess * 2 / wc) + 1`, where
// excess is the pack's weight less the carrying capacity, so `level` covers
// the excesses from `(level - 1) * wc / 2` up to `level * wc / 2` and the
// target below aims at the middle of that band. The wand's own slot absorbs
// the difference, and inv_weight() reports what the pack weighs today, so the
// Healer's gold needs no separate arithmetic here.
function loadPackTo(level) {
    const capacity = weight_cap(game);
    const target = Math.trunc(capacity * (1 + (2 * level - 1) / 4));
    const wand = carriedWand();
    assert.ok(wand, 'the Healer carries a wand');
    wand.owt += target - (inv_weight(game) + capacity);
    assert.equal(near_capacity(game), level);
}

// Every monster the level generated, in mon.c fmon order.
function levelMonsters() {
    const monsters = [];
    for (let mon = game.level.monlist; mon; mon = mon.nmon) monsters.push(mon);
    return monsters;
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
    // Both disjuncts false, so zap.c:2520 runs alone: no draw, no message,
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
    // shk.c:5695-5697, the guard check_unpaid() reaches through
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

    // The same spe on an object type that is not sold by the charge:
    // objects[POT_WATER].oc_charged is 0, so C's third conjunct is false
    // however low spe reads and the fee applies. This is the row that holds
    // the conjunct itself, since every wand above carries oc_charged 1.
    assert.equal(shopState(IN_SHOP).objects[POT_WATER].oc_charged, 0);
    assert.throws(
        () => check_unpaid(
            { otyp: POT_WATER, oclass: POTION_CLASS, spe: 0, unpaid: true },
            shopState(IN_SHOP),
        ),
        UnsupportedShopError,
    );

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

test('an overloaded hero is refused before the object prompt opens',
    async () => {
    // zap.c:2636's check_capacity((char *) 0), the second of dozap()'s two
    // guards and the second of the two ECMD_OK results the command can
    // return. hack.c:4398-4408 refuses at EXT_ENCUMBER and takes You_cant()'s
    // default line for a null argument. No key is queued, so a dozap() that
    // reached getobj() would empty the input queue instead of returning.
    //
    // The nohands() guard above it needs no case of its own: Upolyd is
    // constantly false in this port, so gy.youmonst.data is always the hero's
    // own species and nohands() is always false.
    await heroCarryingWand({ spe: 4 });
    loadPackTo(EXT_ENCUMBER);
    assert.equal(await dozap(game), ECMD_OK);
    assert.equal(
        pendingTopLine(), "You can't do that while carrying so much stuff.",
    );

    // One band below it the command runs to the end, so the guard really is
    // `>=` on EXT_ENCUMBER rather than on any load at all.
    await heroCarryingWand({ spe: 4 });
    loadPackTo(EXT_ENCUMBER - 1);
    typeAtPrompts(HEALER_WAND, ESCAPE_KEY);
    assert.equal(await dozap(game), ECMD_TIME);
    assert.equal(pendingTopLine(), 'The wand of sleep glows and fades.');
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

test('dozap() keeps its foreign naming state after an escaped direction',
    async () => {
        await heroCarryingWand({ spe: 4 });
        const foreign = Object.create(game);
        foreign.mons = structuredClone(game.mons);
        foreign.mons[PM_FOX].pmnames = [
            'foreign fox', 'foreign fox', 'foreign fox',
        ];
        foreign.gf = {
            ffruit: { fname: 'Excalibur', fid: 7, nextf: null },
        };
        foreign.artilist = structuredClone(game.artilist);
        foreign.artiexist = structuredClone(game.artiexist);
        foreign.artilist[ART_EXCALIBUR].name = 'Elsecalibur';
        foreign.artiexist[ART_EXCALIBUR].exists = 1;
        foreign.artiexist[ART_EXCALIBUR].found = 1;
        foreign.objects = structuredClone(game.objects);
        foreign.obj_descr = structuredClone(game.obj_descr);
        foreign.flags = { ...game.flags };
        foreign.iflags = { ...game.iflags, override_ID: true };
        foreign.program_state = { ...game.program_state };
        foreign.context = structuredClone(game.context);
        foreign.u = structuredClone(game.u);
        foreign.youmonst = {
            ...game.youmonst,
            data: foreign.mons[foreign.u.umonnum],
        };
        const wand = { ...carriedWand(), nobj: null };
        wand.oartifact = ART_EXCALIBUR;
        wand.oextra = { oname: 'Excalibur' };
        foreign.invent = wand;
        const wandType = foreign.objects[wand.otyp];
        wandType.oc_name_known = 1;
        foreign.obj_descr[wandType.oc_name_idx].oc_name = 'Excalibur';
        wand.dknown = 1;
        foreign.nhDisplay = game.nhDisplay;
        foreign._pending_message = '';
        foreign._ttyPreviousMessage = '';
        foreign._ttyToplines = '';
        typeAtPrompts(wand.invlet, ESCAPE_KEY);

        assert.equal(await dozap(foreign), ECMD_TIME);
        assert.equal(
            foreign._pending_message,
            'The Excalibur glows and fades.',
        );
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

test('an aimed zap reaches the ray and stops in zhitu', async () => {
    const segment = segmentFor(`${ZAP_KEY}${HEALER_WAND}${ESCAPE_KEY}`);
    // A real direction, which is C's `else` at zap.c:2665. The self arm beside
    // it runs instead of stopping; 'a self-zap of sleep' below owns it.
    // weffects() now sends the sleep ray through dobuzz(), which walks it and
    // stops only when the bolt reaches the hero: zhitu()'s ZT_SLEEP arm is
    // one of the six damage types this port has not reached.
    const aimed = await boundaryFor(segment, `.${ZAP_KEY}${HEALER_WAND}h`);
    assert.match(aimed?.message ?? '', /zhitu\(\) for damage type 3/u);
    // Up and down leave u.dx and u.dy at 0 and set u.dz, so only the third
    // conjunct of zap.c:2657 separates them from the self arm, and a hero who
    // zapped upward must reach weffects() rather than fall asleep. A vertical
    // bolt is forced to range 1 at zap.c:4824-4825 and never leaves the hero's
    // own square, so it stops in the same arm.
    for (const key of ['<', '>']) {
        const vertical =
            await boundaryFor(segment, `.${ZAP_KEY}${HEALER_WAND}${key}`);
        assert.match(
            vertical?.message ?? '', /zhitu\(\) for damage type 3/u, key,
        );
    }
    // WAN_SLEEP is the wand both arms name. BZ_OFS_WAN(432) is
    // (432 - WAN_MAGIC_MISSILE) % 10 = 3, which is the ZT_SLEEP the refusal
    // reports and flash_types[]'s "sleep ray" row.
    assert.equal(WAN_SLEEP, 432);
});

test('a NODIR wand is never asked which way to point', async () => {
    // zap.c:2644 sets need_dir from objects[].oc_dir, and the two arms at 2653
    // and 2657 both test it: for a wand C aims nowhere there is no direction
    // prompt and no self-zap, and the command falls through to weffects().
    // Only the wand letter is queued, so a direction prompt that opened would
    // have no key to read and would fail this case rather than pass it.
    await heroCarryingWand({ otyp: WAN_LIGHT, spe: 4 });
    // The wand of sleep every other case zaps is RAY, which is what makes the
    // same keys open a direction prompt above.
    assert.equal(game.objects[WAN_LIGHT].oc_dir, NODIR);
    assert.notEqual(game.objects[WAN_SLEEP].oc_dir, NODIR);
    typeAtPrompts(HEALER_WAND);
    initRng(49);
    enableRngLog();
    await assert.rejects(
        () => dozap(game),
        /zapnodir\(\) for a directionless wand/u,
    );
    // zappable() spent the charge on the way past and drew nothing for it.
    // weffects()'s exercise(A_WIS, TRUE) precedes the zapnodir() arm, so the
    // one draw the log carries is attrib.c's.
    assert.equal(carriedWand().spe, 3);
    assert.deepEqual(getRngLog(), ['rn2(19)=3']);
});

test('a secret-door-detection wand reports an empty findit result', async () => {
    // The starting room on seed 7830001 has no findone() discovery within the
    // visible BOLT_LIM area. Reusing its Healer inventory supplies the real
    // getobj(), charge, weffects(), zapnodir(), and dozap() cleanup path.
    const wand = await heroCarryingWand({
        otyp: WAN_SECRET_DOOR_DETECTION,
        spe: 4,
        dknown: true,
    });
    // The selected development boundary already knows the wand type. Keeping
    // this catalog row known makes zapnodir() take observe_object(), not the
    // second exercise(A_WIS, TRUE) that a newly discovered type would spend.
    game.objects[WAN_SECRET_DOOR_DETECTION].oc_name_known = 1;
    typeAtPrompts(HEALER_WAND);
    initRng(49);
    enableRngLog();

    assert.equal(await dozap(game), ECMD_TIME);
    assert.equal(wand.spe, 3);
    assert.equal(game.current_wand, null);
    assert.equal(pendingTopLine(), "You don't find anything.");
    // attrib.c exercise(A_WIS, TRUE) is the command's only draw. Seed 49 puts
    // 3 under its rn2(19); findit() itself draws nothing on an empty scan.
    assert.deepEqual(getRngLog(), ['rn2(19)=3']);
});

test('a findit refusal clears the transient current wand', async () => {
    const wand = await heroCarryingWand({
        otyp: WAN_SECRET_DOOR_DETECTION,
        spe: 4,
        dknown: true,
    });
    game.objects[WAN_SECRET_DOOR_DETECTION].oc_name_known = 1;
    const hidden = game.level.at(game.u.ux + 1, game.u.uy);
    hidden.typ = SDOOR;
    typeAtPrompts(HEALER_WAND);
    initRng(49);
    enableRngLog();

    await assert.rejects(
        () => dozap(game),
        /findone\(\) discovery is not ported/u,
    );
    assert.equal(wand.spe, 3, 'zappable spent the charge before the effect');
    assert.equal(game.current_wand, null);
    assert.equal(hidden.typ, SDOOR, 'the fail-closed preflight changed nothing');
});

test('empty secret-door detection discovers a seen unknown wand', async () => {
    // zapnodir() treats findit()'s feedback as observable even when its count
    // is zero. A seen wand therefore takes the shared learnwand() tail after
    // the scan and discovers its catalog row.
    const wand = await heroCarryingWand({
        otyp: WAN_SECRET_DOOR_DETECTION,
        spe: 4,
        dknown: true,
    });
    game.objects[WAN_SECRET_DOOR_DETECTION].oc_name_known = 0;
    game.objects[WAN_SECRET_DOOR_DETECTION].oc_encountered = 0;
    typeAtPrompts(HEALER_WAND);
    initRng(49);
    enableRngLog();

    assert.equal(await dozap(game), ECMD_TIME);
    assert.equal(wand.spe, 3);
    assert.equal(game.objects[WAN_SECRET_DOOR_DETECTION].oc_name_known, 1);
    assert.equal(game.objects[WAN_SECRET_DOOR_DETECTION].oc_encountered, 1);
    assert.equal(game.current_wand, null);
    assert.equal(pendingTopLine(), "You don't find anything.");
    // weffects() exercises Wisdom first. learnwand() then reaches makeknown(),
    // whose discover_object() exercises it again; seed 49 supplies both
    // source-bounded rn2(19) results in that order.
    assert.deepEqual(getRngLog(), ['rn2(19)=3', 'rn2(19)=16']);
});

test('a wand with no charge left says so and crumbles', async () => {
    // zap.c:2645-2646 and the tail at 2677-2679. zappable() answers 0 for a
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
    // The `else` at zap.c:2680-2681, which is what separates `spe < 0` from
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
    // zap.c:2654's `if (!Blind)`. OPTIONS:blind is the one source of blindness
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
    // zap.c:2647. The draw sits inside the condition, so it is spent whether
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

test('a self-zap of sleep puts the hero under for rnd(50) turns', async () => {
    // zap.c:2851-2866 into timeout.c fall_asleep(-rnd(50), TRUE). Seed 49 puts
    // 27 at the head of the stream, which is the same length the recorded
    // Healer sleeps for.
    const wand = await heroCarryingWand({ spe: 4 });
    const waited = game.moves;
    // mondata.c monstunseesu() (1579-1581) clears M_SEEN_SLEEP from every
    // living monster that can see the hero. Nothing in the port reads
    // seen_resistance yet, so these two monsters are the only thing that can
    // show the call happened. The first is put beside the hero, which is all
    // m_canseeu() reads besides Invis and u.uinwater; the second stays where
    // the level put it, out of the hero's line of sight, and is what shows the
    // call is selective rather than a sweep of the whole list.
    const [watcher, distant] = levelMonsters();
    assert.ok(watcher && distant, 'the level generated two monsters');
    watcher.mx = game.u.ux + 1;
    watcher.my = game.u.uy;
    assert.equal(m_canseeu(watcher, game), true);
    assert.equal(m_canseeu(distant, game), false);
    watcher.seen_resistance = M_SEEN_SLEEP;
    distant.seen_resistance = M_SEEN_SLEEP;
    typeAtPrompts(HEALER_WAND, SELF_KEY);
    initRng(49);
    enableRngLog();
    assert.equal(await dozap(game), ECMD_TIME);
    assert.equal(watcher.seen_resistance, 0);
    assert.equal(distant.seen_resistance, M_SEEN_SLEEP);
    // pline_The() prefixes "The " (pline.c:413-421). The sleep spends exactly
    // one draw: the Healer's wand type is already discovered, so learnwand()
    // takes its observe_object() arm and makeknown() is not reached.
    assert.equal(pendingTopLine(), 'The sleep ray hits you!');
    assert.deepEqual(getRngLog(), ['rnd(50)=27']);

    // nomul() stores the countdown negative, which is how allmain.c tells an
    // immobile hero from a hero repeating a command.
    assert.equal(game.multi, -27);
    assert.equal(game.multi_reason, 'sleeping');
    // Both of these are written after nomul(), which clears them: nomul(0)
    // from stop_occupation() clears the reason, and nomul() of any value
    // zeroes u.usleep. u.usleep is what trap.c unconscious() reads, so a
    // zero here would leave the sleeping hero metabolizing as if awake.
    assert.equal(game.u.usleep, game.moves);
    assert.equal(game.moves, waited);
    assert.equal(game.nomovemsg, 'You wake up.');
    // The turn and the charge are spent, and the hero takes no damage: C's
    // losehp() arm needs a nonzero zapyourself() result, and the sleep arm
    // leaves damage at 0.
    assert.equal(carriedWand().spe, 3);
    assert.equal(wand.owornmask ?? 0, 0);
});

test('a self-zap discovers an unfamiliar wand and credits the hero',
    async () => {
    // learnwand()'s `!oc_name_known` arm (zap.c:141-148) into hack.h:1530
    // makeknown(), whose fourth discover_object() argument runs
    // exercise(A_WIS, TRUE) and its rn2(19). u_init.c already discovered the
    // Healer's wand as it handed it over, so the arm needs that undone.
    await heroCarryingWand({ spe: 4, dknown: false });
    game.objects[WAN_SLEEP].oc_name_known = 0;
    game.objects[WAN_SLEEP].oc_encountered = 0;
    typeAtPrompts(HEALER_WAND, SELF_KEY);
    initRng(49);
    enableRngLog();
    assert.equal(await dozap(game), ECMD_TIME);
    // The discovery follows the sleep: zapyourself() runs its arm first and
    // calls learnwand() only on the way out.
    assert.deepEqual(getRngLog(), ['rnd(50)=27', 'rn2(19)=16']);
    assert.equal(game.objects[WAN_SLEEP].oc_name_known, 1);
    // observe_object() set dknown on the way past, which is what lets the
    // `if (obj->dknown)` below it reach makeknown() on the same zap.
    assert.equal(carriedWand().dknown, true);
});

test('a blind hero learns nothing from a wand they cannot see', async () => {
    // The `if (!Blind)` at zap.c:143 holds observe_object() back, so dknown
    // stays clear and the makeknown() under it is skipped: the sleep is the
    // only thing that happens, and its draw is the only one spent.
    const segment = segmentFor(`${ZAP_KEY}${HEALER_WAND}${ESCAPE_KEY}`,
        loadZapCommandRecipe(), BLIND);
    await runSegment({ ...segment, moves: '.' });
    const wand = carriedWand();
    Object.assign(wand, { spe: 4, dknown: false });
    game.objects[WAN_SLEEP].oc_name_known = 0;
    game.objects[WAN_SLEEP].oc_encountered = 0;
    typeAtPrompts(HEALER_WAND, SELF_KEY);
    initRng(49);
    enableRngLog();
    assert.equal(await dozap(game), ECMD_TIME);
    assert.deepEqual(getRngLog(), ['rnd(50)=27']);
    assert.equal(game.objects[WAN_SLEEP].oc_name_known, 0);
    assert.equal(game.objects[WAN_SLEEP].oc_encountered, 0);
    assert.equal(carriedWand().dknown, false);
    // A blind hero is still told what hit them: zap.c:2860 has no Blind guard.
    assert.equal(pendingTopLine(), 'The sleep ray hits you!');
    assert.equal(game.multi, -27);

    // The state zap.c:143-144's comment describes: a wand picked up while
    // sighted and zapped after going blind. dknown is already set, so the
    // `if (obj->dknown)` under the skipped observe_object() still holds and
    // makeknown() runs. It is the one route to the discovery ledger that
    // observe_object() has not marked the type encountered on first.
    await runSegment({ ...segment, moves: '.' });
    Object.assign(carriedWand(), { spe: 4, dknown: true });
    game.objects[WAN_SLEEP].oc_name_known = 0;
    game.objects[WAN_SLEEP].oc_encountered = 0;
    typeAtPrompts(HEALER_WAND, SELF_KEY);
    initRng(49);
    enableRngLog();
    assert.equal(await dozap(game), ECMD_TIME);
    assert.deepEqual(getRngLog(), ['rnd(50)=27', 'rn2(19)=16']);
    assert.equal(game.objects[WAN_SLEEP].oc_name_known, 1);
    // makeknown()'s second discover_object() argument, which is the only thing
    // that can raise oc_encountered on this route.
    assert.equal(game.objects[WAN_SLEEP].oc_encountered, 1);
});

test('a hero who resists sleep stops before the sleep ray is rolled',
    async () => {
    // zap.c:2854-2857. Sleep_resistance is youprop.h:36's plain "either
    // source" test, so an intrinsic alone selects the arm. No race or role the
    // port starts today has it, so it is written in directly.
    await heroCarryingWand({ spe: 4 });
    game.u.uprops[SLEEP_RES] = { intrinsic: FROMOUTSIDE, extrinsic: 0 };
    typeAtPrompts(HEALER_WAND, SELF_KEY);
    initRng(49);
    enableRngLog();
    await assert.rejects(
        () => dozap(game),
        /shieldeff\(\) and monstseesu\(\) for a sleep-resistant hero/u,
    );
    // The refusal precedes the rnd(50), so the arm is chosen before the roll.
    assert.deepEqual(getRngLog(), []);
    // The extrinsic half selects the same arm on its own.
    await heroCarryingWand({ spe: 4 });
    game.u.uprops[SLEEP_RES] = { intrinsic: 0, extrinsic: W_ARMH };
    typeAtPrompts(HEALER_WAND, SELF_KEY);
    await assert.rejects(
        () => dozap(game), UnsupportedZapError,
    );
});

test('a self-zap of anything but sleep stops where C calls impossible',
    async () => {
    // zapyourself()'s `default:` (zap.c:3004-3006). WAN_DIGGING is an
    // ordinary aimed wand with an arm of its own that this port has not
    // reached; the refusal names the type so a session that stops here says
    // which wand it wanted.
    await heroCarryingWand({ otyp: WAN_DIGGING, spe: 4 });
    typeAtPrompts(HEALER_WAND, SELF_KEY);
    initRng(49);
    enableRngLog();
    await assert.rejects(
        () => dozap(game),
        new RegExp(`zapyourself\\(\\) for object type ${WAN_DIGGING}`, 'u'),
    );
    assert.deepEqual(getRngLog(), []);
});

test('zapping unpaid merchandise inside a shop stops at the usage fee',
    async () => {
    // zap.c:2642's check_unpaid(obj), which sits between the object prompt and
    // the charge. A wand the hero has not paid for still has charges, so
    // shk.c:5695-5697 falls through -- into the port's refusal, which is wider
    // than the fee: this level has no shopkeeper, so C would return at 5700
    // and bill nothing. What the case pins is where the command stops, not
    // that C would charge here.
    const wand = await heroCarryingWand({ unpaid: true, spe: 4 });
    game.u.ushops[0] = ROOMOFFSET;
    typeAtPrompts(HEALER_WAND);
    initRng(49);
    enableRngLog();
    await assert.rejects(
        () => dozap(game), UnsupportedShopError,
    );
    // C calls check_unpaid() above zappable(), so the refusal precedes the
    // charge and every draw the command could take.
    assert.equal(wand.spe, 4);
    assert.deepEqual(getRngLog(), []);

    // The last charge is what that order is worth. Reversed, zappable() would
    // take spe to 0 first and shk.c:5696's `(spe <= 0 && oc_charged)` conjunct
    // would then excuse the fee, so the command would run to the end: the
    // self-zap key queued below would be read and the hero would fall asleep
    // in a shop C bills.
    const lastCharge = await heroCarryingWand({ unpaid: true, spe: 1 });
    game.u.ushops[0] = ROOMOFFSET;
    typeAtPrompts(HEALER_WAND, SELF_KEY);
    initRng(49);
    enableRngLog();
    await assert.rejects(
        () => dozap(game), UnsupportedShopError,
    );
    assert.equal(lastCharge.spe, 1);
    assert.deepEqual(getRngLog(), []);
});

test('a zap under perm_invent stops at the inventory window', async () => {
    // zap.c:2681's update_inventory(), whose comment reads "maybe used a
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

// -- Death ray self-zap tests ------------------------------------------------

test('the death ray survive path restores the hero after declining death',
    async () => {
    // zapyourself() WAN_DEATH arm sets killer.name and format, prints the
    // irradiation and death messages, then calls done(DIED). In wizard mode,
    // done() asks "Die? [yn]". Answering 'n' calls savelife() which restores
    // the hero to a viable state and returns normally. The segment covers the
    // full survive path: wish for a wand of death, zap self, answer 'n', then
    // a trailing wait that resumes normal play.
    const recipe = loadZapDeathRayRecipe();
    // First segment is the survive path (answers 'n' to Die?).
    const segment = recipe.segments[0];
    await runSegment(segment);
    // After surviving and resuming play, the hero is alive with restored HP.
    // savelife() uses effective_attribute(CON) to compute givehp; on a Valkyrie
    // with 16 CON: givehp = 50 + 10 * floor(16/2) = 130, but uhpmax on this
    // seed is lower, capping the result.
    assert.ok(game.u.uhp > 0, 'hero HP positive after surviving death ray');
    // The killer is cleared by done()'s survive return path (end.c:1120-1121).
    assert.equal(game.killer.name, '', 'killer name cleared after survival');
    // umortality tracks that a death occurred.
    assert.equal(game.u.umortality, 1, 'mortality counter incremented');
});

test('the death ray accept-death path reaches really_done()',
    async () => {
    // Second segment: answer 'y' to Die?, which enters really_done(). On this
    // seed (D:1, low level) can_make_bones() returns false, so really_done()
    // proceeds through disclosure. The segment completes normally because all
    // the input is consumed and the game ends.
    const recipe = loadZapDeathRayRecipe();
    const segment = recipe.segments[1];
    await runSegment(segment);
    assert.equal(game.program_state.gameover, 1,
        'gameover flag set by really_done()');
    assert.equal(game.u.uhp, 0, 'hero HP is zero after accepting death');
    assert.equal(game.u.umortality, 1, 'mortality counter incremented');
});

test('the death ray recipe covers both paths', () => {
    const recipe = loadZapDeathRayRecipe();
    assert.equal(recipe.version, 5, 'version 5 recipe');
    assert.equal(recipe.segments.length, 2,
        'two segments: survive and die');
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ), 'no recorded steps (replay inputs only)');
    // Both segments use wizard mode.
    assert.ok(recipe.segments.every(
        ({ nethackrc }) => nethackrc.includes('playmode:debug'),
    ), 'both segments are wizard-mode');
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
    // The self key at the direction prompt, which is the one answer that
    // reaches zapyourself(). Three segments type it, and each closes with the
    // wait that proves the sleep ran itself out first.
    assert.equal(
        typed.filter(
            (moves) => moves === `.${ZAP_KEY}${HEALER_WAND}${SELF_KEY}.`,
        ).length,
        3,
    );
    // The seed list is the separate tripwire for a silent re-recording.
    assert.deepEqual(recipe.segments.map(({ seed }) => seed),
        [7830001, 7830011, 7830001, 7830001, 7830001, 7830002, 7830031,
            7830001, 7830021, 8210001, 8210011, 8210005]);
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

test('the discovery matrix zaps a wand whose type is not yet known', () => {
    const recipe = loadZapDiscoveryRecipe();
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    // Debug mode, because the wish is the only way to hold a wand whose type
    // is undiscovered: u_init.c ini_inv_use_obj() discovers the Healer's.
    // The wish names no charges and no beatitude, so nothing distracts from
    // the discovery the zap itself makes.
    assert.deepEqual(
        recipe.segments.map(({ moves, nethackrc, seed }) => [
            seed,
            /\x17([^\n]*)\n/u.exec(moves)[1],
            moves.endsWith(`${ZAP_KEY}${WISHED_WAND}${SELF_KEY}.`),
            nethackrc.includes('playmode:debug'),
        ]),
        [[8210002, 'wand of sleep', true, true]],
    );
});

test('every zap refusal names a zap.c function the port has not ported',
    () => {
    const source = readFileSync(
        new URL('../js/zap.js', import.meta.url), 'utf8',
    );
    // Every refusal the file carries, in source order, and nothing else: an
    // extra one would mean an arm that C runs and this port does not. Each
    // entry is the C function the refusal names, which is the text up to its
    // first parenthesis.
    //
    // The first four are the `z` command's own, above the ray:
    //
    // - backfire() and weffects() are two of dozap()'s five effect arms;
    //   weffects() no longer stops, so only backfire() is left here.
    // - losehp() is dozap()'s self arm reacting to damage. zapyourself()
    //   returns 0 for the one object type it handles, so nothing reaches it.
    // - shieldeff() stands for the Sleep_resistance half of zapyourself()'s
    //   WAN_SLEEP arm, which also needs monstseesu().
    // - zapyourself() is that function's `default:`, where C calls
    //   impossible(); it covers every object type but the two that sleep.
    //
    // The rest are the ray's, in the order the section declares them:
    // flash_str(), zap_hit(), zhitu(), zap_over_floor(), dobuzz(), ubuzz()
    // and weffects().
    assert.deepEqual(
        [...source.matchAll(
            /new UnsupportedZapError\(\s*['"`]([^'"`]*)/gu,
        )].map(([, text]) => text.split('(')[0]),
        [
            // dozap() and zapyourself().
            'backfire', 'losehp', 'shieldeff', 'zapyourself',
            // resist(): the shieldeff_mon() and killed-by-damage arms.
            'shieldeff_mon', 'resist',
            // zhitm() monster arm: the cold-spell arm and the non-cold types.
            'spell_damage_bonus', 'zhitm',
            // flash_str() and zap_hit().
            'rnd_hallublast', 'spell_hit_bonus',
            // zhitu(): the fire-resistant hero and the other six damage types.
            'zhitu', 'zhitu',
            // zap_over_floor(): the exploding-wand caller, then the four
            // terrains the fire arm acts on, the cold arm's two, poison gas,
            // iron bars, and the three arms of the shared tail.
            'zap_over_floor',
            'delfloortrap', 'melt_ice', 'create_gas_cloud', 'dryup',
            'start_melt_ice_timeout', 'start_melt_ice_timeout',
            'create_gas_cloud', 'dissolve_bars',
            'cvt_sdoor_to_door', 'add_damage', 'burn_floor_objects', 'wakeup',
            // dobuzz(): a type that is not a hero wand zap, a hallucinating
            // hero, the swallowed hero, the Rider arm, PM_DEATH absorption,
            // disintegrate_mon(), armor disintegration, slept_monst(), the
            // steed, the reflecting hero, lightning's flashburn(), the Plane
            // of Air and the shop door.
            'dobuzz', 'rnd_hallublast', 'dobuzz',
            'dobuzz', 'dobuzz', 'disintegrate_mon',
            'monster kill path: ${what}',
            'armor disintegration in dobuzz', 'slept_monst',
            'dobuzz',
            'ureflects', 'flashburn', 'Is_airlevel', 'pay_for_damage',
            // zapnodir() retains its default for the other directionless
            // types. weffects() then retains the steed, immediate wand,
            // digging, cast spell, and C impossible() refusals.
            'zapnodir', 'zap_steed', 'zapsetup', 'zap_dig', 'ubuzz',
            'weffects',
        ],
    );
});
