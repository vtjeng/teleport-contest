import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    BLINDED,
    D_CLOSED,
    D_ISOPEN,
    DEAF,
    DOOR,
    DUST,
    LA_UP,
    STAIRS,
    WOUNDED_LEGS,
} from '../js/const.js';
import { commandKeyCode } from '../js/command_bindings.js';
import { dist2 } from '../js/hacklib.js';
import { engr_at, make_engr_at } from '../js/engrave.js';
import { rhack } from '../js/cmd.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    KICK,
    KICK_CASES,
    KICK_EXT,
    SEARCH,
    VALKYRIE_CHARACTER,
    kickCaseFor,
    kickSegment,
    loadKickCommandRecipe,
} from './run-kick-command.mjs';

function cSource(file) {
    return readFileSync(
        new URL(`../nethack-c/upstream/${file}`, import.meta.url), 'utf8',
    ).split('\n');
}
// split('\n') is zero-based and C line numbers are one-based.
const DOKICK_C = cSource('src/dokick.c');
const CMD_C = cSource('src/cmd.c');
const HACK_C = cSource('src/hack.c');
const MON_C = cSource('src/mon.c');
const SKILLS_H = cSource('include/skills.h');
const lineOf = (source, number) => source[number - 1].trim();

// Every case runs from the same fixed clock and rc the matrix records with, so
// a test and its recorded reference cannot drift apart. Two cases share seed
// 6600001 and the same keys and differ only in the role, so the lookup is by
// label; loadKickCommandRecipe() builds one segment per case, in order.
function segmentFor(label) {
    const index = KICK_CASES.findIndex((entry) => entry.label === label);
    assert.ok(index >= 0, `the matrix has a case named ${label}`);
    const segment = loadKickCommandRecipe().segments[index];
    assert.equal(segment.seed, KICK_CASES[index].seed);
    assert.equal(segment.moves, KICK_CASES[index].moves);
    return segment;
}

// Replay one matrix segment, or a prefix of one, and report what the port
// stopped on. A refused arm ends the segment through onBoundary rather than
// throwing, which is the same contract the scorer sees.
async function replay(segment, moves) {
    let boundary = null;
    const nhGame = await runSegment(
        { ...segment, moves },
        { onBoundary: (error) => { boundary = error; } },
    );
    return {
        boundary,
        rngLog: nhGame.getRngLog() ?? [],
        draws: (nhGame.getRngLog() ?? []).length,
        toplines: game._ttyToplines ?? '',
        turns: game.moves,
        kickedloc: game.gk?.kickedloc ?? null,
    };
}

// The Monk of seed 6600001 has plain floor to the west and a monster to the
// north.
const MONK = () => segmentFor('martial');
// The Valkyrie of the same seed starts in a different room: plain floor west,
// wall north.
const VALKYRIE = () => segmentFor('lowDex');
// The Valkyrie of seed 6600007 has a doorway to the south-east.
const DOOR_VALKYRIE = () => segmentFor('highDex');
// Seed 6600002 leaves an object on the plain floor north-west of its Valkyrie,
// which is the only one of these four refusals no matrix seed offers. It is a
// refusal, so it stays out of the recorded matrix; the deferral
// kick-targets-beyond-empty-floor records its inputs alongside the other three.
const OBJECT_PILE = () => kickSegment({
    seed: 6600002, character: VALKYRIE_CHARACTER, moves: `${KICK}y`,
});

test('the matrix holds replay inputs only', () => {
    const recipe = loadKickCommandRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    for (const segment of recipe.segments) {
        assert.match(segment.nethackrc, /OPTIONS=name:Kicker,/u);
        // Every case ends with a search, so a kick that wrongly spent or
        // wrongly saved a turn moves the counter on the screen after it.
        assert.ok(segment.moves.endsWith(SEARCH));
    }
    // The seed list is the tripwire for a silent re-recording. Each seed was
    // found by scanning upward from 6600001 for a start with the neighbouring
    // terrain and the Dexterity its case needs, so a changed seed means a
    // changed case.
    assert.deepEqual(
        recipe.segments.map(({ seed }) => seed),
        [6600001, 6600001, 6600007, 6600006, 6600001, 6600001, 6600001],
    );
});

test('every matrix segment is verified against its own case', () => {
    // loadKickCommandRecipe() builds one segment per case, in order, so the
    // two must line up by index. `martial` and `lowDex` share a seed and the
    // same keys, so a lookup keyed on those alone answers both segments with
    // `martial` and never checks the Valkyrie against her own expectations.
    const { segments } = loadKickCommandRecipe();
    assert.equal(segments.length, KICK_CASES.length);
    segments.forEach((segment, index) => {
        assert.equal(kickCaseFor(segment).label, KICK_CASES[index].label);
    });
});

