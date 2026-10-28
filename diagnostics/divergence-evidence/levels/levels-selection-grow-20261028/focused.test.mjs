import assert from 'node:assert/strict';
import test from 'node:test';
import { ThemeroomSelection } from '../../../../js/themerooms.js';
import { W_NORTH, W_SOUTH, W_EAST, W_WEST, W_ANY, W_RANDOM } from '../../../../js/const.js';
const offsets = [[W_WEST,-1,0],[W_WEST|W_NORTH,-1,-1],[W_NORTH,0,-1],[W_NORTH|W_EAST,1,-1],[W_EAST,1,0],[W_EAST|W_SOUTH,1,1],[W_SOUTH,0,1],[W_SOUTH|W_WEST,-1,1]];
// Source-derived eight-neighbor truth table from selvar.c:340-355. Every
// input neighborhood and every direction mask; source source-to-output union
// proof is in record.json. This is a primitive check, not level-frame coverage.
test('growth uses only the original selection, with all eight C direction terms', () => {
 for(let mask=0;mask<512;mask++) {
  const s=new ThemeroomSelection(null,true);
  for(let bit=0;bit<9;bit++)if(mask&(1<<bit))s.set(9+bit%3,9+Math.floor(bit/3));
  for(let dir=0;dir<=W_ANY;dir++) {
   const g=s.grow(dir);
   let expected=s.get(10,10);
   for(const [flags,dx,dy] of offsets)if((dir&flags)===flags && s.get(10-dx,10-dy))expected=true;
   assert.equal(g.get(10,10),expected,`mask=${mask},dir=${dir}`);
   assert.equal(g.absolute,true);
  }
 }
});
test('growth clips at map boundaries, preserves input, and makes one random direction draw',()=>{
 const s=new ThemeroomSelection([{x:0,y:0}],true);
 const g=s.grow(W_ANY);
 assert.equal(g.numpoints(),4); assert.equal(s.numpoints(),1);
 const draws=[];
 const north=s.grow(W_RANDOM,n=>{draws.push(n);return 0;});
 assert.deepEqual(draws,[4]); assert.equal(north.numpoints(),1);
});
