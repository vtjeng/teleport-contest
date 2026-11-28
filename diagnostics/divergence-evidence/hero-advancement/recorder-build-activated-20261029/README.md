# Activated supported recorder build

The existing /workspace/.setup/activate.sh exposes working Clang19.1.7, Bison3.8.2,
Flex2.6.4 and rsync3.4.1. The earlier failure in recorder-build-gap was from an
unactivated shell, not proof that the environment lacked those tools. Its actual
failure receipt remains preserved. No packages or tools were installed.

A detached isolated checkout at83d4b6209b326c38fd75d02c64719f0aba04e0c2 was created
at /tmp/hero-recorder-build-activated-20261029. The pinned clean upstream tree
16ff59115315917b93185d026aeefea06db9b0f4 was exported unchanged. Existing cached
Lua5.4.8 source was copied into its vendor directory, excluding objects/libraries
and lua/luac executables, before running the unchanged build-recorder.sh. Exact
Lua bytes are archived with per-file hashes; no independent official-tarball
attestation is implied. Nothing was downloaded. Shared source/recorder remained
untouched, and tracked files in the isolated checkout remained unchanged.

The script applied the existing patch series and its standard configuration steps,
compiled and installed solely inside the isolated tree, then passed its supported
smoke test (2870 core RNG calls). Exit0;14.44 seconds elapsed for the build/smoke
command, not active compute and not total audit/setup time. Existing patch recount
and two nhlua compiler warnings are retained in build.log rather than hidden.

Fresh installed binary SHA256:
cb8a2a847d3c4f1c52213757abdbedd2e74c872339691cd5bef5489c64b891ad

The compressed binary, compiler/tool hashes, activation copy, build inputs,
actual argv/result, generated source hashes and installed-file hashes are retained.
This establishes a recorded build origin for this new binary. It is one build,
not an independently repeated bit-for-bit reproducibility claim. The old binary
hash d0e5dceb8871d889b5bd46a5ec27ce1dd060b8aec49a0412d3b8a7458d6a7b13 remains
historically unattested; earlier packages are not retroactively upgraded.

Using supported NETHACK_BINARY/NETHACK_INSTALL overrides, the previously published
integration/below recipe matches all11144 RNG calls and13 screens/cursors. Four
new floor-transition recipes also match; see xp-percent-floor. Its hidden-total
control/target recorded steps equal the earlier preinstalled-binary recordings.
No gameplay differences are found in these scoped checks; not a full workload
claim. No ad hoc instrumentation or new full-state observer was added.

To reproduce the build, use a new isolated checkout of the exact JS base, export
the exact C gitlink into nethack-c/upstream, unpack cached-lua-source.tar.gz beneath
that isolated upstream/lib, source the existing activation script, and run:

```
bash nethack-c/build-recorder.sh
```

Do not run it over a shared recorder: the supported script replaces its own local
recorder directory. The normalized build receipt's cwd `.` means the isolated
checkout; executionRoot preserves the actual absolute path. The recipe control
was executed from the analysis checkout with activation and these overrides:

```
export NETHACK_INSTALL=/tmp/hero-recorder-build-activated-20261029/nethack-c/recorder/install/games/lib/nethackdir
export NETHACK_BINARY="$NETHACK_INSTALL/nethack"
node diagnostics/divergence-evidence/hero-advancement/integration-20261029/run.mjs below /tmp/hero-new-build-below
```

Expected exit0; output directory must be fresh. Environment bindings are retained
in actual command receipts and the hashed build manifest. No merge, CI dispatch,
formal approval, reference changes or excluded investigation occurred.
