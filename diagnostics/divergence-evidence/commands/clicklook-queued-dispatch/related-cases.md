# Relationship to existing command cases

Locations refer to each evidence package's pinned source base; line numbers can shift on Main.

| Case | Suspected branch/root cause | Relationship to #66 |
| --- | --- | --- |
| #54 counted look | `js/cmd.js:5681-5728`: positive count admission rejects `look` before its no-time handler | Different guard; #66 has no count. |
| #58 wizard prayer repeat | `js/pray.js:1835-1841`: records/reuses wizard-force answer rather than fresh non-recording confirmation | Different prompt/queue content behavior; #66 is not repeating a command. |
| #60 queued direction redraw | `js/cmd.js:1574-1622`: redraw branch runs for queued direction though C jumps past it | Different input-origin branch; #66 never calls queued getdir for the selected map-symbol action. |
| #62 current-square travel | `js/cmd.js:2764-2773`: early return clears a flag C retains | Different retained-state behavior; #66 does not initiate travel. |
| #66 queued map-symbol lookup | `js/cmd.js:5537-5543`, `5857`, `6737-6748`: queued row name `clicklook` is tested against handler spelling `doclicklook` | Command-name/handler-name dispatch mismatch. Further internal commands with this same mismatch are additional affected paths, not automatically new unique bugs. |

This is a source-location comparison for Main's overlap assessment, not a claim that implementation work must be separate. The original `doclicklook -> auto_describe` scanner lead remains unresolved and is not counted as a second confirmed bug.
