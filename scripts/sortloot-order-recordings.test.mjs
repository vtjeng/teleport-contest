// C refs: invent.c sortloot(), sortloot_cmp() and loot_classify(); o_init.c
// observe_object() and discover_object(); nethack-c/patches/
// 002-deterministic-qsort.patch, hacklib.c nh_deterministic_qsort().
//
// sortloot_cmp() classifies an object the first time the sort compares
// it, and loot_classify() marks an object the hero can see as encountered,
// which appends its type to the discoveries of its class. The order of
// discoveries therefore follows the order in which the C library's qsort()
// first compares the objects. The judge's recorder ran on macOS, whose
// qsort() differs from glibc's, and the port follows macOS (js/qsort.js).
// The recordings below were made on macOS by
// .github/workflows/macos-recorder.yml (run 44850791668), which records
// every recipe in experiments/host-parity/qsort-oracle/recipes.txt.
//
// This file fails if one of them stops replaying, if one of them shows two
// discoveries in the order a Linux recorder gives them, or if a
// sortloot-order recipe is missing from recipes.txt or from the table
// below.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { RECORDINGS_DIR } from './score-recordings.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

// [recording under recordings/invent.c/, two discoveries of one class in
// the order the macOS recording lists them]. In run 44850791668 a Linux
// recording of the same recipe listed each pair the other way round. The
// two controls, which record alike on both hosts, have no pair.
const CASES = [
    // display_pickinv(), 7 objects: Apple's insertion sort.
    ['sortloot-blind-wishes-classify-order', ['ornamental cope', 'pair of combat boots']],
    // display_pickinv(), 8, 10, 11, 17 and 22 objects: median of three.
    ['sortloot-order-inventory-amulets-barbarian', ['amulet (oval)', 'amulet (perforated)']],
    ['sortloot-order-inventory-armor-valkyrie', ['piece of cloth', 'crystal helmet']],
    ['sortloot-order-inventory-armor-caveman', ['pair of snow boots', 'tattered cape']],
    ['sortloot-order-inventory-mixed-monk', ['amulet (concave)', 'amulet (octagonal)']],
    ['sortloot-order-inventory-armor-amulets-tourist', ['amulet (perforated)', 'amulet (circular)']],
    // display_pickinv(), 44 objects: median of nine.
    ['sortloot-order-inventory-thirty-amulets-wizard', ['amulet (square)', 'amulet (hexagonal)']],
    // Wands are observed by learn_unseen_invent() before the sort: control.
    ['sortloot-order-inventory-wands-samurai', null],
    // query_objlist() over a floor pile of 3, 5, 6, 10 and 42 objects.
    ['sortloot-order-pile-three-scrolls-samurai', ['scroll (GNIK SISI VLE)', 'scroll (GHOTI)']],
    ['sortloot-order-pile-wands-wizard', ['wand (glass)', 'wand (spiked)']],
    ['sortloot-order-pile-rings-priest', ['ring (wire)', 'ring (clay)']],
    ['sortloot-order-pile-potions-healer', ['potion (brilliant blue)', 'potion (smoky)']],
    ['sortloot-order-pile-forty-two-rings-barbarian', ['ring (ivory)', 'ring (jade)']],
    // look_here() does not sort: control.
    ['sortloot-order-look-here-potions-samurai', null],
    // query_objlist() over a container's contents, 5 objects each.
    ['sortloot-order-sack-scrolls-rogue', ['scroll (READ ME)', 'scroll (ZLORFIK)']],
    ['sortloot-order-chest-contents-knight', ['scroll (VELOX NEB)', 'scroll (STRC PRST SKRZ KRK)']],
    // query_objlist() over the inventory from the multiple-drop menu, 11.
    ['sortloot-order-drop-menu-armor-amulets-valkyrie', ['amulet (hexagonal)', 'amulet (spherical)']],
];

function screenRows(recording) {
    return recording.segments.flatMap(({ steps }) => steps.map(({ screen }) => (screen ?? '')
        .split('\n').map((row) => row.replace(/\x1b\[[0-9;]*[A-Za-z]/gu, '').trimEnd())));
}

for (const [name, pair] of CASES) {
    test(`macOS sort-order recording ${name}`, async () => {
        const recording = JSON.parse(readFileSync(
            `${RECORDINGS_DIR}/invent.c/${name}.session.json`, 'utf8'));
        if (pair) {
            // An encountered type that is not identified is listed as two
            // spaces and its description.
            const [first, second] = pair.map((text) => `  ${text}`);
            const page = screenRows(recording)
                .find((rows) => rows.includes(first) && rows.includes(second));
            assert.ok(page, `${name} must list ${pair.join(' and ')} on one page`);
            assert.ok(page.indexOf(first) < page.indexOf(second),
                `${name} must list ${pair[0]} before ${pair[1]}, as macOS does`);
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

test('every sort-order recipe is in recipes.txt and in the table above', () => {
    const listed = readFileSync(new URL(
        '../experiments/host-parity/qsort-oracle/recipes.txt', import.meta.url), 'utf8')
        .trimEnd().split('\n');
    const names = CASES.map(([name]) => name).sort();
    assert.deepEqual(
        listed.map((path) => path.replace(/^recipes\/invent\.c\/|\.session\.json$/gu, '')).sort(),
        names);
    const committed = readdirSync(new URL('../recipes/invent.c/', import.meta.url))
        .filter((file) => file.startsWith('sortloot-order-'))
        .map((file) => file.replace(/\.session\.json$/u, ''));
    for (const name of committed) assert.ok(names.includes(name), `${name} is not in the table`);
    for (const path of listed)
        assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `${path} does not exist`);
});
