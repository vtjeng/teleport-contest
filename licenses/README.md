# Third-party licences

The port of macOS's regular-expression library is a JavaScript translation
of Apple Libc (tag `Libc-1752.120.2`, regex/ directory):

- `js/regcomp.js`, `js/regexec.js`, `js/tre_ast.js`, `js/tre_compile.js`,
  `js/tre_internal.js`, `js/tre_match_parallel.js` and `js/tre_parse.js`
  translate TRE, Copyright (c) 2001-2009 Ville Laurikari, as Apple adapted
  it. TRE is distributed under the two-clause BSD licence in
  `TRE-LICENSE.txt`.
- `js/regerror.js` and the character-name table in `js/tre_parse.js`
  translate FreeBSD's `regerror.c` and `cname.h`, Copyright (c) 1992, 1993,
  1994 Henry Spencer and the Regents of the University of California,
  distributed under the licence in `FreeBSD-regex-LICENSE.txt`.

The port of macOS's `qsort()` is a JavaScript translation of Apple Libc
(tag `Libc-1752.120.2`, stdlib/FreeBSD/ directory):

- `js/qsort.js` and `js/heapsort.js` translate FreeBSD's `qsort.c` and
  `heapsort.c`, Copyright (c) 1991, 1992, 1993 The Regents of the
  University of California, distributed under the licence in
  `FreeBSD-qsort-LICENSE.txt`.

The rest of the repository is not covered by these licences.
