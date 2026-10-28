// Source text only. No game-module imports, eval, compiler, or runtime probes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir = 'diagnostics/divergence-evidence/character-tables/progression-20261028/';
const pin = JSON.parse(readFileSync(dir + 'inputs.json', 'utf8'));
const source = Object.fromEntries(Object.entries(pin.hashes).map(([path, hash]) => {
    const bytes = readFileSync(path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, `changed input: ${path}`);
    return [path, bytes.toString()];
}));
function audit(source) {
const croot = 'nethack-c/upstream/';
const strip = s => s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, m => m.replace(/[^\n]/g, ' '));
// Split only on commas outside nested delimiters and quoted strings.
function split(s) {
    const out = []; let start = 0, depth = 0, quote = null;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if ('([{'.includes(ch)) depth++;
        else if (')]}'.includes(ch)) depth--;
        else if (ch === ',' && depth === 0) { out.push(s.slice(start, i).trim()); start = i + 1; }
    }
    assert.equal(depth, 0); assert.equal(quote, null);
    if (s.slice(start).trim()) out.push(s.slice(start).trim());
    return out;
}
function body(s, marker, open, close) {
    const at = s.indexOf(marker); assert.ok(at >= 0, marker);
    const start = s.indexOf(open, at + marker.length); assert.ok(start >= 0);
    let depth = 0, quote = null;
    for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === open) depth++;
        if (ch === close && --depth === 0) return s.slice(start + 1, i);
    }
    assert.fail(`unclosed ${marker}`);
}
const num = s => {
    s = s.trim();
    const strength = /^STR18\((\d+)\)$/.exec(s);
    if (strength) return 18 + Number(strength[1]);
    assert.match(s, /^-?\d+$/); return Number(s);
};
const vec = s => split(s.slice(1, -1)).map(num);
const crole = strip(source[croot + 'src/role.c']);
const jrole = strip(source['js/roles.js']);
assert.match(source[croot + 'include/attrib.h'], /#define STR18\(x\) \(18 \+ \(x\)\)/);
assert.match(jrole, /function advance\(infix, inrnd, lofix, lornd, hifix, hirnd\)\s*\{\s*return \{ infix, inrnd, lofix, lornd, hifix, hirnd \};\s*\}/);
assert.match(strip(source['js/attrib.js']), /function innate\(ulevel, ability, gainstr, losestr\)\s*\{\s*return Object.freeze\(\{ ulevel, ability, gainstr, losestr \}\);\s*\}/);
assert.match(strip(source['js/role_skills.js']), /entries.map\(\(\[skill, skmax\]\) =>\s*Object.freeze\(\{ skill, skmax \}\)\)/);

const rows = [];
function compare(key, c, js) { rows.push({ key, c, js, equal: JSON.stringify(c) === JSON.stringify(js) }); }
for (const [group, count, fields] of [
    ['roles', 13, ['attrbase', 'attrdist', 'hpadv', 'enadv']],
    ['races', 5, ['attrmin', 'attrmax', 'hpadv', 'enadv']],
]) {
    const cr = split(body(crole, `const struct ${group === 'roles' ? 'Role' : 'Race'} ${group}`, '{', '}'));
    assert.equal(cr.pop(), group === 'roles' ? 'UNDEFINED_ROLE' : 'UNDEFINED_RACE');
    const jr = split(body(jrole, `export const ${group} = deepFreeze(`, '[', ']'));
    assert.equal(cr.length, count); assert.equal(jr.length, count);
    for (let i = 0; i < count; i++) {
        const cf = split(cr[i].slice(1, -1));
        const code = JSON.parse(cf[group === 'roles' ? 5 : 3]);
        assert.equal(jr[i].match(/filecode:\s*'([^']+)'/)[1], code);
        const start = group === 'roles' ? 19 : 12;
        // Field indices are pinned by include/you.h Role and Race layouts.
        for (let k = 0; k < 4; k++) {
            const field = fields[k]; const cv = vec(cf[start + k]);
            const match = jr[i].match(new RegExp(`${field}:\\s*(?:advance\\(([^)]+)\\)|\\[([^\\]]+)\\])`));
            assert.ok(match, `${code}.${field}`);
            const jv = split(match[1] ?? match[2]).map(num);
            assert.equal(cv.length, 6); assert.equal(jv.length, 6);
            for (let n = 0; n < 6; n++) compare(`${group}.${code}.${field}.${n}`, cv[n], jv[n]);
        }
        if (group === 'roles') compare(`roles.${code}.xlev`, num(cf[start + 4]), num(jr[i].match(/xlev:\s*(\d+)/)[1]));
    }
}
// Independent C enums/macros and JS declarations; never use JS constants as C oracle.
const cdefs = new Map(); const jdefs = new Map();
for (const path of ['include/skills.h', 'include/prop.h']) {
    const s = strip(source[croot + path]);
    for (const m of s.matchAll(/\b([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\b/g)) cdefs.set(m[1], m[2]);
    for (const m of s.matchAll(/^#define\s+(P_[A-Z_]+)\s+(P_[A-Z_]+)\s*$/gm)) cdefs.set(m[1], m[2]);
}
for (const m of strip(source['js/const.js']).matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*([A-Z][A-Z0-9_]*|\d+)\s*;/g)) jdefs.set(m[1], m[2]);
function resolve(defs, name, seen = new Set()) {
    if (/^\d+$/.test(name)) return Number(name);
    assert.ok(!seen.has(name) && defs.has(name), `unresolved/cyclic ${name}`); seen.add(name);
    return resolve(defs, defs.get(name), seen);
}
const cs = strip(source[croot + 'src/u_init.c']);
const js = strip(source['js/role_skills.js']);
const skills = ['A', 'B', 'C', 'H', 'K', 'Mon', 'P', 'R', 'Ran', 'S', 'T', 'V', 'W'];
assert.equal([...cs.matchAll(/static const struct def_skill Skill_\w+\[\]/g)].length, 13);
assert.equal([...js.matchAll(/const SKILL_\w+ = catalog\(/g)].length, 13);
let skillEntries = 0;
for (const suffix of skills) {
    const ce = split(body(cs, `Skill_${suffix}[] =`, '{', '}')).map(e => split(e.slice(1, -1)));
    assert.deepEqual(ce.pop(), ['P_NONE', '0']);
    const je = split(body(js, `const SKILL_${suffix.toUpperCase()} = catalog(`, '[', ']')).map(e => split(e.slice(1, -1)));
    compare(`skills.${suffix}.length`, ce.length, je.length);
    for (let i = 0; i < Math.max(ce.length, je.length); i++) {
        for (let n = 0; n < 2; n++) compare(`skills.${suffix}.${i}.${n ? 'cap' : 'id'}`, ce[i] ? resolve(cdefs, ce[i][n]) : null, je[i] ? resolve(jdefs, je[i][n]) : null);
    }
    skillEntries += ce.length;
}
const props = new Map([...strip(source[croot + 'include/youprop.h']).matchAll(/^#define\s+(H\w+)\s+u\.uprops\[([A-Z_]+)\]\.intrinsic\s*$/gm)].map(m => [m[1], m[2]]));
const ca = strip(source[croot + 'src/attrib.c']);
const ja = strip(source['js/attrib.js']);
const names = [...ca.slice(0, ca.indexOf('staticfn')).matchAll(/\b(\w+_abil)\[\]\s*=/g)].map(m => m[1]);
assert.equal(names.length, 18);
assert.equal([...ja.matchAll(/const \w+_abil = Object.freeze\(/g)].length, 18);
let innateEntries = 0;
for (const name of names) {
    const ce = split(body(ca, `${name}[] =`, '{', '}')).map(e => split(e.slice(1, -1)));
    assert.deepEqual(ce.pop(), ['0', '0', '0', '0']);
    const je = split(body(ja, `const ${name} = Object.freeze(`, '[', ']')).map(e => {
        assert.match(e, /^innate\([\s\S]*\)$/); return split(e.slice(7, -1));
    });
    compare(`innates.${name}.length`, ce.length, je.length);
    for (let i = 0; i < Math.max(ce.length, je.length); i++) {
        const convertC = e => {
            if (!e) return [null, null, null, null];
            const macro = e[1].replace(/[&()\s]/g, ''); assert.ok(props.has(macro), macro);
            return [num(e[0]), resolve(cdefs, props.get(macro)), JSON.parse(e[2]), JSON.parse(e[3])];
        };
        const convertJ = e => e ? [num(e[0]), resolve(jdefs, e[1]), ...e.slice(2).map(s => { assert.match(s, /^'[^'\\]*'$/); return s.slice(1, -1); })] : [null, null, null, null];
        const cv = convertC(ce[i]), jv = convertJ(je[i]);
        for (let n = 0; n < 4; n++) compare(`innates.${name}.${i}.${['level', 'property', 'gain', 'loss'][n]}`, cv[n], jv[n]);
    }
    innateEntries += ce.length;
}
return { rows, skillEntries, innateEntries,
    aliasC: resolve(cdefs, 'P_MARTIAL_ARTS'), aliasJ: resolve(jdefs, 'P_MARTIAL_ARTS'),
    bareC: resolve(cdefs, 'P_BARE_HANDED_COMBAT'), bareJ: resolve(jdefs, 'P_BARE_HANDED_COMBAT') };
}
const { rows, skillEntries, innateEntries, aliasC, aliasJ, bareC, bareJ } = audit(source);
const mode = process.argv[2] ?? 'target';
const mismatch = values => values.filter(r => !r.equal);
let controls;
if (mode === 'controls') {
    const mutations = [
        ['js/roles.js', 'attrbase: [7, 10', 'attrbase: [8, 10', ['roles.Arc.attrbase.0']],
        ['js/roles.js', 'attrdist: [20, 20', 'attrdist: [21, 20', ['roles.Arc.attrdist.0']],
        ['js/roles.js', 'hpadv: advance(11, 0, 0, 8, 1, 0)', 'hpadv: advance(12, 0, 0, 8, 1, 0)', ['roles.Arc.hpadv.0']],
        ['js/roles.js', 'enadv: advance(1, 0, 0, 1, 0, 1)', 'enadv: advance(1, 0, 0, 1, 0, 2)', ['roles.Arc.enadv.5']],
        ['js/roles.js', 'xlev: 14', 'xlev: 15', ['roles.Arc.xlev']],
        ['js/roles.js', 'attrmin: [3, 3', 'attrmin: [4, 3', ['races.Hum.attrmin.0']],
        ['js/roles.js', 'attrmax: [118, 18', 'attrmax: [119, 18', ['races.Hum.attrmax.0']],
        ['js/roles.js', 'hpadv: advance(2, 0, 0, 2, 1, 0)', 'hpadv: advance(3, 0, 0, 2, 1, 0)', ['races.Hum.hpadv.0']],
        ['js/roles.js', 'enadv: advance(1, 0, 2, 0, 2, 0)', 'enadv: advance(2, 0, 2, 0, 2, 0)', ['races.Hum.enadv.0']],
        ['js/role_skills.js', '[P_DAGGER, P_BASIC]', '[P_AXE, P_BASIC]', ['skills.A.0.id']],
        ['js/role_skills.js', '[P_DAGGER, P_BASIC]', '[P_DAGGER, P_EXPERT]', ['skills.A.0.cap']],
        ['js/attrib.js', "innate(1, SEARCHING, '', '')", "innate(2, SEARCHING, '', '')", ['innates.arc_abil.0.level']],
        ['js/attrib.js', "innate(1, SEARCHING, '', '')", "innate(1, FAST, '', '')", ['innates.arc_abil.0.property']],
        ['js/attrib.js', "innate(1, SEARCHING, '', '')", "innate(1, SEARCHING, 'changed', '')", ['innates.arc_abil.0.gain']],
        ['js/attrib.js', "innate(1, SEARCHING, '', '')", "innate(1, SEARCHING, '', 'changed')", ['innates.arc_abil.0.loss']],
        ['js/attrib.js', 'const hum_abil = Object.freeze([]);', "const hum_abil = Object.freeze([innate(1, FAST, '', '')]);", ['innates.hum_abil.length', 'innates.hum_abil.0.level', 'innates.hum_abil.0.property', 'innates.hum_abil.0.gain', 'innates.hum_abil.0.loss']],
    ];
    controls = mutations.map(([path, before, after, expected]) => {
        assert.ok(source[path].includes(before));
        const mutated = { ...source, [path]: source[path].replace(before, after) };
        const witnesses = mismatch(audit(mutated).rows);
        assert.deepEqual(witnesses.map(r => r.key), expected);
        return { path, before, after, detected: true, witnesses };
    });
    for (const [path, before, after] of [
        ['js/roles.js', 'attrbase: [7, 10, 10, 7, 7, 7]', 'attrbase: [7, 10, 10, 7, 7]'],
        ['js/role_skills.js', '[P_DAGGER, P_BASIC]', '[P_UNKNOWN, P_BASIC]'],
        ['nethack-c/upstream/src/u_init.c', '{ P_NONE, 0 }', '{ P_NONE, 1 }'],
    ]) {
        assert.ok(source[path].includes(before));
        assert.throws(() => audit({ ...source, [path]: source[path].replace(before, after) }));
        controls.push({ path, before, after, rejectedMalformedInput: true });
    }
    // Positive controls independently pin representative parsed values and normalization.
    for (const [key, value] of [['roles.Arc.attrbase.0', 7], ['races.Hum.attrmax.0', 118], ['races.Gno.attrmax.0', 68], ['skills.Mon.11.cap', 6], ['innates.elf_abil.1.property', 3]]) {
        const row = rows.find(r => r.key === key); assert.ok(row, key); assert.equal(row.c, value); assert.equal(row.js, value);
    }
    assert.equal(aliasC, bareC);
    assert.equal(aliasJ, bareJ);
} else assert.equal(mode, 'target');
console.log(JSON.stringify({ provenance: pin.provenance, mode, counts: { roles: 13, races: 5, skillTables: 13, skillEntries, innateTables: 18, innateEntries, comparisons: rows.length, matched: rows.length - mismatch(rows).length, mismatches: mismatch(rows).length }, mismatches: mismatch(rows), ...(controls ? { controls, positiveControls: 7 } : { rows }) }, null, 2));
process.exitCode = mismatch(rows).length ? 1 : 0;
