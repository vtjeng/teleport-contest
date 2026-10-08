import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { COLNO, ORACLEFILE } from '../js/const.js';
import { xcrypt } from '../js/hacklib.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { RANDOM_TEXT_FILES } from '../js/random_text_data.js';
import { init_oracles, outoracle, restore_oracles, save_oracles } from '../js/rumors.js';
import { InMemoryStorage } from '../js/storage.js';

const source = readFileSync(new URL('../nethack-c/upstream/src/rumors.c', import.meta.url), 'utf8');

function oracleState() {
    // decl.c initializes the flag/count to zero and the location pointer to null.
    return { go: { oracle_flg: 0 }, svo: { oracle_cnt: 0, oracle_loc: null } };
}

test('init_oracles reads the generated count and only its record offsets', () => {
    const state = oracleState();
    const file = { data: RANDOM_TEXT_FILES[ORACLEFILE], position: 0 };
    init_oracles(file, state);
    // makedefs supplies one special record and twenty normal records.
    assert.equal(state.svo.oracle_cnt, 21);
    assert.equal(state.svo.oracle_loc.length, 21);
    assert.equal(state.go.oracle_flg, 0, 'outoracle owns the initialized flag');
    const lines = file.data.split('\n');
    assert.deepEqual(state.svo.oracle_loc, lines.slice(2, 23).map(line => parseInt(line, 16)));
    assert.equal(file.position, lines.slice(0, 23).join('\n').length + 1);
    for (const count of ['not a count', '    0', '   -1']) {
        const empty = oracleState();
        init_oracles({ data: `comment\n${count}\n`, position: 0 }, empty);
        assert.equal(empty.svo.oracle_cnt, 0, 'C accepts only a parsed positive count');
        assert.equal(empty.svo.oracle_loc, null);
    }
});

test('normal output selects once and removes the selected offset before awaiting its window', async () => {
    const state = oracleState();
    const windows = [];
    const draws = [];
    const env = {
        random: { rnd: bound => { draws.push(bound); return 6; } },
        window: async (actualState, lines) => {
            assert.equal(actualState, state);
            assert.equal(state.go.oracle_flg, 1);
            assert.equal(state.svo.oracle_cnt, 20);
            // C swaps the last of twenty normal records into selected slot6.
            const all = oracleState();
            init_oracles({ data: RANDOM_TEXT_FILES[ORACLEFILE], position: 0 }, all);
            assert.equal(state.svo.oracle_loc[6], all.svo.oracle_loc[20]);
            windows.push(lines.map(line => line.text));
        },
    };
    await outoracle(false, true, state, env);
    assert.deepEqual(draws, [20]);
    assert.deepEqual(windows[0], [
        'The Oracle meditates for a moment and then intones:', '',
        // dat/oracles.txt's sixth normal record; the draw is chosen to pin an offset.
        'It is customarily known among travelers that extra-healing draughts may clear',
        'thy senses when thou art addled by delusory visions.  But never forget, the',
        'lowly potion which makes one sick may be used for the same purpose.',
    ]);
    env.random.rnd = bound => { draws.push(bound); return 1; };
    env.window = async () => {};
    await outoracle(false, false, state, env);
    assert.deepEqual(draws, [20, 19], 'the second call uses the consumed count');
    assert.equal(state.svo.oracle_cnt, 19);
});

test('special output repeats without selection RNG or depletion, and generic output keeps its header', async () => {
    const state = oracleState();
    const windows = [];
    const env = {
        random: { rnd: () => assert.fail('special record does not draw') },
        window: async (_state, lines) => windows.push(lines.map(line => line.text)),
    };
    await outoracle(true, true, state, env);
    const offsets = [...state.svo.oracle_loc];
    await outoracle(true, false, state, env);
    assert.equal(state.svo.oracle_cnt, 21);
    assert.deepEqual(state.svo.oracle_loc, offsets);
    assert.equal(windows[0][0], 'The Oracle scornfully takes all your gold and says:');
    assert.equal(windows[1][0], 'The message reads:');
    assert.equal(windows[0][2], '"...it is rather disconcerting to be confronted with the');
    assert.deepEqual(windows[0].slice(1), windows[1].slice(1));
});

test('exhaustion, failed open and empty initialization preserve source guards', async () => {
    const env = { random: { rnd: () => assert.fail('guard must not draw') },
        window: async () => assert.fail('guard must not show text') };
    const state = oracleState();
    state.go.oracle_flg = 1;
    for (const count of [0, 1]) {
        state.svo.oracle_cnt = count;
        await outoracle(false, true, state, env);
    }
    state.go.oracle_flg = 0;
    await outoracle(false, true, state, { ...env, files: {} });
    assert.equal(state.go.oracle_flg, -1, 'C remembers failed open');
    await outoracle(true, true, state, env);
    const empty = oracleState();
    await outoracle(false, true, empty, { ...env, files: { [ORACLEFILE]: 'comment\n    0\n' } });
    assert.equal(empty.go.oracle_flg, 1, 'opening succeeds even when no count was initialized');
});

