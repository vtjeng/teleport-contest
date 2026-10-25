import {validateDashboardPacket} from './dashboard-packet.mjs';

export const DASHBOARD_DATA_URL = 'https://raw.githubusercontent.com/vtjeng/teleport-contest/main/dashboard-data.json.gz';
const STALE_AFTER_MS = 60 * 60 * 1000;

export async function fetchDashboardPacket(fetcher = fetch, now = Date.now()) {
  // Raw GitHub files allow cross-origin reads but advertise a five-minute CDN
  // cache. The query and no-store request make a deliberate refresh observable.
  const url = new URL(DASHBOARD_DATA_URL);
  url.searchParams.set('at', String(now));
  const response = await fetcher(url, {cache: 'no-store'});
  if (!response.ok) throw new Error(`Dashboard data HTTP ${response.status}`);
  const stream = response.body?.pipeThrough(new DecompressionStream('gzip'));
  if (!stream) throw new Error('Compressed dashboard data is unavailable');
  return validateDashboardPacket(JSON.parse(await new Response(stream).text()));
}

export async function loadDashboardSnapshot(fetcher = fetch, now = Date.now()) {
  const status = document.getElementById('dashboardDataStatus');
  status.textContent = 'Loading dashboard data…';
  try {
    const packet = await fetchDashboardPacket(fetcher, now);
    const age = now - Date.parse(packet.generatedAt);
    const link = document.createElement('a');
    link.href = `https://github.com/vtjeng/teleport-contest/commit/${packet.sourceSha}`;
    link.textContent = packet.sourceSha.slice(0, 12);
    status.textContent = age > STALE_AFTER_MS
      ? 'Dashboard data may be stale. Captured ' + packet.generatedAt + ' from '
      : 'Dashboard data captured ' + packet.generatedAt + ' from ';
    status.append(link);
    return packet;
  } catch (error) {
    status.textContent = `Dashboard data unavailable: ${error.message}. Reload to retry.`;
    throw error;
  }
}
