// Static text parser only; no game modules are imported or executed.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
function stripComments(text) {
    let output = '';
    let index = 0;
    while (index < text.length) {
        const ch = text[index];
        if (ch === '"' || ch === "'") {
            const quote = ch;
            output += ch;
            ++index;
            while (index < text.length && text[index] !== quote) {
                if (text[index] === '\\') {
                    output += text[index];
                    ++index;
                }
                output += text[index];
                ++index;
            }
            output += text[index] ?? '';
            ++index;
        } else if (ch === '/' && text[index + 1] === '*') {
            const end = text.indexOf('*/', index + 2);
            if (end < 0) throw new Error('unterminated block comment');
            // Keep any newlines so line-oriented directive handling still works.
            output += text.slice(index, end + 2).replace(/[^\n]/gu, '');
            index = end + 2;
        } else if (ch === '/' && text[index + 1] === '/') {
            const end = text.indexOf('\n', index);
            index = end < 0 ? text.length : end;
        } else {
            output += ch;
            ++index;
        }
    }
    return output;
}

function splitFields(body) {
    const fields = [];
    let depth = 0;
    let current = '';
    let index = 0;
    while (index < body.length) {
        const ch = body[index];
        if (ch === '"' || ch === "'") {
            const quote = ch;
            current += ch;
            ++index;
            while (index < body.length && body[index] !== quote) {
                if (body[index] === '\\') {
                    current += body[index];
                    ++index;
                }
                current += body[index];
                ++index;
            }
            current += body[index] ?? '';
            ++index;
            continue;
        }
        if (ch === '(' || ch === '{') ++depth;
        else if (ch === ')' || ch === '}') --depth;
        if (ch === ',' && !depth) {
            fields.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
        ++index;
    }
    if (current.trim()) fields.push(current.trim());
    return fields;
}

const CHARACTER_ESCAPES = new Map([
    ['n', 10], ['t', 9], ['r', 13], ['b', 8], ['f', 12], ['v', 11],
    ['a', 7], ['\\', 92], ["'", 39], ['"', 34], ['?', 63],
]);

function characterLiteralValue(literal) {
    const inner = literal.slice(1, -1);
    if (inner[0] !== '\\') return inner.charCodeAt(0);
    const escape = inner.slice(1);
    if (CHARACTER_ESCAPES.has(escape)) return CHARACTER_ESCAPES.get(escape);
    if (/^[0-7]{1,3}$/u.test(escape)) return Number.parseInt(escape, 8);
    if (/^x[0-9a-fA-F]+$/u.test(escape)) return Number.parseInt(escape.slice(1), 16);
    throw new Error(`unsupported character escape ${literal}`);
}

// global.h:480-488 defines M(c) as 0x80 | c and C(c) as 0x1f & c.  The NHSTDC
// spelling `(c) - 128` differs only in signedness and lands on the same uchar.
function keyValue(expression, objectClassSymbols) {
    const text = expression.trim();
    if (/^'(\\.[0-7]*|[^\\])'$/u.test(text)) return characterLiteralValue(text);
    const meta = text.match(/^M\(\s*('(?:\\.[0-7]*|[^\\])')\s*\)$/u);
    if (meta) return 0x80 | characterLiteralValue(meta[1]);
    const control = text.match(/^C\(\s*('(?:\\.[0-7]*|[^\\])')\s*\)$/u);
    if (control) return 0x1F & characterLiteralValue(control[1]);
    if (objectClassSymbols.has(text)) return objectClassSymbols.get(text);
    throw new Error(`unsupported extcmdlist key expression: ${text}`);
}

function stringValue(expression) {
    const text = expression.trim();
    if (text === 'null' || text === 'NULL' || text === '0' || /^\(\s*char\s*\*\s*\)\s*0$/u.test(text)) {
        return null;
    }
    const literals = [...text.matchAll(/"((?:[^"\\]|\\.)*)"/gu)];
    if (!literals.length) throw new Error(`unsupported string field: ${text}`);
    return literals.map((literal) => literal[1].replace(
        /\\(.)/gu,
        (whole, escaped) => (CHARACTER_ESCAPES.has(escaped)
            ? String.fromCharCode(CHARACTER_ESCAPES.get(escaped))
            : escaped),
    )).join('');
}

