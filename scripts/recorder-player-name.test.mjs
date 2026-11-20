// The recorder passes the session's player name to NetHack as "-u <name>",
// and NetHack reads any argument starting with '-' as an option
// (earlyarg.c early_options()). Names starting with '-' are out of scope
// (Vincent, 2026-11-13); this pins the recorder's refusal of them, which
// scripts/c-message-exemptions.mjs relies on for its command-line entries.
//
// unixmain.c process_options() (385-396) copies that name over the one the
// nethackrc set, so the name C plays under is the recorder's parse of the
// nethackrc, not NetHack's. The port repeats the parse
// (js/unixmain.js parseNethackrcName()), and the table below pins the
// recorder, the shared parse and the port's startup to the same answers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { recorderPlayerName } from './record-session.mjs';
import { parseNethackrcName, process_options, recorderArguments } from '../js/unixmain.js';
import { utf8Text } from '../js/hacklib.js';

const ROLE = 'role:Valkyrie,race:human,gender:female,align:neutral';

// [nethackrc, name the recorder passes]. The first twelve are the variants a
// recorded C game showed the port getting wrong (2026-11-20, 110 name
// variants, /tmp/claude-1000/fable-hunt/nm{,2}); the rest are common forms
// whose recorded games matched before and must keep matching.
const NAME_TABLE = [
    // The rc parser may take a name from "name=Foo" inside OPTIONS or from
    // the NAME statement, but the recorder looks only for "name:", so it
    // passes "" and C asks "Who are you?".
    [`OPTIONS=name=Foo,${ROLE}\n`, ''],
    [`NAME=Foo\nOPTIONS=${ROLE}\n`, ''],
    // The rc parser accepts the abbreviation "nam"; the recorder does not.
    [`OPTIONS=nam:Abbrev,${ROLE}\n`, ''],
    // The recorder returns the first name: option, whatever the rc parser
    // makes of a second one.
    [`OPTIONS=name:First,${ROLE}\nOPTIONS=name:Second\n`, 'First'],
    // The recorder ignores CHOOSE sections, so the first section's name wins
    // whichever section the player picks.
    [`CHOOSE=A,B\n[A]\nOPTIONS=name:ChoiceA,${ROLE}\n[B]\nOPTIONS=name:ChoiceB,${ROLE}\n`, 'ChoiceA'],
    // JavaScript trim() removes leading spaces, which NetHack keeps.
    [`OPTIONS=name: Spaced,${ROLE}\n`, 'Spaced'],
    [`OPTIONS=name:  padded  ,${ROLE}\n`, 'padded'],
    // It also removes Unicode white space: a no-break space (U+00A0), an
    // ideographic space (U+3000) and a byte-order mark (U+FEFF), inside the
    // value or at the start of the file.
    [`OPTIONS=name: Nbsp ,${ROLE}\n`, 'Nbsp'],
    [`OPTIONS=name:　Ideo,${ROLE}\n`, 'Ideo'],
    [`OPTIONS=name:﻿Bom,${ROLE}\n`, 'Bom'],
    [`﻿OPTIONS=name:FileBom,${ROLE}\n`, 'FileBom'],
    // The recorder splits lines on '\n' alone, so a trailing backslash does
    // not continue the line into the next, as it does for NetHack.
    [`OPTIONS=name:Multi\\\n,${ROLE}\n`, 'Multi\\'],

    // A plain name, and a hyphenated one that plnamesuffix() later splits.
    [`OPTIONS=name:Agnes,${ROLE}\n`, 'Agnes'],
    [`OPTIONS=name:Foo-Val-Hum-Fem-Neu,${ROLE}\n`, 'Foo-Val-Hum-Fem-Neu'],
    // No name option, an empty one, a negated one and one without a value
    // all pass "".
    [`OPTIONS=${ROLE}\n`, ''],
    [`OPTIONS=name:,${ROLE}\n`, ''],
    [`OPTIONS=!name,${ROLE}\n`, ''],
    [`OPTIONS=name,${ROLE}\n`, ''],
    ['', ''],
    // Keyword and option name match in any case, with one optional space
    // before '=', after an indented line or a later OPTIONS line.
    [`options=name:lowerkw,${ROLE}\n`, 'lowerkw'],
    [`OPTIONS =name:EqSpace,${ROLE}\n`, 'EqSpace'],
    [`OPTIONS=NAME:UpperOpt,${ROLE}\n`, 'UpperOpt'],
    [`  OPTIONS=name:Indented,${ROLE}\n`, 'Indented'],
    [`OPTIONS=${ROLE}\nOPTIONS=name:Late\n`, 'Late'],
    // A comment line is skipped, as are options that merely contain "name:".
    [`# OPTIONS=name:Commented\nOPTIONS=name:Real,${ROLE}\n`, 'Real'],
    [`OPTIONS=dogname:name:Rex,${ROLE},name:AfterDog\n`, 'AfterDog'],
    // A carriage return, a tab, a vertical tab and a form feed at the end are
    // trimmed; an interior tab or space is kept.
    [`OPTIONS=name:CRLF,${ROLE}\r\n`, 'CRLF'],
    [`OPTIONS=name:Tabbed\t,${ROLE}\n`, 'Tabbed'],
    [`OPTIONS=name:Vt\u000b,${ROLE}\n`, 'Vt'],
    [`OPTIONS=name:tab\tname,${ROLE}\n`, 'tab\tname'],
    [`OPTIONS=name:Sir Lancelot,${ROLE}\n`, 'Sir Lancelot'],
    // A non-ASCII name passes as decoded text; C receives its UTF-8 bytes.
    [`OPTIONS=name:Zoë,${ROLE}\n`, 'Zoë'],
    // The keyword match uses JavaScript's Unicode case mapping, under which
    // LONG S (U+017F) uppercases to S, so this line counts as OPTIONS.
    [`option\u017f=name:LongS,${ROLE}\n`, 'LongS'],
];

