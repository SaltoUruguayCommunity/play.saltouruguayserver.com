import { db, databaseConfigured } from '@/db';
import { communityServers } from '@/db/schema';
import { z } from 'zod';
import { safeWebUrl } from './security';
export type CommunityServer = Omit<typeof communityServers.$inferSelect, 'createdAt' | 'updatedAt'>;
// Confirmed by the site owner. Administrators can override or hide this entry.
const defaults: CommunityServer[] = [{
  id: '7fb8159c-8396-40e7-b212-4516a93b874d', title: 'RUSTico 7', game: 'Rust',
  description: 'La comunidad se encuentra en RUSTico 7. Sumate al Discord para conocer cómo participar y seguir las novedades de la serie.',
  state: 'active', address: null, version: null,
  joinUrl: 'https://discord.gg/XwHSRRwnzS', joinLabel: 'Entrar a Discord',
  accessNote: 'Información y acceso en Discord', cover: null, visible: true, position: 0,
}];
export const serverStateLabels: Record<CommunityServer['state'], string> = { active: 'Serie activa', upcoming: 'Próximamente', maintenance: 'En mantenimiento', ended: 'Finalizada' };
export async function listServers(includeHidden = false): Promise<CommunityServer[]> {
  const stored: CommunityServer[] = databaseConfigured() ? await db().select().from(communityServers) : [];
  const merged = new Map(defaults.map(server => [server.id, server]));
  for (const server of stored) merged.set(server.id, server);
  return [...merged.values()].filter(s => includeHidden || (s.visible && s.state !== 'ended')).sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, 'es'));
}
export function safeJoinUrl(value: string) {
  if (safeWebUrl(value)) return true;
  try {
    const url = new URL(value);
    return ['minecraft:', 'steam:', 'fivem:', 'saltoplay:', 'saltouruguayserver:'].includes(url.protocol) && !url.username && !url.password && !/[\x00-\x20\x7f]/.test(value);
  } catch { return false; }
}
const optionalText = (max: number) => z.string().trim().max(max).optional().transform(v => v || null);
export const serverFormSchema = z.object({
  id: z.uuid().optional(), title: z.string().trim().min(2).max(100), game: z.string().trim().min(2).max(60),
  description: z.string().trim().min(10).max(1500), state: z.enum(['active', 'upcoming', 'maintenance', 'ended']),
  address: optionalText(255).refine(v => !v || /^(?:[a-zA-Z0-9.-]+|\[[0-9a-fA-F:]+\])(?::\d{1,5})?$/.test(v), 'La dirección debe ser un host o IP, con puerto opcional.'),
  version: optionalText(80), joinUrl: optionalText(1000).refine(v => !v || safeJoinUrl(v), 'Usá HTTPS o un protocolo compatible: minecraft, steam, fivem, saltoplay o saltouruguayserver.'),
  joinLabel: z.string().trim().min(2).max(45), accessNote: optionalText(180),
  cover: optionalText(1000).refine(v => !v || safeWebUrl(v) || (v.startsWith('/') && !v.startsWith('//') && !/[\\\x00-\x20\x7f]/.test(v)), 'Usá una imagen HTTPS o una ruta local.'),
  visible: z.string().optional().transform(v => v === 'on'), position: z.coerce.number().int().min(0).max(999),
}).refine(v => v.state !== 'active' || Boolean(v.address || v.joinUrl), { message: 'Una serie activa debe tener una dirección o un enlace de acceso.', path: ['joinUrl'] });