const sources = ['nethack-c/upstream/src/cmd.c','js/extcmdlist_data.js','js/command_bindings.js','js/cmd.js'];
const raw = Object.fromEntries(sources.map(p=>[p,readFileSync(root+p,'utf8')]));
const clean = Object.fromEntries(sources.map(p=>[p,stripComments(raw[p])]));
const [cp,jp,bp,mp]=sources;
const excluded = /look|what|glance|terrain|travel|herecmdmenu|therecmdmenu|overview|^move|^run|^rush|eat|migrat|figurine|glob|buried/i;
const omissions=[];
function location(p,index){return `${p}:${clean[p].slice(0,index).split('\n').length}`;}
function region(p,start,end){const i=clean[p].indexOf(start);assert(i>=0,start);const e=clean[p].indexOf(end,i+start.length);assert(e>i,end);return {text:clean[p].slice(i,e),offset:i};}
function rows(p,r,re,parse){return [...r.text.matchAll(re)].map(m=>parse(m,location(p,r.offset+m.index)));}
const cr=region(cp,'struct ext_func_tab extcmdlist[] = {','\n};');
const jr=region(jp,'export const extcmdlist = Object.freeze([','\n]);');
function command(fields,loc,isC){
 const name=stringValue(fields[1]); if(!name)return null;
 if(excluded.test(name)){omissions.push({source:loc,name,reason:'scope exclusion before value comparison'});return null;}
 let key;try {key=isC?keyValue(fields[0],new Map()):Number(fields[0]);}catch{key={unexamined:fields[0]};omissions.push({source:loc,name,reason:'symbolic key left unexamined; no symbol-table investigation'});}
 return {name,key,label:stringValue(fields[2]),source:loc};
}
// Parse every initializer, including conditional declarations. Conditions are retained
// as source provenance; no compiled configuration or runtime visibility is claimed.
const c=rows(cp,cr,/\{([^{}]*)\}/gs,(m,l)=>command(splitFields(m[1]),l,true)).filter(Boolean);
const j=rows(jp,jr,/^[ \t]*row\((.*)\),?$/gm,(m,l)=>command(splitFields(m[1]),l,false)).filter(Boolean);
const ar=region(cp,'commands_init(void)\n{','\n}');
const br=region(bp,'const SOURCE_COMMAND_ALIASES = Object.freeze([','\n]);');
const ca=rows(cp,ar,/bind_key\((.*?),\s*"([^"]+)",\s*FALSE\)/g,(m,l)=>({name:m[2],key:keyValue(m[1],new Map()),source:l}));
const ja=rows(bp,br,/\['([^']+)',\s*'([^']+)'\]/g,(m,l)=>({name:m[2],key:m[1].startsWith('M-')?m[1].charCodeAt(2)|128:m[1].startsWith('^')?m[1].charCodeAt(1)&31:m[1].charCodeAt(0),source:l}));
function filterAliases(a){return a.filter(x=>{if(excluded.test(x.name)||x.name==='wait'){omissions.push({...x,reason:x.name==='wait'?'C #if 0 declaration; no active JS alias expected':'scope exclusion'});return false;}return true;});}
const cm=rows(cp,region(cp,'\nyn_function_menu(','\n}'),/yn_func_menu_opt\(win,\s*('(?:\\.|[^'])+'),\s*("(?:\\.|[^"])*"),\s*def\)/g,(m,l)=>({name:String(characterLiteralValue(m[1])),label:stringValue(m[2]),source:l}));
const jm=rows(mp,region(mp,'async function yn_function_menu(','\n}'),/yn_func_menu_opt\(items,\s*('(?:\\.|[^'])+'),\s*('(?:\\.|[^'])*'),\s*def\)/g,(m,l)=>({name:String(characterLiteralValue(m[1])),label:m[2].slice(1,-1),source:l}));
function compare(a,b,fields){const results=[];for(const name of [...new Set([...a,...b].map(x=>x.name))].sort()){
 const left=a.filter(x=>x.name===name),right=b.filter(x=>x.name===name);
 const values=x=>x.map(r=>Object.fromEntries(fields.map(f=>[f,r[f]])));
 const unique=x=>[...new Set(values(x).map(v=>JSON.stringify(v)))].sort();
 const symbolic=left.some(x=>typeof x.key==='object');
 results.push({name,c:left,js:right,status:symbolic?'key-unexamined':JSON.stringify(unique(left))===JSON.stringify(unique(right))?'declarations-match':'static-mismatch'});
 }return results;}
// Only escape and count are non-coordinate entries in this special-key table.
const cs=rows(cp,region(cp,'} const spkeys_binds[] = {','\n};'),/\{\s*(NHKF_ESC|NHKF_COUNT),\s*('(?:\\.|[^'])+'),/g,(m,l)=>({name:m[1]==='NHKF_ESC'?'escape':'count',key:characterLiteralValue(m[2]),source:l}));
const js=rows(bp,region(bp,'export const SOURCE_SPECIAL_KEY_DEFAULTS = Object.freeze({','\n});'),/^[ \t]*(escape|count):\s*('(?:\\.|[^'])+'),/gm,(m,l)=>({name:m[1],key:characterLiteralValue(m[2]),source:l}));
assert.equal(cs.length,2); assert.equal(js.length,2);
const catalogs={specialKeys:compare(cs,js,['key']),commands:compare(c,j,['key','label']),aliases:compare(filterAliases(ca),filterAliases(ja),['key']),menuLabels:compare(cm,jm,['label'])};
assert(c.length>100);assert(j.length>100);assert.equal(cm.length,8);assert.equal(jm.length,8);
assert.equal(compare([{name:'control',key:1}],[{name:'control',key:2}],['key'])[0].status,'static-mismatch');
assert.equal(compare([{name:'control',key:1}],[{name:'control',key:1}],['key'])[0].status,'declarations-match');
assert(excluded.test('whatis'));assert(excluded.test('wizmakemigrating'));
assert.equal([...cr.text.matchAll(/\{([^{}]*)\}/gs)].length,171);
assert.equal([...jr.text.matchAll(/^[ \t]*row\(/gm)].length,170);
assert.equal(c.length,129);assert.equal(j.length,129);
for(const entry of catalogs.commands)assert.deepEqual(entry.c.map(x=>x.label),entry.js.map(x=>x.label));
for (const p of [cp,bp]) {
 const r=p===cp?region(cp,'} const spkeys_binds[] = {','\n};'):region(bp,'export const SOURCE_SPECIAL_KEY_DEFAULTS = Object.freeze({','\n});');
 for(const m of r.text.matchAll(/["'](get(?:pos|dir)\.[^"']+)["']/g)) omissions.push({name:m[1],source:location(p,r.offset+m.index),reason:'coordinate-related special-key entry; values not compared'});
}
const result={sourceHashes:Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(raw[p]).digest('hex')])),rawCounts:{cCommandInitializers:[...cr.text.matchAll(/\{([^{}]*)\}/gs)].length,jsCommandRows:[...jr.text.matchAll(/^[ \t]*row\(/gm)].length},coverage:Object.fromEntries(Object.entries(catalogs).map(([k,v])=>[k,{unionNames:v.length,cRows:v.reduce((n,x)=>n+x.c.length,0),jsRows:v.reduce((n,x)=>n+x.js.length,0),statuses:v.reduce((a,x)=>(a[x.status]=(a[x.status]??0)+1,a),{})}])),controls:'equal, unequal, exclusion and nonempty/8-menu-row assertions passed',catalogs,omissions};
const output=JSON.stringify(result,null,2)+'\n';
const target=new URL('observations.json',import.meta.url);
if(process.argv.includes('--write'))writeFileSync(target,output);else assert.equal(readFileSync(target,'utf8'),output);
console.log(JSON.stringify(result.coverage));
