// Test helper. Synchronous port code reports C's pline.c impossible() through
// js/source_steps.js sync_impossible(), which queues the text on the state's
// notice queue until the next output prints it.

// The reports queued on `state`, oldest first. Takes them off the queue, so
// that a test can assert on the reports of one call.
export function takeQueuedReports(state) {
    const queue = state._glyphUpdateNotices ?? [];
    const reports = queue.filter((notice) => notice.impossible)
        .map((notice) => notice.message);
    state._glyphUpdateNotices = queue.filter((notice) => !notice.impossible);
    return reports;
}