test('COLNO fgets fragments and newline stripping precede xcrypt', async () => {
    const state = { go: { oracle_flg: 1 }, svo: { oracle_cnt: 1, oracle_loc: [0] } };
    // One byte beyond the 79-byte fgets payload forces a second independently decrypted chunk.
    const encrypted = xcrypt('A'.repeat(COLNO)) + '\n---\nignored\n';
    const windows = [];
    await outoracle(true, true, state, { files: { [ORACLEFILE]: encrypted },
        window: async (_state, lines) => windows.push(lines.map(line => line.text)) });
    assert.equal(windows[0][2], xcrypt(encrypted.slice(0, COLNO - 1)));
    assert.equal(windows[0][3], xcrypt(encrypted.slice(COLNO - 1, COLNO)));
    assert.equal(windows[0].length, 4, 'the --- sentinel terminates before ignored text');
});

test('the last normal record is consumed while the special record remains reusable', async () => {
    const state = oracleState();
    init_oracles({ data: RANDOM_TEXT_FILES[ORACLEFILE], position: 0 }, state);
    state.go.oracle_flg = 1;
    state.svo.oracle_cnt = 2; // Valid remaining list: special plus the last normal record.
    const draws = [];
    const windows = [];
    const env = { random: { rnd: bound => { draws.push(bound); return 1; } },
        window: async (_state, lines) => windows.push(lines) };
    await outoracle(false, true, state, env);
    assert.equal(state.svo.oracle_cnt, 1);
    await outoracle(false, true, state, env);
    assert.equal(windows.length, 1, 'another normal request cannot display an exhausted record');
    await outoracle(true, true, state, env);
    assert.equal(windows.length, 2);
    assert.equal(state.svo.oracle_cnt, 1);
    assert.deepEqual(draws, [1], 'the one-based final normal selection is the only draw');
});

test('Oracle persistence copies only live offsets and restores the initialized flag', () => {
    const state = { go: { oracle_flg: 1 }, svo: { oracle_cnt: 2, oracle_loc: [3, 9, 12] } };
    // Count2 means special+one normal; the consumed tail offset12 must not be saved.
    const snapshot = {};
    save_oracles(snapshot, state);
    assert.deepEqual(snapshot.oracles, { oracle_cnt: 2, oracle_loc: [3, 9] });
    state.svo.oracle_loc[1] = 17;
    const restored = oracleState();
    restore_oracles(snapshot, restored);
    assert.deepEqual(restored.svo, { oracle_cnt: 2, oracle_loc: [3, 9] });
    assert.equal(restored.go.oracle_flg, 1);
    restored.svo.oracle_loc[1] = 19;
    assert.deepEqual(snapshot.oracles.oracle_loc, [3, 9], 'snapshot and runtime arrays are distinct');
    const oldSave = oracleState();
    restore_oracles({}, oldSave);
    assert.equal(oldSave.svo.oracle_cnt, 0);
    assert.equal(oldSave.go.oracle_flg, 0);
});

test('production save and restore retain the consumed list without reinitializing it', async () => {
    // This is a state-contract check, not matching-play evidence: the recipe
    // names the broader save-window and restored-monster blockers explicitly.
    const recipe = JSON.parse(readFileSync(new URL(
        '../recipes/rumors.c/oracle-restore-rogue-outside-limit.session.json', import.meta.url)));
    const storage = new InMemoryStorage();
    await runSegment({ ...recipe.segments[0], storage });
    const snapshot = JSON.parse(storage.getItem('vfs:nhsave'));
    assert.equal(snapshot.oracles.oracle_cnt, 20, 'the first normal consultation consumes one');
    const remaining = [...snapshot.oracles.oracle_loc];
    assert.equal(remaining.length, 20, 'the consumed tail is not serialized');
    await runSegment({ ...recipe.segments[1], storage });
    assert.equal(game.go.oracle_flg, 1);
    assert.equal(game.svo.oracle_cnt, 19, 'the second consultation uses the restored count');
    assert.equal(game.svo.oracle_loc[0], remaining[0], 'the special offset survives unchanged');
    assert.deepEqual(snapshot.oracles.oracle_loc, remaining, 'the snapshot is not mutated by play');
});

test('source order and production persistence sites remain explicit', () => {
    const c = source.slice(source.indexOf('void\noutoracle('), source.indexOf('\nint\ndoconsult('));
    const markers = ['if (go.oracle_flg < 0', 'dlb_fopen', 'init_oracles(oracles)',
        'go.oracle_flg = 1', 'svo.oracle_cnt <= 1', 'rnd((int) svo.oracle_cnt - 1)',
        'dlb_fseek', 'svo.oracle_loc[oracle_idx] = svo.oracle_loc[--svo.oracle_cnt]',
        'create_nhwindow', 'while (dlb_fgets(line, COLNO', 'strchr', 'xcrypt',
        'display_nhwindow', 'destroy_nhwindow', 'dlb_fclose', 'couldnt_open_file', 'go.oracle_flg = -1'];
    let previous = -1;
    for (const marker of markers) {
        const position = c.indexOf(marker);
        assert.ok(position > previous, `source order: ${marker}`);
        previous = position;
    }
    const js = readFileSync(new URL('../js/rumors.js', import.meta.url), 'utf8');
    assert.match(js, /await outoracle\(cheapskate, true, state, env\);[\s\S]*event\.major_oracle = true;[\s\S]*await exercise/u);
    assert.match(readFileSync(new URL('../js/save.js', import.meta.url), 'utf8'), /save_oracles\(snapshot, state\)/u);
    assert.match(readFileSync(new URL('../js/restore.js', import.meta.url), 'utf8'), /restore_artifacts\(snapshot, state\);\s*restore_oracles\(snapshot, state\);/u);
});
