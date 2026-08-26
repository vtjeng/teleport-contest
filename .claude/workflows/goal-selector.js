export const meta = {
  name: 'goal-selector',
  description: 'Select the next goal using capped ranking with delegated capping and witness tracing',
  phases: [
    { title: 'Scan', detail: 'Census and capped ranking' },
    { title: 'Cap', detail: 'Classify non-stable sessions', model: 'sonnet' },
    { title: 'Witness', detail: 'C-path witnesses and bounding analysis', model: 'sonnet' },
    { title: 'Report', detail: 'Write candidates file and report winner', model: 'sonnet' },
  ],
}

const SCAN_SCHEMA = {
  type: 'object',
  properties: {
    hasQueuedGoal: { type: 'boolean' },
    queuedGoalId: { type: ['string', 'null'] },
    queuedGoalBoundary: { type: ['string', 'null'] },
    queuedGoalForecast: { type: ['number', 'null'] },
    winner: {
      type: ['object', 'null'],
      properties: {
        member: { type: 'string' },
        cappedForecast: { type: 'number' },
        sessions: { type: 'array' },
        tentative: { type: 'boolean' },
      },
    },
    ranking: { type: ['array', 'null'] },
    needsCapping: { type: 'array', items: { type: 'string' } },
    allStable: { type: 'boolean' },
  },
  required: ['hasQueuedGoal', 'allStable'],
}

const CAP_SCHEMA = {
  type: 'object',
  properties: {
    session: { type: 'string' },
    cappedStretch: { type: 'number' },
    reason: { type: 'string' },
    persisted: { type: 'boolean' },
  },
  required: ['session', 'cappedStretch', 'reason', 'persisted'],
}

const RERANK_SCHEMA = {
  type: 'object',
  properties: {
    winner: {
      type: 'object',
      properties: {
        member: { type: 'string' },
        cappedForecast: { type: 'number' },
        sessions: { type: 'array' },
        tentative: { type: 'boolean' },
      },
    },
    ranking: { type: 'array' },
    allStable: { type: 'boolean' },
  },
  required: ['winner', 'ranking', 'allStable'],
}

const CACHE_CHECK_SCHEMA = {
  type: 'object',
  properties: {
    winnerCached: { type: 'boolean' },
    cachedWitnesses: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    sessionsNeedingWitness: {
      type: 'array',
      items: { type: 'string' },
    },
    cachedDetail: { type: ['string', 'null'] },
    cachedOwners: {
      type: ['array', 'null'],
      items: { type: 'string' },
    },
    cachedBoundary: { type: ['string', 'null'] },
  },
  required: ['winnerCached', 'cachedWitnesses', 'sessionsNeedingWitness'],
}

const WITNESS_SCHEMA = {
  type: 'object',
  properties: {
    session: { type: 'string' },
    evidence: { type: 'string' },
  },
  required: ['session', 'evidence'],
}

const DETAIL_SCHEMA = {
  type: 'object',
  properties: {
    boundary: { type: 'string' },
    owners: { type: 'array', items: { type: 'string' } },
    detail: { type: 'string' },
  },
  required: ['boundary', 'owners', 'detail'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    winnerId: { type: 'string' },
    winnerBoundary: { type: 'string' },
    forecast: { type: 'number' },
    sessions: { type: 'array', items: { type: 'string' } },
    candidatesWritten: { type: 'boolean' },
  },
  required: ['winnerId', 'winnerBoundary', 'forecast', 'sessions', 'candidatesWritten'],
}

// ── Phase 1: Scan ──────────────────────────────────────────────────────

phase('Scan')
const scan = await agent(`
Run two commands and return structured results.

Step 1: Run \`node scripts/goal-log.mjs --current --detail\`
If this shows a goal with status "queued" in the goals array, set hasQueuedGoal
to true and fill queuedGoalId, queuedGoalBoundary, queuedGoalForecast from
that goal. Set winner, ranking, needsCapping to null/empty, allStable to true.

Step 2: If no queued goal, run:
\`node scripts/scan-sessions.mjs --capped-ranking --write-cache\`
Parse its JSON stdout. Set hasQueuedGoal to false and fill winner, ranking,
needsCapping, allStable from the parsed output.

Do NOT read any source files. Only run the two commands above.
`, { schema: SCAN_SCHEMA, label: 'scan', model: 'sonnet' })

if (scan.hasQueuedGoal) {
  log(`Queued goal: ${scan.queuedGoalId}`)
  return {
    winnerId: scan.queuedGoalId,
    boundary: scan.queuedGoalBoundary,
    forecast: scan.queuedGoalForecast,
    source: 'queue',
  }
}

let winner = scan.winner
let ranking = scan.ranking

// ── Phase 2: Cap (conditional) ─────────────────────────────────────────

