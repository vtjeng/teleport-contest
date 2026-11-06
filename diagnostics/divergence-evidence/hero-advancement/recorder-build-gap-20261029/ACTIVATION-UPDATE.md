# Verified availability correction

The historical failure used an unactivated shell. On2026-10-29, sourcing the
existing /workspace/.setup/activate.sh exposed working Clang19.1.7, Bison3.8.2,
Flex2.6.4 and rsync3.4.1; see activated-availability.json. Nothing was installed.
The unchanged isolated build then succeeded. Its distinct build/control receipts
and exact binary hash are in ../recorder-build-activated-20261029/. This preserves
the original failure rather than rewriting it as success. The historical case
remains invalid_setup/incomplete for that attempt; missing-tool availability is
resolved, and the old binary's build origin is still unknown.
