// Keeps deleted refusals for inputs no production caller omits from coming
// back. Each rule below names a guard that threw, or recorded an unported
// gap, only when a caller left out an input that every game path supplies,
// or reached a state that no game path creates. The C code has no such
// guard; it reads the value, or makes the call, directly. A returning guard
// would hide that the port's default is C's.
//
// Each rule lists the files it scans (all of js/ when `files` is absent) and
// a pattern that must not match their code outside comments.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

export const RULES = [
    {
        // mklev.c mineralize() reads u.uz, the topology globals and the
        // level flags that init_dungeons() and clear_level_structures() set
        // before any level is made.
        name: 'mineralize context refusal',
        files: ['mineralize.js'],
        pattern: /UnsupportedMineralizeContextError|requireInteger|\.level\?\.at\?\./gu,
    },
    {
        // mklev.c makelevel() calls makemaz() for every special level and
        // quest filler without asking whether its program exists; makemaz()
        // prints impossible() and makes a maze when one does not.
        // scripts/special-level-loaders.test.mjs keeps every program loadable.
        name: 'special-level loader pre-check',
        files: ['mklev.js'],
        pattern: /hasLoader|no loader for|SPECIAL_LEVEL_LOADERS\[fillName\]/gu,
    },
    {
        // themerms.lua draws from C's one core RNG. dispatch_themeroom() and
        // themerooms_generate() take one random object, so the room code and
        // the fill callbacks cannot be handed different streams.
        name: 'themed-room random facade',
        files: ['mklev.js'],
        pattern: /themeroom_random_facade|THEMEROOM_RANDOM_METHODS|(?:raw)?[eE]nv\.randomFacade/gu,
    },
    {
        // sp_lev.c lspo_door() maps the state and wall names through
        // get_table_option(); every create_room_door() caller passes a
        // themerms.lua literal or shop wall that the tables hold.
        name: 'room-door name refusal',
        files: ['mklev.js'],
        pattern: /unsupported room door/gu,
    },
    {
        // mkmaze.c put_lregion_here()'s switch has no default: every
        // place_lregion() caller passes one of the seven LR_ types it handles.
        name: 'region placement refusal',
        pattern: /UnsupportedRegionPlacementError/gu,
    },
    {
        // sp_lev.c create_object(): get_table_buc() yields only 0-6, and
        // oname() returns the new object itself. The carrier's canseemon()
        // is false during level creation, the only time a level loads.
        name: 'special-level object refusal',
        pattern: /UnsupportedSpecialObjectError|preflightCarrierVisibility/gu,
    },
    {
        // create_object() calls oname() itself; game code must not supply a
        // nameObject hook (a copy of that default a caller could forget).
        name: 'nameObject hook supplied by game code',
        pattern: /(?<![\w.$])nameObject\s*:|\.nameObject\s*(?:\?\?|\|\||&&)?=(?!=)/gu,
    },
    {
        // sp_lev.c lspo_monster() accepts only obj:, mon: and ter:
        // appearances, and no dat/*.lua level uses mon:; create_monster()'s
        // M_AP_MONSTER arm is ported in full.
        name: 'special-level monster appearance refusal',
        files: ['themeroom_fill.js'],
        pattern: /assertSupportedMonsterAppearance|special-level appearance type/gu,
    },
    {
        // rumors.c couldnt_open_file() runs only when a dat file is missing;
        // js/random_text_data.js bundles every one, so the arm cannot run.
        name: 'missing dat file arm',
        pattern: /couldnt_open_file|couldntOpenFile/gu,
    },
    {
        // nhlua.c l_nhcore_call() and l_nhcore_done() serve a persistent Lua
        // core the port does not have: nhcore.lua's live callbacks are ported
        // directly, and its other entries are commented out.
        name: 'Lua core call stand-in',
        pattern: /l_nhcore_call|l_nhcore_done|\.luacore\b/gu,
    },
];

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

function lineOf(source, index) {
    return source.slice(0, index).split('\n').length;
}

export function ruleFindings(sources, rules = RULES) {
    const findings = [];
    for (const rule of rules) {
        for (const [file, source] of sources) {
            if (rule.files && !rule.files.includes(file)) continue;
            const code = stripComments(source);
            for (const match of code.matchAll(rule.pattern))
                findings.push(`${file}:${lineOf(code, match.index)} ${rule.name}: ${match[0]}`);
        }
    }
    return findings;
}

function jsSources() {
    return readdirSync(JS_DIR)
        .filter((file) => file.endsWith('.js'))
        .sort()
        .map((file) => [file, readFileSync(join(JS_DIR, file), 'utf8')]);
}

test('no deleted refusal for an always-supplied input returns to js/', () => {
    assert.deepEqual(ruleFindings(jsSources()), []);
});

test('every rule names files that exist', () => {
    const present = new Set(readdirSync(JS_DIR));
    for (const rule of RULES) {
        for (const file of rule.files ?? [])
            assert.ok(present.has(file), `${rule.name}: js/${file} is missing`);
    }
});

test('the scan reports code but not comments', () => {
    const rules = [{ name: 'demo', pattern: /forbidden\(/gu }];
    const sources = [['a.js', '// forbidden(1)\nok();\nforbidden(2);\n/* forbidden( */']];
    assert.deepEqual(ruleFindings(sources, rules), ['a.js:3 demo: forbidden(']);
});
