// Guards deleted because no game can reach them must not return. Each test
// below names the C source that shows why the guarded state never occurs,
// and pins what remains of the guard, so that a refusal or reason added back
// at the same site fails here rather than waiting for a game to reach it.
// Lower a pin when a remaining refusal is ported; raising one needs a reason
// written beside it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { assertExceptionCount } from './exception-count.mjs';

const JS_DIR = new URL('../js/', import.meta.url);

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

function jsCode(file) {
    return stripComments(readFileSync(new URL(file, JS_DIR), 'utf8'));
}

function skipString(code, start) {
    const quote = code[start];
    for (let i = start + 1; i < code.length; i++) {
        if (code[i] === '\\') { i++; continue; }
        if (code[i] === quote) return i;
    }
    throw new Error(`unterminated string at offset ${start}`);
}

// The body of the function declared as `name` in comment-free `code`, from
// its opening brace to its closing brace. Strings are skipped whole when
// matching braces.
export function functionBody(code, name) {
    const declaration = new RegExp(`function\\s+${name}\\s*\\(`, 'u').exec(code);
    assert.ok(declaration, `no function ${name}`);
    let i = declaration.index + declaration[0].length;
    for (let parens = 1; parens > 0; i++) {
        if (code[i] === '(') parens++;
        else if (code[i] === ')') parens--;
    }
    const open = code.indexOf('{', i);
    let depth = 0;
    for (let j = open; j < code.length; j++) {
        const ch = code[j];
        if (ch === '\'' || ch === '"' || ch === '`') {
            j = skipString(code, j);
            continue;
        }
        if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) return code.slice(open, j + 1);
    }
    throw new Error(`unterminated function ${name}`);
}

