// Source-pinned checks for wizcmds.c wiz_intrinsic().  The blindness entry is
// deliberately exercised through the menu and its existing potion.c owner,
// because C does not use the generic timeout message for that property.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    BLINDED, DISCLOSE_NO_WITHOUT_PROMPT, ECMD_OK, KILLED_BY, LAST_PROP,
    SLIMED, STONED, TIMEOUT,
} from '../js/const.js';
import { delayed_killer } from '../js/end.js';
import { GameDisplay } from '../js/game_display.js';
import { resetGame } from '../js/gstate.js';
import { make_stoned } from '../js/potion.js';
import { wiz_detect, wiz_intrinsic } from '../js/wizcmds.js';

test('wiz_smell checks olfaction before any targeting input', async () => {
    const source = readFileSync('nethack-c/upstream/src/wizcmds.c', 'utf8');
    const start = source.indexOf('wiz_smell(void)');
    const end = source.indexOf('wiz_intrinsic(void)', start);
    assert.match(source.slice(start, end),
        /if \(!olfaction\(gy\.youmonst\.data\)\)[\s\S]*?return ECMD_OK;[\s\S]*?getpos\(&cc, TRUE, "a monster"\)/u);
    const { wiz_smell } = await import('../js/wizcmds.js');
    assert.equal(typeof wiz_smell, 'function');
    const { monst_globals_init, PM_PAPER_GOLEM } = await import('../js/monsters.js');
    const state = resetGame();
    monst_globals_init(state);
    state.u = { ux: 10, uy: 5 }; // An interior square; no targeting should run.
    state.youmonst = { data: state.mons[PM_PAPER_GOLEM] }; // C golems lack olfaction.
    const messages = [];
    assert.equal(await wiz_smell(state, { message: async text => messages.push(text) }), ECMD_OK);
    assert.deepEqual(messages,
        ['You are incapable of detecting odors in your present form.']);
});

test('wiz_detect awaits findit and discards its count like the C caller',
    async () => {
        const source = readFileSync(
            new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url),
            'utf8',
        );
        assert.match(source,
            /wiz_detect\(void\)[\s\S]*if \(wizard\)\s*\(void\) findit\(\);[\s\S]*return ECMD_OK;/u);
        // The swallowed findit early return precedes C map access, isolating
        // wiz_detect's async call and discarded integer result in this unit.
        const state = {
            wizard: true,
            u: { uswallow: true },
        };
        const messages = [];
        assert.equal(await wiz_detect(state, {
            message(text) { messages.push(text); },
        }), ECMD_OK);
        assert.deepEqual(messages, []);
    });

test('wizcmds.c keeps blindness out of the generic timeout arm', () => {
    const source = readFileSync(
        new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url),
        'utf8',
    );
    assert.match(
        source,
        /case BLINDED:\s*make_blinded\(newtimeout, TRUE\);\s*break;/u,
        'the source-specific blindness call must remain before def_feedback',
    );
});

test('wizcmds.c clamps and delegates STONED to potion.c make_stoned', () => {
    const source = readFileSync(
        new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url),
        'utf8',
    );
    assert.match(
        source,
        /case SICK:\s*case SLIMED:\s*case STONED:\s*if \(oldtimeout > 0L && newtimeout > oldtimeout\)\s*newtimeout = oldtimeout;/u,
    );
    assert.match(
        source,
        /case STONED:\s*Sprintf\(buf, fmt,\s*!Stoned \? "" : " still",\s*"turning into stone"\);\s*make_stoned\(newtimeout, buf, KILLED_BY, wizintrinsic\);/u,
    );
});

