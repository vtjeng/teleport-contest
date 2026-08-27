import assert from 'node:assert/strict';
import test from 'node:test';

import { extcmds_match } from '../js/cmd.js';
import {
    AUTOCOMPLETE,
    AUTOCOMP_ADJ,
    CMD_INSANE,
    CMD_MOVE_PREFIXES,
    CMD_M_PREFIX,
    CMD_NOT_AVAILABLE,
    CMD_PARAM,
    CMD_gGF_PREFIX,
    ECM_EXACTMATCH,
    ECM_IGNOREAC,
    ECM_NO1CHARCMD,
    ECM_NOFLAGS,
    GENERALCMD,
    IFBURIED,
    INTERNALCMD,
    MOUSECMD,
    MOVEMENTCMD,
    NOFUZZERCMD,
    PREFIXCMD,
    WIZMODECMD,
    extcmdlist,
} from '../js/extcmdlist_data.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    ESCAPE_KEY,
    EXTCMD_KEY,
    NEWLINE_KEY,
    loadExtendedCommandPromptDebugRecipe,
    loadExtendedCommandPromptRecipe,
} from './run-extended-command-prompt.mjs';

function entry(name) {
    const found = extcmdlist.find(({ ef_txt }) => ef_txt === name);
    assert.ok(found, `extcmdlist[] has a row named ${name}`);
    return found;
}

function names(matchlist) {
    return matchlist.map((index) => extcmdlist[index].ef_txt);
}

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// Locate a segment by the keys it types, so reordering the matrix cannot
// silently point a test at a different case.
function segmentFor(moves) {
    const found = loadExtendedCommandPromptRecipe().segments.find(
        (segment) => segment.moves === `.${moves}.`,
    );
    assert.ok(found, `the matrix contains a segment typing ${moves}`);
    return found;
}

// cmd.c:1667-2067 in source order, read off the initializers rather than off
// the generated module. `check:extcmds` regenerates js/extcmdlist_data.js from
// cmd.c and diffs it, so it catches an edit to the generated file; it cannot
// catch a wrong generator, because the check and the file come out of the same
// code. These literals are the independent copy that can.
const SOURCE_EXTCMD_NAMES = [
    '#', '?', 'adjust', 'annotate', 'apply', 'attributes', 'autopickup',
    'bugreport', 'call', 'cast', 'chat', 'chronicle', 'close', 'conduct',
    'debugfuzzer', 'dip', 'down', 'drop', 'droptype', 'eat', 'engrave',
    'enhance', 'exploremode', 'fight', 'fire', 'force', 'genocided', 'glance',
    'help', 'herecmdmenu', 'history', 'inventory', 'inventtype', 'invoke',
    'jump', 'kick', 'known', 'knownclass', 'levelchange', 'lightsources',
    'look', 'lookaround', 'loot', 'migratemons', 'monster', 'name', 'offer',
    'open', 'options', 'optionsfull', 'overview', 'panic', 'pay', 'perminv',
    'pickup', 'polyself', 'pray', 'prevmsg', 'puton', 'quaff', 'quit',
    'quiver', 'read', 'redraw', 'remove', 'repeat', 'reqmenu', 'retravel',
    'ride', 'rub', 'run', 'rush', 'save', 'saveoptions', 'search', 'seeall',
    'seeamulet', 'seearmor', 'seerings', 'seetools', 'seeweapon', 'shell',
    'showgold', 'showspells', 'showtrap', 'sit', 'stats', 'suspend', 'swap',
    'takeoff', 'takeoffall', 'teleport', 'terrain', 'therecmdmenu', 'throw',
    'timeout', 'tip', 'toggle', 'travel', 'turn', 'twoweapon', 'untrap', 'up',
    'vanquished', 'version', 'versionshort', 'vision', 'wait', 'wear',
    'whatdoes', 'whatis', 'wield', 'wipe', 'wizborn', 'wizbury', 'wizcast',
    'wizcustom', 'wizdetect', 'wizdispmacros', 'wizfliplevel', 'wizgenesis',
    'wizidentify', 'wizintrinsic', 'wizkill', 'wizlevelport', 'wizloaddes',
    'wizloadlua', 'wizobjprobs', 'wizmakemap', 'wizmap', 'wizmondiff',
    'wizrumorcheck', 'wizseenv', 'wizshownhuuid', 'wizsmell', 'wiztelekinesis',
    'wizwhere', 'wizwish', 'wmode', 'zap',
    // cmd.c:1994-2058, the movement rows commands_init() also walks.
    'movewest', 'movenorthwest', 'movenorth', 'movenortheast', 'moveeast',
    'movesoutheast', 'movesouth', 'movesouthwest',
    'rushwest', 'rushnorthwest', 'rushnorth', 'rushnortheast', 'rusheast',
    'rushsoutheast', 'rushsouth', 'rushsouthwest',
    'runwest', 'runnorthwest', 'runnorth', 'runnortheast', 'runeast',
    'runsoutheast', 'runsouth', 'runsouthwest',
    'clicklook', 'mouseaction',
    'altadjust', 'altdip', 'alttakeoff', 'altunwield',
];

