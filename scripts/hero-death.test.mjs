import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    ASCENDED,
    BURNING,
    CHOKING,
    CRUSHING,
    DIED,
    DISSOLVED,
    DROWNING,
    ESCAPED,
    GENOCIDED,
    KILLED_BY,
    KILLED_BY_AN,
    LIFESAVED,
    MAGIC_PORTAL,
    NO_KILLER_PREFIX,
    PANICKED,
    PARANOID_DIE,
    POISONING,
    QUIT,
    STARVING,
    STONING,
    TRICKED,
    TURNED_SLIME,
} from '../js/const.js';
import { can_make_bones } from '../js/bones.js';
import { UnsupportedEndOfGameError, deaths, done, done_in_by }
    from '../js/end.js';
import { game } from '../js/gstate.js';
import { losehp } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster } from '../js/monst.js';
import { NON_PM, PM_GIANT_BAT, PM_GHOUL, PM_GRID_BUG, PM_WRAITH }
    from '../js/monsters.js';
import {
    EXPLORE_CASE,
    HERO_DEATH_CASES,
    WIZARD_CASE,
    loadHeroDeathRecipe,
} from './run-hero-death.mjs';
import {
    MOUNTED_DEATH_CASE,
    loadMountedDeathRecipe,
    verifyMountedDeathSegment,
} from './run-mounted-death.mjs';

const END_C = readFileSync(
    new URL('../nethack-c/upstream/src/end.c', import.meta.url), 'utf8',
);
const FLAG_H = readFileSync(
    new URL('../nethack-c/upstream/include/flag.h', import.meta.url), 'utf8',
);
const HACK_H = readFileSync(
    new URL('../nethack-c/upstream/include/hack.h', import.meta.url), 'utf8',
);

function integerDefine(source, name) {
    const match = new RegExp(`^#define ${name} +(0x[0-9A-Fa-f]+|[0-9]+)$`, 'mu')
        .exec(source);
    assert.ok(match, `${name} has an integer #define`);
    return Number(match[1]);
}

// A fixed clock with no calendar event, so nothing competes for the top line,
// and a role whose first turn the port already replays.
const DATETIME = '20260311073000';
// attrib.c newhp() combines the Tourist's fixed 8 initial HP with the human
// race's fixed 2. Both random components are zero, so this row is stable.
const STARTING_HP_STATUS = /HP:10\(10\)/u;