test('potion.c make_stoned owns the timeout transition and delayed killer', () => {
    const potion = readFileSync(
        new URL('../nethack-c/upstream/src/potion.c', import.meta.url),
        'utf8',
    );
    const end = readFileSync(
        new URL('../nethack-c/upstream/src/end.c', import.meta.url),
        'utf8',
    );
    assert.match(
        potion,
        /make_stoned\(long xtime, const char \*msg, int killedby, const char \*killername\)[\s\S]*?set_itimeout\(&Stoned, xtime\);[\s\S]*?if \(\(xtime != 0L\) \^ \(old != 0L\)\)[\s\S]*?if \(!Stoned\)[\s\S]*?dealloc_killer\(find_delayed_killer\(STONED\)\);[\s\S]*?else if \(!old\)[\s\S]*?delayed_killer\(STONED, killedby, killername\);/u,
    );
    assert.match(end, /delayed_killer\(int id, int format, const char \*killername\)/u);
    assert.match(end, /dealloc_killer\(struct kinfo \*kptr\)/u);
});

function heading(state) {
    return state.nhDisplay.grid[0].map((cell) => cell.ch).join('').trimEnd();
}

test('wiz_intrinsic routes blinded to make_blinded without generic timeout text',
    async () => {
        const state = resetGame();
        state.wizard = true;
        state.iflags = { cbreak: true };
        state.disp = { botl: false };
        state.u = {
            uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
                intrinsic: 0, extrinsic: 0, blocked: 0,
            })),
            uwep: null,
        };
        // C's #wizintrinsic menu assigns 'i' to BLINDED (the ninth property).
        state.u.uprops[BLINDED] = { intrinsic: 3, extrinsic: 0, blocked: 0 };
        state.nhDisplay = new GameDisplay(null);
        state.nhDisplay.onEmptyQueue = () => {
            throw new Error('the intrinsic menu requested an unprovided key');
        };
        state.nhDisplay.pushKey('i'.charCodeAt(0));
        state.nhDisplay.pushKey('\n'.charCodeAt(0));

        await wiz_intrinsic(state);

        assert.equal(state.u.uprops[BLINDED].intrinsic & TIMEOUT, 33);
        assert.equal(heading(state), '',
            'potion.c make_blinded() stays silent when extending blindness');
        assert.equal(state.disp.botl, false,
            'an extension with no visual transition leaves botl unchanged');
    });

test('wiz_intrinsic sets STONED and records its delayed killer through the menu',
    async () => {
        const state = resetGame();
        state.wizard = true;
        state.iflags = { cbreak: true };
        state.disp = { botl: false };
        state.u = {
            uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
                intrinsic: 0, extrinsic: 0, blocked: 0,
            })),
            uwep: null,
        };
        state.killer = { name: 'old immediate killer', format: 0, next: null };
        state.nhDisplay = new GameDisplay(null);
        state.nhDisplay.onEmptyQueue = () => {
            throw new Error('the intrinsic menu requested an unprovided key');
        };
        // property_by_index() assigns b to STONED, the second menu item.
        state.nhDisplay.pushKey('b'.charCodeAt(0));
        state.nhDisplay.pushKey('\n'.charCodeAt(0));

        await wiz_intrinsic(state);

        assert.equal(state.u.uprops[STONED].intrinsic & TIMEOUT, 30);
        assert.equal(state.disp.botl, true);
        assert.equal(state.killer.name, '');
        assert.deepEqual(state.killer.next, {
            id: STONED,
            next: null,
            format: KILLED_BY,
            name: '#wizintrinsic',
        });
        assert.equal(
            state.nhDisplay.toplines,
            'You are turning into stone.',
        );
    });

