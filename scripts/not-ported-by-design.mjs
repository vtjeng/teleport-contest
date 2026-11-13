// C files the port deliberately does not port, each with the reason. This is
// the one definition: `goal-log.mjs roadmap` shows these files as not ported
// by design and leaves them out of the remaining work, goal selection refuses
// them, and not-ported-by-design.test.mjs fails while a js/ module named
// after one exists or a goal for one is not superseded. Add a file only with
// Vincent's approval, and record who approved it and when.

const SAVE_FILE_REASON = 'the port keeps game state between segments through '
    + "input.storage, not NetHack's save-file format";

export const NOT_PORTED_BY_DESIGN = Object.freeze({
    'sfbase.c': Object.freeze({ reason: SAVE_FILE_REASON, approved: 'Vincent, 2026-11-13' }),
    'sfstruct.c': Object.freeze({ reason: SAVE_FILE_REASON, approved: 'Vincent, 2026-11-13' }),
});

/** The reason a C file is not ported, or null when it is to be ported. */
export function notPortedReason(cFile) {
    return Object.hasOwn(NOT_PORTED_BY_DESIGN, cFile)
        ? NOT_PORTED_BY_DESIGN[cFile].reason : null;
}

/** Every C file a goal would port or change. */
export function goalCFiles(goal) {
    return [goal.cFile, ...(goal.requiredFunctions ?? []).map(entry => entry.sourceFile)]
        .filter(Boolean);
}

/** True when a goal touches a C file that is not ported by design. */
export function touchesNotPorted(goal) {
    return goalCFiles(goal).some(file => notPortedReason(file) !== null);
}

/** Refuse a goal that would port or change a C file not ported by design. */
export function assertPortable(goal) {
    for (const file of goalCFiles(goal)) {
        const reason = notPortedReason(file);
        if (reason !== null) throw new Error(`${file} is not ported by design: ${reason}`);
    }
}
