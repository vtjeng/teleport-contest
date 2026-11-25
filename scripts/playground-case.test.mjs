// The judge's recorder ran on macOS, whose default APFS volume is
// case-insensitive and case-preserving: fopen("Castle.lua") in the playground
// opens castle.lua (nhlua.c nhl_loadlua() -> dlb.c dlb_fopen() -> files.c
// fopen_datafile()), access() and fopen() of "$HOME/.NETHACKRC" reach the
// config file (files.c fopen_wizkit_file()), and save/<uid><plname> written
// as "Agent" is restored as "AGENT" (files.c set_savefile_name() and its
// openers). Linux's ext4 fails each of those opens. js/files.js makes every
// such lookup under one fold; these tests pin it and fail if a caller
// compares file names another way again.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DAT_LUA_FILES } from '../js/dat_files.js';
import {
    fileNameFold, playgroundCanCreate, playgroundDeleteFile, playgroundReadFile,
    playgroundWriteFile, resolvePlaygroundPath, resolveRecorderHomePath,
    savefile_creatable, set_savefile_name,
} from '../js/files.js';
import { game } from '../js/gstate.js';
import { InMemoryStorage, setStorageForTesting, vfsListFiles } from '../js/storage.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { isMacosOnly } from './recipe-host.mjs';
import { listRecordings, RECORDINGS_DIR } from './score-recordings.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

function upperAscii(text) {
    return text.replace(/[a-z]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 32));
}

test('every installed Lua file opens under any ASCII case, and no two fold together', () => {
    for (const file of DAT_LUA_FILES) {
        // Installed names are ASCII, so the ASCII fold is APFS's fold for them.
        assert.match(file, /^[\x21-\x7e]+$/u, file);
        // Upper case and an initial capital: the spellings batch games typed
        // ("CASTLE", "Castle"). A fold collision would map one of them to
        // another file.
        const capital = file[0].toUpperCase() + file.slice(1);
        for (const name of [file, upperAscii(file), capital])
            assert.deepEqual(resolvePlaygroundPath(name), { kind: 'lua', file }, name);
    }
});

test('other playground files, save/ and HOME fold too', () => {
    // A non-Lua data file (sys/unix/Makefile.top DAT).
    assert.deepEqual(resolvePlaygroundPath('Rumors'), { kind: 'file', file: 'rumors' });
    // The save directory: a file in it is one the game wrote.
    assert.deepEqual(resolvePlaygroundPath('SAVE/'), { kind: 'directory' });
    assert.deepEqual(resolvePlaygroundPath('Save/1000wizard'), { kind: 'unknown' });
    // ".." from SAVE returns to the playground.
    assert.deepEqual(resolvePlaygroundPath('SAVE/../Oracle.LUA'),
        { kind: 'lua', file: 'oracle.lua' });
    // A name that folds to nothing installed still fails with ENOENT.
    assert.deepEqual(resolvePlaygroundPath('Castles.lua'), { kind: 'absent', errno: 2 });
    // fopen_wizkit_file()'s $HOME/<name> (files.c:2516-2521).
    assert.deepEqual(resolveRecorderHomePath('.NETHACKRC', '.nethackrc'), { kind: 'file' });
    assert.deepEqual(resolveRecorderHomePath('./.NetHackRC', '.nethackrc'), { kind: 'file' });
    assert.deepEqual(resolveRecorderHomePath('.nethackrc2', '.nethackrc'),
        { kind: 'absent', errno: 2 });
});

// C's bytes, one per code unit, as getlin() and the config file hold them.
function utf8Bytes(text) {
    return [...Buffer.from(text, 'utf8')].map((byte) => String.fromCharCode(byte)).join('');
}

