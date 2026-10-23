export const bridgeMethods = ['player.getProfile', 'player.getSaltoTag', 'achievements.list', 'achievements.requestUnlock', 'saves.get', 'saves.set', 'session.get', 'ui.notify', 'ui.achievement', 'ui.configure', 'ui.dismissAll'] as const;
export function validHandshake(event: { origin: string; source: unknown; data: unknown }, expectedOrigin: string, expectedSource: unknown) {
  const data = event.data as Record<string, unknown> | null;
  return event.origin === expectedOrigin && event.source === expectedSource && data?.type === 'saltoplay:ready' && data?.version === 1;
}
export function validRpc(data: unknown): data is { id: string; method: typeof bridgeMethods[number]; params?: Record<string, unknown> } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  try { return typeof d.id === 'string' && d.id.length > 0 && d.id.length <= 80 && typeof d.method === 'string' && (bridgeMethods as readonly string[]).includes(d.method) && (d.params === undefined || (d.params !== null && typeof d.params === 'object' && !Array.isArray(d.params))) && JSON.stringify(data).length <= 70000; } catch { return false; }
}