test('wiz_intrinsic routes SLIMED through potion.c make_slimed', async () => {
    const potion = readFileSync(
        new URL('../nethack-c/upstream/src/potion.c', import.meta.url),
        'utf8',
    );
    const wizard = readFileSync(
        new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url),
        'utf8',
    );
    assert.match(potion,
        /make_slimed\(long xtime, const char \*msg\)[\s\S]*?set_itimeout\(&Slimed, xtime\);[\s\S]*?if \(\(xtime != 0L\) \^ \(old != 0L\)\)/u);
    assert.match(wizard,
        /case SLIMED:\s*Sprintf\(buf, fmt,\s*!Slimed \? "" : " still", "turning into slime"\);\s*make_slimed\(newtimeout, buf\);/u);

    const state = resetGame();
    state.wizard = true;
    state.iflags = { cbreak: true };
    state.disp = { botl: false };
    state.u = {
        uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
            intrinsic: 0, extrinsic: 0, blocked: 0,
        })),
    };
    state.nhDisplay = new GameDisplay(null);
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('the intrinsic menu requested an unprovided key');
    };
    // WIZ_INTRINSIC_PROPERTIES maps its third source entry to 'c' (SLIMED).
    state.nhDisplay.pushKey('c'.charCodeAt(0));
    state.nhDisplay.pushKey('\n'.charCodeAt(0));
    const messages = [];

    await wiz_intrinsic(state, {
        message: async (line) => messages.push(line),
    });

    assert.equal(state.u.uprops[SLIMED].intrinsic & TIMEOUT, 30);
    assert.equal(state.disp.botl, true);
    assert.deepEqual(messages, ['You are turning into slime.']);
});

test('make_stoned unlinks only its delayed-killer record when cured', async () => {
    const state = resetGame();
    state.disp = { botl: false };
    state.u = {
        uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
            intrinsic: 0, extrinsic: 0, blocked: 0,
        })),
    };
    delayed_killer(77, KILLED_BY, 'another delayed cause', state);

    await make_stoned(30, null, KILLED_BY, '#wizintrinsic', state);
    const stonedKiller = state.killer.next;
    assert.equal(stonedKiller.id, STONED);
    assert.equal(stonedKiller.next.id, 77);
    assert.equal(state.u.uprops[STONED].intrinsic & TIMEOUT, 30);

    await make_stoned(0, null, KILLED_BY, '#wizintrinsic', state);
    assert.equal(state.u.uprops[STONED].intrinsic & TIMEOUT, 0);
    assert.equal(state.killer.next.id, 77);
    assert.equal(state.killer.next.next, null);
});

async function smellTestGame() {
    const { runSegment } = await import('../js/jsmain.js');
    await runSegment({
        seed: 14228021, // Independent startup for live map/input owner checks.
        datetime: '20530709151617',
        nethackrc: 'OPTIONS=name:SmellUnit,role:Barbarian,race:human,gender:female,align:chaotic\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,playmode:debug,pettype:none,!tips,!verbose\n',
        moves: ' ',
    });
    const { game } = await import('../js/gstate.js');
    const { clearTtyMessageWindow } = await import('../js/tty_message.js');
    clearTtyMessageWindow(game);
    // Disable automatic description to isolate the command's own messages;
    // independent recordings separately cover getpos's normal description.
    game.iflags.autodescribe = false;
    return game;
}

function queueSmellKeys(state, keys) {
    for (const key of keys) state.nhDisplay.pushKey(key.charCodeAt(0));
}

test('wiz_smell selects the steed before the hero and loops until cancel', async () => {
    const { wiz_smell } = await import('../js/wizcmds.js');
    const { newMonster } = await import('../js/monst.js');
    const { PM_PONY } = await import('../js/monsters.js');
    const { ECMD_CANCEL } = await import('../js/const.js');
    const state = await smellTestGame();
    const messages = [];
    state.u.usteed = newMonster({ data: state.mons[PM_PONY], mnum: PM_PONY });
    // Two selections of the unchanged hero square exercise coordinate reuse,
    // each smelling the pony rather than the Barbarian's body odor.
    queueSmellKeys(state, '..\x1b');
    const moves = state.moves;
    assert.equal(await wiz_smell(state, {
        message: async text => messages.push(text),
    }), ECMD_CANCEL);
    assert.deepEqual(messages, [
        'You can move the cursor to a monster that you want to smell.',
        'Pick a monster to smell.',
        'You detect an odor reminiscent of a stable.',
        'Pick a monster to smell.',
        'You detect an odor reminiscent of a stable.',
        'Pick a monster to smell.',
    ]);
    assert.equal(state.moves, moves, 'the cancelled command spends no time');
});

