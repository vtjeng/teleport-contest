// The level-teleport prompt: wizcmds.c wiz_level_tele() and teleport.c
// level_tele()'s head, plus the cmd.c can_do_extcmd() call rhack() makes for
// the key a command is bound to.
//
// scripts/run-wizard-level-tele.mjs holds the strict differential evidence:
// eight segments recorded against the C reference, covering both dispatch
// routes, both refusals an ordinary hero meets, the Escape that cancels, and
// three shapes of echoed line. The assertions here pin what those recordings
// cannot show -- the refusal class the command seam has to convert, the four
// answers level_tele() classifies before a destination exists, and the
// random-number call a confused hero spends at this prompt.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ADMITTED_COMMANDS, failClosedCommandRefusals,
} from '../js/cmd.js';
import {
    commandForKey, createCommandBindingModel,
} from '../js/command_bindings.js';
import {
    CONFUSION,
    ECMD_OK,
    LAST_PROP,
    UTOTYPE_DEFERRED,
    UTOTYPE_NONE,
} from '../js/const.js';
import {
    deferred_goto,
    maybe_lvltport_feedback,
    UnsupportedLevelChangeError,
} from '../js/do.js';
import {
    CMD_M_PREFIX, IFBURIED, WIZMODECMD, extcmdlist,
} from '../js/extcmdlist_data.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { level_tele } from '../js/teleport.js';
import { wiz_level_tele } from '../js/wizcmds.js';
import {
    ESCAPE_KEY,
    EXTCMD_KEY,
    LEVELPORT_KEY,
    WAIT_KEY,
    loadWizardLevelTeleRecipe,
} from './run-wizard-level-tele.mjs';

// teleport.c:1194's Strcpy(qbuf, ...). getlin() writes it followed by a
// space, so the cursor rests one column past the 38-character question.
const PROMPT = 'To what level do you want to teleport?';
const PROMPT_CURSOR_COL = PROMPT.length + 1;

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// Locate a segment by the keys it types, so reordering the matrix cannot
// silently point a test at a different case.
function segmentFor(moves) {
    const found = loadWizardLevelTeleRecipe().segments.find(
        (segment) => segment.moves === `.${moves}`,
    );
    assert.ok(found, `the matrix contains a segment typing ${moves}`);
    return found;
}

// A game one step short of level_tele(): a display holding the keys the
// prompt will read, and the state bags level_tele() and getlin() write
// through. The hero has no position, so vpline()'s `if (u.ux) flush_screen()`
// is skipped and the top line is the only thing that paints. `reads` collects
// the top line and cursor as each keystroke is about to be read.
//
// `seed` reaches rnl(5) only for a confused hero; the default is never drawn
// from. Luck is 0 because u.uluck and u.moreluck are unset, so rnl() applies
// no adjustment and spends exactly one draw.
function levelTeleState(keys, { confused = false, wizard = true, seed = 1 } = {
}) {
    const state = resetGame();
    state.wizard = wizard;
    state.iflags = {};
    state.flags = {};
    state.u = {
        uprops: Array.from(
            { length: LAST_PROP + 1 },
            () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 }),
        ),
    };
    // youprop.h:83-84 reads the intrinsic field alone, and any nonzero timeout
    // makes the hero confused; 5 is an ordinary remaining turn count.
    if (confused) state.u.uprops[CONFUSION].intrinsic = 5;
    state.nhDisplay = new GameDisplay(null);
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('the level-teleport prompt asked for a withheld key');
    };
    for (const ch of keys) state.nhDisplay.pushKey(ch.charCodeAt(0));
    initRng(seed);
    enableRngLog();
    const reads = [];
    state._preNhgetchHook = () => reads.push({
        line: topLine(),
        col: state.nhDisplay.cursorCol,
        row: state.nhDisplay.cursorRow,
    });
    return { state, reads };
}

