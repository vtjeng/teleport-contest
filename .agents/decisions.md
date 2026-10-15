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