test('the matrix separates the three terms of kick_dumb()\'s test', () => {
    // dokick.c:867 is the line the matrix exists to pin. Its three terms
    // short-circuit in order, so which of them answers TRUE decides whether
    // the rn2(3) is drawn -- and therefore where every later draw lands.
    assert.equal(
        lineOf(DOKICK_C, 867),
        'if (martial() || ACURR(A_DEX) >= 16 || rn2(3)) {',
    );
    assert.equal(lineOf(DOKICK_C, 866), 'exercise(A_DEX, FALSE);');
    assert.equal(lineOf(DOKICK_C, 868), 'You("kick at empty space.");');
    assert.equal(
        lineOf(DOKICK_C, 872),
        'pline("Dumb move!  You strain a muscle.");',
    );
    assert.equal(lineOf(DOKICK_C, 873), 'exercise(A_STR, FALSE);');
    assert.equal(
        lineOf(DOKICK_C, 874),
        'set_wounded_legs(RIGHT_SIDE, 5 + rnd(5));',
    );
    // skills.h:81 is the whole first term: the Monk and the Samurai are the
    // two roles it answers TRUE for.
    assert.equal(
        lineOf(SKILLS_H, 81),
        '#define martial_bonus() (Role_if(PM_SAMURAI) || Role_if(PM_MONK))',
    );

    const byLabel = new Map(KICK_CASES.map((entry) => [entry.label, entry]));
    const martial = byLabel.get('martial');
    const lowDex = byLabel.get('lowDex');
    // The first term is isolated only while these two agree on everything
    // else. Same seed, same keys; only the role differs.
    assert.equal(martial.seed, lowDex.seed);
    assert.equal(martial.moves, lowDex.moves);
    assert.equal(martial.character.role, 'Monk');
    assert.equal(lowDex.character.role, 'Valkyrie');
    // Exactly one case takes the strain arm, and it is the only case whose
    // verifier expects wounded legs.
    assert.deepEqual(
        KICK_CASES.filter(({ strained }) => strained).map(
            ({ label }) => label,
        ),
        ['strain'],
    );
});

test('kicking empty floor prints one line and spends the turn', async () => {
    // dokick.c:1251, kick_nondoor()'s final else, through kick_dumb():868.
    const before = await replay(MONK(), '');
    const after = await replay(MONK(), `${KICK}h`);
    assert.equal(after.boundary, null);
    assert.equal(after.toplines, 'You kick at empty space.');
    assert.equal(after.turns, before.turns + 1);
    assert.equal(lineOf(DOKICK_C, 1251), 'kick_dumb(x, y);');
});

// The draws one kick turn made, in order. Everything before the launch's own
// total belongs to startup, and the hero's command is the first thing the turn
// runs, so the kick's draws head this slice. A whole-turn count cannot stand
// in for it: monster movement follows the kick and differs between roles.
async function kickTurnDraws(segment, moves) {
    const base = await replay(segment, '');
    const kicked = await replay(segment, moves);
    return { kicked, draws: kicked.rngLog.slice(base.draws) };
}

test('martial() keeps the rn2(3) out of a Monk\'s kick', async () => {
    // The Monk and the Valkyrie of seed 6600001 both roll Dexterity below 16,
    // so the second term of :867 answers FALSE for both and only
    // martial_bonus() separates them.
    const monk = await kickTurnDraws(MONK(), `${KICK}h`);
    const valkyrie = await kickTurnDraws(VALKYRIE(), `${KICK}h`);
    assert.equal(monk.kicked.toplines, 'You kick at empty space.');
    assert.equal(valkyrie.kicked.toplines, 'You kick at empty space.');
    // exercise(A_DEX, FALSE) at :866 is the first draw of the turn for both.
    assert.match(monk.draws[0], /^rn2\(2\)=/u);
    assert.match(valkyrie.draws[0], /^rn2\(2\)=/u);
    // The Valkyrie pays for the third term immediately afterwards. The Monk
    // does not: his next draw belongs to the monsters that move after him.
    assert.match(valkyrie.draws[1], /^rn2\(3\)=[12]$/u);
    assert.doesNotMatch(monk.draws[1], /^rn2\(3\)=/u);
});