test('the recorder, the shared parse and the port agree on the player name', () => {
    for (const [rc, name] of NAME_TABLE) {
        const label = JSON.stringify(rc);
        assert.equal(parseNethackrcName(rc) ?? '', name, label);
        assert.equal(recorderPlayerName(rc), name, label);
        assert.deepEqual(recorderArguments(rc), ['-u', name], label);
        const state = { plname: 'FromConfig', gp: { plnamelen: 7 } };
        process_options(recorderArguments(rc), state);
        // plname holds C's bytes: the argument's UTF-8 form.
        assert.equal(state.plname, utf8Text(name), label);
        assert.equal(state.gp.plnamelen, 0, label);
    }
});

test('process_options() copies at most PL_NSIZ - 1 bytes of the -u name', () => {
    // strncpy(svp.plname, argv[0], sizeof svp.plname - 1): PL_NSIZ is 32, so
    // 31 bytes survive. The 40-letter name is over the limit.
    const state = { plname: '', gp: { plnamelen: 0 } };
    process_options(['-u', 'A'.repeat(40)], state);
    assert.equal(state.plname, 'A'.repeat(31));
    // A two-byte UTF-8 letter that straddles byte 31 is cut in half, as
    // strncpy() cuts bytes: 30 ASCII letters, then the first byte of 'ë'.
    process_options(['-u', `${'B'.repeat(30)}ë`], state);
    assert.equal(state.plname, `${'B'.repeat(30)}Ã`);
});

test('record-session.mjs launches NetHack with the shared argument vector', () => {
    // The recorder must not grow its own copy of the parse; it imports the
    // one the port uses (AGENTS.md, "When a change creates a rule").
    const source = readFileSync(new URL('./record-session.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /function parseNethackrcName\b/u);
    assert.match(source, /^import \{recorderArguments\} from '\.\.\/js\/unixmain\.js';$/mu);
    assert.match(source, /const args = recorderArguments\(seg\.nethackrc\);/u);
});

test('the port starts process_options() from the same argument vector', () => {
    const source = readFileSync(new URL('../js/jsmain.js', import.meta.url), 'utf8');
    assert.match(source, /process_options\(recorderArguments\(this\._nethackrc\), g\);/u);
});

test('the recorder passes an ordinary name through', () => {
    // A plain name and one with an interior hyphen (role suffix style) are
    // valid; only a leading '-' reaches early_options().
    assert.equal(recorderPlayerName('OPTIONS=name:Agnes,role:Val\n'), 'Agnes');
    assert.equal(recorderPlayerName('OPTIONS=name:Ag-nes\n'), 'Ag-nes');
    // No name option: C prompts for one, and the recorder passes "".
    assert.equal(recorderPlayerName('OPTIONS=role:Val\n'), '');
});

test('the recorder refuses a name that NetHack would read as an option', () => {
    // -s runs prscore(), --showpaths reveal_paths(); both print instead of
    // starting a game.
    for (const name of ['-s', '--showpaths', '-d/', '--version:copy']) {
        assert.throws(() => recorderPlayerName(`OPTIONS=name:${name}\n`), /starts with '-'/u, name);
    }
});
