import assert from 'node:assert/strict';
import test from 'node:test';
import {createChartTimeRange} from './dashboard-time-range.mjs';

const HOUR = 3600000, DAY = 24 * HOUR;
const make = overrides => createChartTimeRange({start: 0,end: 30*DAY,minimum: HOUR,duration: 7*DAY,
    presetUnit:DAY,presets:['1','7','30'],...overrides});

test('duration and endpoint are independent; Now is an explicit attachment', () => {
    const range = make();
    range.pan(10*DAY,17*DAY);
    assert.deepEqual(range.selection(),{duration:7*DAY,kind:'preset',ending:'fixed'});
    range.setDuration(DAY);
    assert.deepEqual(range.bounds(),{start:16*DAY,end:17*DAY});
    range.setEnd(30*DAY);
    assert.equal(range.selection().ending,'fixed','touching latest does not silently follow it');
    range.setEnd('now');
    assert.deepEqual(range.bounds(),{start:29*DAY,end:30*DAY});
    assert.equal(range.selection().ending,'now');
});

test('All ends at the selected time and fixed endpoints reflect available-data clamps', () => {
    const range = make();range.setEnd(10*DAY);range.setDuration('all');
    assert.deepEqual(range.bounds(),{start:0,end:10*DAY});
    range.setEnd(100*DAY);assert.deepEqual(range.bounds(),{start:0,end:30*DAY});
    range.setEnd(-DAY);assert.deepEqual(range.bounds(),{start:0,end:HOUR});
    range.setDuration(7*DAY);
    assert.deepEqual(range.bounds(),{start:0,end:HOUR});
    assert.equal(range.selection().duration,7*DAY,'requested preset remains identifiable when clamped');
});

test('panning translates a preset window at domain edges without shrinking its duration', () => {
    const range=make();range.pan(-2*DAY,5*DAY);
    assert.deepEqual(range.bounds(),{start:0,end:7*DAY});
    assert.deepEqual(range.selection(),{duration:7*DAY,kind:'preset',ending:'fixed'});
    range.pan(28*DAY,35*DAY);
    assert.deepEqual(range.bounds(),{start:23*DAY,end:30*DAY});
    assert.equal(range.selection().ending,'fixed');
});

test('zoom/resize becomes Custom and chart state never crosses between instances or reloads', () => {
    const progress=make(),activity=make({duration:6*HOUR,presetUnit:HOUR,presets:['6','24','168']});
    progress.resize(10*DAY,12*DAY);
    assert.deepEqual(progress.selection(),{duration:2*DAY,kind:'custom',ending:'fixed'});
    assert.deepEqual(activity.bounds(),{start:30*DAY-6*HOUR,end:30*DAY});
    activity.setEnd(8*DAY);activity.setDuration(24*HOUR);
    assert.deepEqual(progress.bounds(),{start:10*DAY,end:12*DAY});
    assert.deepEqual(make({duration:6*HOUR}).selection(),{duration:6*HOUR,kind:'preset',ending:'now'});
});

test('invalid values do not change the applied range', () => {
    const range=make(),before=range.bounds();
    for(const value of [0,-1,NaN,Infinity])assert.throws(()=>range.setDuration(value),/positive/u);
    assert.throws(()=>range.setEnd(NaN),/valid fixed/u);
    assert.throws(()=>range.resize(10,5),/valid time/u);
    assert.deepEqual(range.bounds(),before);
});

test('keyboard submission retains focus nodes and invalid custom input keeps the previous range', () => {
    const nodes=new Map();
    const doc={getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,listeners:{},
        addEventListener(type,handler){this.listeners[type]=handler;}});return nodes.get(id);}};
    let changes=0;
    const range=make({document:doc,prefix:'test',onChange:()=>changes++});
    const el=name=>nodes.get('test'+name);
    const change=(name,value)=>{el(name).value=value;el(name).listeners.change();};
    const submit=()=>el('RangeForm').listeners.submit({preventDefault(){}});
    const originalNode=el('EndingAt');
    change('Ending','fixed');el('EndingAt').value='1970-01-11T00:00:00';
    change('Window','1');submit();
    const fixed=new Date('1970-01-11T00:00:00').getTime();
    assert.deepEqual(range.bounds(),{start:fixed-DAY,end:fixed});
    assert.equal(el('Window').value,'1');assert.equal(el('Ending').value,'fixed');
    change('Window','custom');el('DurationCustom').value='0';const before=range.bounds();submit();
    assert.match(el('RangeError').textContent,/positive/u);assert.deepEqual(range.bounds(),before);
    el('DurationCustom').value='90';el('DurationUnit').value='60000';submit();
    assert.deepEqual(range.bounds(),{start:fixed-90*60000,end:fixed});
    assert.equal(el('EndingAt'),originalNode,'rendering does not replace focused inputs');
    change('Ending','now');assert.equal(range.bounds().end,30*DAY);
    assert.ok(changes>=3);assert.match(el('RangeAsOf').textContent,/Latest available/u);
});

test('Custom preserves a clamped preset instead of exposing fractional coverage hours', () => {
    const nodes=new Map();
    const doc={getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,listeners:{},
        addEventListener(type,handler){this.listeners[type]=handler;}});return nodes.get(id);}};
    const range=make({document:doc,prefix:'short',end:14.19323194444445*HOUR,duration:DAY});
    const el=name=>nodes.get('short'+name);
    const before=range.bounds();
    assert.equal(el('RangeTimezone').hidden,true);
    el('Window').value='custom';el('Window').listeners.change();
    assert.equal(el('DurationCustom').value,'24');
    assert.deepEqual(range.bounds(),before,'editing a draft does not alter the applied range');
    el('Ending').value='fixed';el('Ending').listeners.change();
    assert.equal(el('RangeTimezone').hidden,false);
    el('Ending').value='now';el('Ending').listeners.change();
    assert.equal(el('RangeTimezone').hidden,true);
});

