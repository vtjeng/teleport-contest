// Enforces js/cmd.js's result-tail rule: every command arm of rhack() hands
// its handler's ECMD_* result to rhackResultTail(), the one port of
// cmd.c rhack():3803-3825, and never spells the reset or the turn out itself.
// An arm that resets unconditionally empties CQ_REPEAT, so ^A after the
// command finds nothing to repeat where C runs the command again.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { extcmdlist, PREFIXCMD } from '../js/extcmdlist_data.js';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const C_SOURCE_DIR = join(PROJECT_ROOT, 'nethack-c', 'upstream', 'src');

const cmdSource = readFileSync(join(PROJECT_ROOT, 'js', 'cmd.js'), 'utf8');

// The text of one top-level function, from its declaration to the closing
// brace in column 0.
function functionText(source, declaration) {
    const start = source.indexOf(declaration);
    assert.notEqual(start, -1, `${declaration} is declared in js/cmd.js`);
    const end = source.indexOf('\n}\n', start);
    assert.notEqual(end, -1, `${declaration} has a closing brace`);
    return source.slice(start, end);
}

const withoutComments = (text) => text.split('\n')
    .filter((line) => !/^\s*\/\//u.test(line)).join('\n');

const rhackBody = withoutComments(
    functionText(cmdSource, 'export async function rhack('),
);

const count = (text, pattern) => (text.match(pattern) ?? []).length;

test('rhack() resets command variables itself only where C does so before the result tail', () => {
    // The five resets rhack() makes outside 3803-3825, each a
    // reset_cmd_vars(TRUE) followed by `return`: no command or ESC
    // (cmd.c:3668); a prefix pressed twice (3766); no command or ESC for the
    // key read after a prefix (3668 again, reached through
    // got_prefix_input); the prefix refusal (3693-3722), whose ECMD_FAIL the
    // port resets where it reports it; and the '#' arm's own prefix-twice
    // test for a typed prefix command. Any other reset in rhack() is a
    // result tail spelled out by hand: lower this count when one of the five
    // goes, and route a new arm through rhackResultTail() instead of raising
    // it.
    assert.equal(count(rhackBody, /\bresetCommandVars\(state\);/gu), 5);
    assert.equal(count(rhackBody, /\bresetCommandVars\(/gu), 5);
    assert.equal(count(rhackBody, /\breset_cmd_vars\(/gu), 0);
});

test('rhack() leaves context.move and the kicked square to the result tail', () => {
    // cmd.c:3818-3825 is the only place rhack() sets context.move back to
    // TRUE or clears gk.kickedloc; the movement arms return earlier through
    // executeMovement(), which is a separate function.
    assert.equal(count(rhackBody, /context\.move\s*=\s*(1|true)/gu), 0);
    assert.equal(count(rhackBody, /clear_kickedloc\(/gu), 0);
    assert.equal(count(rhackBody, /ECMD_CANCEL \| ECMD_FAIL/gu), 0);
});

test('rhack() reads the command after a prefix in its own loop and never re-enters itself', () => {
    // cmd.c:3762-3773 ends a prefix command with `goto got_prefix_input`,
    // whether the prefix came from its key or by name through doextcmd().
    // The label sits below the reset of iflags.menu_requested and
    // context.nopick at 3634-3635 and keeps `firsttime`, `prefix_seen` and
    // `was_m_prefix`. A nested rhack() call in place of the goto re-runs the
    // entry reset, so `#reqmenu` followed by a direction lost the request
    // before set_move_cmd() read it. One match is the declaration itself.
    assert.equal(count(rhackBody, /\brhack\(/gu), 1);
    // One read at got_prefix_input for the first command and one in the
    // prefix loop; a third would be a prefix path reading its own key.
    assert.equal(count(rhackBody, /\bparseCommand\(/gu), 2);
    // The entry reset runs once, above the loop.
    assert.equal(count(rhackBody, /iflags\.menu_requested = false;/gu), 1);
    assert.equal(count(rhackBody, /context\.nopick = 0;/gu), 1);
    // C has four PREFIXCMD rows; both ways of reaching one share the loop.
    assert.deepEqual(
        extcmdlist.filter((row) => row.flags & PREFIXCMD)
            .map((row) => row.ef_txt).sort(),
        ['fight', 'reqmenu', 'run', 'rush'],
    );
});

test('the result tail is declared once and tests the three results in C order', () => {
    const tail = withoutComments(
        functionText(cmdSource, 'function rhackResultTail('),
    );
    assert.equal(count(cmdSource, /^function rhackResultTail\(/gmu), 1);
    const cancel = tail.indexOf('(res & (ECMD_CANCEL | ECMD_FAIL)) !== 0');
    const ok = tail.indexOf('(res & (ECMD_OK | ECMD_TIME)) === ECMD_OK');
    const time = tail.indexOf('(res & ECMD_TIME) !== 0');
    assert.ok(cancel !== -1 && cancel < ok && ok < time, tail);
    // 3812 resets the queues; 3814 keeps them unless a negative count holds.
    assert.match(tail, /reset_cmd_vars\(true, state\)/u);
    assert.match(tail, /reset_cmd_vars\(state\.multi < 0, state\)/u);
    assert.match(tail, /func !== 'dokick'/u);
});

// Arms that discard their handler's JavaScript result and pass ECMD_OK,
// because the handler's port returns nothing or a value of another kind.
function constantOkCommands() {
    const commands = [];
    const arm = /if \(command === '([^']+)'\) \{\n(?:(?!\n {8}\}\n)[\s\S])*?rhackResultTail\(ECMD_OK, state\);/gu;
    for (const match of rhackBody.matchAll(arm)) commands.push(match[1]);
    return commands;
}

// Every `return` expression of one C function in nethack-c/upstream/src.
function cReturns(name) {
    for (const file of readdirSync(C_SOURCE_DIR).filter((f) => f.endsWith('.c'))) {
        const lines = readFileSync(join(C_SOURCE_DIR, file), 'latin1').split('\n');
        for (let i = 1; i < lines.length; i += 1) {
            if (!lines[i].startsWith(`${name}(`)) continue;
            if (!/^(staticfn |static )?int\s*$/u.test(lines[i - 1])) continue;
            let end = i;
            while (lines[end] !== '}') end += 1;
            const body = lines.slice(i, end).join('\n');
            return [...body.matchAll(/\breturn ([^;]*);/gu)]
                .map((match) => match[1].replace(/\s+/gu, ' ').trim());
        }
    }
    throw new Error(`C function ${name}() not found under ${C_SOURCE_DIR}`);
}

// True when every exit of the C function is ECMD_OK, following a `return
// other_function(...)` into that function.
function returnsOnlyOk(name, seen = new Set()) {
    if (seen.has(name)) return true;
    seen.add(name);
    const returns = cReturns(name);
    assert.ok(returns.length > 0, `${name}() has a return statement`);
    return returns.every((expression) => {
        if (expression === 'ECMD_OK') return true;
        const call = /^(\w+)\(/u.exec(expression);
        return call ? returnsOnlyOk(call[1], seen) : false;
    });
}

test('an arm passes a constant ECMD_OK only for a C function that returns nothing else', () => {
    const commands = constantOkCommands();
    // 23 arms: redraw, help, whatdoes, whatis, glance, options, autopickup,
    // eight debug-mode commands, save, and the seven equipment displays.
    // Their C functions return ECMD_OK from every exit, which the loop below
    // reads from the C source. The count fails in both directions: lower it
    // when an arm starts passing its handler's result, and give a reason
    // here before raising it.
    assert.equal(commands.length, 23, commands.join(' '));
    assert.equal(
        commands.length,
        count(rhackBody, /rhackResultTail\(ECMD_OK, state\);/gu),
        'every constant-ECMD_OK call sits in a `command === name` arm',
    );
    for (const command of commands) {
        const row = extcmdlist.find((entry) => entry.ef_txt === command);
        assert.ok(row, `${command} is an extcmdlist[] row`);
        assert.ok(
            returnsOnlyOk(row.ef_funct),
            `${row.ef_funct}() (${command}) returns only ECMD_OK in C`,
        );
    }
});

test('the C scan tells an ECMD_OK-only function from one that cancels or takes time', () => {
    // dodiscovered() (o_init.c:764-873) and doattributes()
    // (insight.c:2009-2019) are the ^A cases: ECMD_OK from every exit.
    assert.equal(returnsOnlyOk('dodiscovered'), true);
    assert.equal(returnsOnlyOk('doattributes'), true);
    // ddoinv() (invent.c:3006-3009) returns dispinv_with_action(), which
    // returns ECMD_OK or iactions.c itemactions(), itself ECMD_OK only.
    assert.equal(returnsOnlyOk('ddoinv'), true);
    // doidtrap() (pager.c:2336-2389) can return ECMD_CANCEL and donull()
    // (do.c:2351-2358) ECMD_TIME, so neither may take a constant.
    assert.equal(returnsOnlyOk('doidtrap'), false);
    assert.equal(returnsOnlyOk('donull'), false);
});
