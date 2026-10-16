// Self-contained so the static dashboard can embed the same tested controller.
export function createChartTimeRange({start, end, asOf = end, minimum, duration, presetUnit, presets,
    prefix, document: doc, onChange = () => {}}) {
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const minSpan = Math.min(minimum, end - start);
    let requested = duration, kind = 'preset', ending = 'now', fixedEnd = end;
    let draft = false;
    const bounds = () => {
        const last = ending === 'now' ? end : clamp(fixedEnd, start + minSpan, end);
        return {start: requested === 'all' ? start : Math.max(start, last - Math.max(minSpan, requested)), end: last};
    };
    const validDuration = value => Number.isFinite(value) && value > 0;
    const selection = () => ({duration: requested, kind, ending});
    const localTime = time => {
        const date = new Date(time), pad = value => String(value).padStart(2, '0');
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
            + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
    };
    const elements = doc ? Object.fromEntries(['Window', 'DurationCustom', 'DurationUnit', 'Ending', 'EndingAt',
        'RangeForm', 'RangeError', 'RangeTimezone', 'RangeAsOf', 'RangePicker', 'RangeSummary']
        .map(name => [name, doc.getElementById(prefix + name)])) : null;
    function position() {
        const win=doc?.defaultView;
        if(!win||!elements.RangePicker.open)return;
        const box=elements.RangePicker.getBoundingClientRect();
        // Mobile innerWidth can expand to include an overflowing panel. Clamp
        // against the layout viewport so opening the panel cannot widen it.
        const width=doc.documentElement?.clientWidth||win.innerWidth;
        // In quirks mode clientHeight is the entire document. The visual
        // viewport also accounts for the mobile keyboard reducing usable space.
        const height=win.visualViewport?.height||win.innerHeight;
        const top=win.visualViewport?.offsetTop||0;
        elements.RangeForm.style.maxHeight=Math.max(0,height-32)+'px';
        const panel=elements.RangeForm.getBoundingClientRect();
        // Anchor to the same right edge as the toolbar's last control, then
        // clamp only when the viewport (including a mobile keyboard) needs it.
        elements.RangeForm.style.left=(clamp(box.right-panel.width,16,Math.max(16,width-panel.width-16))-box.left)+'px';
        elements.RangeForm.style.top=(clamp(box.bottom+6,top+16,Math.max(top+16,top+height-panel.height-16))-box.top)+'px';
    }
    function sync() {
        if (!elements) return;
        const b = bounds();
        const unit = requested !== 'all' ? [86400000,3600000,60000].find(value=>requested%value===0)??60000 : 60000;
        const amount = Math.round(requested/unit*100)/100;
        const unitName = unit===86400000?'day':unit===3600000?'hour':'minute';
        elements.RangeSummary.textContent = (requested==='all'?'All':amount+' '+unitName+(amount===1?'':'s'))
            +' · '+(ending==='now'?'Now':'Fixed');
        elements.RangeAsOf.textContent = 'Latest available: ' + new Date(asOf).toLocaleString(undefined,
            {year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short'});
        elements.RangeTimezone.textContent = 'Timezone: ' + Intl.DateTimeFormat().resolvedOptions().timeZone;
        elements.RangeTimezone.hidden = ending !== 'fixed';
        if (draft) {position();return;}
        elements.Window.value = requested === 'all' ? 'all' : kind === 'preset' ? String(requested / presetUnit) : 'custom';
        elements.Ending.value = ending;
        elements.EndingAt.value = localTime(b.end);
        elements.EndingAt.hidden = ending !== 'fixed';
        const custom = elements.Window.value === 'custom';
        elements.DurationCustom.hidden = !custom; elements.DurationUnit.hidden = !custom;
        if (custom) {
            const unit = [86400000, 3600000, 60000].find(value => requested % value === 0) ?? 60000;
            elements.DurationUnit.value = String(unit);
            elements.DurationCustom.value = String(requested / unit);
        }
        elements.RangeError.textContent = '';
        elements.DurationCustom.removeAttribute?.('aria-invalid');
        elements.EndingAt.removeAttribute?.('aria-invalid');
        position();
    }
    function update(change) {change(); draft = false; sync();}
    const api = {
        bounds, selection,
        setDuration(value, nextKind = 'preset') {
            if (value !== 'all' && !validDuration(value)) throw new Error('Enter a positive duration.');
            update(() => {requested = value; kind = value === 'all' ? 'all' : nextKind;});
        },
        setEnd(value) {
            if (value !== 'now' && !Number.isFinite(value)) throw new Error('Enter a valid fixed date and time.');
            update(() => {ending = value === 'now' ? 'now' : 'fixed'; if (ending === 'fixed') fixedEnd = value;});
        },
        pan(_first, last) {
            const span = requested === 'all' ? minSpan : Math.min(end-start,Math.max(minSpan,requested));
            api.setEnd(clamp(last,start+span,end));
        },
        resize(first, last) {
            if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) throw new Error('Enter a valid time range.');
            update(() => {requested = clamp(last - first, minSpan, end - start); kind = 'custom'; ending = 'fixed'; fixedEnd = last;});
        },
        sync,
    };
    if (elements) {
        const clearError = input => {input?.removeAttribute?.('aria-invalid');elements.RangeError.textContent='';};
        const invalid = (input,message,report) => {
            if(report){input?.setAttribute?.('aria-invalid','true');elements.RangeError.textContent=message;position();}
            return false;
        };
        const apply = change => {
            const before=[requested,kind,ending,fixedEnd].join(':');
            change();draft=true;sync();
            if(before!==[requested,kind,ending,fixedEnd].join(':'))onChange();
            return true;
        };
        const durationValue = () => elements.Window.value==='all'?'all':elements.Window.value==='custom'
            ?Number(elements.DurationCustom.value)*Number(elements.DurationUnit.value):Number(elements.Window.value)*presetUnit;
        const applyDuration = (report=true) => {
            const span=durationValue();
            if(span!=='all'&&!validDuration(span))return invalid(elements.DurationCustom,'Enter a positive duration.',report);
            clearError(elements.DurationCustom);
            return apply(()=>{requested=span;kind=elements.Window.value==='all'?'all':presets.includes(elements.Window.value)?'preset':'custom';});
        };
        const applyEnd = (report=true) => {
            const last=elements.Ending.value==='now'?'now':new Date(elements.EndingAt.value).getTime();
            if(last!=='now'&&!Number.isFinite(last))return invalid(elements.EndingAt,'Enter a valid fixed date and time.',report);
            clearError(elements.EndingAt);
            return apply(()=>{ending=last==='now'?'now':'fixed';if(ending==='fixed')fixedEnd=last;});
        };
        const close = (focus=false) => {
            elements.RangePicker.open=false;draft=false;sync();
            if(focus)elements.RangeSummary.focus?.({preventScroll:true});
        };
        elements.Window.addEventListener('change',()=>{
            clearError(elements.DurationCustom);draft=true;
            const custom=elements.Window.value==='custom';
            elements.DurationCustom.hidden=!custom;elements.DurationUnit.hidden=!custom;
            if(custom){
                const span=requested==='all'?bounds().end-bounds().start:requested;
                elements.DurationCustom.value=String(requested==='all'?Math.round(span/3600000*1000)/1000:span/3600000);
                elements.DurationUnit.value='3600000';elements.DurationCustom.focus?.();
            } else applyDuration();
            position();
        });
        elements.Ending.addEventListener('change',()=>{
            const fixed=elements.Ending.value==='fixed';
            elements.EndingAt.hidden=!fixed;elements.RangeTimezone.hidden=!fixed;
            if(fixed)elements.EndingAt.value=localTime(bounds().end);
            applyEnd();if(fixed)elements.EndingAt.focus?.();position();
        });
        for(const input of [elements.DurationCustom,elements.DurationUnit,elements.EndingAt])
            input.addEventListener('input',()=>{draft=true;clearError(input);});
        elements.DurationCustom.addEventListener('change',()=>applyDuration());
        elements.DurationUnit.addEventListener('change',()=>applyDuration());
        elements.EndingAt.addEventListener('change',()=>applyEnd());
        elements.RangeForm.addEventListener('submit',event=>{
            event.preventDefault();
            // Native form submission is a keyboard fallback; validate both
            // values before changing either applied field.
            const span=durationValue(),last=elements.Ending.value==='now'?'now':new Date(elements.EndingAt.value).getTime();
            if(span!=='all'&&!validDuration(span))return invalid(elements.DurationCustom,'Enter a positive duration.',true);
            if(last!=='now'&&!Number.isFinite(last))return invalid(elements.EndingAt,'Enter a valid fixed date and time.',true);
            clearError(elements.DurationCustom);clearError(elements.EndingAt);
            apply(()=>{requested=span;kind=elements.Window.value==='all'?'all':presets.includes(elements.Window.value)?'preset':'custom';
                ending=last==='now'?'now':'fixed';if(ending==='fixed')fixedEnd=last;});
            close(true);
        });
        elements.RangePicker.addEventListener('keydown',event=>{
            if(event.key==='Escape'){event.preventDefault();close(true);}
            else if(event.key==='Enter'&&(event.target===elements.DurationCustom||event.target===elements.EndingAt)){
                event.preventDefault();
                if(event.target===elements.DurationCustom?applyDuration():applyEnd())close(true);
            }
        });
        elements.RangePicker.addEventListener('toggle',()=>{
            if(elements.RangePicker.open)position();
            else {draft=false;sync();}
        });
        elements.RangePicker.addEventListener('focusout',event=>{
            if(elements.RangePicker.open&&event.relatedTarget&&!elements.RangePicker.contains(event.relatedTarget))close();
        });
        doc.defaultView?.addEventListener('resize',position);
        doc.defaultView?.visualViewport?.addEventListener('resize',position);
        doc.defaultView?.visualViewport?.addEventListener('scroll',position);
        doc.addEventListener?.('pointerdown',event=>{
            if(elements.RangePicker.open&&!elements.RangePicker.contains(event.target)){
                // Pointerdown precedes blur/change. Commit a valid edited box
                // first, while incomplete input leaves the applied range alone.
                if(doc.activeElement===elements.DurationCustom)applyDuration(false);
                else if(doc.activeElement===elements.EndingAt)applyEnd(false);
                close();
            }
        });
    }
    sync();
    return api;
}
