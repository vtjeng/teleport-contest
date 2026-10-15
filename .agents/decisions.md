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
