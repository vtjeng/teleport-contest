# Trial monitor records

`manifest.json` fixes the audited 11:50–15:50 UTC historical baseline and holds
the trial clock and current operational state. `repairs.json` records one stable
ID per parity repair. The static dashboard reads both files at build time and,
when opened, makes read-only requests to the public GitHub API. No credential,
background observer, or separate status publisher is involved.

At the **explicit** trial start, record its UTC `start`, set `status` to
`running`, and record known investigator statuses. Set `coverage` to `complete`
only when the register covers every repair in the window; otherwise leave it
`unknown`. Record `currentCandidate` as `{ "repairId": "…", "sha": "<full SHA>",
"origin": "…", "investigator": "…" }`. `waitingHandoffs` is an array of at
most one item. Update `asOf` on changed records. At the agreed four-hour cutoff,
record the UTC `end` and set `status` to `completed`. Record interruptions as
facts, without treating task-span gaps as measured downtime or compute savings.

For each repair, retain its source, C witness, and focused test evidence. Append
correction candidate SHAs and every required gate attempt to the same repair ID.
Include run ID, exact SHA, event, branch, conclusion, and final job completion
time. Checkpoint may be an integration-branch push or dispatch; Lint and
Dashboard acceptance require Main push runs. A retry or correction is never a
second repair. Dashboard-only changes are excluded. The panel counts a repair
only after all three gates have passed for one candidate SHA, at the time the
last required job finished. Do not publish a dashboard-only commit just to
refresh status; opening the page refreshes public GitHub metadata.