test('the flag constants carry the values include/func_tab.h defines', () => {
    // func_tab.h:10-31. Pinned as literals because every other assertion in
    // this file spells an expected flag with the imported constant, which on
    // its own would agree with any value the generator invented.
    assert.deepEqual(
        {
            IFBURIED,
            AUTOCOMPLETE,
            WIZMODECMD,
            GENERALCMD,
            CMD_NOT_AVAILABLE,
            NOFUZZERCMD,
            INTERNALCMD,
            CMD_M_PREFIX,
            CMD_gGF_PREFIX,
            PREFIXCMD,
            MOVEMENTCMD,
            MOUSECMD,
            CMD_INSANE,
            AUTOCOMP_ADJ,
            CMD_PARAM,
            CMD_MOVE_PREFIXES,
            ECM_NOFLAGS,
            ECM_IGNOREAC,
            ECM_EXACTMATCH,
            ECM_NO1CHARCMD,
        },
        {
            IFBURIED: 0x0001,
            AUTOCOMPLETE: 0x0002,
            WIZMODECMD: 0x0004,
            GENERALCMD: 0x0008,
            CMD_NOT_AVAILABLE: 0x0010,
            NOFUZZERCMD: 0x0020,
            INTERNALCMD: 0x0040,
            CMD_M_PREFIX: 0x0080,
            CMD_gGF_PREFIX: 0x0100,
            PREFIXCMD: 0x0200,
            MOVEMENTCMD: 0x0400,
            MOUSECMD: 0x0800,
            CMD_INSANE: 0x1000,
            AUTOCOMP_ADJ: 0x2000,
            CMD_PARAM: 0x4000,
            // func_tab.h:19 defines this one as a union of two others.
            CMD_MOVE_PREFIXES: 0x0080 | 0x0100,
            ECM_NOFLAGS: 0,
            ECM_IGNOREAC: 0x01,
            ECM_EXACTMATCH: 0x02,
            ECM_NO1CHARCMD: 0x04,
        },
    );
});

