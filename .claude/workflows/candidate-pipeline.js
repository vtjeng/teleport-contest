export const meta = {
  name: 'candidate-pipeline',
  description: 'Prepare all pipeline candidates and select the next goal',
  phases: [
    { title: 'Prepare', detail: 'Cap stale sessions and trace witnesses for all candidates' },
    { title: 'Pipeline', detail: 'Look up a ready candidate' },
    { title: 'Inline', detail: 'Cap and witness when the pipeline missed' },
    { title: 'Report', detail: 'Write goal-context.json', model: 'sonnet' },
  ],
}

const QUEUED_SCHEMA = {
  type: 'object',
  properties: {
    hasQueuedGoal: { type: 'boolean' },
    queuedGoalId: { type: ['string', 'null'] },
    queuedGoalBoundary: { type: ['string', 'null'] },
    queuedGoalForecast: { type: ['number', 'null'] },
  },
  required: ['hasQueuedGoal', 'queuedGoalId', 'queuedGoalBoundary',
    'queuedGoalForecast'],
}

const PIPELINE_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    winner: {
      type: ['object', 'null'],
      properties: {
        member: { type: 'string' },
        id: { type: 'string' },
        cappedForecast: { type: 'number' },
        sessions: { type: 'array' },
        witnesses: { type: 'array' },
        detail: { type: ['string', 'null'] },
        owners: { type: ['array', 'null'] },
        boundary: { type: ['string', 'null'] },
      },
      required: ['member', 'id', 'cappedForecast', 'sessions'],
    },
    topCandidate: {
      type: ['object', 'null'],
      properties: {
        member: { type: 'string' },
        id: { type: 'string' },
        cappedForecast: { type: 'number' },
        sessions: { type: 'array' },
        witnesses: { type: 'array' },
        detail: { type: ['string', 'null'] },
        owners: { type: ['array', 'null'] },
        boundary: { type: ['string', 'null'] },
      },
      required: ['member', 'id', 'cappedForecast', 'sessions'],
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
  },
  required: ['needsCapping'],
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

const ADVANCE_SCHEMA = {
  type: 'object',
  properties: {
    total: { type: 'number' },
    ready: { type: 'number' },
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
    needsWitness: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          member: { type: 'string' },
          id: { type: 'string' },
          sessions: { type: 'array', items: { type: 'string' } },
          cappedForecast: { type: 'number' },
        },
        required: ['member', 'id', 'sessions', 'cappedForecast'],
      },
    },
  },
  required: ['total', 'ready', 'needsCapping', 'needsWitness'],
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
  required: ['winnerId', 'winnerBoundary', 'forecast', 'sessions',
    'candidatesWritten'],
}

// ── Shared: cap stale sessions ────────────────────────────────────────