test('the strain arm wounds a leg and the ordinary arm does not', async () => {
    // dokick.c:872-874. Seed 6600006 is the case whose rn2(3) lands on 0.
    const strain = await kickTurnDraws(segmentFor('strain'), `${KICK}h`);
    assert.equal(strain.kicked.boundary, null);
    assert.equal(strain.kicked.toplines, 'Dumb move!  You strain a muscle.');
    // :866, :867, :873 and :874 in that order: the Dexterity exercise, the
    // rn2(3) that landed on 0, the Strength exercise, and the rnd(5) inside
    // set_wounded_legs().
    assert.match(strain.draws[0], /^rn2\(2\)=/u);
    assert.equal(strain.draws[1], 'rn2(3)=0');
    assert.match(strain.draws[2], /^rn2\(2\)=/u);
    assert.match(strain.draws[3], /^rnd\(5\)=/u);
    // set_wounded_legs(RIGHT_SIDE, 5 + rnd(5)) writes a timeout of 6 through
    // 10 and takes a point of temporary Dexterity with it.
    const wounded = game.u.uprops[WOUNDED_LEGS].intrinsic;
    assert.ok(wounded >= 6 && wounded <= 10, `timeout ${wounded}`);
    assert.equal(game.u.atemp[3], -1); /* A_DEX */

    const plain = await replay(MONK(), `${KICK}h`);
    assert.equal(plain.toplines, 'You kick at empty space.');
    assert.equal(game.u.uprops[WOUNDED_LEGS].intrinsic, 0);
    assert.equal(game.u.atemp[3], 0);
});

test('an unported target stops the command before it draws or prints',
    async () => {
    // Each refusal must leave the turn, the PRNG and the top line exactly as
    // the direction prompt left them, because the segment keeps every frame
    // matched so far and the next replay resumes from the same keystroke.
    // The door case that was here is now ported (kick_door failure branch).
    const cases = [
        [MONK(), `${KICK}k`, /monster arm/u],
        [VALKYRIE(), `${KICK}k`, /wall and upward-stairs arm/u],
        [OBJECT_PILE(), `${KICK}y`, /object-pile arm/u],
    ];
    for (const [segment, moves, reason] of cases) {
        const base = await replay(segment, '');
        const kick = await replay(segment, moves);
        assert.ok(kick.boundary, `${moves} refused`);
        assert.match(kick.boundary.message, reason);
        assert.equal(kick.draws, base.draws, `${moves} drew nothing`);
        assert.equal(kick.turns, base.turns, `${moves} spent no turn`);
        // getdir()'s prompt is the last thing written; no kick message
        // followed it.
        assert.match(kick.toplines, /^In what direction\?/u);
    }
});

test('sixteen points of Dexterity are enough to skip the rn2(3)',
    async () => {
    // :867's second term. The Valkyrie of seed 6600007 rolled exactly 16,
    // which is the boundary the comparison sits on: at 15 she would draw.
    const highDex = await kickTurnDraws(DOOR_VALKYRIE(), `${KICK}h`);
    assert.equal(highDex.kicked.toplines, 'You kick at empty space.');
    assert.match(highDex.draws[0], /^rn2\(2\)=/u);
    assert.doesNotMatch(highDex.draws[1], /^rn2\(3\)=/u);
});

test('a strained muscle refuses the next kick', async () => {
    // dokick.c:1279, the Wounded_legs guard, reached from the state the strain
    // arm left behind. This is the only guard a replay can reach without
    // polymorphing the hero or loading her down.
    const first = await replay(segmentFor('strain'), `${KICK}h`);
    assert.equal(first.toplines, 'Dumb move!  You strain a muscle.');
    const second = await replay(segmentFor('strain'), `${KICK}h${KICK}`);
    assert.ok(second.boundary, 'the second kick was refused');
    assert.match(second.boundary.message, /wounded-legs guard/u);
    // The guard runs above getdir(), so the second '^D' prints no prompt of
    // its own and the strain line is still the last thing written.
    assert.equal(second.toplines, 'Dumb move!  You strain a muscle.');
    assert.equal(second.turns, first.turns);
});

test('kicking the staircase the hero stepped off refuses', async () => {
    // dokick.c:1242-1249. The hero starts on the up staircase, so one step
    // west and a kick east is the shortest way to reach that arm. LA_UP is
    // what sends it to kick_ouch() instead of kick_dumb().
    const base = await replay(MONK(), '');
    assert.equal(base.boundary, null);
    const start = game.level.at(game.u.ux, game.u.uy);
    assert.equal(start.typ, STAIRS);
    assert.equal(start.ladder, LA_UP);

    const kicked = await replay(MONK(), `h${KICK}l`);
    assert.ok(kicked.boundary, 'the staircase kick was refused');
    assert.match(kicked.boundary.message, /wall and upward-stairs arm/u);
    assert.match(kicked.toplines, /^In what direction\?/u);
});

