export const meta = {
  name: 'goal-selector',
  description: 'Select the next goal with cap-stable preference and witness tracing',
  phases: [
    { title: 'Scan', detail: 'Census and winner selection' },
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
      required: ['member', 'cappedForecast', 'sessions', 'tentative'],
    },
    allStable: { type: 'boolean' },
    needsCapping: { type: 'number' },
  },
  required: [
    'hasQueuedGoal', 'queuedGoalId', 'queuedGoalBoundary',
    'queuedGoalForecast', 'winner', 'allStable', 'needsCapping',
  ],
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

const WINNER_SCHEMA = {
  type: 'object',
  properties: {
    winner: {
      type: ['object', 'null'],
      properties: {
        member: { type: 'string' },
        cappedForecast: { type: 'number' },
        sessions: { type: 'array' },
        tentative: { type: 'boolean' },
      },
      required: ['member', 'cappedForecast', 'sessions', 'tentative'],
    },
  },
  required: ['winner'],
}

const NEEDS_CAPPING_SCHEMA = {
  type: 'object',
  properties: {
    needsCapping: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          session: { type: 'string' },
          boundary: { type: 'string' },
        },
        required: ['session', 'boundary'],
      },
    },
    allStable: { type: 'boolean' },
  },
  required: ['needsCapping', 'allStable'],
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
that goal. Set winner to null, needsCapping to 0, allStable to true.

Step 2: If no queued goal, run:
\`node scripts/scan-sessions.mjs --winner\`
Parse its JSON stdout. Set hasQueuedGoal to false and fill winner, allStable,
needsCapping from the parsed output.

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

// ── Phase 2: Cap (conditional) ─────────────────────────────────────────
// The scan already prefers the top cap-stable candidate as the winner.
// Re-cap inline only when no cap-stable candidate has forecast > 0 (the
// winner is tentative).  The orchestrator runs background re-capping after
// the selector returns to refresh stale caps for the next selection.

if (!winner && scan.needsCapping > 0) {
  phase('Cap')
  log(`No cap-stable candidate with forecast > 0; `
    + `re-capping ${scan.needsCapping} session(s) inline`)

  const ncScan = await agent(`
Run: node scripts/scan-sessions.mjs --needs-capping
Parse its JSON stdout. Return needsCapping (array of {session, boundary}).
Do NOT read source files.
`, { schema: NEEDS_CAPPING_SCHEMA, label: 'needs-capping', model: 'sonnet' })

  const capResults = await parallel(ncScan.needsCapping.map(entry => () =>
    agent(`
Cap the look-ahead stretch for session "${entry.session}".

Read \`.claude/agents/goal-selector.md\` step 3 for the capping method.

The session stops at boundary: "${entry.boundary}"

To read the ahead stream:
  node scripts/scan-sessions.mjs --ahead="${entry.boundary}"
Find the lines for session "${entry.session}".

Persist the result:
  node scripts/scan-sessions.mjs --set-cap=${entry.session}=<n>

Return session, cappedStretch, reason, and persisted (true if --set-cap succeeded).
Do NOT read C source files.
`, { schema: CAP_SCHEMA, label: `cap:${entry.session}`, model: 'sonnet' })
  ))
  for (let index = 0; index < ncScan.needsCapping.length; ++index) {
    const expectedSession = ncScan.needsCapping[index].session
    const result = capResults[index]
    if (!result?.persisted || result.session !== expectedSession) {
      throw new Error(`failed to persist cap for session "${expectedSession}"`)
    }
  }

  const rerank = await agent(`
Run: node scripts/scan-sessions.mjs --winner
Parse the JSON stdout. Return the winner object.
Do NOT read source files.
`, { schema: WINNER_SCHEMA, label: 'rerank', model: 'sonnet' })

  winner = rerank.winner
  log(`After capping: winner is "${winner.member}" (forecast ${winner.cappedForecast})`)
} else if (!scan.allStable) {
  log(`Skipped re-capping: ${scan.needsCapping} stale session(s); `
    + `taking cap-stable "${winner.member}" (forecast ${winner.cappedForecast})`)
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

Check .cache/goal-context.json. If its boundary and sessions match the
winner, return its cached witnesses, detail, owners, and boundary.
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
Write the goal context file and report the winning goal.

Read .claude/agents/goal-selector.md "What to report" section for the JSON
format of the entry to write to .cache/goal-context.json.

Winner:
  member: ${JSON.stringify(winnerMember)}
  boundary: ${JSON.stringify(boundary)}
  owners: ${JSON.stringify(owners)}
  forecast: ${winner.cappedForecast}
  sessions: ${JSON.stringify(winnerSessions)}
  witnesses:
${witnessEntries}
  detail: ${JSON.stringify(detail)}

Steps:
1. Read .claude/agents/goal-selector.md "What to report" for the JSON schema
   (id, boundary, owners, forecastSteps, forecastBasis, sessions, witnesses,
   detail).
2. Write .cache/goal-context.json with the winner's entry as a single object.
3. Return winnerId (kebab-case), winnerBoundary, forecast, sessions, and
   candidatesWritten=true.

Do NOT modify any game files. Only write to .cache/.
`, { schema: REPORT_SCHEMA, label: 'report', model: 'sonnet' })

return report
