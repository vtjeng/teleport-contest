# Prior observations and scope corrections

- Initial wraith and green-slime recordings omitted startup-prompt answers.
  The full-moon prompt consumed the pet creation command. Both recordings
  matched, but neither was a valid digestion setup. Raw private recordings
  remain retained; no classification came from them.
- Corrected wraith recording reached a gulp which passed through the unsolid
  target, then a bite killed it. This did not test wraith digestion/growth.
- Corrected green-slime recording did not establish monster combat coverage.
- The first corrected nurse recording ended around the worm's first bite.
  Extending the same public input sequence reached actual digestion. The full
  extended recording is included byte-for-byte as public-witness.session.json.
- Initial direct-state test expected final HP to equal final maximum HP and
  failed: nurse result=2, hp=120, max=121; control result=2, hp=32, max=121.
  It also inherited an invalid rn2(1)=1 fixture answer. Neither the failed
  expectation nor that invalid fixture was classified as a divergence or a
  negative. The corrected fixture uses rn2(1)=0, pins the complete draw bounds,
  and agrees with compiled C. The C source explains why growth can leave a
  one-point deficit after nurse healing.