test('every extcmdlist[] row is the one cmd.c declares in that position',
    () => {
    assert.deepEqual(
        extcmdlist.map(({ ef_txt }) => ef_txt),
        SOURCE_EXTCMD_NAMES,
    );

    // How many rows carry each flag, counted off cmd.c's initializers. The
    // name list above fixes which rows exist and in what order; these counts
    // are what stops a generator from mis-resolving a flag on a row that no
    // individual assertion below happens to name.
    const rowsCarrying = (flag) => (
        extcmdlist.filter(({ flags }) => flags & flag).length
    );
    assert.deepEqual(
        {
            IFBURIED: rowsCarrying(IFBURIED),
            AUTOCOMPLETE: rowsCarrying(AUTOCOMPLETE),
            WIZMODECMD: rowsCarrying(WIZMODECMD),
            GENERALCMD: rowsCarrying(GENERALCMD),
            CMD_NOT_AVAILABLE: rowsCarrying(CMD_NOT_AVAILABLE),
            NOFUZZERCMD: rowsCarrying(NOFUZZERCMD),
            INTERNALCMD: rowsCarrying(INTERNALCMD),
            CMD_M_PREFIX: rowsCarrying(CMD_M_PREFIX),
            CMD_gGF_PREFIX: rowsCarrying(CMD_gGF_PREFIX),
            PREFIXCMD: rowsCarrying(PREFIXCMD),
            MOVEMENTCMD: rowsCarrying(MOVEMENTCMD),
            MOUSECMD: rowsCarrying(MOUSECMD),
            CMD_INSANE: rowsCarrying(CMD_INSANE),
            AUTOCOMP_ADJ: rowsCarrying(AUTOCOMP_ADJ),
            CMD_PARAM: rowsCarrying(CMD_PARAM),
        },
        {
            IFBURIED: 94,
            AUTOCOMPLETE: 52,
            WIZMODECMD: 35,
            GENERALCMD: 52,
            // Only #shell and #suspend can pick this up, and the recorder
            // build defines both SHELL and SUSPEND.
            CMD_NOT_AVAILABLE: 0,
            NOFUZZERCMD: 13,
            INTERNALCMD: 6,
            CMD_M_PREFIX: 60,
            CMD_gGF_PREFIX: 8,
            PREFIXCMD: 4,
            MOVEMENTCMD: 24,
            MOUSECMD: 3,
            CMD_INSANE: 2,
            // AUTOCOMP_ADJ is set at runtime by the 'autocomplete' option,
            // never in the table.
            AUTOCOMP_ADJ: 0,
            CMD_PARAM: 1,
        },
    );

    // Every row's key has to be a byte, since commands_init() indexes the
    // binding table with it.
    assert.ok(extcmdlist.every(
        ({ key }) => Number.isInteger(key) && key >= 0 && key <= 0xFF,
    ));
});

test('the generated table reproduces cmd.c extcmdlist[]', () => {
    // cmd.c:1667-2067 holds 171 initializers; the sentinel row, whose ef_txt
    // is Null and which both extcmds_match() and commands_init() stop at, is
    // not carried into JavaScript.
    assert.equal(extcmdlist.length, 170);
    assert.ok(extcmdlist.every(({ ef_txt }) => typeof ef_txt === 'string'));

    // cmd.c:1668-1669, the row rhack() reaches for '#'.
    assert.deepEqual(
        { ...extcmdlist[0] },
        {
            key: 0x23,
            ef_txt: '#',
            ef_desc: 'enter and perform an extended command',
            ef_funct: 'doextcmd',
            flags: IFBURIED | GENERALCMD | CMD_M_PREFIX,
            f_text: null,
        },
    );

    // extcmdlist[]'s sixth column, f_text, is the occupation name rhack()
    // hands set_occupation() when a count is pending. cmd.c gives exactly two
    // rows one, and every other row leaves it Null.
    assert.deepEqual(
        extcmdlist
            .filter(({ f_text }) => f_text !== null)
            .map(({ ef_txt, f_text }) => [ef_txt, f_text]),
        [['search', 'searching'], ['wait', 'waiting']],
    );
    // cmd.c:2059-2066, the last four internal rows before the sentinel.
    assert.deepEqual(
        extcmdlist.slice(-4).map(({ ef_txt, ef_funct, flags }) => (
            [ef_txt, ef_funct, flags]
        )),
        [
            ['altadjust', 'adjust_split', INTERNALCMD],
            ['altdip', 'dip_into', INTERNALCMD],
            ['alttakeoff', 'ia_dotakeoff', INTERNALCMD],
            ['altunwield', 'remarm_swapwep', INTERNALCMD],
        ],
    );

    // The object-class keys defsym.h supplies for the #see* family.
    assert.equal(entry('seeamulet').key, '"'.charCodeAt(0));
    assert.equal(entry('seearmor').key, '['.charCodeAt(0));
    assert.equal(entry('showgold').key, '$'.charCodeAt(0));
    assert.equal(entry('showspells').key, '+'.charCodeAt(0));
    // C('x') and M('n'), the two key macros global.h:480-488 defines.
    assert.equal(entry('attributes').key, 0x18);
    assert.equal(entry('name').key, 0x80 | 'n'.charCodeAt(0));
    // '\177', which is also the erase character the recorder supplies.
    assert.equal(entry('terrain').key, 0x7F);

    // The three closers the prompt dispatches.
    assert.equal(entry('wait').ef_funct, 'donull');
    assert.equal(entry('wait').flags, IFBURIED | CMD_M_PREFIX);
    assert.equal(entry('look').ef_funct, 'dolook');
    assert.equal(entry('attributes').ef_funct, 'doattributes');
});