test('a kicked square is remembered, and every later command forgets it',
    async () => {
    // dokick.c:1325 writes gk.kickedloc, monmove.c m_avoid_kicked_loc() reads
    // it, and two sites clear it. This is the only state the kick leaves
    // behind that no screen reports.
    assert.equal(
        lineOf(HACK_C, 2708), 'gk.kickedloc.x = 0, gk.kickedloc.y = 0;',
    );
    assert.equal(lineOf(CMD_C, 3821), 'if (func != dokick) {');

    const kick = await replay(VALKYRIE(), `${KICK}h`);
    assert.deepEqual(kick.kickedloc, { x: game.u.ux - 1, y: game.u.uy });

    // cmd.c rhack():3821, reached through the search arm.
    const searched = await replay(VALKYRIE(), `${KICK}h${SEARCH}`);
    assert.deepEqual(searched.kickedloc, { x: 0, y: 0 });

    // hack.c domove():2708, reached by stepping east afterwards.
    const moved = await replay(VALKYRIE(), `${KICK}hl`);
    assert.deepEqual(moved.kickedloc, { x: 0, y: 0 });

    // The same rhack() test with `func` still holding doextcmd(), which is
    // what the '#' key's row supplies: '#kick' forgets the square at once.
    const prompted = await replay(MONK(), `${KICK_EXT}h`);
    assert.equal(prompted.toplines, 'You kick at empty space.');
    assert.deepEqual(prompted.kickedloc, { x: 0, y: 0 });

    // cmd.c:3821 once more, this time through an arm whose handler answers a
    // boolean rather than an ECMD code. invent.c look_here() returns
    // ECMD_TIME only for a blind hero (invent.c:4160, :4248, :4314), and
    // nothing ported writes u.uprops[BLINDED] yet, so the timeout is set on
    // the replayed game rather than earned in it. 100 is any nonzero
    // remaining timeout; the value never counts down here.
    const blind = await replay(VALKYRIE(), `${KICK}h`);
    assert.deepEqual(blind.kickedloc, { x: game.u.ux - 1, y: game.u.uy });
    game.u.uprops[BLINDED].intrinsic = 100;
    game.nhDisplay.pushKey(commandKeyCode(':'));
    // A blind look prints the feel line, the staircase this hero stands on
    // and "You feel no objects here.", so the spaces answer the --More--
    // between them; any left over stay queued and are never read.
    for (const space of '   ') game.nhDisplay.pushKey(commandKeyCode(space));
    await rhack(0, game);
    assert.equal(game.context.move, 1, 'the blind look spent the turn');
    assert.deepEqual(game.gk.kickedloc, { x: 0, y: 0 });
});

test('a direction prompt answering nothing spends no turn', async () => {
    // dokick.c:1318-1321, both cancels. ESC leaves getdir() at 0; '.' writes
    // <0,0,0> and dokick() tests u.dx and u.dy itself.
    const base = await replay(MONK(), '');
    for (const answer of ['\x1b', '.']) {
        const cancelled = await replay(MONK(), `${KICK}${answer}`);
        assert.equal(cancelled.boundary, null);
        assert.equal(cancelled.turns, base.turns);
        assert.equal(cancelled.draws, base.draws);
        // Nothing was kicked, so nothing was recorded to avoid.
        assert.equal(cancelled.kickedloc, null);
    }
});

test('the kick wakes the neighbourhood before it examines the square',
    async () => {
    // dokick.c:1383-1384 run above all five target tests, so an arm refused
    // below them has still paid for both. mon.c wake_nearby() is the reason
    // the radius grows with experience level.
    assert.equal(lineOf(DOKICK_C, 1383), 'wake_nearby(FALSE);');
    assert.equal(lineOf(DOKICK_C, 1384), 'u_wipe_engr(2);');
    assert.equal(
        lineOf(MON_C, 4369),
        'wake_nearto_core(u.ux, u.uy, u.ulevel * 20, petcall);',
    );

    // Neither call reaches a screen or a draw count in this room, so the two
    // are pinned on the state they leave: the sleep flag mon.c
    // wake_nearto_core() clears, and the engraving engrave.c wipe_engr_at()
    // rubs at. The kick is driven a key at a time so that the setup can sit
    // between the level and the command.
    await replay(MONK(), '');
    const asleep = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        monster.msleeping = true;
        asleep.push({
            monster,
            near: dist2(monster.mx, monster.my, game.u.ux, game.u.uy)
                < game.u.ulevel * 20,
        });
    }
    // This seed puts one monster one square from the hero and three across
    // the level, so the radius has a case on each side of it.
    assert.equal(asleep.filter(({ near }) => near).length, 1);
    assert.equal(asleep.filter(({ near }) => !near).length, 3);
    // "Elbereth" holds eight non-blank bytes, and wipeout_text() replaces one
    // byte per count, so two counts always change it.
    make_engr_at(game.u.ux, game.u.uy, 'Elbereth', null, game.moves, DUST,
        { state: game });

    for (const key of `${KICK}h   `)
        game.nhDisplay.pushKey(commandKeyCode(key));
    await rhack(0, game);

    for (const { monster, near } of asleep) {
        assert.equal(Boolean(monster.msleeping), !near,
            `the monster at ${monster.mx},${monster.my}`);
    }
    assert.notEqual(engr_at(game.u.ux, game.u.uy, game).engr_txt[0],
        'Elbereth');
});