// The string literals a function body returns, in order.
export function returnedStrings(body) {
    return [...body.matchAll(/return\s+(?:'([^']*)'|`([^`]*)`)/gu)]
        .map((match) => match[1] ?? match[2]);
}

function count(code, pattern) {
    return [...code.matchAll(pattern)].length;
}

// js/obj.js once refused a missing monster catalog entry, a null artifact
// (mkobj.c:890 and :1099: "mk_artifact() with otmp and A_NONE will never
// return NULL"), an unset current fruit (options.c initoptions_finish() sets
// it on every startup) and a cursed object outside free-object generation.
// obj.js's requiredHook() went when remove_object() began calling
// recalc_block_point() itself (mkobj.c:2518). What is left is invent.js
// requiredHook()'s refusal, whose hook names
// scripts/lifecycle-hook-defaults.test.mjs pins.
const OBJECT_OPERATION_REFUSAL_SITES = 1;

test('object operations refuse only through requiredHook()', () => {
    let sites = 0;
    for (const file of ['obj.js', 'invent.js']) {
        sites += count(jsCode(file), /new UnsupportedObjectOperationError\(/gu);
    }
    assert.match(functionBody(jsCode('invent.js'), 'requiredHook'),
        /new UnsupportedObjectOperationError\(/u);
    assertExceptionCount(sites, OBJECT_OPERATION_REFUSAL_SITES, {
        what: 'UnsupportedObjectOperationError throw sites in obj.js and invent.js',
        pin: 'OBJECT_OPERATION_REFUSAL_SITES in scripts/unreachable-guards.test.mjs',
    });
    const code = jsCode('obj.js');
    // mkobj.c mksobj_init() calls its corpse, egg and tin initializer only
    // from those three case labels, so the switch needs no default.
    assert.doesNotMatch(functionBody(code, 'initializeMonsterFood'), /default\s*:/u);
});

// timeout.c run_timers() (2216-2240) runs every due timer in queue order:
// C starts only TIMER_OBJECT timers and the TIMER_LEVEL MELT_ICE_AWAY timer,
// every timeout_funcs[] row is ported, an object may hold several timers and
// mkobj.c shrink_glob() treats an unpaid glob like any other. So run_timers()
// refuses nothing.
test('run_timers() runs every due timer without a refusal', () => {
    const body = functionBody(jsCode('timeout.js'), 'run_timers');
    assert.doesNotMatch(body, /\bthrow\b|unported/u);
});

test('returnedStrings reads quoted and template returns', () => {
    const body = "{ if (a) return 'one'; if (b) return `two ${c}`; return null; }";
    assert.deepEqual(returnedStrings(body), ['one', 'two ${c}']);
});

// apply.c doapply() has a case label for every type it handles (4238-4402),
// and the port has a case for each, so its default arm is C's own: poles,
// picks and axes, then "Sorry, I don't know how to use that."
test('doapply()\'s default arm refuses no named object type', () => {
    const code = jsCode('apply.js');
    assert.doesNotMatch(code, /DOAPPLY_UNPORTED_NAMED_ARMS/u);
    const body = functionBody(code, 'doapply');
    const defaultArm = body.slice(body.lastIndexOf('default:'));
    assert.doesNotMatch(defaultArm, /\bthrow\b/u);
});

// do_wear.c answers an unknown boots, shield or shirt type with impossible()
// and carries on (251, 723, 751, 768, 789), as cursed() does without an
// object (1894-1897) and canwearobj() with silly_thing() (2198-2201). The
// port follows; none of these functions may throw.
test('do_wear.c impossible() arms continue as C does', () => {
    const code = jsCode('do_wear.js');
    for (const name of ['Boots_on', 'Shield_on', 'Shield_off', 'Shirt_on',
        'Shirt_off', 'cursed', 'canwearobj'])
        assert.doesNotMatch(functionBody(code, name), /\bthrow\b/u, name);
    assert.doesNotMatch(code, /SUPPORTED_BOOTS_ON/u);
});

// No caller passes INCLUDE_HERO to pickup.c query_objlist(): invent.c
// display_minventory() builds its own rows. Every pickup selection comes from
// the floor pile or u.ustuck's inventory with a positive count.
test('pickup admission refuses no caller-made selection', () => {
    const code = jsCode('pickup.js');
    assert.doesNotMatch(functionBody(code, 'query_objlist'), /INCLUDE_HERO/u);
    assert.doesNotMatch(functionBody(code, 'preflightPickupObjects'),
        /\bthrow\b/u);
});

// read.c seffects() calls seffect_punishment(), seffect_destroy_armor() and
// seffect_light() only from their own case labels, so none rechecks the
// scroll's type.
test('seffect_*() helpers do not recheck their scroll type', () => {
    const code = jsCode('read.js');
    for (const name of ['seffect_punishment', 'seffect_destroy_armor',
        'seffect_light'])
        assert.doesNotMatch(functionBody(code, name), /\bthrow\b/u, name);
});

// spell.c spelleffects() has a case for every spell a hero can learn (flame
// and freeze sphere are #if 0 in objects.h; blank paper cannot be learned),
// so its default arm is C's impossible(), obfree() and ECMD_OK.
test('spelleffects()\'s default arm is C\'s impossible()', () => {
    const body = functionBody(jsCode('spell.js'), 'spelleffects');
    const defaultArm = body.slice(body.lastIndexOf('default:'));
    assert.match(defaultArm, /^default:\s*await impossible\(`Unknown spell \$\{spell\} attempted\.`/u);
    assert.doesNotMatch(defaultArm.slice(0, defaultArm.indexOf('}')), /\bthrow\b/u);
});

// zap.c weffects() (3455-3468): every RAY-direction wand and spell in
// objects.h is a dig or in one of the two ray bands, so the last arm is C's
// impossible() and weffects() carries on to disclose = TRUE.
test('weffects()\'s last arm is C\'s impossible()', () => {
    const body = functionBody(jsCode('zap.js'), 'weffects');
    assert.match(body,
        /await impossible\('weffects: unexpected spell or wand', state\);\s*\}\s*disclose = true;/u);
    assert.doesNotMatch(body, /\bthrow\b/u);
});
