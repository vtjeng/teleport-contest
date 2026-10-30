// Exact nhlua get_table_str_opt C body with disclosed allocation/error/call
// shims; tests cover values and accepted types, not full diagnostic messages.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {get_table_str_opt, luaL_checkstring} from '../js/nhlua.js';
import {get_traptype_byname} from '../js/mklev.js';
import {RUST_TRAP, NO_TRAP} from '../js/const.js';
const fixture = new URL('./fixtures/optional-string-reader/', import.meta.url);
const oracle = JSON.parse(readFileSync(new URL('oracle.json', fixture)));
const inputs = {
  plain: [{s:'a'},null], nul: [{s:'a\0suffix'},null],
  'fn-plain': [{s:()=> 'b'},null], 'fn-nul': [{s:()=> 'b\0suffix'},null],
  default: [{},'dflt'], 'default-nul': [{},'dflt\0suffix'],
  empty: [{s:''},'fallback'], 'leading-nul': [{s:'\0suffix'},'fallback'],
  'fn-nil': [{s:()=>null},null], 'fn-nil-default': [{s:()=>null},'fallback'],
  'fn-int': [{s:()=>3},null], 'fn-float': [{s:()=>3.5},null],
  'raw-number': [{s:3},null], 'fn-boolean': [{s:()=>false},null],
};
test('C oracle retains source body and output provenance',()=>{
  for(const [name,hash] of Object.entries(oracle.provenance.fixtureHashes))
    assert.equal(createHash('sha256').update(readFileSync(new URL(name,fixture))).digest('hex'),hash);
  const source=readFileSync('nethack-c/upstream/src/nhlua.c','utf8');
  const start=source.indexOf('char *\nget_table_str_opt(');
  const body=source.slice(start,source.indexOf('\n}\n',start)+3);
  assert.equal(createHash('sha256').update(body).digest('hex'),oracle.provenance.bodySha256);
  assert.ok(readFileSync(new URL('oracle.c',fixture),'utf8').includes(body));
});
for(const entry of oracle.cases){
  test(`optional string C oracle: ${entry.id}`,()=>{
    const [table,defval]=inputs[entry.id];
    const invoke=()=>get_table_str_opt(table,'s',defval);
    if(entry.outcome==='error') assert.throws(invoke);
    else assert.equal(invoke(),entry.value);
  });
}
// Pure name lookup only; expectations from sp_lev.c strcmpi() and trap_types.
// These do not construct a trap, room, level or destination.
for(const [name,expected] of [
  ['rust',RUST_TRAP],['RuSt',RUST_TRAP],['rust\0suffix',RUST_TRAP],
  ['RuSt\0suffix',RUST_TRAP],['rustsuffix',NO_TRAP],
  ['other\0rust',NO_TRAP],['\0rust',NO_TRAP],
]) test(`trap name C-string lookup: ${JSON.stringify(name)}`,()=>{
  assert.equal(get_traptype_byname(name),expected);
});

test('raw Lua string primitive keeps NUL payload; owned optional copy alone truncates',()=>{
  assert.equal(luaL_checkstring('a\0suffix'),'a\0suffix');
});