const capStaleSessions = async (cappingEntries, phaseLabel) => {
  if (cappingEntries.length === 0) return
  log(`Capping ${cappingEntries.length} session(s)`)
  const capResults = await parallel(cappingEntries.map(entry => () =>
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
`, { schema: CAP_SCHEMA, label: `cap:${entry.session}`, phase: phaseLabel, model: 'sonnet' })
  ))
  for (let i = 0; i < cappingEntries.length; ++i) {
    const expected = cappingEntries[i].session
    const result = capResults[i]
    if (!result?.persisted || result.session !== expected)
      throw new Error(`failed to persist cap for "${expected}"`)
  }
}

// ── Prepare mode: cap and witness all candidates ─────────────────────

if (args?.prepareOnly) {
  phase('Prepare')

  const adv = await agent(`
Run: \`node scripts/pipeline-candidates.mjs --needs-preparation\`
Return the full JSON output.
Do NOT read source files.
`, { schema: ADVANCE_SCHEMA, label: 'advance-report', model: 'sonnet' })

  if (adv.needsCapping.length === 0 && adv.needsWitness.length === 0) {
    log(`All ${adv.ready} candidates are ready`)
    return { prepared: true, ready: adv.ready, capped: 0, witnessed: 0 }
  }

  await capStaleSessions(adv.needsCapping, 'Prepare')

  let witnessed = 0
  if (adv.needsWitness.length > 0) {
    log(`Witnessing ${adv.needsWitness.length} candidate(s)`)
    await pipeline(adv.needsWitness, async (candidate) => {
      const witnessWork = candidate.sessions.map(session => () => agent(`
Trace the C-path witness for session "${session}" at its first stop.

Read \`.claude/agents/goal-selector.md\` step 5 for the witness method.

The session stops at boundary: "${candidate.member}"

Return session name and a detailed evidence string describing the C path.
`, { schema: WITNESS_SCHEMA, label: `witness:${session}`, phase: 'Prepare', model: 'sonnet' }))

      witnessWork.push(() => agent(`
Analyze the bounding property and size for a goal candidate.

Read \`.claude/agents/goal-selector.md\` step 6 for the bounding-analysis method.

Boundary: "${candidate.member}"

Return a boundary description, the C file owners array, and a detail string
with traced findings.
`, { schema: DETAIL_SCHEMA, label: `detail:${candidate.id}`, phase: 'Prepare', model: 'sonnet' }))

      const results = (await parallel(witnessWork)).filter(Boolean)

      const witnesses = results
        .filter(r => r.session)
        .map(r => ({ session: r.session, evidence: r.evidence }))
      const detailResult = results.find(r => r.detail)

      const metaPayload = JSON.stringify({
        member: candidate.member,
        id: candidate.id,
        witnesses,
        detail: detailResult?.detail ?? '',
        owners: detailResult?.owners ?? [],
        boundary: detailResult?.boundary ?? candidate.member,
      }, null, 2)
      await agent(`
Store candidate metadata by running this command:
\`\`\`bash
node scripts/pipeline-candidates.mjs --set-metadata << 'ENDJSON'
${metaPayload}
ENDJSON
\`\`\`
Return the JSON output.
`, { label: `store:${candidate.id}`, phase: 'Prepare', model: 'sonnet' })
      witnessed++
    })
  }

  log(`Prepared: ${adv.needsCapping.length} capped, ${witnessed} witnessed`)
  return {
    prepared: true,
    ready: adv.ready,
    capped: adv.needsCapping.length,
    witnessed,
  }
}

// ── Phase 1: Pipeline ─────────────────────────────────────────────────

phase('Pipeline')

const queue = await agent(`
Run: \`node scripts/goal-log.mjs --current --detail\`
If this shows a goal with status "queued" in the goals array, set hasQueuedGoal
to true and fill queuedGoalId, queuedGoalBoundary, queuedGoalForecast.
Otherwise set hasQueuedGoal to false and all fields to null.
Do NOT read any source files.
`, { schema: QUEUED_SCHEMA, label: 'queue-check', model: 'sonnet' })

if (queue.hasQueuedGoal) {
  log(`Queued goal: ${queue.queuedGoalId}`)
  return {
    winnerId: queue.queuedGoalId,
    boundary: queue.queuedGoalBoundary,
    forecast: queue.queuedGoalForecast,
    source: 'queue',
  }
}

const pipelineCheck = await agent(`
Run: \`node scripts/pipeline-candidates.mjs --ready-winner\`
Parse its JSON stdout. If "winner" is non-null, return it.
If "winner" is null, also return "topCandidate" from the output.
Do NOT read any source files.
`, { schema: PIPELINE_RESULT_SCHEMA, label: 'pipeline-check', model: 'sonnet' })

let winner = pipelineCheck.winner

if (!winner && !pipelineCheck.topCandidate) {
  log('all remaining candidates are blocked by session divergences')
  return { exhausted: true }
}

// ── Phase 2: Inline fallback (cap → reconcile → witness) ──────────────

if (!winner) {
  phase('Inline')
  log('pipeline miss: no witnessed candidate, falling back to inline work')

  // Find sessions needing caps.
  const nc = await agent(`
Run: \`node scripts/pipeline-candidates.mjs --needs-capping\`
Return the needsCapping array from the output.
Do NOT read source files.
`, { schema: NEEDS_CAPPING_SCHEMA, label: 'needs-capping', model: 'sonnet' })

  await capStaleSessions(nc.needsCapping, 'Inline')

  // Check for a winner after capping.
  const retry = await agent(`
Run: \`node scripts/pipeline-candidates.mjs --ready-winner\`
Return the full JSON: both "winner" and "topCandidate" fields.
Do NOT read source files.
`, { schema: PIPELINE_RESULT_SCHEMA, label: 'post-cap-check', model: 'sonnet' })

  // Use the witnessed winner if available; otherwise take the top candidate
  // (which is capped but not yet witnessed) and witness it inline.
  winner = retry.winner ?? retry.topCandidate

  if (!winner)
    throw new Error('no candidate with nonzero forecast after inline capping')

  // Trace witnesses for the winner if it lacks witnesses or detail.
  if (!winner.witnesses?.length || !winner.detail) {
    log(`Winner "${winner.id}" needs witness tracing`)

    const winnerSessions = winner.sessions.map(s =>
      typeof s === 'string' ? s : s.session)
    const witnessedSet = new Set(
      (winner.witnesses ?? []).map(w => w.session))
    const needWitness = winnerSessions.filter(s => !witnessedSet.has(s))

    const witnessWork = needWitness.map(session => () => agent(`
Trace the C-path witness for session "${session}" at its first stop.

Read \`.claude/agents/goal-selector.md\` step 5 for the witness method.

The session stops at boundary: "${winner.member}"

Return session name and a detailed evidence string describing the C path.
`, { schema: WITNESS_SCHEMA, label: `witness:${session}`, model: 'sonnet' }))

    if (!winner.detail) {
      witnessWork.push(() => agent(`
Analyze the bounding property and size for a goal candidate.

Read \`.claude/agents/goal-selector.md\` step 6 for the bounding-analysis method.

Boundary: "${winner.member}"

Return a boundary description, the C file owners array, and a detail string
with traced findings.
`, { schema: DETAIL_SCHEMA, label: 'bounding-analysis', model: 'sonnet' }))
    }

    const results = witnessWork.length > 0
      ? (await parallel(witnessWork)).filter(Boolean)
      : []

    const allWitnesses = {}
    for (const w of (winner.witnesses ?? [])) allWitnesses[w.session] = w.evidence
    for (const r of results) {
      if (r.session) allWitnesses[r.session] = r.evidence
    }
    winner.witnesses = Object.entries(allWitnesses)
      .map(([session, evidence]) => ({ session, evidence }))
    winner.detail = winner.detail
      || results.find(r => r.detail)?.detail || ''
    winner.owners = winner.owners
      || results.find(r => r.owners)?.owners || []
    winner.boundary = winner.boundary
      || results.find(r => r.boundary)?.boundary || winner.member
    // Persist the inline-produced metadata so the next --ready-winner finds it.
    const metaPayload = JSON.stringify({
      member: winner.member,
      id: winner.id,
      witnesses: winner.witnesses,
      detail: winner.detail,
      owners: winner.owners,
      boundary: winner.boundary,
    }, null, 2)
    await agent(`
Store candidate metadata by running this command:
\`\`\`bash
node scripts/pipeline-candidates.mjs --set-metadata << 'ENDJSON'
${metaPayload}
ENDJSON
\`\`\`
Return the JSON output.
`, { label: 'store-metadata', model: 'sonnet' })
  }
}

log(`Winner: "${winner.id}" (forecast ${winner.cappedForecast})`)

// ── Phase 3: Report ───────────────────────────────────────────────────

phase('Report')

const winnerSessions = winner.sessions.map(s =>
  typeof s === 'string' ? s : s.session)
const witnessEntries = (winner.witnesses ?? [])
  .map(w => `    {"session": ${JSON.stringify(w.session)}, "evidence": ${JSON.stringify(w.evidence)}}`)
  .join(',\n')

const report = await agent(`
Write the goal context file and report the winning goal.

Read .claude/agents/goal-selector.md "What to report" section for the JSON
format of the entry to write to .cache/goal-context.json.

Winner:
  member: ${JSON.stringify(winner.member)}
  id: ${JSON.stringify(winner.id)}
  boundary: ${JSON.stringify(winner.boundary)}
  owners: ${JSON.stringify(winner.owners)}
  forecast: ${winner.cappedForecast}
  sessions: ${JSON.stringify(winnerSessions)}
  witnesses:
${witnessEntries}
  detail: ${JSON.stringify(winner.detail)}

Steps:
1. Read .claude/agents/goal-selector.md "What to report" for the JSON schema
   (id, boundary, owners, forecastSteps, forecastBasis, sessions, witnesses,
   detail).
2. Write .cache/goal-context.json with the winner's entry as a single object.
3. Return winnerId, winnerBoundary, forecast, sessions, and
   candidatesWritten=true.

Do NOT modify any game files. Only write to .cache/.
`, { schema: REPORT_SCHEMA, label: 'report', model: 'sonnet' })

return report
