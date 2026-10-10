// C ref: alloc.c fmt_ptr() (125-136), after patch 007 stabilizes recorder
// diagnostics. Native addresses vary across processes; callers can observe
// only whether the supplied pointer is null.
export function fmt_ptr(pointer) {
    return pointer === null || pointer === undefined ? '<null>' : '<ptr>';
}
