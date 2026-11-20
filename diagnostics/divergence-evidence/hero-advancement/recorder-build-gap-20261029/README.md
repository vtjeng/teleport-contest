# Supported recorder build prerequisite gap

Action: run an unchanged copy of nethack-c/build-recorder.sh in isolated
/tmp/hero-recorder-build-preflight-zbyk4hdn/nethack-c/. The copy and source have
identical SHA256 c37c6942e0563c4dc807b5c32ca6a43b9532519346658e1dfc7680567c0f6a38.
It exited1 with `[FAIL] clang required (deterministic argument evaluation order)`
before creating a recorder directory. This is a prerequisite failure, not a
policy denial, pending approval, uncertain execution, or a gameplay negative.

Current executable lookup: clang, bison, flex and rsync absent; make, git, node
and gcc available. The supported script requires clang and exports CC=clang.
Repository documentation explains that GCC argument-evaluation order changes RNG
call order, so substituting GCC would not be the supported recorder build.
No installation, dependency fetch, alternative compiler, modified build script,
source/patch changes, shared recorder deletion, or engine instrumentation occurred.
No unchanged failure was retried. No fresh binary, smoke test or advancement
control replay can be reported.

The input inventory hashes the actual build script, all current patch files,
Linux hints and supported smoke/fresh-differential tooling. Upstream gitlink is
16ff59115315917b93185d026aeefea06db9b0f4 with a clean worktree. These are planned
inputs, not a claim that the failed preflight consumed them. JS review base is
e6e03e2635b3444476e9f5d4d6aee60fd2a98929. Existing installed binary remains hash
d0e5dceb8871d889b5bd46a5ec27ce1dd060b8aec49a0412d3b8a7458d6a7b13; this does not
provide its build attestation. No replacement binary hash exists.

Smallest build prerequisite: an already provisioned supported environment with
clang, bison, flex and rsync available to the unchanged script. It also needs the
pinned source/patches, supported Lua build inputs and existing Node smoke harness;
those later stages were not reached, so their success is not assumed. An isolated
checkout would be necessary because the script removes its own recorder directory.
The script's final smoke test and NETHACK_BINARY/NETHACK_INSTALL overrides are the
supported way to validate and select a fresh binary, once one can be built.

No full-state observer was found in the supported interfaces reviewed: README
lists seed/time/RNG logs/terminal captures, and patches/README explicitly places
internal event_log/midlog/mapstate hooks outside this repository's public tooling.
No private tooling or ad hoc instrumentation was sought.

Best next reachable advancement branch: nonzero XP percentage truncation floor.
At ordinary Tourist level10, wizard levelchange sets XP5120; first travel to
D:2 awards2 XP. The 4880-point level interval makes integer percentage0 before
C percentage() promotes nonzero progress to1. A parsed `<1%/red`, `>=1%/green`
rule with totals hidden can observe this, paired with the same level10 state
before the award. Prior level-one highlight fixtures never exercise that floor.
This is a supported wizard-assisted setup plan, not an executed result here.
It does not need a new binary, and it will retain the existing provenance limit.

This versioned case is deliberately invalid_setup/incomplete, with target/control
qualification pending. build-result.json is the actual failure receipt; no
successful C/JS command pair is invented. Existing matching packages remain
bounded and unchanged. No global exhaustion or new semantic cause is claimed.
