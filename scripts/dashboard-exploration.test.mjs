import assert from 'node:assert/strict';
import test from 'node:test';
import {renderExplorationYield} from './dashboard-exploration.mjs';
import {createChartTimeRange} from './dashboard-time-range.mjs';

function harness(payload,width=800,fixture={}) {
    const elements=new Map(),drawn=[];
    const element=id=>{
        if(!elements.has(id))elements.set(id,{id,textContent:'',innerHTML:'',style:{},hidden:false,
            listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},
            getBoundingClientRect:()=>({width,left:0}),
            parentElement:{getBoundingClientRect:()=>({width})},
            getContext:()=>new Proxy({measureText:s=>({width:s.length*6})},{
                get:(o,k)=>o[k]??((...args)=>drawn.push([k,...args])),set:(o,k,v)=>(o[k]=v,true),
            })});
        return elements.get(id);
    };
    const document={getElementById:element,documentElement:{}};
    const window={devicePixelRatio:1,addEventListener(){},matchMedia:()=>({addEventListener(){}})};
    const bucket=(hour,closedTasks,qualified)=>({start:Date.parse('2026-10-16T12:00Z')+hour*3600000,
        end:Date.parse('2026-10-16T13:00Z')+hour*3600000,claimedTasks:closedTasks+1,closedTasks,
        usableYes:closedTasks-1,usableNo:0,usableUnknown:1,qualifyingSessions:qualified,
        distinctFamilies:qualified,taskYield:qualified/closedTasks*100});
    const buckets=fixture.buckets??[bucket(0,4,1),bucket(1,8,0)];
    const calls=[];
    const aggregate=(_p,options)=>{calls.push(options);return {buckets,
        totals:{claimedTasks:14,closedTasks:12,usableYes:10,usableNo:0,usableUnknown:2,
            qualifyingSessions:1,distinctFamilies:1,taskYield:100/12,classifications:{duplicate:3,'setup-miss':2,unknown:2}},
        markers:[{at:Date.parse('2026-10-16T13:00Z'),label:'Documented <change>'}],
        coverage:{notes:['Earlier probe denominators unavailable.']}};};
    renderExplorationYield({payload,aggregate,createRange:createChartTimeRange,document,window,
        getStyle:()=>({getPropertyValue:()=> '#123456'})});
    return {element,drawn,calls};
}

const payload={asOf:'2026-10-16T14:00:00Z',records:[{id:'one',kind:'discovery',claimedAt:'2026-10-16T12:00:00Z',closedAt:'2026-10-16T12:30:00Z',qualifyingSessionIds:['v91-example']},{id:'two',kind:'discovery',claimedAt:'2026-10-16T13:00:00Z',closedAt:'2026-10-16T13:30:00Z'}]};

test('missing historical yield is unavailable rather than a zero discovery rate',()=>{
    const h=harness(null);
    assert.match(h.element('yieldSummary').textContent,/unavailable/);
    assert.equal(h.element('yieldChart').hidden,true);
    assert.equal(h.calls.length,0);
});

test('primary chart exposes sample volume, evidence gaps, markers and task-rate units',()=>{
    const h=harness(payload);
    assert.match(h.element('yieldSummary').innerHTML,/1<\/strong> qualified session/);
    assert.match(h.element('yieldSummary').innerHTML,/12 closed tasks/);
    assert.match(h.element('yieldSummary').innerHTML,/2 unknown/);
    assert.match(h.element('yieldFreshness').textContent,/updates on publication/);
    assert.match(h.element('yieldMarkers').innerHTML,/&lt;change&gt;/);
    assert.match(h.element('yieldDispositions').innerHTML,/Known duplicates: <strong>3/);
    assert.match(h.element('yieldDispositions').innerHTML,/Setup misses: <strong>2/);
    assert.match(h.element('yieldContext').textContent,/7 recovered v90 sessions/);
    assert.ok(h.drawn.some(op=>op[0]==='fillText'&&op[1]==='Qualified sessions · task closure'));
    assert.equal(h.drawn.filter(op=>op[0]==='arc').length,1,'only the positive session event gets a dot; zero intervals do not');
    assert.ok(h.drawn.some(op=>op[0]==='strokeRect'),'claims have outline bars distinct from closed tasks');
    assert.ok(h.drawn.some(op=>op[0]==='fillRect'));
    assert.equal(h.calls[0].bucketMs,3600000);
    assert.ok(Number.isFinite(h.calls[0].start));
});