test('wiz_smell marks an unseen monster and clears the stale marker after removal', async () => {
    const { wiz_smell } = await import('../js/wizcmds.js');
    const { newMonster, place_monster, remove_monster } = await import('../js/monst.js');
    const { PM_JACKAL } = await import('../js/monsters.js');
    const { ROOM, ECMD_CANCEL } = await import('../js/const.js');
    const { glyph_at, glyph_is_invisible, newsym } = await import('../js/display.js');
    const state = await smellTestGame();
    // Select a free adjacent floor square using the same direction keys as
    // getpos; the case concerns invisible memory rather than terrain bounds.
    const [key, dx, dy] = [
        ['l', 1, 0], ['h', -1, 0], ['j', 0, 1], ['k', 0, -1],
    ].find(([, dx, dy]) => state.level.at(state.u.ux + dx, state.u.uy + dy).typ === ROOM
        && !state.level.monsters[state.u.ux + dx][state.u.uy + dy]);
    const x = state.u.ux + dx, y = state.u.uy + dy;
    const monster = newMonster({ data: state.mons[PM_JACKAL], mnum: PM_JACKAL,
        minvis: true, mhp: 4, mhpmax: 4 }); // A living invisible dog-class target.
    place_monster(monster, x, y, state);
    newsym(x, y, state);
    const before = glyph_at(x, y, state);
    const messages = [];
    queueSmellKeys(state, `${key}.\x1b`);
    assert.equal(await wiz_smell(state, { message: async text => {
        messages.push(text);
        if (text === 'You notice a dog smell.')
            assert.equal(glyph_at(x, y, state), before,
                'C captures the glyph before odor output and maps afterward');
    } }), ECMD_CANCEL);
    assert.ok(messages.includes('You notice a dog smell.'));
    assert.equal(glyph_is_invisible(glyph_at(x, y, state)), true);
    assert.equal(glyph_is_invisible(state.level.at(x, y).remembered_glyph.glyph), true);
    remove_monster(x, y, state);
    queueSmellKeys(state, `${key}.\x1b`);
    const emptyMessages = [];
    assert.equal(await wiz_smell(state, {
        message: async text => emptyMessages.push(text),
    }), ECMD_CANCEL);
    assert.ok(emptyMessages.includes("You don't smell any monster there."));
    assert.equal(glyph_is_invisible(glyph_at(x, y, state)), false);
    assert.equal(glyph_is_invisible(state.level.at(x, y).remembered_glyph.glyph), false);
});

