// Self-contained: the builder embeds this factory in the generated dashboard.
// Display only. Stored evidence and chart arithmetic remain absolute instants.
export function createDashboardTime() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'browser local time';
    const date = value => {
        if (value == null || value === '' || (typeof value !== 'string' && typeof value !== 'number')) return null;
        const parsed = new Date(value);
        return Number.isFinite(parsed.getTime()) ? parsed : null;
    };
    const formatter = options => {
        const format = new Intl.DateTimeFormat('en-GB', options);
        return value => { const parsed = date(value); return parsed ? format.format(parsed) : 'unknown'; };
    };
    const stamp = formatter({year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit',
        second:'2-digit', hourCycle:'h23', timeZoneName:'shortOffset'});
    const clock = formatter({hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
    const day = formatter({year:'numeric', month:'short', day:'numeric'});
    const shortDay = formatter({month:'numeric', day:'numeric'});
    const input = value => {
        const d = date(value), pad = n => String(n).padStart(2, '0');
        return d ? d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate())
            + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) : '';
    };
    const parseInput = (value, retained) => {
        if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(value)) return NaN;
        const normalized = value.length === 16 ? value + ':00' : value;
        // Opening/changing an unchanged field must preserve the second instant
        // of a repeated DST hour (Date parsing otherwise chooses the first).
        if (Number.isFinite(retained) && input(retained) === normalized) return retained;
        const parsed = new Date(value).getTime();
        // Reject missing spring-forward times and invalid calendar rollovers.
        return input(parsed) === normalized ? parsed : NaN;
    };
    return {zone, stamp, clock, day, shortDay, input, parseInput};
}
