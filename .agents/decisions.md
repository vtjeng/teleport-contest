# Adopted process changes

This log records adopted process and tooling changes. Observations remain in
[friction.md](friction.md), and pending ideas remain in
[proposals.md](proposals.md). The Process analyst drafts entries; Work lead
integrates them alongside the approved implementation at safe boundaries with
all existing validation and publication checks preserved.

Keep each entry concise: date/change; why, with friction or proposal links;
implementation commit or PR; expected benefit and tradeoff; and follow-up
evidence initially `unmeasured`. Measure comparable observations when available
and link their evidence here. Preserve older entries; a later reversal links to
the earlier decision and states its reason. Do not backfill assumed adoption
or measured benefits from pending proposals.

## 2026-10-15 — ongoing friction triage and an adopted-change log

- Change: make friction triage a standing Process analyst responsibility, with
  brief post-batch and periodic reflections, and link this log from the dashboard.
- Why: repeated setup extensions and a mislabelled replay in the
  [v89 friction record](friction.md#2026-10-15--v88-acceptance-and-v89-setup-limits),
  plus the [fresh-ledger startup gap](friction.md#2026-10-15--fresh-ledger-baseline-has-no-first-publication-route),
  show the need for ongoing review of repeated failures and coordination mistakes.
  The user's standing request replaces the former request-only triage rule.
- Implementation: [17a1f38f0754cb1b6fdcfcd68776fe65afea7e53](https://github.com/vtjeng/teleport-contest/commit/17a1f38f0754cb1b6fdcfcd68776fe65afea7e53).
- Expected benefit/tradeoff: detect recurring friction and test small remedies
  sooner; brief reflections and decision upkeep add coordination work. Reviews
  use saved evidence independently of worker execution and preserve existing gates.
- Follow-up evidence: `unmeasured`. Compare repeated attempts, rejected-delivery
  corrections, and avoidable waits across subsequent comparable batches, including
  reflection overhead and unchanged or worse outcomes; link observed results here.

## 2026-10-15 — observe a verified first published tooling baseline

- Change: add `initial-baseline.mjs` to observe an already tested and published
  first baseline, recording the existing `tooling-published` event with a
  hash-frozen checkpoint and no task or delivery acceptance.
- Why: the [fresh-ledger startup record](friction.md#2026-10-15--fresh-ledger-baseline-has-no-first-publication-route)
  identified a deadlock: ordinary tooling publication required an earlier
  accepted anchor, and the first Prep submission required an accepted comparison.
  Work lead approved this separate scoped recovery change.
- Implementation: [8c74fa337a6f226f301830d0936d38285776b1e5](https://github.com/vtjeng/teleport-contest/commit/8c74fa337a6f226f301830d0936d38285776b1e5).
- Expected benefit/tradeoff: establish a truthful initial comparison baseline
  without fabricating history or changing old readers. The route requires exact
  archived execution evidence, published-main identity and tooling-only history;
  a later tooling baseline needs an explicit queue refresh and JavaScript-only
  comparison update for retained cases. Normal validation and acceptance gates stay.
- Follow-up evidence: `unmeasured`. Observe the first real initialization and
  first Prep submission at that baseline; record any rejected supported case,
  provenance updates and retries. Preserve original C captures and packets.

## 2026-10-16 — complete hosted evidence through the GitHub API

- Change: routine checkpoint and admission imports read complete result files
  from the exact combine job's Check output. Numbered gzip/base64 annotation
  chunks and a final SHA-256 manifest preserve the original JSON bytes.
  Imports verify the workflow run, attempt, commit, job, check suite, GitHub
  Actions app, chunk membership and file digests before existing archive and
  per-case acceptance checks. Historical artifact transport requires explicit
  `--artifact`; missing API evidence has no automatic fallback.
- Why: proxy CONNECT HTTP 403 failures prevented artifact-host access after
  successful hosted validation; see the recovery entry in [friction.md](friction.md).
- Implementation: [6bf27a30913ac385d5af8da2556117bd499c1f42](https://github.com/vtjeng/teleport-contest/commit/6bf27a30913ac385d5af8da2556117bd499c1f42).
- Expected benefit/tradeoff: routine imports no longer depend on the artifact
  storage host. Annotation encoding and API pagination add transport overhead.
- Follow-up evidence: [checkpoint 38835906013](https://github.com/vtjeng/teleport-contest/actions/runs/38835906013)
  passed, and finalized check 116766121192 retained all 14 payload chunks.
  API import verified 93 files, including all 89 admitted synthetic evaluations,
  with 496,613 compressed bytes and no artifact download. Existing full-checkpoint
  and per-case validators passed. This establishes transport availability for one
  checkpoint; comparative timing and hosted admission publication remain unmeasured.

## 2026-10-16 — manual Score and Coverage reports

- Change: Vincent asked whether to disable automatic Score and Coverage runs;
  Coordinator adopted manual-only reports after reviewing the evidence. Remove
  their main-push triggers while retaining manual dispatch, scripts and artifacts.
  Publication tracking requires automatic Lint and Dashboard only.
- Why: Checkpoint already tests and scores both populations before publication.
  Score's separate summary has no repository acceptance consumer. Coverage's
  unique unexecuted-line listing is reporting only and sets no threshold.
- Expected benefit/tradeoff: avoid two repeated post-publication jobs while
  giving up their automatic per-push reports. The full prepublication Checkpoint
  gate remains unchanged. The latest six completed jobs averaged 13m11s for
  Coverage and 8m39s for Score; all 18 sampled completed runs per workflow passed.
- Follow-up evidence: first-publication workflow selection and pending-cache
  completion will be checked. Comparative publication timing and throughput
  remain unmeasured.
