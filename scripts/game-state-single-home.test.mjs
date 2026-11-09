// AGENTS.md, "Keep each game value in one place": each C state value has one
// JavaScript location. C groups its globals by initial letter (gt.twohits,
// gn.nomovemsg); the port keeps some of them in those groups
// (state.gt.thrownobj) and others on the game state itself
// (state.nomovemsg). Either is fine, but one field must not use both. When
// uhitm.js hmonas() wrote state.gt.twohits while hitum() and hmon_hitmon()
// used state.twohits, a polymorphed hero's bare-handed hit read undefined and
// reached worn.c which_armor()'s impossible(). Writes through the other
// location are lost the same way (apply.js once froze the hero through
// state.gn.nomovemsg, which unmul() never reads).
//
// This test fails when a field is reached both as `<x>.g?.<field>` and as
// `<state>.<field>` in js/.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// Names the port gives the game state object.
const STATE_RECEIVER = /\b(?:state|game|gameState|liveState|s)\??\.([A-Za-z_]\w*)/gu;
const GROUPED = /\.(g[a-z])\??\.([A-Za-z_]\w*)/gu;

// Sites in files another agent is editing at the time this check was added.
// Each entry must still match its line exactly; delete it when its file is
// converted. Neither changes a result: state.gi.invent is never set, and
// state.nomovemsg is already null whenever sounds.js nomul()s the hero.
const PENDING = new Set([
    'sounds.js:nomovemsg:        state.gn.nomovemsg = null;',
    'teleport.js:invent:                if (state.gi?.invent || state.invent) {',
    'teleport.js:invent:                    `Your body rematerializes${state.gi?.invent || state.invent',
]);

// Blank out comments and string contents, keeping line breaks, so that
// neither can produce a match. Template-literal holes stay as code.
export function codeOnly(source) {
    let out = '';
    const templateDepths = [];
    let braceDepth = 0;
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        const next = source[i + 1];
        if (ch === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') i++;
            out += '\n';
            continue;
        }
        if (ch === '/' && next === '*') {
            const end = source.indexOf('*/', i + 2);
            const body = source.slice(i, end < 0 ? source.length : end + 2);
            out += body.replace(/[^\n]/gu, ' ');
            i += body.length - 1;
            continue;
        }
        if (ch === '}' && templateDepths.length
            && templateDepths.at(-1) === braceDepth) {
            templateDepths.pop();
            i = skipTemplate(source, i + 1, (text) => { out += text; },
                templateDepths, braceDepth) - 1;
            continue;
        }
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
        if (ch === '\'' || ch === '"') {
            let j = i + 1;
            while (j < source.length && source[j] !== ch && source[j] !== '\n') {
                if (source[j] === '\\') j++;
                j++;
            }
            out += ch + ' '.repeat(Math.max(0, j - i - 1)) + ch;
            i = j;
            continue;
        }
        if (ch === '`') {
            out += '`';
            i = skipTemplate(source, i + 1, (text) => { out += text; },
                templateDepths, braceDepth) - 1;
            continue;
        }
        out += ch;
    }
    return out;
}

// Copy a template literal's text as blanks from `start` up to its closing
// backtick or a `${` hole; returns the index after what it consumed.
function skipTemplate(source, start, emit, templateDepths, braceDepth) {
    let i = start;
    let text = '';
    while (i < source.length) {
        if (source[i] === '\\') { text += '  '; i += 2; continue; }
        if (source[i] === '`') { emit(`${text}\``); return i + 1; }
        if (source[i] === '$' && source[i + 1] === '{') {
            emit(`${text}\${`);
            templateDepths.push(braceDepth);
            return i + 2;
        }
        text += source[i] === '\n' ? '\n' : ' ';
        i++;
    }
    emit(text);
    return i;
}

function scan() {
    const grouped = new Map();
    const direct = new Map();
    const add = (map, field, site) => {
        if (!map.has(field)) map.set(field, []);
        map.get(field).push(site);
    };
    for (const file of readdirSync(JS_DIR).filter((f) => f.endsWith('.js'))) {
        const raw = readFileSync(join(JS_DIR, file), 'utf8').split('\n');
        const code = codeOnly(raw.join('\n')).split('\n');
        code.forEach((line, index) => {
            const site = { file, line: index + 1, text: raw[index] };
            for (const match of line.matchAll(GROUPED))
                add(grouped, match[2], { ...site, group: match[1] });
            for (const match of line.matchAll(STATE_RECEIVER)) {
                if (/^g[a-z]$/u.test(match[1])) continue;
                add(direct, match[1], site);
            }
        });
    }
    return { grouped, direct };
}

test('codeOnly() blanks comments and strings but keeps template holes', () => {
    const source = [
        'a.gt.x; // state.x',
        '/* game.gn.y */ "state.z" \'s.w\'',
        '`${state.v} state.u ${s.gt.t}`',
    ].join('\n');
    const code = codeOnly(source).split('\n');
    assert.equal(code.length, 3);
    assert.match(code[0], /a\.gt\.x;/u);
    assert.doesNotMatch(code[0], /state\.x/u);
    assert.doesNotMatch(code[1], /gn\.y|state\.z|s\.w/u);
    assert.match(code[2], /state\.v/u);
    assert.match(code[2], /s\.gt\.t/u);
    assert.doesNotMatch(code[2], /state\.u/u);
});

test('no C global is kept both in its g? group and on the game state', () => {
    const { grouped, direct } = scan();
    const conflicts = [];
    const pendingSeen = new Set();
    for (const [field, groupedSites] of grouped) {
        const directSites = direct.get(field);
        if (!directSites) continue;
        const sites = [...groupedSites, ...directSites].filter((site) => {
            const key = `${site.file}:${field}:${site.text}`;
            if (!PENDING.has(key)) return true;
            pendingSeen.add(key);
            return false;
        });
        const groupedLeft = sites.filter((site) => site.group);
        const directLeft = sites.filter((site) => !site.group);
        if (!groupedLeft.length || !directLeft.length) continue;
        conflicts.push(`${field}: grouped at ${groupedLeft.map((site) =>
            `${site.file}:${site.line}`).join(', ')}; direct at ${directLeft
            .slice(0, 5).map((site) => `${site.file}:${site.line}`)
            .join(', ')}`);
    }
    assert.deepEqual(conflicts, []);
    assert.deepEqual([...PENDING].filter((key) => !pendingSeen.has(key)), [],
        'a pending entry no longer matches its line; delete it');
});
