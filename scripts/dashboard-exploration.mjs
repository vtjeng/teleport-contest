// Self-contained renderer embedded in the static dashboard alongside its tested
// aggregation and existing Duration / Ending at controller.
export function renderExplorationYield({payload, aggregate, createRange, document, window, getStyle}) {
    const el = name => document.getElementById('yield' + name);
    if (!payload || !Array.isArray(payload.records)) {
        el('Summary').textContent = 'Exploration yield is unavailable for this snapshot.';
        el('Chart').hidden = true;
        return;
    }
    const HOUR = 3600000, asOf = Date.parse(payload.asOf);
    const dates = payload.records.flatMap(r => [r.claimedAt, r.closedAt]).map(Date.parse).filter(Number.isFinite);
    const first = Math.min(asOf - HOUR, ...dates), last = Math.max(asOf, first + HOUR);
    const stamp = t => new Date(t).toLocaleString(undefined,
        {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', timeZoneName:'short'});
    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const rate = n => n == null ? '—' : n.toFixed(1);
    const range = createRange({start:first,end:last,asOf,minimum:Math.min(HOUR,last-first),duration:24*HOUR,
        presetUnit:HOUR,presets:['6','24','168'],prefix:'yield',document,onChange:() => {selected=null;render();}});
    let selected = null, buckets = [], geometry;
    const canvas = el('Chart');
    function inspect(index) {
        const b = buckets[index];
        if (!b) return;
        const families = b.distinctFamilies ? ' · ' + b.distinctFamilies + ' supported bug families' : '';
        el('Readout').textContent = stamp(b.start) + ' – ' + stamp(b.end) + ': '
            + b.claimedTasks + ' claimed, ' + b.closedTasks + ' closed discovery tasks · '
            + b.usableYes + ' with usable C evidence, ' + b.usableNo + ' without, '
            + b.usableUnknown + ' unknown · ' + b.qualifyingSessions + ' qualified mismatching sessions'
            + families + ' · ' + rate(b.taskYield) + ' qualified sessions / 100 closed tasks.';
    }
    function render() {
        const bounds = range.bounds();
        const bucketMs=bounds.end-bounds.start>48*HOUR?24*HOUR:HOUR;
        const result = aggregate(payload,{bucketMs,start:bounds.start,end:bounds.end});
        buckets = result.buckets;
        const t = result.totals;
        el('Summary').innerHTML = '<strong>' + t.qualifyingSessions + '</strong> new qualified mismatching sessions'
            + ' · <strong>' + t.distinctFamilies + '</strong> supported distinct bug families'
            + '<span class="yield-secondary">' + t.closedTasks + ' closed discovery tasks → '
            + t.usableYes + ' tasks with usable C evidence → ' + t.qualifyingSessions + ' qualified sessions</span>'
            + '<span class="yield-secondary">' + t.claimedTasks + ' new task claims in this window · '
            + t.usableUnknown + ' usable-evidence classifications unknown · '
            + rate(t.taskYield) + ' qualified sessions / 100 closed tasks</span>';
        el('Freshness').textContent = 'Activity snapshot ' + stamp(asOf)
            + (result.coverage?.auditAsOf ? ' · classifications audited ' + stamp(Date.parse(result.coverage.auditAsOf)) : '')
            + ' · updates on publication; no live ledger feed.';
        const since=aggregate(payload,{bucketMs:HOUR,start:first,end:last}).totals;
        el('Context').textContent = 'Since v90, in the available task ledger: ' + since.qualifyingSessions
            + ' qualified sessions from ' + since.closedTasks + ' closed discovery tasks. '
            + 'v90’s 7 recovered sessions are not new discoveries. '
            + 'Earlier physical C-attempt denominators are unavailable. Tasks can contain multiple scouts; '
            + 'elapsed time is a calendar window, not active compute time.';
        const notes = result.coverage?.notes || [];
        el('Coverage').textContent = notes.join(' ');
        const labels={'match':'Comparison matches','bounded-miss':'Bounded misses','duplicate':'Known duplicates',
            'setup-miss':'Setup misses','recorder-failure':'Recorder failures','source-prerequisite-stop':'Source or prerequisite stops',
            'procedural-excluded':'Procedural exclusions','retention-incomplete':'Incomplete retention',
            'unattributed-failure':'Unattributed failures','qualified-mismatch':'Qualified discoveries','unknown':'Unclassified'};
        el('Dispositions').innerHTML = Object.entries(t.classifications || {}).filter(([,n])=>n)
            .map(([key,n])=>'<li>'+esc(labels[key] || key)+': <strong>'+n+'</strong></li>').join('');
        const markers = result.markers || [];
        el('Markers').innerHTML = markers.map((m,i) => '<li><strong>' + (i+1) + '. '
            + esc(stamp(m.at)) + '</strong> ' + esc(m.label) + '</li>').join('');
        el('MarkerNote').textContent = markers.length
            ? 'Documented operational changes; no measured strategy shift. Before/after differences are descriptive, and small samples do not establish an effect.'
            : 'No documented operational change in this window and no measured strategy shift; differences do not establish a strategy effect.';
        const width = Math.max(280,canvas.getBoundingClientRect().width || canvas.parentElement.getBoundingClientRect().width);
        const height = 330, dpr = window.devicePixelRatio || 1;
        canvas.width = width*dpr; canvas.height = height*dpr; canvas.style.height = height+'px';
        const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,width,height);
        const style=getStyle(document.documentElement), color=n=>style.getPropertyValue(n).trim();
        const ink=color('--progress-fill'), muted=color('--ink-muted'), grid=color('--gridline');
        const left=52,right=width-18,top=38,bottom=190,volumeTop=230,volumeBottom=295;
        const x=t=>left+(t-bounds.start)/(bounds.end-bounds.start)*(right-left);
        const countMax=Math.max(1,...buckets.flatMap(b=>[b.qualifyingSessions,b.distinctFamilies]));
        const maxVolume=Math.max(1,...buckets.flatMap(b=>[b.closedTasks,b.claimedTasks]));
        const y=v=>bottom-v/countMax*(bottom-top);
        ctx.font='11px monospace';ctx.fillStyle=muted;
        ctx.fillText('New qualified discoveries · '+(bucketMs===HOUR?'hourly':'daily')+' counts',left,14);
        el('BucketLabel').textContent = bucketMs===HOUR?'Hourly discovery outcomes':'Daily discovery outcomes · UTC day boundaries';
        for(let i=0;i<=countMax;i++) {
            const value=i,py=y(value);
            ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(left,py);ctx.lineTo(right,py);ctx.stroke();
            ctx.fillStyle=muted;ctx.fillText(String(Math.round(value*10)/10),5,py+4);
        }
        ctx.fillText('Discovery task volume · '+(bucketMs===HOUR?'hourly':'daily')+' samples',left,218);
        ctx.fillText(String(maxVolume),5,volumeTop+5);ctx.fillText('0',5,volumeBottom+4);
        ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,volumeBottom-top);ctx.clip();
        for(const key of ['qualifyingSessions','distinctFamilies']) {
            ctx.strokeStyle=key==='qualifyingSessions'?ink:muted;ctx.lineWidth=2;
            ctx.setLineDash(key==='distinctFamilies'?[5,4]:[]);let connected=false;ctx.beginPath();
            for(const b of buckets) {
                if(!b.closedTasks){connected=false;continue;}
                const px=x((b.start+b.end)/2),py=y(b[key]);
                if(connected)ctx.lineTo(px,py);else ctx.moveTo(px,py);connected=true;
            }
            ctx.stroke();ctx.setLineDash([]);
        }
        buckets.forEach((b,i)=>{
            const center=x((b.start+b.end)/2),bw=Math.max(2,Math.min(22,(x(b.end)-x(b.start))*.35));
            if(b.closedTasks){ctx.fillStyle=ink;ctx.beginPath();ctx.arc(center,y(b.qualifyingSessions),3,0,Math.PI*2);ctx.fill();}
            for(const [key,offset,fill] of [['claimedTasks',-bw,muted],['closedTasks',0,ink]]) {
                const h=b[key]/maxVolume*(volumeBottom-volumeTop);ctx.fillStyle=fill;
                ctx.fillRect(center+offset,volumeBottom-h,bw-1,h);
            }
            if(i===selected){ctx.strokeStyle=muted;ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(center,top);ctx.lineTo(center,volumeBottom);ctx.stroke();ctx.setLineDash([]);}
        });
        markers.forEach((m,i)=>{
            ctx.strokeStyle=muted;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x(m.at),top);ctx.lineTo(x(m.at),volumeBottom);ctx.stroke();ctx.setLineDash([]);
            ctx.fillStyle=muted;ctx.fillText(String(i+1),x(m.at)+4,31);
        });ctx.restore();
        ctx.fillStyle=muted;
        for(let i=0;i<=4;i++){
            const time=bounds.start+(bounds.end-bounds.start)*i/4;
            const label=bucketMs===HOUR?new Date(time).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})
                :new Date(time).toLocaleDateString(undefined,{month:'short',day:'numeric'});
            const w=ctx.measureText(label).width;ctx.fillText(label,Math.max(left,Math.min(right-w,x(time)-w/2)),316);
        }
        geometry={left,right,width,start:bounds.start,end:bounds.end};
        if(selected!=null)inspect(selected);
        else el('Readout').textContent = 'Select '+(bucketMs===HOUR?'an hourly':'a daily')+' sample for counts. Gaps mean no closed-task denominator; '
            + 'zero points mean no qualified discovery among the recorded closed tasks. Task volume is context, not a success score.';
    }
    canvas.addEventListener('click',event=>{
        if(!geometry||!buckets.length)return;
        const time=geometry.start+(event.clientX-canvas.getBoundingClientRect().left-geometry.left)
            /(geometry.right-geometry.left)*(geometry.end-geometry.start);
        selected=buckets.reduce((best,b,i)=>Math.abs((b.start+b.end)/2-time)
            <Math.abs((buckets[best].start+buckets[best].end)/2-time)?i:best,0);render();
    });
    canvas.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;
        event.preventDefault();
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