function nethackrc(playmode, options = []) {
    return [
        'OPTIONS=name:Doomed,role:Tourist,race:human,gender:male,'
        + `align:neutral${playmode ? `,playmode:${playmode}` : ''}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics',
        ...options.map((option) => `OPTIONS=${option}`),
        '',
    ].join('\n');
}

// Build a controlled done() fixture from a newly started game. Copy the killer
// record that hack.c losehp():4283-4286 would establish, but deliberately
// leave HP and the welcome top line intact so each test can arrange the state
// it needs. The segment types no keys, so every later queued key is read by
// done() itself.
//
// The seed is the wizard case's, so a re-recording that changed the Tourist's
// starting hit points would move both together.
async function dyingGame({ playmode = null, options = [] } = {}) {
    await runSegment({
        seed: WIZARD_CASE.seed,
        datetime: DATETIME,
        nethackrc: nethackrc(playmode, options),
        moves: '',
    });
    game.killer = { name: 'a falling rock trap', format: KILLED_BY_AN };
    return game;
}

function statusRow() {
    return game.nhDisplay.grid[23].map(({ ch }) => ch).join('').trimEnd();
}

// Two keys, because the query reads two. win/tty/topl.c tty_yn_function()
// dismisses whatever --More-- the top line is holding before it draws its own
// prompt, exactly as it does in a real death, where the held line is
// urgent_pline("You die..."). Here it is the welcome message the segment left
// behind. The second key is the answer.
function answerQuery(key) {
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    game.nhDisplay.pushKey(key.charCodeAt(0));
}

async function refusal(how) {
    let caught = null;
    try {
        await done(how, game);
    } catch (error) {
        caught = error;
    }
    assert.ok(caught instanceof UnsupportedEndOfGameError,
              `done(${how}) refused: ${caught?.message ?? '<returned>'}`);
    return caught.message;
}

test('killer formats and ParanoidDie match their C definitions', () => {
    // hack.h:602-604 and flag.h:85. These values select grammar and input
    // mode, so importing them as their own expected values would be circular.
    assert.equal(KILLED_BY_AN, integerDefine(HACK_H, 'KILLED_BY_AN'));
    assert.equal(KILLED_BY, integerDefine(HACK_H, 'KILLED_BY'));
    assert.equal(
        NO_KILLER_PREFIX,
        integerDefine(HACK_H, 'NO_KILLER_PREFIX'),
    );
    assert.equal(PARANOID_DIE, integerDefine(FLAG_H, 'PARANOID_DIE'));
});

test('deaths[] matches C order and supplies unnamed killers', async () => {
    // end.c:44-50, "the array of death". Read the C initializer back rather
    // than a copy of it, so a renamed or reordered row fails here.
    const [, body] = /const char \*deaths\[\] = \{([^}]*)\}/u.exec(END_C);
    const rows = [...body.matchAll(/"([^"]*)"/gu)].map(([, text]) => text);
    // include/hack.h:483-498 runs DIED through ASCENDED. Parse the enum too,
    // so equal drift in const.js and the array index does not validate itself.
    const [, enumBody] = /enum game_end_types \{([^}]*)\}/u.exec(HACK_H);
    const cGameEndValues = Object.fromEntries(
        [...enumBody.matchAll(/^\s*([A-Z_]+)\s*=\s*([0-9]+)/gmu)]
            .map(([, name, value]) => [name, Number(value)]),
    );
    const jsGameEndValues = {
        DIED, CHOKING, POISONING, STARVING, DROWNING, BURNING, DISSOLVED,
        CRUSHING, STONING, TURNED_SLIME, GENOCIDED, PANICKED, TRICKED, QUIT,
        ESCAPED, ASCENDED,
    };
    assert.equal(rows.length, 16);
    assert.deepEqual(jsGameEndValues, cGameEndValues);
    assert.deepEqual([...deaths], rows);

    // done() reads the table only for a caller that named no killer, so the
    // refusal message is where a copied row reaches the running game.
    await dyingGame();
    game.killer.name = '';
    assert.match(await refusal(DIED),
                 new RegExp(`killer "${rows[DIED]}"`, 'u'));
});

test('the status arm forces a full repaint outside the three skip cases',
     async () => {
    await dyingGame();
    // The hero is already at zero, which is where a hit-point death leaves
    // her; the status line still shows the value the last repaint painted.
    game.u.uhp = 0;
    assert.match(statusRow(), STARTING_HP_STATUS);
    await refusal(DIED);
    // end.c:1045-1046. bot() repainted, so the row now carries the zero.
    assert.match(statusRow(), /HP:0\(10\)/u);
});

test('a panicking game skips the status update and clears every flag',
     async () => {
    await dyingGame();
    game.u.uhp = 0;
    game.program_state.panicking = true;
    game.disp.botl = true;
    game.disp.botlx = true;
    game.disp.time_botl = true;
    await refusal(DIED);
    // end.c:1042. No bot(), so the status line still shows the old value.
    assert.match(statusRow(), STARTING_HP_STATUS);
    assert.equal(game.disp.botl, false);
    assert.equal(game.disp.botlx, false);
    assert.equal(game.disp.time_botl, false);
});

test('a hung-up game skips the status update too', async () => {
    await dyingGame();
    game.u.uhp = 0;
    // end.c:1037's HANGUPHANDLING term, the middle disjunct. Nothing in this
    // port raises it -- js/invent.js and js/timeout.js read it and no file
    // writes it -- so this is the only place its arm can be exercised. The
    // game is not in debug or explore mode, so end.c:1110's second reading of
    // the same flag is never reached.
    game.program_state.done_hup = true;
    game.disp.botl = true;
    game.disp.botlx = true;
    game.disp.time_botl = true;
    await refusal(DIED);
    assert.match(statusRow(), STARTING_HP_STATUS);
    assert.equal(game.disp.botl, false);
    assert.equal(game.disp.botlx, false);
    assert.equal(game.disp.time_botl, false);
});

test('program_state.stopprint skips the status update only for a quit',
     async () => {
    await dyingGame();
    game.u.uhp = 0;
    // end.c:1039's `how == QUIT && done_stopprint`. DIED is not QUIT, so the
    // conjunction is false and the repaint runs despite the flag.
    game.program_state.stopprint = true;
    await refusal(DIED);
    assert.match(statusRow(), /HP:0\(10\)/u);

    await dyingGame();
    game.u.uhp = 0;
    game.program_state.stopprint = true;
    game.disp.botl = true;
    game.disp.botlx = true;
    game.disp.time_botl = true;
    await refusal(QUIT);
    // The true side of end.c:1039 clears all three flags and skips bot().
    assert.match(statusRow(), STARTING_HP_STATUS);
    assert.equal(game.disp.botl, false);
    assert.equal(game.disp.botlx, false);
    assert.equal(game.disp.time_botl, false);
});

test('the forced status update raises disp.botlx before bot() reads it',
     async () => {
    await dyingGame();
    game.u.uhp = 0;
    game.disp.botlx = false;
    // botl.c bot():254-256 returns before it clears the flags when the status
    // window is disabled, which js/windows.js select_menu() and getlin() do.
    // That is what leaves end.c:1045's write visible to a test.
    game.gb = { ...game.gb, bot_disabled: true };
    await refusal(DIED);
    assert.equal(game.disp.botlx, true);
    // bot() returned early, so nothing repainted.
    assert.match(statusRow(), STARTING_HP_STATUS);
});

test('done(TRICKED) refuses before status or death-state changes', async () => {
    await dyingGame();
    const trickedStatus = statusRow();
    const trickedKiller = { ...game.killer };
    const trickedMortality = game.u.umortality;
    assert.match(await refusal(TRICKED), /paniclog\(\)/u);
    // With this named killer, the refusal is at end.c:1026's paniclog(), before
    // the TRICKED arm clears the name or reaches the later status/state writes.
    assert.equal(statusRow(), trickedStatus);
    assert.deepEqual(game.killer, trickedKiller);
    assert.equal(game.u.umortality, trickedMortality);
});

test('debug-fuzzer death refuses after status and before death state',
     async () => {
    await dyingGame();
    // moveloop_preamble() copies iflags.fuzzerpending here; only earlyarg.c's
    // command line raises that, and runSegment() supplies none.
    game.iflags.debug_fuzzer = 1;
    game.killer = { name: '', format: KILLED_BY_AN };
    game.u.uhp = 0;
    game.u.umortality = 0;
    assert.match(await refusal(DIED), /fuzzer_savelife\(\)/u);
    // fuzzer_savelife() follows the status update but precedes the killer
    // defaults, mortality increment, and HP force at end.c:1056.
    assert.match(statusRow(), /HP:0\(10\)/u);
    assert.deepEqual(game.killer, { name: '', format: KILLED_BY_AN });
    assert.equal(game.u.umortality, 0);
});

test('an unnamed death takes both format defaults and the deaths[] name',
     async () => {
    await dyingGame();
    game.killer = { name: '', format: KILLED_BY_AN };
    // end.c:1061 and 1064 both test `how` as well as the empty name, and DIED
    // is neither ASCENDED, GENOCIDED, STARVING nor BURNING, so the format
    // survives untouched while 1066-1067 supplies the name.
    assert.equal(await refusal(DIED),
                 `really_done(${DIED}) for killer "died"`
                 + ` in format ${KILLED_BY_AN}`);

    await dyingGame();
    game.killer = { name: '', format: KILLED_BY_AN };
    // end.c:1064's second default, "Avoid killed by \"a\" starvation".
    assert.equal(
        await refusal(STARVING),
        `really_done(${STARVING}) for killer "starvation"`
        + ` in format ${KILLED_BY}`,
    );

    for (const [how, name, format] of [
        // end.c:1061's right disjunct, at the highest actual death.
        [GENOCIDED, 'genocided', integerDefine(HACK_H, 'NO_KILLER_PREFIX')],
        // end.c:1064's BURNING literal, beside the STARVING case above.
        [BURNING, 'burning', integerDefine(HACK_H, 'KILLED_BY')],
    ]) {
        await dyingGame();
        game.killer = { name: '', format: KILLED_BY_AN };
        assert.equal(
            await refusal(how),
            `really_done(${how}) for killer "${name}" in format ${format}`,
        );
    }
});

test('an ascension resets the format even with a killer already named',
     async () => {
    await dyingGame();
    // end.c:1061's left disjunct ignores svk.killer.name, so a named killer
    // still loses its format here.
    assert.equal(
        await refusal(ASCENDED),
        `really_done(${ASCENDED}) for killer "ascended"`
        + ` in format ${NO_KILLER_PREFIX}`,
    );
});

test('a how at or above PANICKED renames the killer and skips the death block',
     async () => {
    await dyingGame();
    game.u.uhp = 5;
    game.u.umortality = 0;
    // end.c:1066's right disjunct: PANICKED and everything above it take the
    // deaths[] row whatever the caller named. end.c:1069 excludes them from
    // the mortality count and the hit-point force.
    assert.equal(await refusal(PANICKED),
                 `really_done(${PANICKED}) for killer "panic"`
                 + ` in format ${KILLED_BY_AN}`);
    assert.equal(game.u.umortality, 0);
    assert.equal(game.u.uhp, 5);
});

test('a death forces positive or negative hit points to zero', async () => {
    for (const hitPoints of [5, -3]) {
        await dyingGame();
        // Positive covers deaths not caused by HP loss; negative covers a
        // killing blow larger than the hero's remaining points.
        game.u.uhp = hitPoints;
        game.u.umortality = 0;
        // C writes both fields from one statement, `u.uhp = u.mh = 0`, so
        // the polymorph field goes to zero whether or not the hero is
        // polymorphed.
        game.u.mh = 7;
        await refusal(DIED);
        assert.equal(game.u.uhp, 0);
        assert.equal(game.u.mh, 0);
        assert.equal(game.u.umortality, 1);
        assert.equal(game.disp.botl, true);
    }
});

test('a polymorphed death forces mh when ordinary HP is already zero',
     async () => {
    await dyingGame();
    game.u.uhp = 0;
    game.u.mh = 5;
    // you.h:554 defines Upolyd by these two distinct monster indexes.
    game.u.umonnum = game.u.umonster + 1;
    await refusal(DIED);
    assert.equal(game.u.uhp, 0);
    assert.equal(game.u.mh, 0);
    assert.equal(game.disp.botl, true);
});

test('a death that arrives already at zero leaves the polymorph field alone',
     async () => {
    await dyingGame();
    game.u.uhp = 0;
    // u.mh belongs to a polymorphed hero, and end.c:1072's second disjunct
    // reads it only behind Upolyd. This hero is not polymorphed, so a nonzero
    // u.mh must not reach the force.
    game.u.mh = 5;
    await refusal(DIED);
    assert.equal(game.u.mh, 5);
    assert.equal(game.disp.botl, false);
});

test('the life-saving amulet stops every death it covers', async () => {
    for (const how of [DIED, GENOCIDED]) {
        await dyingGame();
        // youprop.h:387 Lifesaved is the extrinsic alone. end.c:1081 covers
        // every how through GENOCIDED, its highest.
        game.u.uprops[LIFESAVED].extrinsic = 1;
        const topLine = game._ttyToplines;
        assert.match(await refusal(how), /amulet of life saving/u);
        // The refusal stands at end.c:1082, before "But wait...".
        assert.equal(game._ttyToplines, topLine);
    }
});

test('life saving and the query stop above GENOCIDED', async () => {
    await dyingGame();
    game.u.uprops[LIFESAVED].extrinsic = 1;
    assert.match(
        await refusal(PANICKED),
        new RegExp(`^really_done\\(${PANICKED}\\)`, 'u'),
    );

    await dyingGame({ playmode: 'debug' });
    // No key is queued. Removing the query's upper bound would read one and
    // fail with "Input queue empty" instead of reaching really_done().
    assert.match(
        await refusal(PANICKED),
        new RegExp(`^really_done\\(${PANICKED}\\)`, 'u'),
    );
});

test('the keep-playing query opens for debug mode and for explore mode',
     async () => {
    for (const playmode of ['debug', 'explore']) {
        await dyingGame({ playmode });
        // 'n' declines the death, which sends C into savelife().
        // Set context.mon_moving so savelife() skips endmultishot().
        game.context.mon_moving = true;
        // Set uhpmax above givehp so the formula result is the binding
        // constraint, not uhpmax itself.
        game.u.uhpmax = 200;
        answerQuery('n');
        // done() returns normally after savelife() restores the hero.
        await done(DIED, game);
        // savelife() restores HP from the constitution-based formula.
        // In debug mode ACURR(A_CON) = 17; in explore mode 16. Both give
        // floor(CON / 2) = 8, so givehp = 50 + 10 * 8 = 130.
        // uhpmax (200) > givehp (130), so u.uhp = givehp = 130.
        assert.equal(game.u.uhp, 130,
            'HP restored to givehp (uhpmax > givehp exercises the formula)');
        // savelife() sets multi to -1 (can't move during this turn).
        assert.equal(game.multi, -1, 'multi set to -1');
        // savelife() sets the survive message.
        assert.equal(game.nomovemsg,
                     'You survived that attempt on your life.');
        // The killer is cleared by the survive return path.
        assert.equal(game.killer.name, '', 'killer name cleared');
    }
});

test('the query covers every how through GENOCIDED and accepts the death',
     async () => {
    await dyingGame({ playmode: 'debug' });
    // end.c:1105's `how <= GENOCIDED`, at the boundary itself.
    // Set context.mon_moving so savelife() skips endmultishot().
    game.context.mon_moving = true;
    answerQuery('n');
    // done() returns normally after savelife().
    await done(GENOCIDED, game);
    assert.equal(game.killer.name, '', 'killer cleared after survive');

    await dyingGame({ playmode: 'debug' });
    // 'y' accepts, so C falls past the block into really_done().
    answerQuery('y');
    assert.match(
        await refusal(DIED),
        new RegExp(`^really_done\\(${DIED}\\)`, 'u'),
    );
});

test('losehp() waits for done() before it returns', async () => {
    await dyingGame();
    game.u.uhp = 1;
    // The pending welcome line is what urgent_pline("You die...") displaces:
    // win/tty/topl.c update_topl():265 refuses to let a line starting "You
    // die" share a row, so this key answers the --More-- it raises over the
    // line already there. A real death raises the same one.
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    // hack.c losehp():4288. Without the await this rejection escapes as an
    // unhandled promise and the command that called losehp() runs on past a
    // query C stops at.
    await assert.rejects(
        losehp(5, 'a bolt of fire', KILLED_BY_AN, game),
        UnsupportedEndOfGameError,
    );
    assert.equal(game.killer.name, 'a bolt of fire');
    assert.equal(game.u.umortality, 1);
});

test('an ordinary D:1 death reaches the possessions disclosure prompt',
     async () => {
    await dyingGame();
    // The slice begins after a Knight's second mount attempt. Set moves to 2
    // so end.c:1186's first-move epitaph branch is not the behavior under test.
    game.moves = 2;
    game.killer = {
        name: 'slipped while mounting a saddled pony',
        format: NO_KILLER_PREFIX,
    };
    // The welcome line occupies the message window. This one space dismisses
    // it when disclose() opens the inventory prompt; no second key answers
    // that prompt, so the replay stops at the slice's observable boundary.
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    const inventory = [];
    for (let obj = game.invent; obj; obj = obj.nobj) inventory.push(obj);
    await assert.rejects(
        done(DIED, game),
        /Input queue empty/u,
    );
    assert.equal(
        game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd(),
        'Do you want your possessions identified? [ynq] (n)',
    );
    assert.equal(game.program_state.gameover, 1);
    assert.equal(game.program_state.something_worth_saving, 0);
    assert.equal(game.iflags.vision_inited, false);
    assert.equal(game.iflags.perm_invent, false);
    assert.equal(game.u.ugrave_arise, NON_PM);
    assert.ok(inventory.every(
        (obj) => obj.known && obj.bknown && obj.dknown && obj.rknown,
    ));
});

test('mounted-slip death continuation is independent of steed naming',
    async () => {
    for (const name of [
        'slipped while mounting a saddled pony called Dobbin',
        'slipped while mounting a saddled mumak',
    ]) {
        await dyingGame();
        game.moves = 2;
        game.killer = { name, format: NO_KILLER_PREFIX };
        game.nhDisplay.pushKey(' '.charCodeAt(0));
        await assert.rejects(done(DIED, game), /Input queue empty/u, name);
        assert.equal(
            game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd(),
            'Do you want your possessions identified? [ynq] (n)',
        );
    }
});

test('can_make_bones spends the D:1 low-level rejection draw', () => {
    // bones.c:377 uses 1 + (depth >> 2). D:1 therefore calls rn2(1), whose
    // only result is zero, and rejects bones before the discover-mode test.
    const state = {
        flags: { bones: true },
        u: { uz: { dnum: 0, dlevel: 1 }, uswallow: false },
        dungeons: [{
            boneid: 'D', depth_start: 1, ledger_start: 0, num_dunlevs: 5,
            flags: { hellish: false },
        }],
        n_dgns: 1,
        specialLevels: [],
        branches: [],
        level: { traps: [] },
        wizard: false,
        discover: false,
    };
    const calls = [];
    assert.equal(can_make_bones(state, {
        random: { rn2: (bound) => { calls.push(bound); return 0; } },
    }), false);
    assert.deepEqual(calls, [1]);
});

test('can_make_bones accepts an eligible level and honors independent vetoes',
    () => {
    const eligible = {
        flags: { bones: true },
        u: { uz: { dnum: 0, dlevel: 5 }, uswallow: false },
        dungeons: [{
            boneid: 'D', depth_start: 1, ledger_start: 0, num_dunlevs: 10,
            flags: { hellish: false },
        }],
        n_dgns: 1,
        specialLevels: [],
        branches: [],
        level: { traps: [] },
        wizard: false,
        discover: false,
    };
    const acceptingRandom = { rn2: (bound) => {
        assert.equal(bound, 2);
        return 1;
    } };
    assert.equal(can_make_bones(eligible, { random: acceptingRandom }), true);

    assert.equal(can_make_bones({
        ...eligible, flags: { bones: false },
    }, { random: { rn2: () => assert.fail('disabled bones draws no RNG') } }),
    false);
    assert.equal(can_make_bones({
        ...eligible,
        level: { traps: [{ ttyp: MAGIC_PORTAL }] },
    }, { random: { rn2: () => assert.fail('portal veto precedes RNG') } }),
    false);
    assert.equal(can_make_bones({
        ...eligible, discover: true,
    }, { random: acceptingRandom }), false);
});

test('the mounted-death recipe reaches the ordinary disclosure boundary',
    async () => {
        const recipe = loadMountedDeathRecipe();
        assert.equal(recipe.version, 5);
        assert.equal(recipe.segments.length, 1);
        assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);
        // This seed is the first qualifying case in the source-declared
        // 9140000..9140049 search domain in run-mounted-death.mjs.
        assert.equal(recipe.segments[0].seed, 9140000);
        assert.equal(recipe.segments[0].moves, MOUNTED_DEATH_CASE.moves);
        await verifyMountedDeathSegment(recipe.segments[0]);
    });

test('the query stops for a hung-up game and preflights ParanoidDie',
     async () => {
    await dyingGame({ playmode: 'debug' });
    game.program_state.done_hup = true;
    assert.match(await refusal(DIED), /gd\.done_seq/u);

    await dyingGame({
        playmode: 'debug', options: ['paranoid_confirmation:die'],
    });
    assert.equal(game.flags.paranoid_confirmation, undefined);
    assert.notEqual(game.flags.paranoia_bits & PARANOID_DIE, 0);
    // Leave the displayed HP at 10 while the state says zero. A misplaced
    // preflight after bot() would repaint this row before it refused.
    game.u.uhp = 0;
    const rawStatus = statusRow();
    const rawKiller = { ...game.killer };
    const rawMortality = game.u.umortality;
    const rawHp = game.u.uhp;
    assert.match(await refusal(DIED), /paranoid_ynq\(\)/u);
    assert.equal(statusRow(), rawStatus);
    assert.deepEqual(game.killer, rawKiller);
    assert.equal(game.u.umortality, rawMortality);
    assert.equal(game.u.uhp, rawHp);
});

test('the query preflight preserves every earlier exclusion', async () => {
    await dyingGame({
        playmode: 'debug', options: ['paranoid_confirmation:die'],
    });
    game.iflags.debug_fuzzer = 1;
    assert.match(await refusal(DIED), /fuzzer_savelife\(\)/u);

    await dyingGame({
        playmode: 'debug', options: ['paranoid_confirmation:die'],
    });
    game.u.uprops[LIFESAVED].extrinsic = 1;
    game.killer = { name: '', format: KILLED_BY_AN };
    // Distinct positive sentinels make the pre-force repaint show uhp=5 and
    // prove that end.c:1072-1077 later zeroes both HP fields together.
    game.u.uhp = 5;
    game.u.mh = 4;
    game.u.umortality = 0;
    assert.match(await refusal(DIED), /amulet of life saving/u);
    // end.c:1035-1081 reaches this refusal only after the status repaint and
    // the complete death-state prefix.
    assert.match(statusRow(), /HP:5\(10\)/u);
    assert.deepEqual(game.killer, { name: 'died', format: KILLED_BY_AN });
    assert.equal(game.u.umortality, 1);
    assert.equal(game.u.uhp, 0);
    assert.equal(game.u.mh, 0);
    assert.equal(game.disp.botl, true);
    assert.equal(game.disp.botlx, false);

    await dyingGame({ options: ['paranoid_confirmation:die'] });
    // Ordinary mode never reaches end.c:1105, so the parsed query bit is
    // irrelevant to this done() call and must not preempt really_done().
    assert.match(
        await refusal(DIED),
        new RegExp(`^really_done\\(${DIED}\\)`, 'u'),
    );

    await dyingGame({
        playmode: 'debug', options: ['paranoid_confirmation:die'],
    });
    // GENOCIDED is end.c:1105's inclusive upper boundary.
    assert.match(
        await refusal(GENOCIDED),
        /paranoid_ynq\(\)/u,
    );

    await dyingGame({
        playmode: 'debug', options: ['paranoid_confirmation:die'],
    });
    game.program_state.done_hup = true;
    game.killer = { name: '', format: KILLED_BY_AN };
    // The same sentinels prove the joint zeroing even though done_hup skips
    // the status repaint that would otherwise display uhp=5.
    game.u.uhp = 5;
    game.u.mh = 4;
    game.u.umortality = 0;
    game.disp.botl = true;
    game.disp.botlx = true;
    game.disp.time_botl = true;
    const hungUpStatus = statusRow();
    assert.match(await refusal(DIED), /gd\.done_seq/u);
    // done_hup skips the repaint but still reaches the killer, mortality, and
    // hit-point prefix before end.c:1110 consults gd.done_seq.
    assert.equal(statusRow(), hungUpStatus);
    assert.deepEqual(game.killer, { name: 'died', format: KILLED_BY_AN });
    assert.equal(game.u.umortality, 1);
    assert.equal(game.u.uhp, 0);
    assert.equal(game.u.mh, 0);
    assert.equal(game.disp.botl, true);
    assert.equal(game.disp.botlx, false);
    assert.equal(game.disp.time_botl, false);
});

test('ParanoidDie reads its bit before status or death-state changes',
     async () => {
    await dyingGame({ playmode: 'debug' });
    // flag.h:85 PARANOID_DIE. options.c initoptions_init():7173 leaves it out
    // of the startup default, so this is the only way to raise it here, and
    // paranoid_ynq()'s spelled-out arm is what it selects.
    assert.equal((game.flags.paranoia_bits & PARANOID_DIE), 0);
    game.flags.paranoia_bits |= PARANOID_DIE;
    // Keep the status row stale so a preflight moved below bot() is visible.
    game.u.uhp = 0;
    const paranoidStatus = statusRow();
    const paranoidKiller = { ...game.killer };
    const paranoidMortality = game.u.umortality;
    const paranoidHp = game.u.uhp;
    let caught = null;
    try {
        await done(DIED, game);
    } catch (error) {
        caught = error;
    }
    assert.match(caught.message, /paranoid_ynq\(\)/u);
    assert.equal(statusRow(), paranoidStatus);
    assert.deepEqual(game.killer, paranoidKiller);
    assert.equal(game.u.umortality, paranoidMortality);
    assert.equal(game.u.uhp, paranoidHp);
});

test('the hero-death matrix carries replay inputs only', () => {
    const recipe = loadHeroDeathRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 2);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    // The seed list is the tripwire for a silent re-recording.
    assert.deepEqual(recipe.segments.map(({ seed }) => seed),
                     [4820613, 8300007]);
    // One segment per disjunct of end.c:1105, and one killer format each.
    assert.deepEqual(HERO_DEATH_CASES.map(({ playmode }) => playmode),
                     ['debug', 'explore']);
    assert.equal(WIZARD_CASE.format, KILLED_BY_AN);
    assert.equal(EXPLORE_CASE.format, NO_KILLER_PREFIX);
    // Both segments end on the key that dismisses the death's --More--, which
    // is the key that draws the query. A third would answer it.
    assert.ok(recipe.segments.every(({ moves }) => moves.endsWith('  ')));
});

// ── done_in_by() tests ──
// done_in_by() (end.c:185-344) builds the killer string from the monster
// that dealt lethal damage, then calls done(). These tests verify the killer
// format, name, and ugrave_arise for representative monster types.

// Build a monster that done_in_by can identify. dyingGame() leaves a welcome
// message pending on the top line; ttyUrgentPline("You die...") dismisses
// it, so one space key is enough. done() then reaches really_done() without
// a query for an ordinary (non-wizard) game.
function killerMonster(pmidx, overrides = {}) {
    return newMonster({
        data: game.mons[pmidx],
        cham: NON_PM,          // not a shapechanger
        m_id: 9999,
        mhp: 10,
        mhpmax: 10,
        ...overrides,
    });
}

test('done_in_by sets the killer for a plain monster', async () => {
    // end.c:323-325 plain-monster path. A giant bat is neuter, so pmname()
    // returns the neutral name "giant bat". KILLED_BY_AN is the default
    // because no branch resets it.
    await dyingGame();
    const bat = killerMonster(PM_GIANT_BAT);
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    await assert.rejects(
        done_in_by(bat, DIED, game),
        UnsupportedEndOfGameError,
    );
    assert.equal(game.killer.name, 'giant bat');
    assert.equal(game.killer.format, KILLED_BY_AN);
});

test('done_in_by sets ugrave_arise for a wraith', async () => {
    // end.c:326-327. A wraith's mlet is S_WRAITH, so ugrave_arise receives
    // PM_WRAITH.
    await dyingGame();
    const wraith = killerMonster(PM_WRAITH);
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    await assert.rejects(
        done_in_by(wraith, DIED, game),
        UnsupportedEndOfGameError,
    );
    assert.equal(game.killer.name, 'wraith');
    assert.equal(game.killer.format, KILLED_BY_AN);
    assert.equal(game.u.ugrave_arise, PM_WRAITH);
});

test('done_in_by sets ugrave_arise for a ghoul', async () => {
    // end.c:337-338. PM_GHOUL is tested explicitly (not by mlet).
    await dyingGame();
    const ghoul = killerMonster(PM_GHOUL);
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    await assert.rejects(
        done_in_by(ghoul, DIED, game),
        UnsupportedEndOfGameError,
    );
    assert.equal(game.killer.name, 'ghoul');
    assert.equal(game.killer.format, KILLED_BY_AN);
    assert.equal(game.u.ugrave_arise, PM_GHOUL);
});

test('done_in_by uses STONING message and killer for a stoning death',
     async () => {
    // end.c:197 prints "You turn to stone..." instead of "You die..." and
    // passes STONING through to done(). The killer name still comes from
    // the monster's permonst data.
    await dyingGame();
    const bug = killerMonster(PM_GRID_BUG);
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    await assert.rejects(
        done_in_by(bug, STONING, game),
        UnsupportedEndOfGameError,
    );
    assert.equal(game.killer.name, 'grid bug');
    assert.equal(game.killer.format, KILLED_BY_AN);
});
