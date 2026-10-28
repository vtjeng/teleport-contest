import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {renderWorkflow} from './dashboard-workflow-view.mjs';
import {workflowSummary} from './dashboard-workflow.mjs';
import {createTrialMonitor} from './trial-monitor.mjs';
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.value='';this.handlers={};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(){}
  addEventListener(name,callback){this.handlers[name]=callback;}
  text(){return this.textContent+this.children.map(c=>typeof c==='string'?c:c.text()).join(' ');}
  find(tag){if(this.tag===tag)return this;return this.children.filter(c=>typeof c!=='string').map(c=>c.find(tag)).find(Boolean);}
}
const read=path=>JSON.parse(readFileSync(new URL('../trial-monitor/'+path,import.meta.url)));
test('renderer displays pinned inventories, separate receipts and conservative cause rates',()=>{
  const root=new Element('section');const document={getElementById:()=>root,createElement:tag=>new Element(tag)};
  const view=createTrialMonitor({manifest:read('manifest.json'),register:read('repairs.json')}).summarize();
  renderWorkflow(document,read('evidence.json'),view,workflowSummary,null);
  assert.match(root.text(),/523/);assert.match(root.text(),/485/);
  assert.match(root.text(),/unknown \(incomplete root classification\)/);
  assert.match(root.text(),/receipt: unknown/);
  assert.match(root.text(),/not a population false-positive rate/);
  const select=root.find('select');select.value='1';select.handlers.change();
  assert.match(root.text(),/689/);assert.match(root.text(),/686/);assert.match(root.text(),/Unresolved 1/);
});
test('absent projection remains unknown and source markup is never inserted as HTML',()=>{
  const root=new Element('section');const document={getElementById:()=>root,createElement:tag=>new Element(tag)};
  renderWorkflow(document,null,{},workflowSummary,null);
  assert.match(root.text(),/coverage unknown/);
  const source=readFileSync(new URL('./dashboard-workflow-view.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\.innerHTML\s*=/u);
});
