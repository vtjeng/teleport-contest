export const meta = {
  name: 'candidate-pipeline',
  description: 'Prepare all pipeline candidates: cap stale sessions, trace witnesses, store metadata',
  phases: [
    { title: 'Prepare', detail: 'Cap stale sessions and trace witnesses for all candidates' },
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

// ── Cap stale sessions ───────────────────────────────────────────────

const capStaleSessions = async (cappingEntries) => {
  if (cappingEntries.length === 0) return
  log(`Capping ${cappingEntries.length} session(s)`)
  const capResults = await parallel(cappingEntries.map(entry => () =>
    agent(`
Cap the look-ahead stretch for session "${entry.session}".

Read \`.claude/agents/candidate-pipeline.md\` for the capping method.

The session stops at boundary: "${entry.boundary}"

To read the ahead stream:
  node scripts/scan-sessions.mjs --ahead="${entry.boundary}"
Find the lines for session "${entry.session}".

Persist the result:
  node scripts/scan-sessions.mjs --set-cap=${entry.session}=<n>

Return session, cappedStretch, reason, and persisted (true if --set-cap succeeded).
Do NOT read C source files.
`, { schema: CAP_SCHEMA, label: `cap:${entry.session}`, phase: 'Prepare', model: 'sonnet' })
  ))
  for (let i = 0; i < cappingEntries.length; ++i) {
    const expected = cappingEntries[i].session
    const result = capResults[i]
    if (!result?.persisted || result.session !== expected)
      throw new Error(`failed to persist cap for "${expected}"`)
  }
}

// ── Prepare: cap and witness all candidates ──────────────────────────

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

await capStaleSessions(adv.needsCapping)

let witnessed = 0
if (adv.needsWitness.length > 0) {
  log(`Witnessing ${adv.needsWitness.length} candidate(s)`)
  await pipeline(adv.needsWitness, async (candidate) => {
    const witnessWork = candidate.sessions.map(session => () => agent(`
Trace the C-path witness for session "${session}" at its first stop.

Read \`.claude/agents/candidate-pipeline.md\` for the witness method.

The session stops at boundary: "${candidate.member}"

Return session name and a detailed evidence string describing the C path.
`, { schema: WITNESS_SCHEMA, label: `witness:${session}`, phase: 'Prepare', model: 'sonnet' }))

    witnessWork.push(() => agent(`
Analyze the bounding property and size for a goal candidate.

Read \`.claude/agents/candidate-pipeline.md\` for the bounding-analysis method.

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
