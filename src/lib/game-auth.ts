import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { tokens, games, players, sessions } from '@/db/schema';
import { hash } from './security';
import { HttpError } from './http';
export async function authenticateGame(request: Request) {
  const value = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!value) throw new HttpError(401, 'invalid_token');
  const [row] = await db().select({ token: tokens, game: games, player: players }).from(tokens).innerJoin(games, eq(games.id, tokens.gameId)).innerJoin(players, eq(players.id, tokens.playerId)).where(and(eq(tokens.hash, hash(value)), gt(tokens.expiresAt, new Date()), eq(games.status, 'published'))).limit(1);
  if (!row) throw new HttpError(401, 'invalid_token');
  if (row.token.buildId && row.token.buildId !== row.game.activeBuildId) throw new HttpError(401, 'build_changed');
  if (row.token.sessionHash) { const [session] = await db().select().from(sessions).where(and(eq(sessions.id, row.token.sessionHash), gt(sessions.expiresAt, new Date()))); if (!session || session.playerId !== row.player.id) throw new HttpError(401, 'session_expired'); }
  return row;
}
export function scopeCheck(available: string[], required: string) { if (!available.includes(required)) throw new HttpError(403, 'insufficient_scope'); }
