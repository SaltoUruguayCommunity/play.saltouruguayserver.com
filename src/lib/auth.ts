import type { AstroCookies } from 'astro';
import { and, eq, gt } from 'drizzle-orm';
import { db, databaseConfigured } from '@/db';
import { sessions, players } from '@/db/schema';
import { appUrl, hash, randomToken } from './security';
export const sessionCookie = 'saltoplay_session';
export const cookieOptions = () => ({ path: '/', httpOnly: true, sameSite: 'lax' as const, secure: appUrl().startsWith('https://') });
export async function getPlayer(cookies: AstroCookies) {
  const token = cookies.get(sessionCookie)?.value;
  if (!token || !databaseConfigured()) return null;
  const [row] = await db().select({ player: players }).from(sessions).innerJoin(players, eq(players.id, sessions.playerId)).where(and(eq(sessions.id, hash(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  return row?.player ?? null;
}
export async function createSession(playerId: string, cookies: AstroCookies) {
  const token = randomToken(); const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db().insert(sessions).values({ id: hash(token), playerId, expiresAt });
  cookies.set(sessionCookie, token, { ...cookieOptions(), expires: expiresAt });
}