test('names with bytes above 0x7f fold as APFS folds UTF-8', () => {
    // macOS recorder run 44669396862 (probe-nonascii-names): KELVIN SIGN
    // (decomposes to K) + "nox" opened knox.lua, and LONG S (folds to s) +
    // "oko1-1" opened soko1-1.lua.
    assert.deepEqual(resolvePlaygroundPath(utf8Bytes('\u212Anox.lua')),
        { kind: 'lua', file: 'knox.lua' });
    assert.deepEqual(resolvePlaygroundPath(utf8Bytes('\u017Foko1-1.lua')),
        { kind: 'lua', file: 'soko1-1.lua' });
    // Precomposed and decomposed accents, in either case, are one name.
    assert.equal(fileNameFold(utf8Bytes('\u00c9lodie')), fileNameFold(utf8Bytes('e\u0301LODIE')));
    // Run 44670028619 (probe-unicode-fold): full case folding takes LIGATURE
    // FI to "fi" and LIGATURE ST to "st", so these built the Plane of Fire
    // and the Astral Plane.
    assert.deepEqual(resolvePlaygroundPath(utf8Bytes('\uFB01re.lua')),
        { kind: 'lua', file: 'fire.lua' });
    assert.deepEqual(resolvePlaygroundPath(utf8Bytes('a\uFB06ral.lua')),
        { kind: 'lua', file: 'astral.lua' });
    // DOTLESS I has no case folding, so it does not reach fire.lua.
    assert.deepEqual(resolvePlaygroundPath(utf8Bytes('f\u0131re.lua')), { kind: 'absent', errno: 2 });
    // A byte that is not UTF-8 is compared exactly and matches nothing installed.
    assert.deepEqual(resolvePlaygroundPath('\x80Knox.lua'), { kind: 'absent', errno: 2 });
    assert.notEqual(fileNameFold('\xc9'), fileNameFold(utf8Bytes('\u00c9')));
    // EF BB BF (U+FEFF) before "castle" is part of the name, not a BOM to drop.
    assert.deepEqual(resolvePlaygroundPath('\xef\xbb\xbfcastle.lua'), { kind: 'absent', errno: 2 });
    // A code unit above 0xff is not one of C's bytes; it is compared exactly
    // rather than truncated to a byte ("\u0143" would become 0x43, "C").
    assert.deepEqual(resolvePlaygroundPath('\u0143astle.lua'), { kind: 'absent', errno: 2 });
});

test('APFS creates only names that are UTF-8', () => {
    // macOS recorder run 45507166983 (recorder/competitor-probes): the name
    // "Wanderingcartographerofthenor" + EURO SIGN is 32 bytes, unixmain.c
    // process_options() keeps 31, so plname ends E2 82, and #save printed
    // "Cannot open save file." where Linux saved
    // (recordings/save.c/save-name-cut-mid-utf8-save-last).
    const state = { plname: 'Wanderingcartographerofthenor\xe2\x82' };
    set_savefile_name(state);
    assert.equal(savefile_creatable(state), false);
    // The same name with its third byte, and the Greek control name of
    // recordings/save.c/save-name-valid-utf8-restore, save on both hosts.
    state.plname = 'Wanderingcartographerofthenor\xe2\x82\xac';
    set_savefile_name(state);
    assert.equal(savefile_creatable(state), true);
    assert.equal(playgroundCanCreate(utf8Bytes('save/0\u1f08\u03b8\u03b7\u03bd\u1fb6')), true);
    // ASCII, a lone continuation byte, an overlong form and a surrogate.
    assert.equal(playgroundCanCreate('save/0Agent'), true);
    assert.equal(playgroundCanCreate('save/0\x80'), false);
    assert.equal(playgroundCanCreate('save/0\xc0\xaf'), false);
    assert.equal(playgroundCanCreate('save/0\xed\xa0\x80'), false);
});

test('stored playground files open and keep their name under any case', () => {
    const saved = game.mockStorage;
    setStorageForTesting(new InMemoryStorage());
    try {
        // dosave0() creates save/<uid><plname> for "Agent".
        assert.equal(playgroundWriteFile('save/1000Agent', 'first'), true);
        // A later game named "AGENT" opens it (restore_saved_game()).
        assert.equal(playgroundReadFile('save/1000AGENT'), 'first');
        // fopen(..., "w") of another spelling rewrites the existing file,
        // which keeps the name it was created with.
        playgroundWriteFile('save/1000agent', 'second');
        assert.deepEqual(vfsListFiles('save/'), ['save/1000Agent']);
        assert.equal(playgroundReadFile('save/1000Agent'), 'second');
        // A new name is created as spelled.
        playgroundWriteFile('save/1000Other', 'third');
        assert.deepEqual(vfsListFiles('save/').sort(), ['save/1000Agent', 'save/1000Other']);
        // unlink() of another spelling removes the file.
        assert.equal(playgroundDeleteFile('SAVE/1000AGENT'), true);
        assert.equal(playgroundReadFile('save/1000Agent'), null);
        assert.equal(playgroundDeleteFile('save/1000agent'), false);
    } finally {
        setStorageForTesting(saved);
    }
});

