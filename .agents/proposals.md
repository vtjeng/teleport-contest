# Proposed changes

Costed changes to tooling or process that nobody has scheduled. `ROADMAP.md`
holds open game behavior; nothing here is selectable work.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

## Reconcile the checklist template with the gate that reads it

**What it changes.** `.agents/implementation-checklist-template.md` and
`scripts/audit-worktree.mjs` would agree on the two lines the gate parses.

**What prompted it.** Preparing the search pass on 29 July 2026 failed three
times in a row on the checklist a previous step had written from the template:

- the gate at `scripts/audit-worktree.mjs:206` requires the exact line
  `Current mode: Ready for audit`, while the template prompts for
  `Current readiness: [`Implementation` or `Ready for audit`]`;
- the gate at `scripts/audit-worktree.mjs:211` anchors `Commit checked:` to the
  end of the line, so a SHA followed by any prose does not match, which the
  template's `[full commit SHA]` prompt does not say.

Both forms appear in this file's history, so the two drifted apart rather than
one being new. `4b1b3f7` and later checklists use the template's wording;
`afd468f` and earlier use the gate's.

**Scope.** Either relax the two patterns to accept both forms, or change the
template's prompts to the exact lines the gate parses and say why the shape is
fixed. The second is smaller and keeps one spelling in the repository.

**Cost.** Under an hour, plus a check that no other tool reads either line. The
template is an instruction document, so its wording needs the user's approval
before it changes.

**What it leaves unfixed.** Nothing else in the checklist is machine-read, so a
row whose status or evidence is wrong still passes the gate. The gate rejects
`missing` and `undecided` rows by pattern alone.
