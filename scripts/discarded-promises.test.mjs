// Every statement-level call in js/ that discards a promise is either awaited
// or listed, with a reason, in scripts/discarded-promise-allowlist.json.
// scripts/discarded-promises.mjs says why: a discarded promise is the one way
// code keeps running after js/end.js nh_terminate() ends a game.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    readJsSources, scanDiscardedPromises, scanDiscardedPromisesInAsync,
} from './discarded-promises.mjs';
import { assertExceptionCount } from './exception-count.mjs';

const ALLOWLIST = JSON.parse(readFileSync(
    new URL('./discarded-promise-allowlist.json', import.meta.url), 'utf8'));

// The allowlist's size, pinned both ways so that neither a new entry nor a
// raised count gets in unnoticed, and a removal lowers the pin. 291 entries
// holding 374 discarded calls: 289 and 372 on 9f7e42e6 (8 November 2026),
// plus sp_lev_object.js applyObjectFields()'s oname(), plus mon.js
// apply_newcham_steps()'s newmonhp() (branch levdiff, 11 November 2026).
// 293 and 376 since discard_minvent() calls extract_from_minvent() (branch
// minvent-extract, 12 November 2026): its two inline-copy entries went, and
// its four synchronous callers and worn.js's extract() arm came in. 292 and
// 374 since mklev.js fill_empty_maze() awaits its two makemon() calls
// (12 November 2026). 300 and 385 with eight level-creation-only callers of
// mktrap(), dodoor() and priestini(), which return a Promise only outside
// level creation (11 calls; branch wizloadlua-makemon, 12 November 2026).
// 305 and 390 with the finish_steps() calls of the synchronous newsym(),
// feel_location(), map_location() and map_background(), and docrt()'s
// vision_recalc(2) (branch wall-angle-vision, 12 November 2026). 304 and
// 389 since dothrow.js gem_accept() awaits its rloc() (branch b15-fixes,
// 13 November 2026). 303 and 388 since bones.js drop_upon_death() awaits
// its obj_extract_self() (branch b16-defects, 13 November 2026). 304 and
// 389 with monst.js place_monster()'s finish_steps(), the synchronous form of
// place_monster_steps() (branch b16-defects, 13 November 2026). 238 and
// 308 since the removal callees were audited (branch
// audit-unawaited-removals, 13 November 2026): every caller of
// obj_extract_self(), freeinv() and freeinv_core() that can reach a carried
// object awaits it, delobj_core() hands its Promise on, and 66 entries holding
// 81 calls went, with read.js unpunish()'s delobj() added. 239 and 309 with
// mkobj.js add_to_migration()'s finish_steps(), the synchronous form of
// add_to_migration_steps() (branch loose-ends, 13 November 2026). 238 and
// 308 with light.js del_light_source()'s finish_steps(), the synchronous form
// of del_light_source_steps() (branch followups-light-norep, 15 November
// 2026). 239 and 309 with tty_message.js queuedVplineVisionRecalc()'s
// vision_recalc(), synchronous because sync_impossible() returns nothing
// (branch mention-map-notices, 22 November 2026; the function is
// queuedVpline() since branch queued-notice-status). 230 and 299 since the
// `async` callers of five `async` callees await them (branch
// deferred-output-audit, 22 November 2026): exercise(), remove_worn_item(),
// rot_organic(), rouse_shk() and add_weapon_skill(), whose bodies run past
// the caller's next statement once they reach an await; pray.c gcrownu()'s
// add_weapon_skill(1) prints weapon.c give_may_advance_msg()'s line.
// hideunder() is `async` too and stays discarded in eight `async` callers:
// each passes the hero, for whom it reaches no await (see their reasons).
// 138 and 192 since no `async` function discards a call (branch small-gaps,
// 23 November 2026): the 107 calls left inside `async` functions are awaited,
// those eight hideunder() calls among them, and the test below allows none.
// Every remaining entry sits in a synchronous function. 139 and 193 with
// insight.js status_enlightenment()'s youhiding(), found once the scan
// resolved `(env.hook ?? callee)(...)` (same branch); the two such calls in
// `async` functions, potion.js djinni_from_bottle()'s mongone() and
// wizcmds.js wiz_custom()'s docrt(), are awaited. 126 and 180 since every
// entry has an audited reason (branch sync-discards, 23 November 2026): 13
// entries holding 13 calls went. bones.js give_to_nearby_mon(),
// fixuporacle() and purgeDefunctBonesMonsters() and end.js
// finishInUseInventory() became `async` and await; makemon.js unmakemon(),
// priest.js priestini() and mk_roamer(), shknam.js shkinit() and
// finishStocking(), sp_lev_object.js's statue monster (two calls) and
// trap.js mk_trap_statue() hand the callee's Promise to a caller that
// already waits. A replay of 4,810 recordings with every listed call wrapped
// found a Promise returned only by the `async` callees hideunder(),
// mon_adjust_speed() and update_mon_extrinsics()'s Promise.resolve(), whose
// reasons say why no await is reached. 121 and 173 since mkmaze.js
// populate_maze() is `async` and mkroom.js mkswamp() is a step generator,
// both awaited by mklev.js (same branch): makemon() answers a Promise when a
// new shapechanger's first newcham() waits. 122 and 174 with
// startup_a11y.js queueVisionMonsterNotices()'s notice_all_mons(), whose
// queueing message keeps it synchronous, since hack.c notice_mon() and
// notice_all_mons() moved to js/hack.js (branch small-leftovers-2,
// 24 November 2026). 119 and 171 since mklev.js fill_ordinary_room() is a
// step generator that waits for its monster, web and traps, and
// water_surrounded_vault_contents() waits for its vampire lord (same
// branch): either can be a new shapechanger whose first newcham() prompts.
// 118 and 170 since mon.js apply_newcham_steps() yields newmonhp_steps()
// (same branch).
const ALLOWLIST_PINS = { entries: 118, calls: 170 };