function schedulableLevelTeleState(answer) {
    const fixture = levelTeleState(`${answer}\n`);
    const { state } = fixture;
    state.flags.verbose = true;
    state.u.uz = { dnum: 0, dlevel: 1 };
    state.u.uz0 = { dnum: 0, dlevel: 1 };
    state.u.utolev = { dnum: 0, dlevel: 1 };
    state.u.utotype = UTOTYPE_NONE;
    state.u.utrap = 0;
    state.u.usteed = null;
    state.dungeons = [{
        depth_start: 1,
        num_dunlevs: 10,
        ledger_start: 0,
    }];
    state.branches = [];
    state.specialLevels = [];
    state.quest_dnum = 1;
    state.astral_level = { dnum: 2, dlevel: 1 };
    state.knox_level = { dnum: 3, dlevel: 1 };
    state.medusa_level = { dnum: 0, dlevel: 8 };
    state.sanctum_level = { dnum: 0, dlevel: 10 };
    return fixture;
}

test('the level-teleport matrix contains only source-selected inputs', () => {
    const recipe = loadWizardLevelTeleRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 8);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // Every segment opens with a wait, so the prompt paints over a screen
        // an ordinary turn produced rather than over the arrival screen.
        assert.equal(segment.moves.at(0), '.');
        // A pet's move on a closing wait reaches distfleeck()
        // (monmove.c:538), which is unported, so no segment keeps one.
        assert.match(segment.nethackrc, /pettype:none/u);
    }
    // Six segments reach the command and two are refused, so exactly six set
    // debug mode. cmd.c:1970's "wizlevelport" row carries WIZMODECMD, which
    // can_do_extcmd() and extcmds_match() both read.
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('playmode:debug'),
        ).length,
        6,
    );
    // The two refused segments are the two dispatch routes an ordinary hero
    // can take, one per route.
    const ordinary = recipe.segments.filter(
        ({ nethackrc }) => !nethackrc.includes('playmode:debug'),
    );
    assert.deepEqual(ordinary.map(({ moves }) => moves), [
        `${WAIT_KEY}${LEVELPORT_KEY}${WAIT_KEY}`,
        `${WAIT_KEY}${EXTCMD_KEY}wizlevelport\n${WAIT_KEY}`,
    ]);
});

test('the command table binds C(v) to the row wiz_level_tele() serves', () => {
    // cmd.c:1970-1971. The key admits the command through rhack(), the flags
    // decide both refusals, and CMD_M_PREFIX is what lets an 'm' prefix
    // survive rhack()'s test at 3693-3695 and reach level_tele().
    const row = extcmdlist.find(({ ef_txt }) => ef_txt === 'wizlevelport');
    assert.equal(row.key, LEVELPORT_KEY.charCodeAt(0));
    assert.equal(row.ef_funct, 'wiz_level_tele');
    assert.equal(row.flags, IFBURIED | WIZMODECMD | CMD_M_PREFIX);
    assert.equal(
        commandForKey(
            createCommandBindingModel(resetGame()),
            LEVELPORT_KEY.charCodeAt(0),
        ),
        'wizlevelport',
    );
    // readSimpleCommand() refuses every command outside this list before any
    // handler runs, so the key reaches rhack()'s arm only once it is here.
    assert.ok(ADMITTED_COMMANDS.includes('wizlevelport'));
});

test('the level-teleport refusal converts at the command seam', () => {
    // js/cmd.js runLevelTeleCommand() wraps wiz_level_tele() in
    // failClosedCommand(), and js/jsmain.js breaks a segment only for the
    // three boundary classes, so a class level_tele() can raise that the
    // wrapper does not list escapes as a hard failure and discards the
    // segment's matching prefix instead of stopping on it. Every unported
    // answer reaches this one after getlin() has echoed the whole line.
    assert.ok(failClosedCommandRefusals().includes(UnsupportedLevelChangeError));
});

test('C(v) paints the level-teleport prompt', async () => {
    const { state, reads } = levelTeleState(ESCAPE_KEY);
    await level_tele(state);
    // One key was read, and the prompt stood alone when it was.
    assert.deepEqual(reads, [{ line: PROMPT, col: PROMPT_CURSOR_COL, row: 0 }]);
});

test('an Escape cancels the level teleport and draws nothing', async () => {
    const { state } = levelTeleState(ESCAPE_KEY);
    // teleport.c:1218-1219 returns with no value; wizcmds.c:405 then answers
    // ECMD_OK, which is what leaves the turn unspent.
    assert.equal(await level_tele(state), undefined);
    assert.deepEqual(getRngLog(), []);
    assert.equal(await wiz_level_tele(levelTeleState(ESCAPE_KEY).state),
        ECMD_OK);
});

