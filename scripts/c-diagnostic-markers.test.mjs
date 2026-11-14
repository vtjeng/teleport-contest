// A ported function must not drop a C impossible() or panic() without a
// trace: it ports the call, or marks it with note_unported('pline.c
// impossible') or note_unported('end.c panic'), or, for a panic() in a
// synchronous function, throws with a "panic" entry in
// scripts/throw-site-list.json. scripts/c-diagnostic-markers.mjs explains how
// the calls and the markers are counted.
//
// The exceptions below are pinned by count, each and in total, in both
// directions. Lower a count when you port or mark a call; a new deficit
// needs the port, a marker, or a new entry here with its reason.

import assert from 'node:assert/strict';
import test from 'node:test';

import { tokenizePreprocessed } from './c-message-coverage.mjs';
import {
    cDiagnosticSites,
    diagnosticDeficits,
    jsFunctionMarkers,
    scanDeficits,
} from './c-diagnostic-markers.mjs';
import { assertExceptionCount } from './exception-count.mjs';
import { requireCompiler } from './recorder-headers.mjs';

// include/flag.h notice_mon_on() expands to impossible("mon_notices_blocked<0")
// at each caller; js/hack.js notice_mon_on() ports the macro once and holds
// the marker, so the callers have none of their own.
const NOTICE_MON_ON = 'the flag.h notice_mon_on() macro; js/hack.js notice_mon_on() holds the marker';
// The port reads dungeon.lua through the generated DUNGEON_DATA
// (scripts/generate-dungeon-data.mjs), not as a Lua table, so C's checks of
// the table's Lua types have no counterpart.
const DUNGEON_LUA = 'a type check of the dungeon.lua table, which the port reads as generated DUNGEON_DATA';
// The C test cannot succeed in C either.
const DEAD_IN_C = 'its condition cannot hold, in C as in the port';
// C checks a fixed-size buffer, an allocation, or a host file read that the
// port does not have.
const NO_C_RESOURCE = 'checks a C buffer, allocation or file read the port does not have';
// The port saves and restores live object graphs, without C's counting and
// writing passes, chained reads or deferred frees.
const SAVE_GRAPH = 'checks a step of C\'s save or restore stream that the port\'s object-graph save has no counterpart for';

const EXCEPTIONS = new Map([
    ['src/allmain.c newgame', { count: 1, reason: NOTICE_MON_ON }],
    ['src/do.c goto_level', { count: 1, reason: NOTICE_MON_ON }],
    ['src/read.c seffect_magic_mapping', { count: 1, reason: NOTICE_MON_ON }],
    ['src/save.c dosave0', { count: 1, reason: NOTICE_MON_ON }],
    ['src/teleport.c teleds', { count: 1, reason: NOTICE_MON_ON }],
    ['src/wizcmds.c wiz_map', { count: 1, reason: NOTICE_MON_ON }],
    ['src/dungeon.c get_dgn_flags', { count: 2, reason: DUNGEON_LUA }],
    ['src/dungeon.c init_dungeon_levels', { count: 1, reason: DUNGEON_LUA }],
    ['src/dungeon.c init_dungeon_branches', { count: 1, reason: DUNGEON_LUA }],
    ['src/dungeon.c init_dungeon_dungeons', { count: 2, reason: DUNGEON_LUA }],
    // dungeon.c:1218 is the panic1() for a failed nhl_init(), which the
    // port's Lua state setup cannot report.
    ['src/dungeon.c init_dungeons', { count: 3, reason: DUNGEON_LUA }],
    // cmdcount_nht is a typedef of long, so the cast never changes the count.
    ['src/cmd.c get_count', { count: 1, reason: DEAD_IN_C }],
    // youprop.h defines Punished as (uball != 0).
    ['src/insight.c status_enlightenment', { count: 1, reason: DEAD_IN_C }],
    // strchr() of a nonzero byte never returns the terminator, so the index
    // is always in range.
    ['src/options.c optfn_disclose', { count: 1, reason: DEAD_IN_C }],
    ['src/glyphs.c parse_id', { count: 1, reason: NO_C_RESOURCE }],
    // MAX_BMASK bounds C's fixed bmask[] table (mkmaze.c:1900).
    ['src/mkmaze.c mk_bubble', { count: 1, reason: NO_C_RESOURCE }],
    ['src/nhlua.c l_nhcore_init', { count: 1, reason: NO_C_RESOURCE }],
    ['src/nhlua.c nhl_loadlua', { count: 1, reason: NO_C_RESOURCE }],
    ['src/nhlua.c nhlL_newstate', { count: 1, reason: NO_C_RESOURCE }],
    // js/pager.js reads the generated DATA_BASE_ENTRIES, not the data file.
    ['src/pager.c checkfile', { count: 3, reason: NO_C_RESOURCE }],
    ['src/rect.c init_rect', { count: 1, reason: NO_C_RESOURCE }],
    // C's msg[BUFSZ] read buffer; the port's save already cuts each message.
    ['src/restore.c restore_msghistory', { count: 1, reason: NO_C_RESOURCE }],
    // tty create_nhwindow() panics rather than return WIN_ERR.
    ['src/rumors.c others_check', { count: 1, reason: NO_C_RESOURCE }],
    // light.c:438 compares C's count pass with its write pass.
    ['src/light.c save_light_sources', { count: 1, reason: SAVE_GRAPH }],
    // One id lookup stands for lookup_id_mapping() and find_oid()/find_mid();
    // its "no id mapping" throw covers the miss.
    ['src/light.c relink_light_sources', { count: 1, reason: SAVE_GRAPH }],
    ['src/mkobj.c dobjsfree', { count: 1, reason: SAVE_GRAPH }],
    ['src/restore.c restobjchn', { count: 1, reason: SAVE_GRAPH }],
    ['src/restore.c restmonchn', { count: 1, reason: SAVE_GRAPH }],
    ['src/save.c savelev', { count: 1, reason: SAVE_GRAPH }],
    ['src/botl.c percentage', { count: 1,
        reason: 'js/themerooms.js percentage() is the Lua selection filter, not botl.c percentage()' }],
    ['src/windows.c choose_classes_menu', { count: 2,
        reason: 'the port has only category 1, the one its sole caller (options.c) passes' }],
    ['win/tty/topl.c topl_putsym', { count: 1,
        reason: 'the port writes through state.nhDisplay and keeps no WIN_MESSAGE record to be missing' }],
]);
// The sum of the counts above.
const EXCEPTION_PIN = 39;