test('the generator resolves every #if in extcmdlist[] against the build',
    () => {
    // A probe compiled against the recorder's include tree reported
    // CRASHREPORT, DEBUG, DEBUG_MIGRATING_MONS, SHELL and SUSPEND all defined,
    // with NH_DEVEL_STATUS at NH_STATUS_RELEASED.

    // #ifdef CRASHREPORT admits #bugreport.
    assert.equal(entry('bugreport').flags, GENERALCMD | NOFUZZERCMD);
    // #ifndef SHELL and #ifndef SUSPEND both fail, so neither row picks up
    // CMD_NOT_AVAILABLE and extcmds_match() still offers them.
    assert.equal(entry('shell').flags & CMD_NOT_AVAILABLE, 0);
    assert.equal(entry('suspend').flags & CMD_NOT_AVAILABLE, 0);
    assert.equal(
        extcmdlist.filter(({ flags }) => flags & CMD_NOT_AVAILABLE).length,
        0,
    );
    // #ifdef DEBUG admits #wizbury; the three
    // `NH_DEVEL_STATUS != RELEASED || defined(DEBUG)` regions ride on the
    // same macro.
    for (const name of ['wizbury', 'wizdispmacros', 'wizobjprobs',
        'wizmondiff']) {
        assert.equal(entry(name).flags & WIZMODECMD, WIZMODECMD);
    }
    // DEBUG_MIGRATING_MONS selects the longer of #migratemons' two
    // descriptions.
    assert.equal(
        entry('migratemons').ef_desc,
        'show migrating monsters and migrate N random ones',
    );
});

