// scripts/recipe-host.mjs marks a recipe whose committed recording must come
// from the macOS recorder with the top-level field "recordOn": "macos".
// This file fails when that field is missing from a recipe whose comment
// says to record it on macOS, when a recipe whose comment says it records
// alike on both hosts has the field, when a recipe and its recording
// disagree about the field, when a macOS-only recipe falls under none of the
// known host differences (docs/testing.md, "Known differences"), and when
// the command line that experiments/host-parity/check-changed-recordings.sh
// calls stops reporting a recipe correctly.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { isMacosOnly, isMacosOnlyFile } from './recipe-host.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'scripts', 'recipe-host.mjs');

// One recipe of each kind, used by the command-line tests: a key-binding
// recipe that fails only on macOS (cmd.c handler_rebind_keys_add()), and a
// debug-mode #panic that aborts alike on every host
// (scripts/macos-abort-recordings.test.mjs, HOST_INDEPENDENT).
const MACOS_RECIPE = 'recipes/cmd.c/bind-new-key-live.session.json';
const ANY_HOST_RECIPE = 'recipes/unixunix.c/panic-save-question-across-segments.session.json';

// Wordings that comments have used to say a recipe's recording must come
// from macOS. Each matched only recipes whose Linux recording differs from
// the committed one when this check was written. A bare "Recorded on macOS"
// is not one: the regex recipes that record alike on both hosts say it too.
const MACOS_ONLY_WORDING = [
    /\brecord (?:this recipe|these recipes|it|them)(?: again)? on macos\b/iu,
    /\bnot (?:on|with) (?:a )?linux\b/iu,
    /\bmust come from (?:the )?macos\b/iu,
    /\bonly (?:the )?macos (?:recorder )?can\b/iu,
    /\brecorded on macos only\b/iu,
    /\bmacos[- ]only (?:recipe|recording)\b/iu,
    /\bmacos and glibc regex answer differently here\b/iu,
    /\bcomes? from the macos recorder\b/iu,
    /\ba linux recorder (?:cannot|can't|would|rejects|dies)\b/iu,
];
const ANY_HOST_WORDING = /\brecords? alike on (?:macos and linux|both hosts)\b/iu;

// The recipe lists that .github/workflows/macos-recorder.yml records.
function listed(path) {
    return new Set(readFileSync(join(ROOT, path), 'utf8').trim().split('\n'));
}
const REGEX_RECIPES = listed('experiments/host-parity/regex-oracle/recipes.txt');
const QSORT_RECIPES = listed('experiments/host-parity/qsort-oracle/recipes.txt');

// The host differences docs/testing.md, "Known differences", names whose
// recordings are made on macOS. A macOS-only recipe must fall under one.
const KNOWN_DIFFERENCES = [
    ['regex: listed in regex-oracle/recipes.txt', (path) => REGEX_RECIPES.has(path)],
    ['qsort() call order: listed in qsort-oracle/recipes.txt', (path) => QSORT_RECIPES.has(path)],
    // The glob macos-recorder.yml records them with.
    ['key binding: recipes/cmd.c/*bind*-live',
        (path) => /^recipes\/cmd\.c\/[^/]*bind[^/]*-live\.session\.json$/u.test(path)],
    // scripts/macos-abort-recordings.test.mjs names each one.
    ['SIGABRT: a segment ends on terminalSignal',
        (path, recipe) => recipe.segments.some((segment) => Object.hasOwn(segment, 'terminalSignal'))],
    // APFS is case-insensitive and refuses names that are not UTF-8
    // (scripts/playground-case.test.mjs).
    ['APFS file names: recipes/files.c/ or recipes/save.c/',
        (path) => /^recipes\/(?:files|save)\.c\//u.test(path)],
];

// Every recipe, listing each directory under recipes/ directly.
function recipePaths() {
    const paths = [];
    for (const dir of readdirSync(join(ROOT, 'recipes'), { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        for (const file of readdirSync(join(ROOT, 'recipes', dir.name))) {
            if (file.endsWith('.session.json')) paths.push(`recipes/${dir.name}/${file}`);
        }
    }
    return paths.sort();
}

// Every comment of a recipe, at the top level and in its segments.
function comments(recipe) {
    const out = [];
    for (const node of [recipe, ...recipe.segments]) {
        for (const key of ['comment', '_comment', 'description'])
            if (typeof node[key] === 'string') out.push(node[key]);
    }
    return out;
}

function readRecipes() {
    const recipes = new Map();
    const unparsed = new Map();
    for (const path of recipePaths()) {
        const text = readFileSync(join(ROOT, path), 'utf8');
        try {
            recipes.set(path, JSON.parse(text));
        } catch {
            unparsed.set(path, text);
        }
    }
    return { recipes, unparsed };
}

test('isMacosOnly() reads the recordOn field', () => {
    // No field: any host. "macos": macOS only. Any other value, including
    // another host's name or a boolean, is refused rather than read as "any".
    assert.equal(isMacosOnly({ version: 5, segments: [] }), false);
    assert.equal(isMacosOnly({ version: 5, recordOn: 'macos', segments: [] }), true);
    assert.throws(() => isMacosOnly({ recordOn: 'linux' }), /recordOn must be "macos" or absent/u);
    assert.throws(() => isMacosOnly({ recordOn: true }), /recordOn must be "macos" or absent/u);
});

test('the command line prints the macOS-only recipes and fails on a bad one', () => {
    const ok = spawnSync(process.execPath, [CLI, MACOS_RECIPE, ANY_HOST_RECIPE],
        { cwd: ROOT, encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(ok.stdout, `${MACOS_RECIPE}\n`);
    // A missing file must stop the caller, not pass as "any host".
    const missing = 'recipes/cmd.c/no-such-recipe.session.json';
    const bad = spawnSync(process.execPath, [CLI, MACOS_RECIPE, missing], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /no-such-recipe/u);
});

test('a recipe whose comment says to record it on macOS has the field', () => {
    const { recipes, unparsed } = readRecipes();
    const missing = [];
    const contradicted = [];
    for (const [path, recipe] of recipes) {
        const text = comments(recipe);
        const macos = isMacosOnly(recipe);
        if (!macos && text.some((comment) => MACOS_ONLY_WORDING.some((re) => re.test(comment))))
            missing.push(path);
        if (macos && text.some((comment) => ANY_HOST_WORDING.test(comment)))
            contradicted.push(path);
    }
    assert.deepEqual(missing, [], 'add "recordOn": "macos" beside the comment (scripts/recipe-host.mjs)');
    assert.deepEqual(contradicted, [], 'the comment says this recipe records alike on both hosts');
    // A recipe that is not strict JSON cannot be read by the predicate, so
    // it must not need the field.
    const unreadable = [...unparsed].filter(([, text]) => /"recordOn"/u.test(text)
        || MACOS_ONLY_WORDING.some((re) => re.test(text))).map(([path]) => path);
    assert.deepEqual(unreadable, [], 'make this recipe strict JSON and give it the field');
});

test('every macOS-only recipe falls under a known host difference', () => {
    const { recipes } = readRecipes();
    const unexplained = [];
    for (const [path, recipe] of recipes) {
        if (isMacosOnly(recipe) && !KNOWN_DIFFERENCES.some(([, applies]) => applies(path, recipe)))
            unexplained.push(path);
    }
    assert.deepEqual(unexplained, [],
        `each must be one of: ${KNOWN_DIFFERENCES.map(([name]) => name).join('; ')}`);
    for (const path of [...REGEX_RECIPES, ...QSORT_RECIPES])
        assert.ok(recipes.has(path), `${path} is listed but is not a recipe`);
});

test('a macOS-only recipe and its recording both carry the field', () => {
    const { recipes } = readRecipes();
    const expected = [...recipes].filter(([, recipe]) => isMacosOnly(recipe))
        .map(([path]) => path.replace(/^recipes\//u, 'recordings/'));
    for (const path of expected)
        assert.ok(existsSync(join(ROOT, path)), `${path}: a macOS-only recipe needs its macOS recording`);
    // A recording is JSON.stringify() output, so a quote inside a string is
    // escaped and an unescaped "recordOn": can only be a key. Searching the
    // bytes avoids parsing every recording.
    const key = Buffer.from('"recordOn":');
    const found = [];
    for (const dir of readdirSync(join(ROOT, 'recordings'), { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        for (const file of readdirSync(join(ROOT, 'recordings', dir.name))) {
            if (!file.endsWith('.session.json')) continue;
            const path = `recordings/${dir.name}/${file}`;
            const bytes = readFileSync(join(ROOT, path));
            for (let at = bytes.indexOf(key); at >= 0; at = bytes.indexOf(key, at + 1)) {
                if (bytes[at - 1] === 0x5c) continue;
                // The field belongs at the top level, as the recorder copies it.
                assert.equal(isMacosOnlyFile(join(ROOT, path)), true, `${path}: recordOn is not top-level`);
                found.push(path);
                break;
            }
        }
    }
    assert.deepEqual(found.sort(), expected.sort());
});
