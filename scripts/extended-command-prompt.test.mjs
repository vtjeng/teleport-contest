import assert from 'node:assert/strict';
import test from 'node:test';

import { extcmds_match } from '../js/cmd.js';
import {
    AUTOCOMPLETE,
    CMD_M_PREFIX,
    CMD_NOT_AVAILABLE,
    ECM_EXACTMATCH,
    ECM_IGNOREAC,
    ECM_NO1CHARCMD,
    ECM_NOFLAGS,
    GENERALCMD,
    IFBURIED,
    INTERNALCMD,
    NOFUZZERCMD,
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
        },
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