test('extcmds_match applies its four flags the way cmd.c:2523 does', () => {
    const ordinary = { wizard: false };
    const debug = { wizard: true };

    // ECM_NOFLAGS keeps only AUTOCOMPLETE rows, which is what the completion
    // hook asks for. #loot autocompletes; #levelchange and #lightsources do
    // too but are WIZMODECMD, so the same keystroke answers differently in
    // the two play modes.
    assert.deepEqual(names(extcmds_match('l', ECM_NOFLAGS, ordinary)), ['loot']);
    assert.deepEqual(
        names(extcmds_match('l', ECM_NOFLAGS, debug)),
        ['levelchange', 'lightsources', 'loot'],
    );
    assert.deepEqual(names(extcmds_match('n', ECM_NOFLAGS, ordinary)), ['name']);
    // #wait carries no AUTOCOMPLETE, so nothing expands towards it.
    assert.deepEqual(names(extcmds_match('wai', ECM_NOFLAGS, ordinary)), []);

    // ECM_IGNOREAC | ECM_EXACTMATCH is what tty_get_ext_cmd() passes: the
    // whole name, autocompleting or not, and nothing shorter.
    const exact = ECM_IGNOREAC | ECM_EXACTMATCH;
    assert.deepEqual(names(extcmds_match('wait', exact, ordinary)), ['wait']);
    assert.deepEqual(names(extcmds_match('wai', exact, ordinary)), []);
    // strcmpi() folds case through lowc().
    assert.deepEqual(names(extcmds_match('WaIt', exact, ordinary)), ['wait']);
    // INTERNALCMD rows are dropped before any comparison.
    assert.deepEqual(names(extcmds_match('clicklook', exact, ordinary)), []);
    // The WIZMODECMD filter is what stops an ordinary game from naming a
    // debug command, which is why can_do_extcmd()'s WIZMODECMD arm cannot be
    // reached through the prompt.
    assert.deepEqual(names(extcmds_match('levelchange', exact, ordinary)), []);
    assert.deepEqual(
        names(extcmds_match('levelchange', exact, debug)),
        ['levelchange'],
    );

    // ECM_NO1CHARCMD drops '#' and '?', the only single-character names.
    const oneCharacter = extcmds_match(null, ECM_IGNOREAC, ordinary)
        .filter((index) => extcmdlist[index].ef_txt.length === 1);
    assert.deepEqual(names(oneCharacter), ['#', '?']);
    assert.equal(
        extcmds_match(null, ECM_IGNOREAC | ECM_NO1CHARCMD, ordinary).length,
        extcmds_match(null, ECM_IGNOREAC, ordinary).length - 2,
    );

    // A null findstr returns every currently available row, so the two
    // filters that run before the comparison are the only ones left.
    assert.equal(
        extcmds_match(null, ECM_IGNOREAC, debug).length,
        extcmdlist.filter(
            ({ flags }) => !(flags & (CMD_NOT_AVAILABLE | INTERNALCMD)),
        ).length,
    );
    assert.equal(
        extcmds_match(null, ECM_NOFLAGS, debug).length,
        extcmdlist.filter(
            ({ flags }) => !(flags & (CMD_NOT_AVAILABLE | INTERNALCMD))
                && (flags & AUTOCOMPLETE),
        ).length,
    );
});

test('the extended-command matrix contains only source-selected inputs',
    () => {
    const ordinary = loadExtendedCommandPromptRecipe();
    const debug = loadExtendedCommandPromptDebugRecipe();
    assert.equal(ordinary.version, 5);
    assert.equal(ordinary.segments.length, 31);
    assert.equal(debug.segments.length, 4);
    for (const segment of [...ordinary.segments, ...debug.segments]) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // Every segment opens the prompt, and brackets it with waits so a
        // wrongly spent or wrongly saved turn shows in the next screen.
        assert.ok(segment.moves.includes(EXTCMD_KEY));
        assert.equal(segment.moves.at(0), '.');
        assert.equal(segment.moves.at(-1), '.');
    }
    // Only the debug recipe may set debug mode; the ordinary one has to stay
    // on the other side of the extcmds_match() gate.
    assert.equal(
        ordinary.segments.filter(
            ({ nethackrc }) => nethackrc.includes('playmode:debug'),
        ).length,
        0,
    );
    assert.equal(
        debug.segments.filter(
            ({ nethackrc }) => nethackrc.includes('playmode:debug'),
        ).length,
        4,
    );
});

test('NEWAUTOCOMP paints the expansion ahead of an unmoved cursor',
    async () => {
    const segment = segmentFor(`${EXTCMD_KEY}n${ESCAPE_KEY}${ESCAPE_KEY}`);

    // custompline() writes "# " and leaves the cursor at column 2.
    await runSegment({ ...segment, moves: `.${EXTCMD_KEY}` });
    assert.equal(topLine(), '#');
    assert.deepEqual(
        [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow], [2, 0],
    );

    // 'n' identifies #name alone, so ext_cmd_getlin_hook() rewrites the whole
    // buffer and hooked_tty_getlin() prints the rest of it, then walks the
    // cursor back over what it just printed: the pointer and cursor are left
    // where they were, one character into the buffer.
    await runSegment({ ...segment, moves: `.${EXTCMD_KEY}n` });
    assert.equal(topLine(), '# name');
    assert.deepEqual(
        [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow], [3, 0],
    );

    // Escape over a non-empty buffer clears the message window and reissues
    // the prompt rather than cancelling.
    await runSegment({ ...segment, moves: `.${EXTCMD_KEY}n${ESCAPE_KEY}` });
    assert.equal(topLine(), '#');
    assert.deepEqual(
        [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow], [2, 0],
    );
});