test('each ported C function ports or marks its missing diagnostics', async () => {
    const { deficits } = await scanDeficits({
        compiler: requireCompiler('the check reads the preprocessed C sources'),
    });
    const problems = [];
    for (const d of deficits) {
        const pinned = EXCEPTIONS.get(d.key);
        const where = `${d.key}() (C lines ${d.lines.join(', ')}; ${d.js.join(', ')})`;
        if (!pinned) problems.push(`${where}: ${d.deficit} unmarked; port or mark them`);
        else if (pinned.count !== d.deficit)
            problems.push(`${where}: ${d.deficit} unmarked, pinned at ${pinned.count}`);
    }
    const observed = new Set(deficits.map((d) => d.key));
    for (const [key, { reason }] of EXCEPTIONS) {
        if (!observed.has(key)) problems.push(`${key}: no deficit now; remove its entry`);
        if (!reason) problems.push(`${key}: needs a reason`);
    }
    assert.deepEqual(problems, []);
    const total = [...EXCEPTIONS.values()].reduce((n, e) => n + e.count, 0);
    assertExceptionCount(total, EXCEPTION_PIN, {
        what: 'pinned unmarked diagnostics',
        pin: 'EXCEPTION_PIN in scripts/c-diagnostic-markers.test.mjs',
    });
});

test('deficits count missing calls less markers and listed panic throws', () => {
    // Hand-written preprocessor output for src/x.c; the marker numbers the
    // line after it as line 1, where f() starts.
    const text = [
        '# 1 "src/x.c"',
        'void f(int n) {', // 1
        '    if (n < 0) impossible("f: negative count %d", n);', // 2: missing
        '    if (n > 9) impossible("f: count far too big %d", n);', // 3: missing
        '    if (n == 5) impossible("f: text the port has", n);', // 4: covered
        '    if (n == 6) panic("f: panic with a listed throw");', // 5: listed throw
        '    if (n == 7) impossible("%s", buf);', // 6: no checked fragment
        '}',
        'void g(void) { impossible("g: not ported at all"); }', // 8: no JS g()
        'void h(void) { impossible("h: ported as h_steps"); }', // 9
    ].join('\n');
    const sources = [{ source: 'src/x.c', tokens: tokenizePreprocessed(text) }];
    const corpus = ['f: text the port has'].join('\0');
    const sites = cDiagnosticSites(sources, corpus, () => null);
    // Line 6 has no fragment of MIN_FRAGMENT_LENGTH, so it is not a site.
    assert.deepEqual(sites.map((s) => [s.function, s.line, s.missing]), [
        ['f', 2, true], ['f', 3, true], ['f', 4, false], ['f', 5, true],
        ['g', 8, true], ['h', 9, true],
    ]);
    const js = [
        // x.js f() marks one arm, inside a nested arrow, which counts.
        ...jsFunctionMarkers('x.js', [
            'export function f(n) {',
            "    const arm = () => note_unported('pline.c impossible');",
            '    if (n < 0) arm();',
            "    note_unported('other.c thing');", // not a diagnostic label
            '}',
            'export async function h_steps() {}', // ports C h() under _steps
        ].join('\n')),
        // Another file's f() is not x.c's port, since x.js has one.
        ...jsFunctionMarkers('y.js', [
            "export function f() { note_unported('pline.c impossible'); }",
        ].join('\n')),
    ];
    const deficits = diagnosticDeficits(sites, js, new Set(['src/x.c:5']));
    assert.deepEqual(deficits.map((d) => [d.key, d.lines, d.markers, d.deficit, d.js]), [
        ['src/x.c f', [2, 3], 1, 1, ['js/x.js:1']],
        ['src/x.c h', [9], 0, 1, ['js/x.js:6']],
    ]);
});
