# Opt-in completion of a single future C recording

This tool implements a predeclared prompt protocol; it does not authorize a
gameplay experiment, change the pre-JavaScript candidate gate, or reopen a
closed task. Use only within a separately authorized, bounded recording plan.
Default `record-session.mjs` behavior is unchanged.

```
node scripts/record-session.mjs input.json capture.json \
  --prompt-plan policy.json --prompt-receipt receipt.json \
  --emitted-recipe emitted-input.json
```

Use a private recorder installation and unique artifact paths as usual. Opt-in
mode requires one input-only, nonterminal segment. Its fixed `moves` includes
the complete setup and the one target action, with no speculative completion
suffix. Every source binding is checked and the policy bytes are frozen before
the child starts. Output paths must be distinct and previously nonexistent.

## Frozen policy schema

`schemaVersion: 1` requires:

- `sources`: nonempty `{path, sha256, reason}` bindings under
  `nethack-c/upstream/` or `nethack-c/patches/`.
- `normalBoundaryProof`: the task's source-specific explanation of why the
  normal predicate positively identifies command readiness. An input marker,
  an absent More label, or a plausible empty message is insufficient.
- `targets` and `observers`: nonempty arrays of exact frame predicates.
- `rules`: at most 64 `{id, kind, match, proof}` entries. IDs are unique.
- `maxKeys` (1–64 completion keys), `maxFrames` (1–128 completion input frames),
  `maxMs` (1–1,200,000 milliseconds for capture and required replay together).

A frame predicate is `{screen, cursor: [x,y,1]}`. `screen` is the **entire
canonical serialized screen**, including its ANSI run encoding, not just a
message substring; cursor coordinates must also match. No regular expressions,
callbacks, RNG tests, name variants, or negative-only predicates are supported.
The task must derive the predicates independently and justify their source
context. Exact matching is conservative; it does not itself prove that two
semantically different C input contexts cannot render the same frame. Practical
authorability for new gameplay tasks remains unmeasured.

The finite completion states are target-completion, awaiting-observer, stopped:

| Rule kind | Fixed action | Restriction |
| --- | --- | --- |
| `more` | one ASCII space | Exact frame must include `--More--`; source proof must put it in this action's output chain. May also complete the observer's paging. |
| `scroll-call` | Escape | Exact screen starts `Call a scroll…:`; task must prove cancellation neutral (`name_from_player`/`docall`). Only before the observer. |
| `normal` | `i`, once | Positive normal-boundary proof, target already observed. No repeat command. |

An exact observer predicate after the one inventory query ends capture. Unknown
frames, multiple matching rules, rule/observer overlap, a premature observer,
unexpected prompt after `i`, process failure or any cap stop without another
key. They produce incomplete evidence and exit 2, not a successful session.
Do not add a broad fallback rule to make a mismatching predicate pass.

## Evidence and mandatory static replay

`receipt.json.jsonl` is flushed after each event: frozen policy/input/source and
binary hashes, command invocation, every input/animation frame, matching rule
decision, key intent (exact wire bytes), accepted stdin write and process
outcome. A write receipt means submitted to the pipe, not proof that C acted on
the key. Capture and static replay events carry distinct `run` labels. Preserve
the journal even when a host/process/disk failure prevents
the final summary. Capture steps retain RNG/screens/cursors as usual.

The emitted input-only recipe contains the actual complete keys. CR is
normalized to LF, matching the recorder's wire behavior. It contains no handler
policy or captured state. After target-plus-observer success, the CLI performs
**one ordinary static unchanged-input C replay**, with no prompt handler. It
saves `capture.json.replay.json` and compares exact steps, including RNG,
screens and cursors. No retry follows a mismatch, failure or exhausted deadline.
Capture and replay are separate physical executions; they are not two chances
to choose an outcome. The replay is skipped on incomplete capture.
If artifact finalization exhausts the shared deadline, replay is explicitly
skipped as `deadline-exhausted`; a second deadline check after recorder setup
also prevents spawning a child after the remaining budget has elapsed.

`receipt.json` distinguishes `observerSuccess` from `captureComplete`: the
latter requires a matching static replay. A nonzero exit, partial capture or
reproducible message alone proves neither mutation completion nor parity with
JavaScript. No C game was executed to validate this initial tool change; its
focused tests use synthetic marker processes only. Unicode endpoint loss is a
separate issue and this handler does not change the C capture patch.