test('a stale expansion is blanked when the next keystroke stops matching',
    async () => {
    const segment = segmentFor(`${EXTCMD_KEY}nx${ESCAPE_KEY}${ESCAPE_KEY}`);
    // "nx" matches nothing, so the arm that erases the rest of the prior guess
    // overwrites the three characters "ame" the expansion had painted.
    await runSegment({ ...segment, moves: `.${EXTCMD_KEY}nx` });
    assert.equal(topLine(), '# nx');
    assert.deepEqual(
        [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow], [4, 0],
    );
});

test('the prompt spends a turn only when the command it names does',
    async () => {
    // Each pair is the keys typed and whether cmd.c's handler returns
    // ECMD_TIME: the two cancels and the unknown-command answer never do,
    // donull() always does, and dolook() does not for a sighted hero.
    for (const [moves, spendsTurn] of [
        [`${EXTCMD_KEY}${ESCAPE_KEY}`, false],
        [`${EXTCMD_KEY}${NEWLINE_KEY}`, false],
        [`${EXTCMD_KEY}xyzzy${NEWLINE_KEY}`, false],
        [`${EXTCMD_KEY}look${NEWLINE_KEY}`, false],
        [`${EXTCMD_KEY}wait${NEWLINE_KEY}`, true],
        // '#' names extcmdlist[0], so this dispatches doextcmd() from inside
        // doextcmd() and the inner #wait's ECMD_TIME has to travel back out
        // through both frames.
        [`${EXTCMD_KEY}${EXTCMD_KEY}${NEWLINE_KEY}wait${NEWLINE_KEY}`, true],
    ]) {
        const segment = segmentFor(moves);
        const before = await runSegment({ ...segment, moves: '.' });
        const start = {
            moves: game.moves,
            rng: before.getRngLog().length,
        };
        const after = await runSegment({
            ...segment,
            moves: `.${moves}`,
        });
        assert.equal(
            game.moves > start.moves,
            spendsTurn,
            `${JSON.stringify(moves)} spends a turn`,
        );
        if (!spendsTurn) {
            assert.equal(
                after.getRngLog().length,
                start.rng,
                `${JSON.stringify(moves)} consumes no randomness`,
            );
        }
    }
});

test('an unknown extended command answers with the initiator and the text',
    async () => {
    const segment = segmentFor(`${EXTCMD_KEY}xyzzy${NEWLINE_KEY}`);
    await runSegment({ ...segment, moves: `.${EXTCMD_KEY}xyzzy${NEWLINE_KEY}` });
    assert.equal(topLine(), '#xyzzy: unknown extended command.');

    // A prefix of a real command reaches the same answer, because
    // tty_get_ext_cmd() asks extcmds_match() for an exact match.
    const prefix = segmentFor(`${EXTCMD_KEY}wai${NEWLINE_KEY}`);
    await runSegment({ ...prefix, moves: `.${EXTCMD_KEY}wai${NEWLINE_KEY}` });
    assert.equal(topLine(), '#wai: unknown extended command.');

    // Both cancels return -1 without printing anything, so the top line the
    // prompt occupied is simply cleared.
    const cancel = segmentFor(`${EXTCMD_KEY}${ESCAPE_KEY}`);
    await runSegment({ ...cancel, moves: `.${EXTCMD_KEY}${ESCAPE_KEY}` });
    assert.equal(topLine(), '');
});