test('an Escape over a typed answer repaints instead of cancelling',
    async () => {
        // getline.c:88 clears the buffer and reissues the prompt when Escape
        // arrives over text, so teleport.c:1218 never sees "\033" until a
        // second Escape reaches an empty line.
        const { state, reads } = levelTeleState(
            `25${ESCAPE_KEY}${ESCAPE_KEY}`,
        );
        assert.equal(await level_tele(state), undefined);
        assert.deepEqual(reads.map(({ line, col }) => [line, col]), [
            [PROMPT, PROMPT_CURSOR_COL],
            [`${PROMPT} 2`, PROMPT_CURSOR_COL + 1],
            [`${PROMPT} 25`, PROMPT_CURSOR_COL + 2],
            [PROMPT, PROMPT_CURSOR_COL],
        ]);
    });

// teleport.c:1213-1249. Each answer below leaves level_tele() through a path
// this slice does not port, and each has to stop rather than guess.
for (const [answer, reason] of [
    // 1213-1214: "*" jumps to random_levtport.
    ['*', 'level_tele() random_levtport for "*"'],
    // 1221-1228: a wizard's "?" opens dungeon.c print_dungeon().
    ['?', 'level_tele() reaching print_dungeon() for "?"'],
    // The same tail for a name, which lev_by_name() rather than atoi()
    // would answer.
    ['sokoban', 'level_tele() resolving a non-positive or named destination'],
    // An empty line: C's strcmp() tests all fail, so it reaches the same
    // tail rather than cancelling.
    ['', 'level_tele() resolving a non-positive or named destination'],
]) {
    test(`the answer ${JSON.stringify(answer)} stops the level teleport`,
        async () => {
            const { state } = levelTeleState(`${answer}\n`);
            await assert.rejects(
                () => level_tele(state),
                (error) => {
                    assert.ok(error instanceof UnsupportedLevelChangeError);
                    assert.equal(error.reason, reason);
                    return true;
                },
            );
        });
}

test('a positive decimal schedules a deferred level teleport without drawing',
    async () => {
        const { state } = schedulableLevelTeleState('2');
        await level_tele(state);

        assert.deepEqual(state.u.uz, { dnum: 0, dlevel: 1 });
        assert.deepEqual(state.u.utolev, { dnum: 0, dlevel: 2 });
        assert.equal(state.u.utotype, UTOTYPE_DEFERRED);
        assert.equal(
            state.gd.dfr_post_msg,
            'You materialize on a different level!',
        );
        assert.deepEqual(getRngLog(), []);
    });

test('a same-level destination is deferred and then only clears the schedule',
    async () => {
        const { state } = schedulableLevelTeleState('1');
        await level_tele(state);
        assert.equal(state.u.utotype, UTOTYPE_DEFERRED);

        await deferred_goto(state);
        assert.deepEqual(state.u.uz, { dnum: 0, dlevel: 1 });
        assert.equal(state.u.utotype, UTOTYPE_NONE);
        assert.equal(state.gd.dfr_pre_msg, null);
        assert.equal(state.gd.dfr_post_msg, null);
        assert.deepEqual(getRngLog(), []);
    });

test('level-teleport feedback ignores a missing deferred message', async () => {
    const state = { gd: {} };
    await maybe_lvltport_feedback(state);
    assert.deepEqual(state, { gd: {} });
});

test('a trap other than a buried ball does not block numeric scheduling',
    async () => {
        const { state } = schedulableLevelTeleState('2');
        state.u.utrap = 1;
        state.u.utraptype = 0;

        await level_tele(state);
        assert.deepEqual(state.u.utolev, { dnum: 0, dlevel: 2 });
        assert.equal(state.u.utotype, UTOTYPE_DEFERRED);
    });

test('the exact main-dungeon bottom boundary enters the Gehennom path',
    async () => {
        const { state } = schedulableLevelTeleState('11');
        await assert.rejects(
            () => level_tele(state),
            (error) => {
                assert.equal(
                    error.reason,
                    'level_tele() finding the entrance to Gehennom',
                );
                return true;
            },
        );
    });

