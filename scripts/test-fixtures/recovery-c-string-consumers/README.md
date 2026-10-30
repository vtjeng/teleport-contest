Executed references: compile message-oracle.c and engraving-oracle.c with provisioned
Clang19.1.7, `clang -std=c99 -O2 <file> -o /tmp/<name>`. Message oracle arguments
are each input string's UTF-8 hex bytes; output is accumulated text in hex.
Engraving oracle arguments are form0(table) or1(positional), then input UTF-8 hex;
output is all stored text states, allocation and metadata. messages.json and
engravings.json retain inputs and raw parsed results. Six exact C bodies are
source/hash-bound in provenance.json. Disclosed adapters do not execute a full
native C Lua constructor or finalization.

The four map fixtures separately execute real native C Lua table-map and selection
iteration. A transparent map restores a known coordinate frame before iterating
retained selection. Fixtures/recipes/hashes are pinned; JS tests mirror those
supported APIs. No full custom-Lua JS replay or recorder source-build attestation.

C lspo_map explicitly does not support row arrays. Its raw-string counterpart
versus the port's array convenience overload needs a translation-contract decision.
This candidate leaves row arrays unchanged and labels source3f78593d partial;
only message and engraving sources are included in the complete-source notice.
The optional owned-string reader candidate ae6de452 is not a dependency: its
mandatory engraving reader and these copying consumers are distinct paths.
No des.room construction or failed-turn artifacts are used.