test('a named command with no ported handler stops the segment, not the key',
    async () => {
    // cmd.c doextcmd()'s switch dispatches the handlers this port owns and
    // throws on the rest. '#wipe' is an ordinary non-WIZMODECMD row, so
    // extcmds_match() finds it and can_do_extcmd() admits it; only the switch
    // refuses. Borrow an existing segment's seed and options, because no
    // matrix segment can hold these keys: C wipes its face and the port does
    // not.
    const base = segmentFor(`${EXTCMD_KEY}xyzzy${NEWLINE_KEY}`);
    const moves = `.${EXTCMD_KEY}wipe${NEWLINE_KEY}`;
    let boundary = null;
    const replay = await runSegment(
        { ...base, moves }, { onBoundary: (error) => { boundary = error; } },
    );

    assert.equal(boundary?.name, 'UnsupportedHeroCommandBoundaryError');
    assert.match(boundary.message, /the extended command 'wipe' is not ported/u);

    // resetCommandVars() runs before the throw, so the turn is given up
    // rather than half-spent.
    assert.equal(game.context.move, 0);
    assert.equal(game.context.run, 0);
    assert.equal(game.multi, 0);
    assert.equal(topLine(), '');

    // What the pre-dispatch boundaries promise does not hold here. They stop
    // before the command runs, so restoring the parsed command reproduces the
    // same refusal; this one stops after hooked_tty_getlin() has already eaten
    // "pray\n". pendingCommand therefore names '#' alone, which on a retry
    // would reopen an empty prompt rather than repeat the command.
    assert.equal(game.context.pendingCommand?.key, EXTCMD_KEY.charCodeAt(0));
    // A segment that runs to the end records one screen per key plus the one
    // the game starts on. The refusal paints nothing, so this one is short by
    // exactly the screen the command would have drawn.
    assert.equal(replay.getScreens().length, moves.length);
});

test('extended spellings share the four newly ported direct handlers',
    async () => {
    const base = segmentFor(`${EXTCMD_KEY}wait${NEWLINE_KEY}`);
    for (const [name, expected] of [
        ['engrave', /engrave requires an accessible ordinary floor/u],
        ['read', /What do you want to read\?/u],
        ['whatis', /What do you want to look at:/u],
        ['quiver', /What do you want to ready\?/u],
    ]) {
        let boundary = null;
        await runSegment({
            ...base,
            moves: `.${EXTCMD_KEY}${name}${NEWLINE_KEY}`,
        }, { onBoundary: (error) => { boundary = error; } });
        const visible = [
            boundary?.message ?? '',
            game.nhDisplay.grid.flat().map(({ ch }) => ch).join(''),
        ].join('\n');
        assert.match(visible, expected, name);
        assert.doesNotMatch(
            visible,
            new RegExp(`the extended command '${name}' is not ported`, 'u'),
            name,
        );
    }
});

test('extmenu stops the prompt before it opens, through either spelling',
    async () => {
    // getline.c:300 makes iflags.extmenu tty_get_ext_cmd()'s first test:
    // `if (iflags.extmenu) return extcmd_via_menu();`.  extcmd_via_menu() is
    // unported, so the port has to stop there rather than substitute the
    // typed prompt, which would paint different screens and draw different
    // random numbers.  No matrix segment can hold this: C opens a menu.
    const base = segmentFor(`${EXTCMD_KEY}wait${NEWLINE_KEY}`);
    const moves = `.${EXTCMD_KEY}wait${NEWLINE_KEY}`;

    // Both spellings, because the bare form reaches applyBooleanOption()
    // directly while the value-carrying form only arrives through
    // HANDLED_BOOLEAN_OPTIONS.
    for (const line of ['OPTIONS=extmenu\n', 'OPTIONS=extmenu:true\n']) {
        let boundary = null;
        const replay = await runSegment(
            { ...base, nethackrc: base.nethackrc + line, moves },
            { onBoundary: (error) => { boundary = error; } },
        );
        assert.equal(boundary?.name, 'UnsupportedHeroCommandBoundaryError', line);
        assert.match(boundary.message, /extcmd_via_menu\(\)/u);
        // The test precedes extcmd_initiator() and the custompline() paint, so
        // the prompt never reaches row zero and only the screens before the
        // '#' keystroke were drawn.
        assert.equal(topLine(), '', line);
        assert.equal(replay.getScreens().length, 2, line);
    }

    // The negated form must leave the typed prompt working, which is what
    // separates the guard from an unconditional refusal.  It negates an
    // enabling line rather than the default, so reaching the prompt proves the
    // negation wrote iflags instead of merely failing to turn it on.
    const off = await runSegment({
        ...base,
        nethackrc: `${base.nethackrc}OPTIONS=extmenu\nOPTIONS=!extmenu\n`,
        moves,
    });
    assert.equal(game.iflags.extmenu, false);
    assert.equal(off.getScreens().length, moves.length + 1);
});

