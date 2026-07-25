# Expected leaderboard score

This tracker keeps exact-commit evidence snapshots, newest first. It is not an
implementation journal. Routine chunk validation stays in tests, commit
history, and the active checklist. Recorded correctness and simplification
frontiers and metrics stay in `QUALITY.json`; other required reports and the
removed pre-policy checkpoint rows remain available in their related checklist
evidence and Git history through
`eb0ae7f17e0141c35884de2ac833104f25f28dde`.

`shown` is the estimated 44-session public score. A published leaderboard
result supplies that value when available; otherwise a development result is a
conservative lower bound and does not scale from 33 to 44 sessions. `hidden`
is the separate official held-out score. Carried published values remain
uncertain after later code changes. No row below implies a local holdout run.

Keep one row per full code SHA and combine coincident triggers. The optional
candidate row marks a selected, fully validated handoff for the open slice. It
is replaced only by a later validated handoff, promoted if the same SHA meets a
permanent trigger, or deleted when a permanent snapshot supersedes it. It does
not advance merely because the code head advances.

| Code commit | Date | Trigger | Expected screen score | Score evidence and uncertainty |
| --- | --- | --- | --- | --- |
| `c6de861d830f3b4610a31ad2fce8e65869893ff8` | 2026-07-25 | current candidate | `206 shown + 194 hidden = 400 total` | The starting-pet result contract is pinned through downstream `postmov()`. Thirty focused pet tests, all 1,565 tests, and the four routine generated-data checks passed. Development remained at 77,557 PRNG values, 205 screens, and 236 cursors. The active second-command slice remains open, and the carried published estimate is uncertain. |
| `a61681496d5712aa17ddee750d1a72a5275ab627` | 2026-07-24 | score change | `206 shown + 194 hidden = 400 total` | A live first-move object case raised the development result to 206 screens, with 77,588 PRNG values and 243 cursors. The hidden value is carried from the published ancestor and is uncertain. |
| `3b6c38de148679a5cc8313d755ec906fa95627c3` | 2026-07-23 | live slice and milestone closure | `205 shown + 194 hidden = 399 total` | The first complete gameplay turn closed with all 1,290 tests passing. The 18-segment fresh matrix matched 48,825 PRNG calls and all 55 complete screens, attributes, and cursors. Composite review and simplification coverage is recorded in `QUALITY.json`; the hidden value is carried and uncertain. |
| `270731e88cb25c3813820b7f4d516a9763719061` | 2026-07-23 | score change | `205 shown + 194 hidden = 399 total` | Source-shaped safe-wait handling raised the development result to 205 screens while retaining 77,588 PRNG values and 243 cursors. The hidden value is carried and uncertain. |
| `68472ba3aa99786e5c3e01f4407b07bc853ea89b` | 2026-07-23 | score correction | `204 shown + 194 hidden = 398 total` | Explicit replay and monster-action stops reduced the development result from 302 to 204 screens by removing credit beyond behavior the port owned. A four-way reproduction confirmed the attribution. The hidden value became especially uncertain after the correction. |
| `0708853dc18b2a0723dab61f6d116f7606fc23ab` | 2026-07-22 | score change | `302 shown + 194 hidden = 496 total` | Runtime monster creation raised the development lower bound to 302 screens, 78,645 PRNG values, and 590 cursors. This was never a published 44-session result; the hidden value was carried and uncertain. |
| `ddb23823ac69f27906257ee615a4bdb818deeaac` | 2026-07-22 | score change | `301 shown + 194 hidden = 495 total` | Source ambient sounds reduced the development result by one already-divergent level-two screen while fresh source-matching cases passed. The hidden value was carried and uncertain. |
| `76109518c4e879b444ee53cddd9617f875780888` | 2026-07-22 | score change | `302 shown + 194 hidden = 496 total` | Live command decoding and turn intent raised the development lower bound to 302 screens, 78,350 PRNG values, and 590 cursors. This was not a published result, and the hidden value was carried and uncertain. |
| `f0624a759f50fbf061ab7e48ff7e83a08ea57ef1` | 2026-07-22 | first-command milestone closure | `249 shown + 194 hidden = 443 total` | The 107-case closure matrix matched 311,439 PRNG calls, 119 screens, and every cursor; all 997 tests passed. Final review coverage is recorded in `QUALITY.json`, with the non-ledger clarity report retained in the pre-compaction Git history. The score is carried from the published ancestor. |
| `8866764466effe643de8f2020fc3e6612ed21bf4` | 2026-07-22 | published result | `249 shown + 194 hidden = 443 total` | The published leaderboard reported 249 public and 194 held-out points for its 2026-07-22 18:31 UTC run. A clean detached development run matched 213 screens. The local holdout was not run. |
| `e0f8b050a5215a2a999f10c75b8c574d6682e2a4` | 2026-07-22 | score correction | `213 shown + 0 hidden = 213 total` | A clean detached rerun matched 213 screens, 78,280 PRNG values, and 418 cursors; the previously recorded 217-screen result did not reproduce. No published hidden result existed yet. |
| `2b88f27dab4d6fc0af5dd50673cd4de6d87bfdb2` | 2026-07-22 | score change | `217 shown + 0 hidden = 217 total` | Source vault retry behavior raised the development result by 26 to 217 screens. This result was later corrected when it did not reproduce. |
| `5d3bfb9a5232fd966df86b678b6a27651eea0de4` | 2026-07-22 | score change | `191 shown + 0 hidden = 191 total` | Live optional themed-room fills raised the development result by 13 to 191 screens; broad first-command validation remained open. |
| `f140abfaa499b2e8d7648fffc5c0fb73e33a5c73` | 2026-07-21 | score change | `178 shown + 0 hidden = 178 total` | Startup and display work raised the development result by six to 178 screens. Fresh Enhanced1 and IBM cases matched completely; arbitrary first-prompt parity remained open. |
| `0ad24831c0de0d098af381520c8b85449bbd0802` | 2026-07-21 | score change | `172 shown + 0 hidden = 172 total` | Visible engraving reveal behavior raised the development result by six to 172 screens, with a fresh exact differential through the first prompt. |
| `1be5455e9c24c4a6515c7a176a62f5d7aca3fd8b` | 2026-07-21 | score change | `166 shown + 0 hidden = 166 total` | Source-ordered explore-mode notice handling raised the development result by four to 166 screens. Earlier level-generation divergence still blocked whole-session parity on sampled seeds. |
| `9dd455841a755c4506ee821b45fc741b1bbef43c` | 2026-07-21 | score change | `162 shown + 0 hidden = 162 total` | Source-shaped post-level startup replaced replay scaffolding and raised the development result to 162 screens. Earlier level-generation divergences remained. |
| `e143b964e1e12f458cbccab0c14521cef42ca259` | 2026-07-20 | initial baseline | `103 shown + 0 hidden = 103 total` | The fixed development set matched 103 screens; 286 tests and both then-declared generated-catalog checks passed. |
