// A note_unported('<file>.c <function>') call records a C call the port
// skips because <function> has no JavaScript port. Once js/ defines that
// function, the marker is stale: AGENTS.md, "Port whole source units and wire
// their callers", rule 5, says to replace it with the call C makes. This
// check fails when a marker names a function that jsFunctionNames() finds.
//
// The exceptions below are pinned by count in both directions. Lower a count
// when you wire a site; a new site needs the real call, or a new entry here
// with its reason.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { blankCommentsAndStrings } from './check-namespace-members.mjs';
import { PROJECT_ROOT, UPSTREAM_ROOT, jsFunctionNames } from './c-functions.mjs';

const JS_ROOT = join(PROJECT_ROOT, 'js');

// impossible() is ported as js/pline.js impossible(), which is async; many of
// these callers are synchronous and would need to become async to wait for
// it. Each site is an arm C reaches only on inconsistent game state. Every
// impossible() marker uses this label, whatever C file it sits in, because
// scripts/c-diagnostic-markers.test.mjs counts markers by it.
const IMPOSSIBLE = 'impossible() diagnostic not yet wired to js/pline.js impossible()';

const EXCEPTIONS = new Map([
    // 267: vault.c find_guard_dest() now awaits impossible() and tele()
    // (2026-11-14).
    ['pline.c impossible', { count: 267, reason: IMPOSSIBLE }],
    // js/shknam.js shkname() must stay synchronous (its value is used inside
    // expressions) and js/end.js panic() never settles; no valid state
    // reaches the arm.
    ['end.c panic', { count: 1, reason: 'synchronous shkname() cannot wait for async panic()' }],
    // The named function is ported; the marker inside it records an input
    // the port cannot read: a host file, or the fuzzer's random key loop.
    // fopen_wizkit_file() reads $HOME/.nethackrc and directories; its two
    // markers are the other playground files and names outside the
    // playground or HOME, whose bytes the port does not have.
    ['files.c fopen_wizkit_file', { count: 2, reason: 'reading a host wizkit file is unported' }],
    ['nhlua.c nhl_loadlua', { count: 2, reason: 'loading a host file that is not a bundled Lua program is unported' }],
    ['wizcmds.c wiz_fuzzer', { count: 1, reason: 'the fuzzer key loop is unported' }],
]);

const MARKER = /\bnote_unported\(\s*/gu;
const LABEL = /^(['"`])([A-Za-z0-9_-]+\.c)\s+([A-Za-z_]\w*)/u;

function walk(directory, out = []) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) walk(path, out);
        else if (entry.name.endsWith('.js')) out.push(path);
    }
    return out;
}

// Each note_unported() call in code (not in a comment) whose literal label
// starts with '<file>.c <identifier>', as { key, function, site }.
export function markers(jsRoot = JS_ROOT) {
    const found = [];
    for (const path of walk(jsRoot).sort()) {
        const text = readFileSync(path, 'utf8');
        for (const match of blankCommentsAndStrings(text).matchAll(MARKER)) {
            const label = LABEL.exec(text.slice(match.index + match[0].length));
            if (!label) continue;
            const line = text.slice(0, match.index).split('\n').length;
            found.push({
                key: `${label[2]} ${label[3]}`,
                function: label[3],
                site: `${path.slice(PROJECT_ROOT.length + 1)}:${line}`,
            });
        }
    }
    return found;
}

// The markers whose named function js/ defines, grouped by label key.
export function staleMarkers(jsRoot = JS_ROOT) {
    const defined = jsFunctionNames(jsRoot);
    const groups = new Map();
    for (const marker of markers(jsRoot)) {
        if (!defined.has(marker.function)) continue;
        if (!groups.has(marker.key)) groups.set(marker.key, []);
        groups.get(marker.key).push(marker.site);
    }
    return groups;
}

test('no note_unported() label names a function that js/ defines', () => {
    const groups = staleMarkers();
    const unexpected = [...groups]
        .filter(([key]) => !EXCEPTIONS.has(key))
        .map(([key, sites]) => `${key}: ${sites.join(', ')}`);
    assert.deepEqual(unexpected, [],
        'replace each marker with the call C makes (AGENTS.md rule 5)');
    for (const [key, { count, reason }] of EXCEPTIONS) {
        assert.ok(reason, `${key} needs a reason`);
        const observed = groups.get(key)?.length ?? 0;
        assert.equal(observed, count,
            `${key}: ${observed} stale markers, pinned at ${count}; `
            + 'update the count in this file');
    }
});

// Calls that print or change nothing in the recorder's build need a comment
// at the call site, not a marker. No hints file the recorder uses defines a
// SND_LIB_*, so sndprocs.h's no-sound-library branch defines each sound call
// as an empty macro; this reads those names from the header. debugpline*()
// prints only for files named in sysconf DEBUGFILES, which the recorder's
// sysconf leaves unset (files.c debugcore(), sys/unix/sysconf).
function emptySoundMacros() {
    const header = readFileSync(join(UPSTREAM_ROOT, 'include', 'sndprocs.h'), 'utf8');
    const start = header.indexOf('NO SOUNDLIB IS INTEGRATED AFTER THIS');
    assert.ok(start > 0, 'sndprocs.h no longer has its no-sound-library branch');
    const branch = header.slice(start, header.indexOf('#endif  /* No SOUNDLIB */', start));
    return [...branch.matchAll(/^#define (\w+)\([^)]*\)[ \t]*$/gmu)].map((m) => m[1]);
}

test('no note_unported() label names a call that does nothing in the recorder build', () => {
    const empty = new Set([
        ...emptySoundMacros(),
        'debugpline', 'debugpline0', 'debugpline1', 'debugpline2',
        'debugpline3', 'debugpline4',
    ]);
    // Soundeffect, SoundAchievement and SetVoice are the macros js/ had
    // marked; the header must still define them as empty.
    for (const name of ['Soundeffect', 'SoundAchievement', 'SetVoice'])
        assert.ok(empty.has(name), `${name} is no longer an empty macro`);
    const found = markers().filter((marker) => empty.has(marker.function))
        .map((marker) => `${marker.key}: ${marker.site}`);
    assert.deepEqual(found, [],
        'replace each marker with a comment naming the C call and why it does nothing');
});
