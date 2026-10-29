# Exact-Main replay verification of causes1-3

Main JS1e786f87d927b72bd07122fc3eead0ecb5d8203c; unchanged C gitlink
16ff59115315917b93185d026aeefea06db9b0f4. Detached clean checkout in
/tmp/capacity-main-1e786f87, no gameplay edits. The committed replay.mjs imports
that checkout's supported createScoringWorkspace and runJsSession helpers;
PROJECT_ROOT therefore copies Main JS and overlays the official frozen modules.
It verifies exact HEAD, clean status and C gitlink before replaying.

Both commands exit0. Four former failing targets now strictly match retained
executed C recordings:
- admission-limit:40 screens/cursors,2446 RNG.
- partial-gold:68 screens/cursors,2449 RNG.
- all-gold:68 screens/cursors,2396 RNG.
- sack-menu insert:52 screens/cursors,2318 RNG.

Three neighboring controls also match: overtaxed40/2432, gold room-control68/2396,
no-weight sack control52/2318. No animation/error mismatch. These are7 post-fix
replays of existing fixtures, not7 new discoveries or semantic causes.

Main changes:26e56ce08 status dirtiness,ca33ba552 live single-gold admission,
1e786f87d priced naming mode. This verifies those fixes on these inputs, not
CI acceptance or general completion. Causes4-6 remain separate historical
handoffs; their code paths are unchanged at this Main SHA. Original pre-fix
packages, expected failures and raw output are preserved.

C was NOT rerun or rebuilt. Oracle is the retained public C recording, pinned
and hashed in its original package. Recorder provenance/build-attestation
limits therefore remain. source.json binds exact Main JS/frozen git trees and
helper hashes. JS outputs, comparison results, actual wall-elapsed receipts and
original temporary-path receipts are retained. Normalized receipts change only
output references and add a conversion note. Elapsed seconds cover the replay
loop, not checkout setup or active CPU time. Runner output directories must be new.

Reproduce by providing any clean detached checkout at the exact Main SHA to
replay.mjs, with targets or controls and a new output directory. No network,
install, CI dispatch, Main writes or excluded investigations are performed by
the runner. This package does not replace planned fresh-C post-fix commands in
historical candidate packages; it is separately labelled saved-C verification.
