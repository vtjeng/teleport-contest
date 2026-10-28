import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runSegment} from '../../../../js/jsmain.js';
import {game} from '../../../../js/gstate.js';
import {SCR_BLANK_PAPER} from '../../../../js/objects.js';
const root=new URL('../../../../',import.meta.url);
test('C blank-scroll function is inlined with the same blindness predicate',()=>{
  const c=readFileSync(new URL('nethack-c/upstream/src/read.c',root),'utf8');
  const props=readFileSync(new URL('nethack-c/upstream/include/youprop.h',root),'utf8');
  const js=readFileSync(new URL('js/read.js',root),'utf8');
  assert.match(props,/#define Blind \(\(HBlinded \|\| EBlinded\) && !BBlinded\)/);
  assert.match(c,/seffect_blank_paper\(struct obj \*\*sobjp UNUSED\)\s*\{\s*if \(Blind\)\s*You\("don't remember there being any magic words on this scroll\."\);\s*else\s*pline\("This scroll seems to be blank\."\);\s*gk.known = TRUE;\s*\}/);
  assert.match(js,/return Boolean\(value\?\.intrinsic \|\| value\?\.extrinsic\) && !value\?\.blocked;/);
  assert.match(js,/case SCR_BLANK_PAPER:[\s\S]*?if \(propertyActive\(BLINDED, state\)\)[\s\S]*?state.gk.known = true;\s*break;/);
});
for(const [file,message] of [['capture-c.json','This scroll seems to be blank.'],['blind-c.json',"You don't remember there being any magic words on this scroll."]]) {
  test(`public-input ${file}`,async()=>{
    const s=JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8')).segments[0];
    let boundary=null;
    const g=await runSegment({seed:s.seed,datetime:s.datetime,nethackrc:s.nethackrc,moves:s.moves},{onBoundary:e=>boundary=e.message});
    assert.equal(boundary,null);
    assert.equal(g.getScreens().length,s.steps.length);
    assert.equal(g.getScreens().at(-1).split('\n')[0],message);
    assert.equal(s.steps.at(-1).screen.split('\n')[0],message);
    assert.equal(Boolean(game.objects[SCR_BLANK_PAPER].oc_name_known),true);
    let found=false;for(let o=game.invent;o;o=o.nobj) if(o.otyp===SCR_BLANK_PAPER) found=true;
    assert.equal(found,true,'blank scroll remains in inventory');
  });
}