test('keyboard sample inspection and shared duration controller remain usable',()=>{
    const h=harness(payload),chart=h.element('yieldChart');
    const key=key=>chart.listeners.keydown({key,preventDefault(){}});
    key('Home');assert.match(h.element('yieldReadout').textContent,/among 4 closed tasks/);
    key('End');assert.match(h.element('yieldReadout').textContent,/0 qualified discoveries among 8 closed tasks/);
    key('Escape');assert.match(h.element('yieldReadout').textContent,/No closed tasks means no denominator/);
    h.element('yieldWindow').value='all';h.element('yieldWindow').listeners.change();
    assert.match(h.element('yieldRangeSummary').textContent,/All/);
    assert.ok(h.calls.length>=5);
});

test('long history uses daily samples and labels both charts consistently',()=>{
    const h=harness({...payload,records:[{claimedAt:'2026-10-09T12:00:00Z',closedAt:'2026-10-16T13:00:00Z'}]});
    h.element('yieldWindow').value='all';h.element('yieldWindow').listeners.change();
    assert.equal(h.calls.at(-1).bucketMs,3600000); // The final call computes since-v90 context.
    assert.ok(h.calls.some(c=>c.bucketMs===86400000));
    assert.equal(h.element('yieldBucketLabel').textContent,'Discovery timeline');
    assert.ok(h.drawn.some(op=>op[0]==='fillText'&&op[1]==='Task volume · daily counts'));
});

test('mobile time labels are sparse and do not overlap at the plot edges',()=>{
    const h=harness(payload,342);
    const ticks=h.drawn.filter(op=>op[0]==='fillText'&&/^\d\d:00$/.test(op[1])).sort((a,b)=>a[2]-b[2]);
    assert.ok(ticks.length>=2&&ticks.length<=4);
    assert.ok(ticks.every(op=>op[1].endsWith(':00')),'ticks are aligned hours, not fractional range edges');
    for(let i=1;i<ticks.length;i++)assert.ok(ticks[i][2]>=ticks[i-1][2]+ticks[i-1][1].length*6);
    assert.match(h.element('yieldSummary').innerHTML,/supported first cause/);
});


test('exact session marks deduplicate carried records and ignore future closures',()=>{
    const record=payload.records[0];
    const h=harness({...payload,records:[record,{...record,id:'carry'},
        {...record,id:'future',closedAt:'2026-10-17T12:30:00Z',qualifyingSessionIds:['later']},
        {...record,id:'support',kind:'linked-validation',qualifyingSessionIds:['not-discovery']} ]});
    assert.equal(h.drawn.filter(op=>op[0]==='arc').length,1);
    const dot=h.drawn.find(op=>op[0]==='arc');
    h.element('yieldChart').listeners.click({clientX:dot[1],clientY:dot[2]});
    assert.match(h.element('yieldReadout').textContent,/Task closed/);
    assert.match(h.element('yieldReadout').textContent,/retrospectively qualified/);
    assert.match(h.element('yieldReadout').textContent,/example/);
});

test('empty discovery windows and no-closure intervals do not assert a zero rate',()=>{
    const start=Date.parse('2026-10-16T12:00:00Z');
    const h=harness({...payload,records:payload.records.map(r=>({...r,qualifyingSessionIds:[]}))},342,
        {buckets:[{start,end:start+3600000,closedTasks:0,claimedTasks:2,usableYes:0,usableNo:0,usableUnknown:0,qualifyingSessions:0,distinctFamilies:0,taskYield:null}]});
    assert.equal(h.drawn.filter(op=>op[0]==='arc').length,0);
    assert.ok(h.drawn.some(op=>op[0]==='fillText'&&op[1]==='No qualified discoveries in this window'));
    h.element('yieldChart').listeners.keydown({key:'Home',preventDefault(){}});
    assert.match(h.element('yieldReadout').textContent,/No closed tasks; discovery rate unavailable/);
});