// Comments and strings aside, the source of a js/ file.
function code(file) {
    return readFileSync(join(JS_DIR, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .split('\n').map((line) => line.replace(/\/\/.*$/u, '')).join('\n');
}

test('file names are compared only in js/files.js', () => {
    const offenders = [];
    for (const file of readdirSync(JS_DIR).filter((name) => name.endsWith('.js'))) {
        if (file === 'storage.js' || file === 'files.js') continue;
        const source = code(file);
        // The storage calls take the name exactly; js/files.js's
        // playground*File() wrappers fold it.
        if (/\bvfs(?:ReadFile|WriteFile|DeleteFile|ListFiles)\b/u.test(source))
            offenders.push(`${file}: a storage call outside js/files.js`);
        // The installed names, matched exactly, would miss "Castle.lua".
        if (/\bDAT_LUA_FILES\b/u.test(source) && file !== 'dat_files.js')
            offenders.push(`${file}: DAT_LUA_FILES outside js/files.js`);
    }
    // Inside js/files.js the installed names are looked up only through
    // their folded map.
    if (/\b(?:DAT_LUA_FILES|PLAYGROUND_NON_LUA_FILES)\.has\(/u.test(code('files.js')))
        offenders.push('files.js: an exact lookup of an installed name');
    assert.deepEqual(offenders, []);
});

test('no recording shows a Linux-only failure to open an installed file', () => {
    // nhl_loadlua()'s impossible() for a name that folds to an installed
    // file, and fopen_wizkit_file()'s access() failure for one, appear only
    // in a recording made on a case-sensitive Linux volume.
    const FAILURES = [
        /nhl_loadlua: Error opening \(([^)]*)\)/gu,
        /Access to (\S+) denied \(2\)\./gu,
    ];
    const offenders = [];
    for (const path of listRecordings()) {
        const text = readFileSync(`${RECORDINGS_DIR}/${path}`, 'utf8');
        if (!text.includes('Error opening') && !text.includes('denied (2)')) continue;
        for (const segment of JSON.parse(text).segments) {
            for (const { screen } of segment.steps) {
                for (const pattern of FAILURES) {
                    for (const [, name] of (screen ?? '').matchAll(pattern)) {
                        const kind = resolvePlaygroundPath(name).kind;
                        if (kind === 'lua' || kind === 'file')
                            offenders.push(`${path}: ${name}`);
                    }
                }
            }
        }
    }
    assert.deepEqual([...new Set(offenders)], []);
});

function screens(recording) {
    return recording.segments.flatMap(({ steps }) => steps.map(({ screen }) => screen ?? ''));
}

// The recordings of these paths come from .github/workflows/macos-recorder.yml
// (runs 44669396862 and 44670028619, on branches
// integration-checkpoint/case-open-rec1 and -rec2), because a Linux recorder
// fails each open, so each is macOS-only (scripts/recipe-host.mjs).
// [recording under recordings/, text only
// the macOS recording shows, text only the Linux one shows]
const MACOS_CASES = [
    // "Knox" builds Fort Ludios; "Knoxx" fails on both hosts.
    ['files.c/wizloaddes-case-variant-names', 'Error opening (Knoxx.lua)',
        'Error opening (Knox.lua)'],
    // "./Rumors" reaches the rumors file and fails in luaL_loadbuffer().
    ['files.c/wizloadlua-case-variant-files', 'Error loading (./Rumors)',
        'Error opening (./Rumors)'],
    // $HOME/.NETHACKRC is the config file, so its item lines are wished for.
    ['files.c/wizkit-home-config-upper-case', 'an elven mithril-coat', null],
    // KASUMI restores Kasumi's save.
    ['files.c/save-restore-name-case', 'Kasumi, the human Samurai, welcome back to NetHack!',
        'Konnichi wa KASUMI, welcome to NetHack!'],
    // KELVIN SIGN + "nox" opens knox.lua; the later 0xFF escapes getlin().
    ['files.c/wizloaddes-unicode-fold-names', 'Load which des lua file?', 'Error opening'],
    // LIGATURE ST + "ral" builds the Astral Plane; DOTLESS I fails on both hosts.
    ['files.c/wizloaddes-unicode-full-fold-names', 'You arrive on the Astral Plane!', null],
    // éLODIE restores Élodie's save.
    ['files.c/save-restore-name-accent-case', 'the human Tourist, welcome back to NetHack!', null],
];

for (const [name, macos, linux] of MACOS_CASES) {
    test(`macOS recording ${name} shows the case-insensitive open`, async () => {
        const recording = JSON.parse(readFileSync(`${RECORDINGS_DIR}/${name}.session.json`, 'utf8'));
        // The recording carries its recipe's field (scripts/recipe-host.test.mjs).
        assert.equal(isMacosOnly(recording), true, `${name} must be macOS-only`);
        const shown = screens(recording);
        assert.ok(shown.some((screen) => screen.includes(macos)),
            `${name} must show ${JSON.stringify(macos)}`);
        if (linux) {
            assert.ok(!shown.some((screen) => screen.includes(linux)),
                `${name} must not show ${JSON.stringify(linux)}`);
        }
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
