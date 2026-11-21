import assert from 'node:assert/strict';
import test from 'node:test';

import { runSegment } from '../js/jsmain.js';

// restore.c restore_menu() copies the picked "name-role-race-gend-algn" text
// into the 32-byte svp.plname[] with Strcpy(). macOS's checked strcpy()
// aborts when it does not fit; the judge's recordings come from macOS.

function sharedStorage() {
    const store = new Map();
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
        get length() { return store.size; },
        key: (i) => [...store.keys()][i] ?? null,
        keys: () => [...store.keys()],
    };
}

// No name in the rc, so the first segment asks "Who are you?" and the second
// shows the saved-games menu. Role, race, gender and alignment are fixed so
// no other startup prompt appears; !legacy and !tutorial remove the intro
// text and the tutorial question.
const RC = 'OPTIONS=role:Samurai,race:human,gender:male,align:lawful\n'
    + 'OPTIONS=!tutorial\nOPTIONS=!legacy\n';

async function saveThenPick(name) {
    const storage = sharedStorage();
    // Type the name, dismiss the welcome --More--, one spare space, then
    // save and confirm. Seeds and datetimes are arbitrary; the behaviour
    // under test reads only the name's length.
    const first = await runSegment({
        seed: 7301, datetime: '20410315101500', nethackrc: RC,
        moves: `${name}\r  Sy`, storage,
    });
    const saved = storage.keys().length;
    // 'a' picks the only saved game; the rest plays on if the game survives.
    const second = await runSegment({
        seed: 7401, datetime: '20410316101500', nethackrc: RC,
        moves: 'a  s.Sy', storage,
    });
    return { first, second, saved, storage };
}

test('a 15-character name restores from the saved-games menu', async () => {
    // 15 + the 16-character "-Sam-Hum-Mal-Law" suffix + NUL = 32 bytes, the
    // largest text that fits plname[PL_NSIZ]. macOS recorded this game to
    // its last key (run 44942488930, name15).
    const { second } = await saveThenPick('Abcdefghijklmno');
    // One screen for the startup boundary and one per key: 1 + 7.
    assert.equal(second.getScreens().length, 8);
    assert.match(second.getScreens()[1], /Abcdefghijklmno, the human Samurai, welcome back/u);
});

test('a 16-character name aborts at the pick, as macOS strcpy does', async () => {
    // 16 + 16 + NUL = 33 bytes: one too many. macOS ended in SIGABRT with
    // only the startup boundary recorded ("got 1, expected 8", name16).
    const { second, saved, storage } = await saveThenPick('Abcdefghijklmnop');
    assert.equal(second.getScreens().length, 1);
    assert.match(second.getScreens()[0], /Select one of your saved games/u);
    // abort() runs before the restore, so the save file is still there.
    assert.equal(storage.keys().length, saved);
});

test('a 31-character name, the longest the prompt keeps, aborts too', async () => {
    // The fuzz cases that exposed this had 30- and 31-character names
    // (macOS run 44941995763).
    const { second } = await saveThenPick('Abcdefghijklmnopqrstuvwxyzabcde');
    assert.equal(second.getScreens().length, 1);
});