// --- kick_door() tests (dokick.c:908-970) ---

// Set the square to the hero's west to a closed door. Returns the maploc.
// Called after replay() has set up the game state, before manually pushing
// the kick key sequence.
function setDoorWest(mask) {
    const x = game.u.ux - 1;
    const y = game.u.uy;
    const loc = game.level.at(x, y);
    loc.typ = DOOR;
    loc.flags = mask;
    loc.doormask = mask;
    return loc;
}

test('kicking a closed door and failing prints Whammm!! or Thwack!!',
    async () => {
    // dokick.c:959-966. The failure branch exercises Strength and prints
    // "Whammm!!" when rn2(3) is nonzero and the hero can hear, or "Thwack!!"
    // otherwise.
    assert.equal(
        lineOf(DOKICK_C, 966),
        'pline("%s!!", (Deaf || !rn2(3)) ? "Thwack" : "Whammm");',
    );
    assert.equal(lineOf(DOKICK_C, 962), 'exercise(A_STR, TRUE);');
    assert.equal(lineOf(DOKICK_C, 926), 'exercise(A_DEX, TRUE);');

    // Use the lowDex Valkyrie (seed 6600001) who has attributes low enough
    // that rnl(35) is very likely to exceed avrg_attrib, landing in the
    // failure branch. Set a closed door to the west so `${KICK}h` hits it.
    await replay(VALKYRIE(), '');
    setDoorWest(D_CLOSED);

    for (const key of `${KICK}h   `)
        game.nhDisplay.pushKey(commandKeyCode(key));
    await rhack(0, game);

    // The message is either "Whammm!!" or "Thwack!!"; both are valid
    // depending on the rn2(3) draw.
    assert.match(game._ttyToplines, /^(Whammm|Thwack)!!$/u,
        'door kick failure prints the expected message');
});

test('a deaf hero kicking a closed door always gets Thwack!!', async () => {
    // dokick.c:966 short-circuits: when Deaf is true, rn2(3) is never drawn.
    // The deaf macro (youprop.h:125) reads HDeaf || EDeaf || uroleplay.deaf.
    await replay(VALKYRIE(), '');
    setDoorWest(D_CLOSED);
    // Make the hero deaf via the intrinsic.
    game.u.uprops[DEAF].intrinsic = 100;

    for (const key of `${KICK}h   `)
        game.nhDisplay.pushKey(commandKeyCode(key));
    await rhack(0, game);

    assert.equal(game._ttyToplines, 'Thwack!!',
        'deaf hero always hears Thwack');
});

test('kicking an open door falls through to kick_dumb', async () => {
    // dokick.c:914-917. When the door mask is D_ISOPEN, kick_door calls
    // kick_dumb rather than attempting to break the door.
    await replay(VALKYRIE(), '');
    setDoorWest(D_ISOPEN);

    for (const key of `${KICK}h   `)
        game.nhDisplay.pushKey(commandKeyCode(key));
    await rhack(0, game);

    assert.equal(game._ttyToplines, 'You kick at empty space.',
        'open door goes to kick_dumb');
});

test('avrg_attrib is computed before the door kick', async () => {
    // dokick.c:1327-1331. The average of ACURRSTR, ACURR(A_DEX), and
    // ACURR(A_CON) determines whether the kick succeeds. When avrg_attrib
    // is very high (e.g. kicking boots set it to 99), the hero always
    // succeeds and the success branch is reached.
    assert.equal(
        lineOf(DOKICK_C, 1328),
        'if (uarmf && uarmf->otyp == KICKING_BOOTS)',
    );
    assert.equal(lineOf(DOKICK_C, 1329), 'avrg_attrib = 99;');
});
