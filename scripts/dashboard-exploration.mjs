// Self-contained renderer embedded with the tested aggregation and shared
// Duration / Ending at controller. Discovery marks are events, never a rate.
export function renderExplorationYield({payload, aggregate, createRange, document, window, getStyle}) {
    const el = name => document.getElementById('yield' + name);
    if (!payload || !Array.isArray(payload.records)) {
        el('Summary').textContent = 'Exploration yield is unavailable for this snapshot.';
        el('Chart').hidden = true;
        return;
    }
    const HOUR=3600000, asOf=Date.parse(payload.asOf);
    const dates=payload.records.flatMap(r=>[r.claimedAt,r.closedAt]).map(Date.parse).filter(Number.isFinite);
    const first=Math.min(asOf-HOUR,...dates), last=Math.max(asOf,first+HOUR);
    const stamp=t=>new Date(t).toLocaleString(undefined,
        {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC',timeZoneName:'short'});
    const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const rate=n=>n==null?'unavailable':n.toFixed(2);
    const plural=(n,word)=>word+(n===1?'':'s');
    // Match aggregation's global task/session deduplication, including records
    // outside the selected window. Carried or repeated cases get one dot.
    const seenTasks=new Set(),seenSessions=new Set(),events=[];
    for(const r of payload.records.filter(r=>r.kind==='discovery'&&r.claimedAt&&r.closedAt)
        .sort((a,b)=>Date.parse(a.closedAt)-Date.parse(b.closedAt))) {
        const at=Date.parse(r.closedAt);
        if(seenTasks.has(r.id)||!Number.isFinite(at)||at>asOf)continue;
        seenTasks.add(r.id);
        for(const id of new Set(r.qualifyingSessionIds||[])) {
            if(seenSessions.has(id))continue;
            seenSessions.add(id);events.push({at,id,task:r.id});
        }
    }
    let selected=null,selectedEvent=null,buckets=[],geometry,eventPoints=[];
    const range=createRange({start:first,end:last,asOf,minimum:Math.min(HOUR,last-first),duration:24*HOUR,
        presetUnit:HOUR,presets:['6','24','168'],prefix:'yield',document,onChange:()=>{selected=null;selectedEvent=null;render();}});
    const canvas=el('Chart');
    function inspect(index) {
        const b=buckets[index];if(!b)return;
        const discoveries=b.qualifyingSessions+' qualified '+(b.qualifyingSessions===1?'discovery':'discoveries');
        const exposure=b.closedTasks?discoveries+' among '+b.closedTasks+' '+plural(b.closedTasks,'closed task')+'. '
            :'No closed tasks; discovery rate unavailable. ';
        const event=selectedEvent?'Task closed '+stamp(selectedEvent.at)+' · '
            +selectedEvent.id.replace(/^v\d+-/u,'').replace(/-/g,' ')
            +' (retrospectively qualified). ':'';
        const partial=b.start<geometry.start||b.end-b.start<geometry.bucketMs?' (partial interval)':'';
        el('Readout').textContent=stamp(Math.max(b.start,geometry.start))+' – '+stamp(b.end)+partial+': '+exposure
            +b.claimedTasks+' tasks claimed · usable C evidence '+b.usableYes+' yes / '+b.usableNo+' no / '+b.usableUnknown+' unknown.'
            +(event?' '+event:'');
    }
    function render() {
        const bounds=range.bounds(),bucketMs=bounds.end-bounds.start>48*HOUR?24*HOUR:HOUR;
        const result=aggregate(payload,{bucketMs,start:bounds.start,end:bounds.end});
        buckets=result.buckets.filter(b=>b.end>b.start||b.closedTasks||b.claimedTasks);
        const t=result.totals,unit=bucketMs===HOUR?'hourly':'daily';
        el('BucketLabel').textContent='Discovery timeline';
        el('Summary').innerHTML='<strong>'+t.qualifyingSessions+'</strong> qualified '+plural(t.qualifyingSessions,'session')
            +' <span class="yield-cause-count">· '+t.distinctFamilies+' distinct supported first '+plural(t.distinctFamilies,'cause')+'</span>'
            +'<span class="yield-secondary">'+t.closedTasks+' closed tasks · '+t.usableYes+' with usable C evidence · '
            +t.usableUnknown+' unknown</span>';
        el('Freshness').textContent='Snapshot '+stamp(asOf)+' · updates on publication.';
        const since=aggregate(payload,{bucketMs:HOUR,start:first,end:last}).totals;
        el('Context').textContent='Since v90: '+since.qualifyingSessions+' qualified sessions / '+since.closedTasks
            +' closed discovery tasks. The 7 recovered v90 sessions are separate. Physical C-attempt counts are unavailable. '
            +'Tasks may contain multiple scouts; calendar time is not active compute. In this window: '+rate(t.taskYield)
            +' qualified sessions per 100 closed tasks (secondary task-level rate, not an event count).';
        el('Coverage').textContent=(result.coverage?.notes||[]).join(' ')
            +(result.coverage?.auditAsOf?' Classifications audited '+stamp(Date.parse(result.coverage.auditAsOf))+'.':'');
        const labels={'match':'Comparison matches','bounded-miss':'Bounded misses','duplicate':'Known duplicates',
            'setup-miss':'Setup misses','recorder-failure':'Recorder failures','source-prerequisite-stop':'Source or prerequisite stops',
            'procedural-excluded':'Procedural exclusions','retention-incomplete':'Incomplete retention',
            'unattributed-failure':'Unattributed failures','qualified-mismatch':'Qualified discoveries','unknown':'Unclassified'};
        el('Dispositions').innerHTML=Object.entries(t.classifications||{}).filter(([,n])=>n)
            .map(([k,n])=>'<li>'+esc(labels[k]||k)+': <strong>'+n+'</strong></li>').join('');
        el('Markers').innerHTML=(result.markers||[]).map(m=>'<li><strong>'+esc(stamp(m.at))+'</strong> '+esc(m.label)+'</li>').join('');
        el('MarkerNote').textContent='Operational milestones only; no measured strategy shift or causal comparison.';
        const width=Math.max(280,canvas.getBoundingClientRect().width||canvas.parentElement.getBoundingClientRect().width);
        const left=34,right=width-12,x=t=>left+(t-bounds.start)/(bounds.end-bounds.start)*(right-left);
        const visible=events.filter(e=>e.at>=bounds.start&&e.at<=bounds.end),laneEnds=[];
        eventPoints=visible.map(e=>{
            const px=x(e.at);let lane=laneEnds.findIndex(end=>px-end>=18);
            if(lane<0)lane=laneEnds.length;laneEnds[lane]=px;
            return {...e,x:px,lane};
        });
        const eventBase=54+Math.max(1,laneEnds.length)*20,volumeTop=eventBase+40,volumeBottom=volumeTop+68;
        const axisY=volumeBottom+23,height=axisY+12,dpr=window.devicePixelRatio||1;
        canvas.width=width*dpr;canvas.height=height*dpr;canvas.style.height=height+'px';
        const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,width,height);
        const style=getStyle(document.documentElement),color=n=>style.getPropertyValue(n).trim();
        const ink=color('--progress-fill'),muted=color('--ink-muted'),grid=color('--gridline');
        ctx.font='12px monospace';ctx.fillStyle=muted;
        ctx.fillText('Qualified sessions · task closure',left,17);
        ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(left,eventBase);ctx.lineTo(right,eventBase);ctx.stroke();
        for(const e of eventPoints) {
            e.y=eventBase-18-e.lane*20;
            ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(e.x,e.y+5);ctx.lineTo(e.x,eventBase);ctx.stroke();
            ctx.fillStyle=ink;ctx.beginPath();ctx.arc(e.x,e.y,6,0,Math.PI*2);ctx.fill();
            if(selectedEvent?.id===e.id){ctx.strokeStyle=ink;ctx.beginPath();ctx.arc(e.x,e.y,9,0,Math.PI*2);ctx.stroke();}
        }
        if(!visible.length){ctx.fillStyle=muted;ctx.fillText('No qualified discoveries in this window',left,eventBase-20);}
        ctx.fillStyle=muted;ctx.fillText('Task volume · '+unit+' counts',left,volumeTop-15);
        const maxVolume=Math.max(1,...buckets.flatMap(b=>[b.closedTasks,b.claimedTasks]));
        ctx.fillText(String(maxVolume),0,volumeTop+4);ctx.fillText('0',0,volumeBottom+4);
        ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(left,volumeBottom);ctx.lineTo(right,volumeBottom);ctx.stroke();
        ctx.save();ctx.beginPath();ctx.rect(left,volumeTop-1,right-left,volumeBottom-volumeTop+2);ctx.clip();
        buckets.forEach((b,i)=>{
            const center=x((Math.max(b.start,bounds.start)+Math.min(b.end,bounds.end))/2);
            const bw=Math.max(1,Math.min(18,(x(b.end)-x(b.start))*.34));
            const closedHeight=b.closedTasks/maxVolume*(volumeBottom-volumeTop),claimedHeight=b.claimedTasks/maxVolume*(volumeBottom-volumeTop);
            ctx.strokeStyle=muted;ctx.lineWidth=1;
            if(b.claimedTasks)ctx.strokeRect(center-bw,volumeBottom-claimedHeight,Math.max(1,bw-2),claimedHeight);
            ctx.fillStyle=ink;if(b.closedTasks)ctx.fillRect(center+1,volumeBottom-closedHeight,Math.max(1,bw-2),closedHeight);
            else {ctx.fillStyle=muted;ctx.fillRect(center+1,volumeBottom-1,Math.max(2,bw-2),1);}
            if(i===selected){ctx.strokeStyle=ink;ctx.strokeRect(center-bw-2,volumeTop,right-left>10?bw*2+4:1,volumeBottom-volumeTop);}
        });ctx.restore();
        // Aligned hour/day ticks, not arbitrary minute values at range edges.
        const span=bounds.end-bounds.start,maxTicks=width<600?3:6;
        const choices=bucketMs===HOUR?[HOUR,2*HOUR,3*HOUR,6*HOUR,12*HOUR,24*HOUR]:[24*HOUR,2*24*HOUR,7*24*HOUR,14*24*HOUR,30*24*HOUR];
        const step=choices.find(v=>span/v<=maxTicks)||choices.at(-1);let previousEnd=-Infinity;
        for(let time=Math.ceil(bounds.start/step)*step;time<=bounds.end;time+=step){
            const label=bucketMs===HOUR&&new Date(time).getUTCHours()!==0
                ?new Date(time).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'UTC'})
                :new Date(time).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
            const w=ctx.measureText(label).width,tx=Math.max(left,Math.min(right-w,x(time)-w/2));
            if(tx<previousEnd+12)continue;ctx.fillStyle=muted;ctx.fillText(label,tx,axisY);previousEnd=tx+w;
        }
        geometry={left,right,start:bounds.start,end:bounds.end,eventBase,bucketMs};
        if(selected!=null)inspect(selected);
        else el('Readout').textContent='Times UTC. Select a dot or task interval; arrow keys inspect all intervals. No closed tasks means no denominator, not zero yield.';
    }
    canvas.addEventListener('click',event=>{
        if(!geometry||!buckets.length)return;
        const rect=canvas.getBoundingClientRect(),px=event.clientX-rect.left,py=event.clientY-(rect.top||0);
        selectedEvent=eventPoints.reduce((best,e)=>!best||Math.hypot(e.x-px,e.y-py)<Math.hypot(best.x-px,best.y-py)?e:best,null);
        if(selectedEvent&&Math.hypot(selectedEvent.x-px,selectedEvent.y-py)>22)selectedEvent=null;
        const time=selectedEvent?.at??(geometry.start+(px-geometry.left)/(geometry.right-geometry.left)*(geometry.end-geometry.start));
        selected=buckets.findIndex((b,i)=>time>=b.start
            &&(time<b.end||(i===buckets.length-1&&time===b.end)));
        if(selected<0)selected=time<geometry.start?0:buckets.length-1;
        render();
    });
    canvas.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;
        event.preventDefault();selectedEvent=null;
        if(event.key==='Escape')selected=null;
        else if(event.key==='Home')selected=0;
        else if(event.key==='End')selected=buckets.length-1;
        else selected=Math.max(0,Math.min(buckets.length-1,(selected??0)+(event.key==='ArrowLeft'?-1:1)));
        render();
    });
    window.addEventListener('resize',render);
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change',render);
    render();
}