test('an EOF byte cancels the prompt where Escape would restart it',
    async () => {
    // tty_nhgetch() maps NUL to Escape and cannot deliver EOF itself, but
    // cmd.c:452 ends pgetchar() with `return (char) ch;` and char is signed,
    // so a 0xFF byte arrives as -1.  getline.c:85 tests `c == '\033' || c ==
    // EOF` and sets iflags.term_gone for the EOF half; getline.c:88 then gates
    // the restart on `c == '\033'` alone, so EOF always cancels -- even over
    // text, where Escape clears the buffer and redraws the prompt instead.
    const EOF_KEY = '\xFF';
    const base = segmentFor(`${EXTCMD_KEY}xyzzy${NEWLINE_KEY}`);

    // Over an empty buffer both arms would cancel, so this pins term_gone.
    await runSegment({ ...base, moves: `.${EXTCMD_KEY}${EOF_KEY}` });
    assert.equal(topLine(), '');
    assert.equal(game.iflags.term_gone, 1);

    // Over existing text the two arms diverge, which is the whole gate.
    await runSegment({ ...base, moves: `.${EXTCMD_KEY}wa${EOF_KEY}` });
    assert.equal(topLine(), '');
    assert.equal(game.iflags.term_gone, 1);

    // The NUL control: tty_nhgetch() has already turned it into Escape by the
    // time the gate runs, so it restarts and leaves term_gone alone.  Without
    // this case a gate that cancelled on every byte would still pass above.
    await runSegment({ ...base, moves: `.${EXTCMD_KEY}wa\x00` });
    assert.equal(topLine(), EXTCMD_KEY);
    assert.equal(game.iflags.term_gone, undefined);

    // And the untouched prompt, so the two cancels are read against a row
    // that does hold the typed text.
    await runSegment({ ...base, moves: `.${EXTCMD_KEY}wa` });
    assert.equal(topLine(), `${EXTCMD_KEY} wa`);
});

test('a 77-character answer fills the prompt row without wrapping',
    async () => {
    // hooked_tty_getlin() takes printable bytes while pos < BUFSZ - 1 and
    // pos < COLNO. custompline() has put "# " in columns 0 and 1, so the
    // matrix segment's 77 characters end in column 78 and leave the cursor on
    // column 79 -- the column topl_putsym() keeps unused, and the last one
    // reachable before its unported newline arm.
    const segment = loadExtendedCommandPromptRecipe().segments.find(
        ({ moves }) => moves.includes('abcdefghijklmnopqrstuvwxyz'),
    );
    assert.ok(segment, 'the matrix contains an input-length segment');
    const typed = segment.moves.slice(2, -2);
    assert.equal(typed.length, 77);

    await runSegment({ ...segment, moves: `.${EXTCMD_KEY}${typed}` });
    assert.equal(topLine(), `# ${typed}`);
    assert.deepEqual(
        [game.nhDisplay.cursorCol, game.nhDisplay.cursorRow], [79, 0],
    );
});
