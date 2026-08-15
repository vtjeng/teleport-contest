# Questions for the user

The loop appends a question here when
`.agents/loop.md` triages it as non-blocking or slice-blocking. Entries
stay open until the user answers, here or in conversation; apply the answer,
then delete the entry. Append new entries at the end.

Entry shape:

```
## Q<n> (<date>) <slice or topic>

- Context: one or two sentences.
- Question: the question, answerable in one line.
- Provisional decision: what the loop did meanwhile, or "slice parked".
- Answer: (open)
```

## Q8 (2026-08-15) Should startup-deferral-sweep close on a stated boundary?

- Context: the sweep has closed 13 slices and its counted census has gone 14,
  12, 11, 11, 12. Every slice closes an entry, and reading the C to close it
  opens one or two more, all real. The slice-selector measured why: 14 of the
  18 non-`scope` startup entries are the rc option parser or the options menu,
  so the label is doing almost no work and this is an `options.c` goal wearing
  a sweep's clothes. Driving `parseNethackrc()` over `OPTIONS=<name>:zqxj` for
  every rc-settable CompOpt row finds 29 that report and **54 that store the
  raw string silently**, where C reports; 20 of the 31 handlers checked hold a
  `config_error_add()` arm the port skips without a word. All 54 are carried by
  one ledger entry, whose own note says it "is retired one optfn_ handler at a
  time". A census cannot measure that in either direction. The `blockedOn`
  escape is unavailable too: every parser residue waits on `options.c` itself,
  and three of the six blocked entries are blocked on symbols this sweep will
  write.
- Question: should the sweep close on "every startup entry outside the rc
  option parser and the options menu is read and dispositioned", with a fresh
  fail-closed boundary port taking the parser under a coverage closing
  condition — every rc-settable `allopt[]` row either runs its `do_set` arm or
  reports, measured as one integer that is 54 today and 0 at close?
- Provisional decision: the loop continues on the four entries that belong to
  the sweep under either answer, taking the worst shape first: the live monster
  refusal, which loses a whole segment through `runSegment()` and which the
  sweep has walked past nine times. The parser entries are not queued while
  this is open, so no work is done that the restructuring would waste.
- Answer: (open)
