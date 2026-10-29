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
  const evidence=read('evidence.json');
  renderWorkflow(document,evidence,view,workflowSummary,null);
  assert(root.text().includes(String(evidence.cohorts[0].summary.total)));
  assert(root.text().includes(String(evidence.cohorts[0].summary.counts.unreviewed)));
  assert.match(root.text(),/unknown \(incomplete root classification\)/);
  assert.match(root.text(),/receipt: unknown/);
  assert.match(root.text(),/not a population false-positive rate/);
  const select=root.find('select');select.value='1';select.handlers.change();
  assert(root.text().includes(String(evidence.cohorts[1].summary.total)));
  assert(root.text().includes(String(evidence.cohorts[1].summary.counts.unreviewed)));
  assert.match(root.text(),/Unresolved/);
});
test('absent projection remains unknown and source markup is never inserted as HTML',()=>{
  const root=new Element('section');const document={getElementById:()=>root,createElement:tag=>new Element(tag)};
  renderWorkflow(document,null,{},workflowSummary,null);
  assert.match(root.text(),/coverage unknown/);
  const source=readFileSync(new URL('./dashboard-workflow-view.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\.innerHTML\s*=/u);
});

test('failed refresh is prominently last-known and manual cases retain separate coverage',()=>{
  const root=new Element('section');const document={getElementById:()=>root,createElement:tag=>new Element(tag)};
  const view=createTrialMonitor({manifest:read('manifest.json'),register:read('repairs.json')}).summarize();
  const evidence=read('evidence.json');evidence.cohorts[0].refresh={state:'last-known',attemptedAt:'2026-10-29T01:00:00Z',lastSuccessAt:null,error:'Source unavailable'};
  renderWorkflow(document,evidence,view,workflowSummary,null);
  assert.match(root.text(),/LAST-KNOWN review data/);assert.match(root.text(),/Source unavailable/);
  assert.match(root.text(),/manual\/differently bound cases/);
});