function interactiveRange() {
    const nodes=new Map(),listeners={};let changes=0,focused;
    const doc={activeElement:null,addEventListener(type,fn){listeners[type]=fn;},
        getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,listeners:{},attrs:{},
            addEventListener(type,fn){this.listeners[type]=fn;},
            setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},
            focus(){focused=this;},contains(target){return [...nodes.values()].includes(target);}});return nodes.get(id);}};
    const range=make({document:doc,prefix:'live',onChange:()=>changes++});
    const el=name=>nodes.get('live'+name);
    el('RangePicker').open=true;
    return {range,el,doc,listeners,changes:()=>changes,focused:()=>focused,
        change(name,value){el(name).value=value;el(name).listeners.change();},
        type(name,value){el(name).value=value;el(name).listeners.input();},
        key(key,target){el('RangePicker').listeners.keydown({key,target:el(target),preventDefault(){}});}};
}

test('presets apply immediately; partial custom input does not redraw or discard other drafts',()=>{
    const h=interactiveRange();
    h.change('Window','1');assert.equal(h.range.selection().duration,DAY);
    assert.equal(h.changes(),1);assert.equal(h.el('RangePicker').open,true);
    h.change('Window','custom');const before=h.range.bounds();
    h.type('DurationCustom','');assert.deepEqual(h.range.bounds(),before);assert.equal(h.changes(),1);
    h.el('DurationCustom').listeners.change();
    assert.equal(h.el('DurationCustom').attrs['aria-invalid'],'true');
    assert.deepEqual(h.range.bounds(),before);
    h.type('DurationCustom','90');h.el('DurationUnit').value='60000';
    h.el('DurationCustom').listeners.change();
    assert.equal(h.range.selection().duration,90*60000);assert.equal(h.changes(),2);
    assert.equal(h.el('RangePicker').open,true);assert.equal(h.el('DurationCustom').attrs['aria-invalid'],undefined);
    h.change('Ending','fixed');h.type('EndingAt','');
    h.change('Window','7');
    assert.equal(h.range.selection().duration,7*DAY);
    assert.equal(h.el('EndingAt').value,'','valid duration selection preserves incomplete date entry');
});

test('Enter commits a valid box and closes; Escape cancels unfinished text',()=>{
    const h=interactiveRange();h.change('Window','custom');
    h.type('DurationCustom','2');h.el('DurationUnit').value=String(HOUR);
    h.key('Enter','DurationCustom');
    assert.equal(h.range.selection().duration,2*HOUR);assert.equal(h.el('RangePicker').open,false);
    assert.equal(h.focused(),h.el('RangeSummary'));
    h.el('RangePicker').open=true;h.type('DurationCustom','');const before=h.range.bounds();
    h.key('Enter','DurationCustom');assert.equal(h.el('RangePicker').open,true);
    assert.match(h.el('RangeError').textContent,/positive/);assert.deepEqual(h.range.bounds(),before);
    h.key('Escape','DurationCustom');assert.equal(h.el('RangePicker').open,false);
    assert.deepEqual(h.range.bounds(),before);
});

test('Fixed date changes commit only when valid; outside blur commits valid custom input',()=>{
    const h=interactiveRange();h.change('Ending','fixed');const before=h.range.bounds(),count=h.changes();
    h.type('EndingAt','');h.el('EndingAt').listeners.change();
    assert.deepEqual(h.range.bounds(),before);assert.equal(h.changes(),count);
    assert.equal(h.el('EndingAt').attrs['aria-invalid'],'true');
    h.type('EndingAt','1970-01-15T12:00:00');h.el('EndingAt').listeners.change();
    assert.equal(h.range.bounds().end,new Date('1970-01-15T12:00:00').getTime());
    h.change('Window','custom');h.type('DurationCustom','3');h.el('DurationUnit').value=String(HOUR);
    h.doc.activeElement=h.el('DurationCustom');h.listeners.pointerdown({target:{}});
    assert.equal(h.range.selection().duration,3*HOUR);assert.equal(h.el('RangePicker').open,false);
});

test('opening a mobile picker clamps to layout viewport despite overflow-expanded innerWidth',()=>{
    const nodes=new Map(),view={innerWidth:521,innerHeight:1100,addEventListener(){}};
    const doc={defaultView:view,documentElement:{clientWidth:390,clientHeight:844},addEventListener(){},
        getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,open:false,style:{},listeners:{},
            addEventListener(type,fn){this.listeners[type]=fn;}});return nodes.get(id);}};
    make({document:doc,prefix:'mobile'});
    const picker=nodes.get('mobileRangePicker'),form=nodes.get('mobileRangeForm');
    picker.getBoundingClientRect=()=>({left:163,top:700,bottom:742});
    form.getBoundingClientRect=()=>({width:358,height:300});
    picker.open=true;picker.listeners.toggle();
    assert.equal(form.style.left,'-147px','panel starts at 16, within the actual 390px viewport');
    assert.equal(form.style.top,'-172px','panel bottom remains inside the layout viewport');
});
