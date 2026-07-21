// input.js — Keystroke input handling.
// Provides async nhgetch() that reads from an input queue.

import { game } from './gstate.js';
import { KEY_BINDINGS } from './terminal.js';

const _inputQueue = [];

function inputQueue(state) {
    if (state === game) return _inputQueue;
    state._inputQueue ??= [];
    return state._inputQueue;
}

export function pushKey(key, state = game) {
    inputQueue(state).push(
        typeof key === 'number' ? key : key.charCodeAt(0),
    );
}

export function pushKeys(keys, state = game) {
    for (const k of keys) pushKey(k, state);
}

// C ref: tty_nhgetch — read one key.
// In replay mode, reads from the input queue.
// In browser mode, waits for a real keypress.
export async function nhgetch(state = game) {
    // Fire the capture hook before reading the next key
    const hook = state._preNhgetchHook;
    if (hook) await hook();

    // C ref: win/tty/wintty.c tty_nhgetch().  The recorder marker is
    // emitted before WIN_STOP is cleared, then every actual key wait makes
    // later messages visible again.  Keep this after the capture hook so an
    // Escape-dismissed More boundary suppresses messages through precisely
    // the next recorded input boundary.
    state._ttyMessageStopped = false;

    const queue = inputQueue(state);
    if (queue.length > 0) {
        return queue.shift();
    }

    // Browser mode: wait for keypress from the display
    const display = state?.nhDisplay;
    if (display?.readKey) {
        return await display.readKey({ bindings: KEY_BINDINGS.VI_KEYS });
    }

    throw new Error('Input queue empty - test may be missing keystrokes');
}

// Reset input state
export function resetInputState(state = game) {
    inputQueue(state).length = 0;
}