// Callees that take an object out of a chain. A carried object goes through
// invent.c freeinv(), whose impossible() reports and artifact intrinsic
// removal can wait at --More--; C finishes them before the caller's next
// statement, so a discarded call prints out of order (batch 16 game F3,
// bones.js drop_upon_death()). Each listed caller names the object's chain
// in its reason; the count is pinned both ways like the total above.
const REMOVAL_CALLEES = new Set([
    'obj_extract_self', 'freeinv', 'freeinv_core', 'delobj', 'delobj_core', 'delallobj',
]);
// 15 obj_extract_self() callers whose object is never carried, and
// read.js unpunish()'s delobj() of the iron chain.
const REMOVAL_PIN = 16;

test('every discarded promise in js/ is on the allowlist with a reason', () => {
    const current = scanDiscardedPromises(readJsSources());
    const problems = [];
    for (const [key, count] of Object.entries(current)) {
        const entry = ALLOWLIST.entries[key];
        if (!entry) problems.push(`new: ${key} (${count}); await it or list it with a reason`);
        else if (entry.count !== count)
            problems.push(`changed: ${key} (${entry.count} -> ${count}); await it or update its count`);
    }
    for (const key of Object.keys(ALLOWLIST.entries))
        if (!Object.hasOwn(current, key)) problems.push(`stale: ${key}; remove its entry`);
    for (const [key, entry] of Object.entries(ALLOWLIST.entries))
        if (typeof entry.reason !== 'string' || !entry.reason.trim())
            problems.push(`no reason: ${key}`);
    assert.deepEqual(problems, []);
});

// An `async` function can always await, and C finishes the callee before the
// caller's next statement: a callee that returns a Promise only from an arm
// that prints or waits is exactly the one whose output would land late. The
// allowlist cannot excuse these; it holds synchronous callers only.
test('no async function in js/ discards a promise', () => {
    assert.deepEqual(scanDiscardedPromisesInAsync(readJsSources()), {});
});

test('the allowlist holds the pinned number of entries and calls', () => {
    const entries = Object.values(ALLOWLIST.entries);
    assertExceptionCount(entries.length, ALLOWLIST_PINS.entries, {
        what: 'allowlist entries',
        pin: 'ALLOWLIST_PINS.entries in scripts/discarded-promises.test.mjs',
    });
    assertExceptionCount(entries.reduce((n, entry) => n + entry.count, 0), ALLOWLIST_PINS.calls, {
        what: 'allowed discarded calls',
        pin: 'ALLOWLIST_PINS.calls in scripts/discarded-promises.test.mjs',
    });
});

test('every allowed discarded removal call is audited, and their number is pinned', () => {
    const removals = Object.entries(ALLOWLIST.entries)
        .filter(([key]) => REMOVAL_CALLEES.has(key.split(' | ')[2]));
    assert.deepEqual(
        removals.filter(([, entry]) => /not yet audited/u.test(entry.reason)).map(([key]) => key),
        []);
    assertExceptionCount(removals.length, REMOVAL_PIN, {
        what: 'allowlist entries for removal callees',
        pin: 'REMOVAL_PIN in scripts/discarded-promises.test.mjs',
    });
});

test('the scan finds discarded calls to async and promise-returning functions only', () => {
    // A stand-in js/ tree. Each line names the case it exercises; the
    // expected listing below holds exactly the discarded promises.
    const sources = {
        'js/a.js': [
            "import { later } from './b.js';",
            "import * as b from './b.js';",
            'export async function slow() {}',
            // Synchronous, but returns a promise on one path.
            'export function sometimes(x) { if (x) return slow(); return 1; }',
            'function plain() { return 2; }',
            'export async function caller() {',
            '    slow();', // discarded async call
            '    await slow();', // awaited: not listed
            '    sometimes(1);', // discarded promise-returning call
            '    plain();', // synchronous: not listed
            '    later();', // discarded call through a static import
            '    b.later();', // discarded call through a namespace import
            '    void slow();', // an explicit void still discards it
            '    const kept = slow();', // kept in a binding: not listed
            '    await kept;',
            "    const { later: dyn } = await import('./b.js');",
            '    dyn();', // discarded call through a dynamic import
            '    (b.hook ?? slow)();', // discarded call through a hook's fallback
            '    const run = () => { slow(); };', // nested arrow, named by its binding
            '    run();',
            '}',
        ].join('\n'),
        'js/b.js': [
            "import { slow } from './a.js';",
            // Forwards a promise through an expression-bodied arrow.
            'export const later = () => slow();',
        ].join('\n'),
    };
    assert.deepEqual(scanDiscardedPromises(sources), {
        'js/a.js | caller | b.later': 1,
        'js/a.js | caller | dyn': 1,
        'js/a.js | caller | later': 1,
        'js/a.js | caller | slow': 3,
        'js/a.js | caller | sometimes': 1,
        'js/a.js | run | slow': 1,
    });
    // run() is a synchronous arrow, so its call is not inside an async
    // function although caller() encloses it.
    assert.deepEqual(scanDiscardedPromisesInAsync(sources), {
        'js/a.js | caller | b.later': 1,
        'js/a.js | caller | dyn': 1,
        'js/a.js | caller | later': 1,
        'js/a.js | caller | slow': 3,
        'js/a.js | caller | sometimes': 1,
    });
});
