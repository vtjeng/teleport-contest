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

test('control drafts apply together, retain focus nodes, and invalid input keeps the previous range', () => {
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
