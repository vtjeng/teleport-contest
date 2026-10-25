// Shared browser/publication contract. One packet owns every displayed field.
export const DASHBOARD_PACKET_VERSION = 1;
const SHA = /^[a-f0-9]{40}$/u;

export function validateDashboardPacket(packet) {
  if (!packet || packet.schemaVersion !== DASHBOARD_PACKET_VERSION
    || !SHA.test(packet.sourceSha ?? '')
    || !Number.isFinite(Date.parse(packet.generatedAt))
    || !packet.data || typeof packet.data !== 'object'
    || !Array.isArray(packet.data.scoreHistory)
    || !Array.isArray(packet.data.progress)
    || !packet.data.scores || !packet.data.challenges || !packet.data.activity
    || !packet.queue || typeof packet.queue !== 'object'
    || !packet.trial || packet.trial.buildSha !== packet.sourceSha
    || !packet.trial.manifest || !packet.trial.register)
    throw new Error('Invalid dashboard data snapshot');
  return packet;
}
