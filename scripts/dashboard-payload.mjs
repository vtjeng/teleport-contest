// Keep evaluator evidence on the build side of the dashboard boundary. The
// browser renders only aggregate state, batch notices, and per-case progress;
// evaluation objects and manifest metadata can contain full replay traces.
export function challengeDashboardPayload(view) {
  return {
    status: view.status,
    totals: view.totals,
    error: view.error,
    commitUtc: view.commitUtc,
    commitAgeLabel: view.commitAgeLabel,
    cases: (view.cases || []).map(({
      batch, id, title, first, current, screenCount, delta, outcome,
    }) => ({ batch, id, title, first, current, screenCount, delta, outcome })),
    batches: (view.batches || []).map(({ batch, status, error }) => ({
      batch, status, error,
    })),
  };
}
