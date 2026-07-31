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
// It returns a guard whose assertNoLeak() covers the one part of the graph
// freezing cannot reach.
//
// This belongs in a test and nowhere else. Object.freeze() cannot be undone,
// so a frozen game cannot run the live pass afterwards; a caller gets one dry
// run and then discards the fixture. The reversible substitute --
// defineProperty({writable: false}) per property, undone by {writable: true}
// -- measured 74 to 131 ms per turn against the 1.13 ms preflight it would
// guard, so no form of this runs in the scored path.
//
// Three exclusions, all load-bearing, all covered another way or declared:
//
// 1. Three root fields, named in RESTORED_ROOT_FIELDS below. The rest of the
//    root is frozen field by field. An earlier version exempted the whole root
//    object, which silently blinded the detector to every root-field leak;
//    narrowing it was confirmed by injecting a write to state.moves into the
//    planning path, which now fails all five cases and previously failed none.
//    The three named fields stay uncovered by construction: the scan's own
//    restore has to write them, so the detector cannot tell that write from a
//    leak. Recorded defect 8 was exactly a leak onto one of them,
//    vision_full_recalc, so this exclusion is not costless -- what covers it
//    is the dedicated case 'a planned door opening leaves vision_full_recalc
//    as it found it' in scripts/unported-monster-actions.test.mjs, which fails
//    when the restore is deleted. Do not let that case be deleted as
//    redundant; no frozen case replaces it.
// 2. The object catalog. planningState() clones objects[] with Object.create(),
//    so the copy delegates reads to the live entry and shadows writes on
//    itself. [[Set]] walks the prototype chain, and a non-writable inherited
//    data property blocks the creation of a shadowing own property -- it throws
//    in strict mode. Freezing the entries would report discover_object()
//    writing the *copy* as a live leak, which is the opposite of the truth.
// 3. Typed arrays. Object.freeze() throws on an ArrayBuffer view that has
//    elements, so the views themselves are skipped, not merely their backing
//    buffers. This is not hypothetical cover: js/vision.js:791 assigns
//    game.viz_array = liveVisionBuffers.rows[0], and those rows are
//    Uint8Array, so freezing alone leaves every per-cell vision write
//    undetected. assertNoLeak() closes that by snapshotting each reachable
//    view before the dry run and comparing afterwards. It reports the leak at
//    the end rather than at the leaking line, which is weaker than a throw,
//    but it is the difference between covered and not.
//
// Reachability is not the same as being in the state. Only rows[0] of
// vision.c's live COULD_SEE pair is reachable, through game.viz_array; the
// spare row set and both rmin/rmax pairs are module-level, and they are
// precisely what vision_recalc() writes. The snapshot therefore takes
// liveVisionBufferViews() as well as everything the walk finds, so a leak into
// the spare half is caught rather than silently missed.
//
// The same reasoning covers vision.c's module-level transparency index
// (viz_clear, left_ptrs, right_ptrs, js/vision.js:65-67). Each is a ROWNO x
// COLNO typed-array grid holding one pointer per cell, which is the shape the
// view branch above already snapshots; what kept it out was reachability, not
// shape, since nothing in the state points at it. It is the one vision
// structure the planning clone deliberately borrows and hand-restores
// (js/unported_monster_actions.js:891), so the snapshot takes
// transparencyIndexViews() as well.

// preflightSimpleMonsterActions() ends by calling recalc_block_point() against
// the live map to re-derive the transparency index it borrowed. That restore
// writes exactly these three root fields -- vision_reset() nulls the first two
// and rebuildVisionPoint() writes them back, and js/vision.js:180 sets the
// third, which is why the scan saves and restores it. Freezing them would
// block the clone's own cleanup.
const RESTORED_ROOT_FIELDS = new Set([
    '_viz_rmin',
    '_viz_rmax',
    'vision_full_recalc',
]);

function collectExemptions(state) {
    // The catalog entries only; the root is now frozen field by field below.
    return new Set(state.objects ?? []);
}

import {
    liveVisionBufferViews,
    transparencyIndexViews,
} from '../js/vision.js';

export function freezeLiveState(state) {
    const exempt = collectExemptions(state);
    const seen = new Set([state, ...exempt]);
    const pending = [];
    const views = [];

    const consider = (value) => {
        if (value === null || typeof value !== 'object') return;
        if (value instanceof ArrayBuffer) return;
        if (ArrayBuffer.isView(value)) {
            // Cannot be frozen; snapshot it for assertNoLeak() instead.
            if (!seen.has(value)) {
                seen.add(value);
                views.push([value, value.slice()]);
            }
            return;
        }
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
    // catalog exemption exists to leave alone.
    walk(state);
    // Not reachable from the state, and the half vision_recalc() writes.
    for (const view of liveVisionBufferViews()) consider(view);
    // Also not reachable, and what the planning clone borrows outright.
    for (const view of transparencyIndexViews()) consider(view);
    while (pending.length > 0) {
        const target = pending.pop();
        walk(target);
        Object.freeze(target);
    }

    // The root last, field by field, so the restore's three fields stay
    // assignable while every other root field is guarded. The root is left
    // extensible, which is why assertNoLeak() also checks for added fields.
    const rootKeysBefore = new Set(Reflect.ownKeys(state));
    for (const key of rootKeysBefore) {
        if (RESTORED_ROOT_FIELDS.has(key)) continue;
        const descriptor = Reflect.getOwnPropertyDescriptor(state, key);
        if (!descriptor || !('value' in descriptor) || !descriptor.writable)
            continue;
        Object.defineProperty(state, key, { writable: false });
    }

    return {
        // Objects actually frozen: everything seen, less the catalog entries,
        // less the root, less the typed-array views, which are snapshotted
        // rather than frozen and are counted separately in `views`. Cases
        // assert a floor on this so a walk that reached almost nothing cannot
        // pass as a clean run, and the two numbers must not overlap or the
        // floor counts arrays it never froze.
        frozen: seen.size - exempt.size - 1 - views.length,
        views: views.length,
        assertNoLeak(assert) {
            for (const [view, before] of views) {
                if (view.length !== before.length) {
                    assert.fail(
                        `planning resized a live ${view.constructor.name}`,
                    );
                }
                for (let i = 0; i < view.length; ++i) {
                    if (view[i] !== before[i]) {
                        assert.fail(
                            `planning wrote a live ${view.constructor.name}`
                            + ` at index ${i}: ${before[i]} -> ${view[i]}`,
                        );
                    }
                }
            }
            for (const key of Reflect.ownKeys(state)) {
                if (rootKeysBefore.has(key)) continue;
                assert.fail(`planning added the live root field ${String(key)}`);
            }
        },
    };
}