test('the same-level clamp uses here when requested depth equals deepest',
    async () => {
        const { state } = schedulableLevelTeleState('11');
        state.u.uz.dlevel = 10;
        state.u.uz0.dlevel = 10;
        state.u.utolev.dlevel = 10;
        state.medusa_level = { dnum: 2, dlevel: 1 };
        state.dungeons.push({
            depth_start: 2,
            num_dunlevs: 10,
            ledger_start: 10,
        });
        state.sanctum_level = { dnum: 1, dlevel: 10 };

        await level_tele(state);
        assert.equal(state._ttyToplines, "You can't get there from here.");
        assert.equal(state.u.utotype, UTOTYPE_NONE);
        assert.deepEqual(getRngLog(), []);
    });

test('a confused hero spends one rnl(5) before the Escape test', async () => {
    // teleport.c:1215. Seed 2 is the smallest seed whose first rnl(5) is
    // nonzero (3), which sends the hero to random_levtport even though the
    // key typed was an Escape.
    const { state } = levelTeleState(ESCAPE_KEY, { confused: true, seed: 2 });
    await assert.rejects(
        () => level_tele(state),
        (error) => {
            assert.equal(
                error.reason,
                'level_tele() random_levtport for a confused hero',
            );
            return true;
        },
    );
    assert.deepEqual(getRngLog(), ['rnl(5)=3']);
    assert.equal(game.nhDisplay.topMessage, 'Oops...');

    // Seed 1's first rnl(5) is 0, the one in five that lets the Escape
    // through. The draw still happens, and no "Oops..." is printed.
    const zero = levelTeleState(ESCAPE_KEY, { confused: true, seed: 1 });
    assert.equal(await level_tele(zero.state), undefined);
    assert.deepEqual(getRngLog(), ['rnl(5)=0']);
    assert.notEqual(game.nhDisplay.topMessage, 'Oops...');

    // An unconfused hero short-circuits before the call, so the same keys
    // cost no randomness at all.
    const calm = levelTeleState(ESCAPE_KEY, { seed: 2 });
    assert.equal(await level_tele(calm.state), undefined);
    assert.deepEqual(getRngLog(), []);
});

test("the 'm' prefix stops before print_dungeon()", async () => {
    // teleport.c:1196-1202. The row carries CMD_M_PREFIX, so 'm ^V' reaches
    // level_tele() with iflags.menu_requested set and skips the prompt
    // entirely. C clears the flag before the wizard test, and so must this
    // port, or a later prompt would inherit it.
    const { state, reads } = levelTeleState(ESCAPE_KEY);
    state.iflags.menu_requested = true;
    await assert.rejects(
        () => level_tele(state),
        (error) => {
            assert.equal(
                error.reason,
                "level_tele() reaching print_dungeon() for the 'm' prefix",
            );
            return true;
        },
    );
    assert.equal(state.iflags.menu_requested, false);
    // No prompt was issued, so no key was read.
    assert.deepEqual(reads, []);
});

test('level_tele() stops for a hero who is not in wizard mode', async () => {
    // teleport.c:1185-1190. Both arms an ordinary hero takes are unported,
    // and teleport.c level_tele_trap() is the caller that reaches them.
    const { state, reads } = levelTeleState(ESCAPE_KEY, { wizard: false });
    await assert.rejects(
        () => level_tele(state),
        (error) => {
            assert.equal(
                error.reason,
                'level_tele() for a hero who is not in wizard mode',
            );
            return true;
        },
    );
    assert.deepEqual(reads, []);
});

test('wiz_level_tele() names the command in its unavailable line', async () => {
    // Dead behind cmd.c can_do_extcmd(), which prints this same line for a
    // WIZMODECMD row before either dispatch route arrives. wizcmds.c:404
    // spells the name as ecname_from_fn(wiz_level_tele), which finds the
    // "wizlevelport" row.
    const { state, reads } = levelTeleState('', { wizard: false });
    assert.equal(await wiz_level_tele(state), ECMD_OK);
    assert.equal(game.nhDisplay.topMessage, "Unavailable command "
        + "'wizlevelport'.");
    assert.deepEqual(reads, []);
});

test('the matrix segment that opens the prompt types nothing else', () => {
    // The first differential segment is the bare prompt: one wait, then
    // C('v'). Anything after it would move the stop this slice ends at.
    assert.equal(segmentFor(LEVELPORT_KEY).moves, `.${LEVELPORT_KEY}`);
});
