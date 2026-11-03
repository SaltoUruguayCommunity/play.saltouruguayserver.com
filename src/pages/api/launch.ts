import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { games, builds, grants, tokens } from '@/db/schema';
import { failure, HttpError, json, requirePlayer } from '@/lib/http';
import { hash, randomToken } from '@/lib/security';
import { sessionCookie } from '@/lib/auth';
const hostedScopes = ['profile:read', 'saltotag:read', 'achievements:read', 'achievements:write', 'saves:read', 'saves:write'];
export const POST: APIRoute = async ({ locals, request, cookies }) => { try {
 const player = requirePlayer(locals.player);
 const data = z.object({ gameId: z.uuid(), buildId: z.uuid(), previousToken: z.string().min(20).max(100).optional(), consent: z.boolean().optional() }).parse(await request.json());
 const [game] = await db().select().from(games).where(and(eq(games.id, data.gameId), eq(games.status, 'published'), eq(games.type, 'hosted')));
 if (!game?.activeBuildId) throw new HttpError(404, 'game_unavailable');
 const cookie = cookies.get(sessionCookie)?.value; if (!cookie) throw new HttpError(401, 'login_required');
 if (data.buildId !== game.activeBuildId) {
  const previous = data.previousToken && !data.consent ? await db().select({ id: tokens.hash }).from(tokens).where(and(eq(tokens.hash, hash(data.previousToken)), eq(tokens.gameId, game.id), eq(tokens.playerId, player.id), eq(tokens.buildId, data.buildId), eq(tokens.sessionHash, hash(cookie)))).limit(1) : [];
  if (!previous.length) throw new HttpError(409, 'build_changed', 'La versión publicada cambió. Recargá la página para empezar una partida nueva.');
 }
 const [build] = await db().select({ id: builds.id }).from(builds).where(and(eq(builds.id, data.buildId), eq(builds.gameId, game.id), eq(builds.status, 'approved')));
 if (!build) throw new HttpError(409, 'build_unavailable');
 const [grant] = await db().select().from(grants).where(and(eq(grants.gameId, game.id), eq(grants.playerId, player.id)));
 if (!data.consent && (!grant || hostedScopes.some(scope => !grant.scopes.includes(scope)))) throw new HttpError(403, 'consent_required');
 const value = randomToken();
 await db().transaction(async tx => {
  if (data.consent) await tx.insert(grants).values({ playerId: player.id, gameId: game.id, scopes: hostedScopes }).onConflictDoUpdate({ target: [grants.playerId, grants.gameId], set: { scopes: hostedScopes, updatedAt: new Date() } });
  await tx.insert(tokens).values({ hash: hash(value), playerId: player.id, gameId: game.id, sessionHash: hash(cookie), buildId: data.buildId, scopes: hostedScopes, expiresAt: new Date(Date.now() + 5 * 60_000) });
 });
 return json({ token: value, expiresIn: 300, buildId: data.buildId });
} catch (error) { return failure(error); } };
export const DELETE: APIRoute = async ({ locals, request }) => { try { const player = requirePlayer(locals.player); const data = z.object({ token: z.string().min(20).max(100) }).parse(await request.json()); await db().delete(tokens).where(and(eq(tokens.hash, hash(data.token)), eq(tokens.playerId, player.id))); return json({ ok: true }); } catch (error) { return failure(error); } };
