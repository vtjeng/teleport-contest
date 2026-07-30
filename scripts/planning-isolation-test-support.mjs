// A test-only detector for the planning clone's isolation.
//
// planningState() in js/unported_monster_actions.js copies about thirty named
// fields of live state so preflightSimpleMonsterActions() can dry-run a
// monster turn before it happens for real. Isolation is opt-in: a field nobody
// thought to name is shared by reference, the dry run writes through it, and
// nothing fails. QUALITY.json records nine production defects of that shape,
// two of them introduced by the fix for a previous one, and every one was
// found by its symptom rather than by review -- the construct has no C
// counterpart, so a reviewer has nothing to check the field list against.
//
// freezeLiveState() makes the class loud instead of silent. It deep-freezes
// everything reachable from the live game, so a leaked write throws a
// TypeError at the leaking line rather than diverging a hundred turns later.
//
// This belongs in a test and nowhere else. Object.freeze() cannot be undone,
// so a frozen game cannot run the live pass afterwards; a caller gets one dry
// run and then discards the fixture. The reversible substitute --
// defineProperty({writable: false}) per property, undone by {writable: true}
// -- measured 74 to 131 ms per turn against the 1.13 ms preflight it would
// guard, so no form of this runs in the scored path.

// Reachable objects that must stay writable, and why. Both are load-bearing;
// neither is an oversight.
//
// The live root. preflightSimpleMonsterActions() ends by calling
// recalc_block_point() against the live map to re-derive vision.c's
// transparency index, which it borrowed because that index has no per-state
// form. That restore writes three fields on the root -- _viz_rmin, _viz_rmax
// and vision_full_recalc -- so freezing the root would block the clone's own
// cleanup. Nothing deeper is written: with the root exempt and everything
// below it frozen, the restore completes and the live doormask is unchanged.
//
// The object catalog. planningState() clones objects[] with Object.create(),
// so the copy delegates reads to the live entry and shadows writes on itself.
// [[Set]] walks the prototype chain, and a non-writable inherited data
// property blocks the creation of a shadowing own property -- it throws in
// strict mode. Freezing the entries would therefore report discover_object()
// writing the *copy* as a live leak, which is the opposite of the truth.
function collectExemptions(state) {
    const exempt = new Set([state]);
    for (const entry of state.objects ?? []) exempt.add(entry);
    return exempt;
}

// Two things this detector can never see, because they are not reachable from
// the state at all: vision.c's module-level transparency index (viz_clear,
// left_ptrs, right_ptrs) and its liveVisionBuffers. Those stay covered by the
// finally restore and by the refusing visionRecalc owner.
export function freezeLiveState(state) {
    const exempt = collectExemptions(state);
    const seen = new Set(exempt);
    const pending = [];

    const consider = (value) => {
        if (value === null || typeof value !== 'object') return;
        // A typed array's buffer is not part of the state graph a leak would
        // write through by name, and freezing one throws outright.
        if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return;
        if (seen.has(value)) return;
        seen.add(value);
        pending.push(value);
    };

    const walk = (target) => {
        for (const key of Reflect.ownKeys(target)) {
            const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
            // Accessors are read through their getter, which may compute or
            // refuse; the eight catalog aliases are of this kind. A getter's
            // result is not a distinct location a write can leak into, so the
            // walk takes data properties only.
            if (!descriptor || !('value' in descriptor)) continue;
            consider(descriptor.value);
        }
    };

    // Prototypes are deliberately not walked. The catalog copies delegate to
    // live entries, so following the chain would freeze exactly what the
    // exemption above exists to leave alone.
    walk(state);
    while (pending.length > 0) {
        const target = pending.pop();
        walk(target);
        Object.freeze(target);
    }
    return seen.size - exempt.size;
}