if (!scan.allStable && scan.needsCapping.length > 0) {
  phase('Cap')
  log(`${scan.needsCapping.length} session(s) need capping`)

  const sessionBehaviors = {}
  for (const c of ranking) {
    for (const s of c.sessions) {
      if (!s.capStable && !s.divergenceZeroed) {
        sessionBehaviors[s.session] = c.member
      }
    }
  }

  await parallel(scan.needsCapping.map(session => () =>
    agent(`
Cap the look-ahead stretch for session "${session}".

Read \`.claude/agents/goal-selector.md\` step 3 for the capping method.

The session stops at boundary: "${sessionBehaviors[session]}"

To read the ahead stream:
  node scripts/scan-sessions.mjs --read-cache --ahead="${sessionBehaviors[session]}"
Find the lines for session "${session}".

Persist the result:
  node scripts/scan-sessions.mjs --set-cap=${session}=<n>

Return session, cappedStretch, reason, and persisted (true if --set-cap succeeded).
Do NOT read C source files.
`, { schema: CAP_SCHEMA, label: `cap:${session}`, model: 'sonnet' })
  ))

  const rerank = await agent(`
Run: node scripts/scan-sessions.mjs --capped-ranking --read-cache
Parse the JSON stdout. Return winner, ranking, and allStable.
Do NOT read source files.
`, { schema: RERANK_SCHEMA, label: 'rerank', model: 'sonnet' })

  winner = rerank.winner
  ranking = rerank.ranking
  log(`After capping: winner is "${winner.member}" (forecast ${winner.cappedForecast})`)
}

log(`Winner: "${winner.member}" (forecast ${winner.cappedForecast})`)

// ── Phase 3: Witnesses and detail ──────────────────────────────────────

phase('Witness')

const winnerSessions = winner.sessions.map(s =>
  typeof s === 'string' ? s : s.session
)
const winnerMember = winner.member

const cache = await agent(`
Check the cache for reusable witnesses and detail for the winning candidate.

Read \`.claude/agents/goal-selector.md\` steps 5–6 for the cache-reuse rules.

Winner member string: "${winnerMember}"
Winner sessions: ${JSON.stringify(winnerSessions)}

Check .cache/selector-candidates.json and .cache/session-frontiers.json.
Return winnerCached, cachedWitnesses, sessionsNeedingWitness, cachedDetail,
cachedOwners, cachedBoundary.

Do NOT read C source files.
`, { schema: CACHE_CHECK_SCHEMA, label: 'cache-check', model: 'sonnet' })

const witnessWork = []

for (const session of (cache.sessionsNeedingWitness || [])) {
  witnessWork.push(() => agent(`
Trace the C-path witness for session "${session}" at its first stop.

Read \`.claude/agents/goal-selector.md\` step 5 for the witness method.

The session stops at boundary: "${winnerMember}"

Return session name and a detailed evidence string describing the C path.
`, { schema: WITNESS_SCHEMA, label: `witness:${session}`, model: 'sonnet' }))
}

if (!cache.winnerCached) {
  witnessWork.push(() => agent(`
Analyze the bounding property and size for a goal candidate.

Read \`.claude/agents/goal-selector.md\` step 6 for the bounding-analysis method.

Boundary: "${winnerMember}"

Return a boundary description, the C file owners array, and a detail string
with traced findings.
`, { schema: DETAIL_SCHEMA, label: 'bounding-analysis', model: 'sonnet' }))
}

const witnessResults = witnessWork.length > 0
  ? (await parallel(witnessWork)).filter(Boolean)
  : []

const allWitnesses = Object.assign({}, cache.cachedWitnesses || {})
for (const r of witnessResults) {
  if (r.session) allWitnesses[r.session] = r.evidence
}

const detail = cache.cachedDetail
  || witnessResults.find(r => r.detail)?.detail
  || ''
const owners = cache.cachedOwners
  || witnessResults.find(r => r.owners)?.owners
  || []
const boundary = cache.cachedBoundary
  || witnessResults.find(r => r.boundary)?.boundary
  || winnerMember

// ── Phase 4: Report ────────────────────────────────────────────────────

phase('Report')

const witnessEntries = Object.entries(allWitnesses)
  .map(([s, e]) => `    {"session": ${JSON.stringify(s)}, "evidence": ${JSON.stringify(e)}}`)
  .join(',\n')

const report = await agent(`
Write the selector-candidates.json cache and report the winning goal.

Read .claude/agents/goal-selector.md "What to report" section for the JSON format.

Winner:
  member: ${JSON.stringify(winnerMember)}
  boundary: ${JSON.stringify(boundary)}
  owners: ${JSON.stringify(owners)}
  forecast: ${winner.cappedForecast}
  sessions: ${JSON.stringify(winnerSessions)}
  witnesses:
${witnessEntries}
  detail: ${JSON.stringify(detail)}

Full ranking (${ranking.length} candidates):
${JSON.stringify(ranking.map(c => ({ member: c.member, cappedForecast: c.cappedForecast, sessions: c.sessions })), null, 2)}

Steps:
1. Read .claude/agents/goal-selector.md "What to report" for the exact JSON
   schema of each candidate entry (id, boundary, owners, forecastSteps, etc.).
2. Build the full candidates array from the ranking. For the winner, use the
   provided witnesses and detail. For other candidates, use the data from the
   ranking (set witnesses and detail to empty if not traced).
3. Write .cache/selector-candidates.json with the array, ordered by capped
   forecast descending.
4. Return winnerId (kebab-case), winnerBoundary, forecast, sessions, and
   candidatesWritten=true.

Do NOT modify any game files. Only write to .cache/.
`, { schema: REPORT_SCHEMA, label: 'report', model: 'sonnet' })

return report