// C wiz_makemap156-173 snapshots the tower before replacing the level and
// returns ECMD_OK after both helper calls; no command-level draw is present.
test('wiz_makemap preserves tower snapshot, pre/generation/post order and result', async () => {
    const c = readFileSync('nethack-c/upstream/src/wizcmds.c', 'utf8');
    const source = c.slice(c.indexOf('wiz_makemap(void)'), c.indexOf('wiz_map(void)'));
    assert.match(source, /was_in_W_tower = In_W_tower[\s\S]*makemap_prepost\(TRUE, was_in_W_tower\);[\s\S]*mklev\(\);[\s\S]*makemap_prepost\(FALSE, was_in_W_tower\);[\s\S]*return ECMD_OK;/u);
    const { wiz_makemap } = await import('../js/wizcmds.js');
    assert.equal(typeof wiz_makemap, 'function');
    const js = readFileSync('js/wizcmds.js', 'utf8');
    const body = js.slice(js.indexOf('export async function wiz_makemap('), js.indexOf('export async function wiz_map('));
    assert.match(body, /was_in_W_tower = In_W_tower[\s\S]*await makemap_prepost\(true, was_in_W_tower, state\);[\s\S]*await mklev\(\);[\s\S]*await makemap_prepost\(false, was_in_W_tower, state\);[\s\S]*return ECMD_OK;/u);
    assert.match(body, /Unavailable command 'wizmakemap'\./u);
    assert.doesNotMatch(body, /\brn[2d]\(/u, 'level generation owns its source draws');
});

test('wiz_makemap has awaited interactive and queued command dispatch', () => {
    const js = readFileSync('js/cmd.js', 'utf8');
    assert.match(js, /case 'wiz_makemap':\s*(?:\/\/[^\n]*\n\s*)*return await wiz_makemap\(state\);/u);
    assert.match(js, /queuedExtcmdEntry\?\.ef_funct === 'wiz_makemap'[\s\S]*?const res = await wiz_makemap\(state\);[\s\S]*?resetCommandVars\(state, state.multi < 0\);/u);
});


// wizcmds.c:243–352 owns both target iteration and immediate dead-node cleanup.
test('wiz_kill restores targeting flags and returns OK even on cancellation', async () => {
    const { wiz_kill } = await import('../js/wizcmds.js');
    assert.equal(typeof wiz_kill, 'function');
    const state = await smellTestGame();
    state.flags.verbose = true;
    state.iflags.autodescribe = false;
    const messages = [];
    queueSmellKeys(state, '\x1b'); // getpos's negative result exits without a target.
    const moves = state.moves;
    assert.equal(await wiz_kill(state, {
        message: async text => messages.push(text),
    }), ECMD_OK);
    assert.deepEqual(messages, ['Pick first monster to slay:']);
    assert.equal(state.flags.verbose, true);
    assert.equal(state.iflags.autodescribe, false);
    assert.equal(state.iflags.purge_monsters, 0);
    assert.equal(state.moves, moves, 'C returns ECMD_OK without spending time');
});

test('wiz_kill clears an empty invisible marker before its no-monster message', async () => {
    const { wiz_kill } = await import('../js/wizcmds.js');
    assert.equal(typeof wiz_kill, 'function');
    const { ROOM } = await import('../js/const.js');
    const { map_invisible, glyph_at, glyph_is_invisible } = await import('../js/display.js');
    const state = await smellTestGame();
    const [key, dx, dy] = [
        ['l', 1, 0], ['h', -1, 0], ['j', 0, 1], ['k', 0, -1],
    ].find(([, dx, dy]) => state.level.at(state.u.ux + dx, state.u.uy + dy).typ === ROOM
        && !state.level.monsters[state.u.ux + dx][state.u.uy + dy]);
    const x = state.u.ux + dx, y = state.u.uy + dy;
    map_invisible(x, y, state);
    queueSmellKeys(state, `${key}.`); // A free adjacent floor ends the loop.
    const messages = [];
    assert.equal(await wiz_kill(state, { message: async text => {
        messages.push(text);
        if (text === 'There is no monster there.')
            assert.equal(glyph_is_invisible(glyph_at(x, y, state)), false);
    } }), ECMD_OK);
    assert.deepEqual(messages, ['Pick first monster to slay:', 'There is no monster there.']);
});

test('wiz_kill stops at accepted suicide before dead-monster cleanup', async () => {
    const { wiz_kill } = await import('../js/wizcmds.js');
    const state = await smellTestGame();
    state.wizard = false; // Skip the debug-mode reprieve after confirming suicide.
    state.iflags.window_inited = false; // C's no-window finalization needs no key.
    state.flags.end_disclose.fill(DISCLOSE_NO_WITHOUT_PROMPT);
    state.flags.bones = false;
    state.invent = null;
    state.moves = Math.max(state.moves, 2);
    // A call to dmonsfree() would reject this unmatched pending count.  C's
    // accepted-suicide path never reaches that cleanup after done(DIED).
    state.iflags.purge_monsters = 1;
    queueSmellKeys(state, '.yes\n');

    assert.equal(await wiz_kill(state), undefined);
    assert.equal(state.program_state.gameover, true);
    assert.equal(state.iflags.purge_monsters, 1);
});

test('wiz_kill does not prompt again after a fatal gas-spore explosion',
    async () => {
        const { wiz_kill } = await import('../js/wizcmds.js');
        const { newMonster, place_monster } = await import('../js/monst.js');
        const { NON_PM, PM_GAS_SPORE } = await import('../js/monsters.js');
        const { ROOM } = await import('../js/const.js');
        const state = await smellTestGame();
        const [key, dx, dy] = [
            ['l', 1, 0], ['h', -1, 0], ['j', 0, 1], ['k', 0, -1],
        ].find(([, offsetX, offsetY]) =>
            state.level.at(state.u.ux + offsetX, state.u.uy + offsetY).typ === ROOM
            && !state.level.monsters[state.u.ux + offsetX][state.u.uy + offsetY]);
        const spore = newMonster({
            data: state.mons[PM_GAS_SPORE],
            mnum: PM_GAS_SPORE,
            mx: state.u.ux + dx,
            my: state.u.uy + dy,
            mhp: 1,
            mhpmax: 1,
            cham: NON_PM,
        });
        place_monster(spore, spore.mx, spore.my, state);
        spore.nmon = state.level.monlist;
        state.level.monlist = spore;
        state.wizard = false;
        state.u.uhp = 1;
        state.invent = null;
        state.iflags.window_inited = false;
        state.flags.end_disclose.fill(DISCLOSE_NO_WITHOUT_PROMPT);
        state.flags.bones = false;
        state.level.flags.deathdrops = true;
        state.moves = Math.max(state.moves, 2);
        const messages = [];
        queueSmellKeys(state, `${key}.`);
        state.nhDisplay.onEmptyQueue = () => '\x1b'.charCodeAt(0);

        const result = await wiz_kill(state, {
            message: async text => messages.push(text),
        });
        assert.equal(state.program_state.gameover, true, JSON.stringify({
            result,
            messages,
            hp: state.u.uhp,
            killer: state.killer,
            sporeHp: spore.mhp,
        }));
        assert.equal(result, undefined);
        assert.ok(!messages.includes('Next monster:'));
    });

test('wiz_kill follows the whole source control flow and caller contracts', () => {
    const source = readFileSync('nethack-c/upstream/src/wizcmds.c', 'utf8');
    const start = source.indexOf('wiz_kill(void)');
    const kill = source.slice(start, source.indexOf('DISABLE_WARNING_FORMAT_NONLITERAL', start));
    assert.match(kill, /save_verbose = flags.verbose[\s\S]*?save_autodescribe = iflags.autodescribe/u);
    assert.match(kill, /ans = getpos\(&cc, TRUE, "a monster"\);[\s\S]*?flags.verbose = save_verbose[\s\S]*?ans < 0 \|\| cc.x < 1/u);
    assert.match(kill, /ynq\(qbuf\)[\s\S]*?paranoid_query\(TRUE, qbuf\)[\s\S]*?done\(DIED\)/u);
    assert.match(kill, /next2u\(cc.x, cc.y\) \? u.ustuck : 0/u);
    assert.match(kill, /unmap_invisible[\s\S]*?xkilled\(mtmp, XKILL_NOMSG\)/u);
    assert.match(kill, /mon_moving = TRUE[\s\S]*?monkilled\(mtmp, \(char \*\) 0, AD_PHYS\)[\s\S]*?mon_moving = FALSE/u);
    assert.match(kill, /u.utotype \|\| !on_level[\s\S]*?dmonsfree\(\);[\s\S]*?return ECMD_OK/u);
    const js = readFileSync('js/wizcmds.js', 'utf8');
    assert.match(js, /export async function wiz_kill\(/u);
});

test('wiz_rumor_check awaits its diagnostic window and returns source ECMD_OK', async () => {
    const { wiz_rumor_check } = await import('../js/wizcmds.js');
    const source = readFileSync(new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url), 'utf8');
    assert.match(source, /wiz_rumor_check\(void\)\s*\{\s*rumor_check\(\);\s*return ECMD_OK;/u);
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    let entered = false;
    let settled = false;
    const call = wiz_rumor_check({}, { window: () => { entered = true; return pending; } })
        .then(result => { settled = true; return result; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(entered, true);
    assert.equal(settled, false, 'the command cannot return while its text window is pending');
    release();
    assert.equal(await call, ECMD_OK);
    assert.equal(settled, true);
});
