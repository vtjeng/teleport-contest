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
        const box=elements.RangePicker.getBoundingClientRect(),panel=elements.RangeForm.getBoundingClientRect();
        elements.RangeForm.style.left=(clamp(box.left,16,Math.max(16,win.innerWidth-panel.width-16))-box.left)+'px';
        elements.RangeForm.style.top=(clamp(box.bottom+6,16,Math.max(16,win.innerHeight-panel.height-16))-box.top)+'px';
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
        const changed = action => {action(); onChange();};
        elements.Window.addEventListener('change', () => {
            if (elements.Window.value === 'custom') {
                draft = true;
                const span = requested === 'all' ? bounds().end - bounds().start : requested;
                elements.DurationCustom.value = String(requested === 'all'
                    ? Math.round(span / 3600000 * 1000) / 1000 : span / 3600000);
                elements.DurationUnit.value = '3600000';
                elements.DurationCustom.hidden = false; elements.DurationUnit.hidden = false;
            } else if (draft) {
                elements.DurationCustom.hidden = true; elements.DurationUnit.hidden = true;
            } else changed(() => api.setDuration(elements.Window.value === 'all' ? 'all'
                : Number(elements.Window.value) * presetUnit));
            position();
        });
        elements.Ending.addEventListener('change', () => {
            elements.RangeTimezone.hidden = elements.Ending.value !== 'fixed';
            if (elements.Ending.value === 'now' && draft) elements.EndingAt.hidden = true;
            else if (elements.Ending.value === 'now') changed(() => api.setEnd('now'));
            else {draft = true; elements.EndingAt.hidden = false; elements.EndingAt.value = localTime(bounds().end);}
            position();
        });
        for (const input of [elements.DurationCustom,elements.DurationUnit,elements.EndingAt])
            input.addEventListener('input', () => {draft = true;elements.RangeError.textContent = '';});
        elements.RangeForm.addEventListener('submit', event => {
            event.preventDefault();
            try {
                const choice = elements.Window.value;
                const span = choice === 'all' ? 'all' : choice === 'custom'
                    ? Number(elements.DurationCustom.value) * Number(elements.DurationUnit.value) : Number(choice) * presetUnit;
                const last = elements.Ending.value === 'now' ? 'now' : new Date(elements.EndingAt.value).getTime();
                if (span !== 'all' && !validDuration(span)) throw new Error('Enter a positive duration.');
                if (last !== 'now' && !Number.isFinite(last)) throw new Error('Enter a valid fixed date and time.');
                // Validate both drafts before changing either committed value.
                update(() => {requested = span; kind = choice === 'all' ? 'all' : presets.includes(choice) ? 'preset' : 'custom';
                    ending = last === 'now' ? 'now' : 'fixed'; if (ending === 'fixed') fixedEnd = last;});
                onChange();
                elements.RangePicker.open=false;
                elements.RangeSummary.focus?.({preventScroll:true});
            } catch (error) {elements.RangeError.textContent = error.message;position();}
        });
        const close = () => {elements.RangePicker.open=false;draft=false;sync();};
        elements.RangePicker.addEventListener('keydown',event=>{
            if(event.key==='Escape'){event.preventDefault();close();elements.RangeSummary.focus?.({preventScroll:true});}
        });
        elements.RangePicker.addEventListener('toggle',position);
        doc.defaultView?.addEventListener('resize',position);
        doc.addEventListener?.('pointerdown',event=>{
            if(elements.RangePicker.open&&!elements.RangePicker.contains(event.target))close();
        });
    }
    sync();
    return api;
}
