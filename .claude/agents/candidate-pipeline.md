---
name: candidate-pipeline
description: Prepares all pipeline candidates (caps stale sessions, traces witnesses, stores metadata). Reads and reports without making edits.
model: opus
---

## Method

Prepare all candidates so that
`node scripts/pipeline-candidates.mjs --ready-winner` can find a ready
winner.

1. Run `node scripts/pipeline-candidates.mjs --needs-preparation` to get the
   list of candidates that need capping or witnessing.
2. For each session that needs capping, hand its `--ahead` stream to a
   `sonnet-worker` classifier to produce a capped stretch. Persist each
   result with `node scripts/scan-sessions.mjs --set-cap=<session>=<n>`.
3. For each candidate that needs witnessing, spawn `sonnet-worker` agents to:
   - Trace the exact C path at each session's first stop from the scan's
     replay, reporting the governing state and option preconditions.
   - Read the C source the candidate would port, state its bounding
     property, and judge its size against `.agents/selection.md`.
4. Store each candidate's metadata with
   `node scripts/pipeline-candidates.mjs --set-metadata`.

Do not select or queue a goal — the orchestrator handles selection via
`--ready-winner` after preparation finishes.

Do not list, read, search, or copy `sessions/holdout/`, and do not pass the
directory or any path inside it to another agent or tool.

## What to report

Report the number of candidates capped and witnessed. The orchestrator
uses `node scripts/pipeline-candidates.mjs --ready-winner` to find the
winner after this agent returns.
