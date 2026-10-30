import assert from 'node:assert/strict';
import test from 'node:test';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {cmdq_add_ec,cmdq_peek,rhack} from '../js/cmd.js';
import {extcmdlist} from '../js/extcmdlist_data.js';
import {CQ_CANNED} from '../js/const.js';

// Only the historical command-row dispatch claim. Leave clicklook_cc unset;
// no coordinate selection, custom output, or description behavior is tested.
for(const handler of ['doclicklook','donull'])
 test(`queued native handler ${handler}`,async()=>{
  await runSegment({seed:620417,datetime:'20320405060710',nethackrc:'OPTIONS=name:Dispatch,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',moves:''});
  const row=extcmdlist.find(e=>e.ef_funct===handler);
  assert.ok(row);
  assert.notEqual(row.ef_txt,row.ef_funct);
  assert.equal(game.clicklook_cc??null,null);
  const moves=game.moves;
  cmdq_add_ec(CQ_CANNED,row,game);
  await rhack(0,game);
  assert.equal(cmdq_peek(CQ_CANNED,game),null);
  assert.equal(game.moves,moves);
  assert.equal(game.clicklook_cc??null,null);
 });
