import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { games, builds, audit, tokens, refreshTokens } from '@/db/schema';
import { admin } from '@/lib/security';
import { failure, formObject, HttpError, requirePlayer } from '@/lib/http';
import { publishBuild } from '@/lib/hosted-storage';
export const POST: APIRoute = async ({ request, locals, redirect }) => { try {
  const player = requirePlayer(locals.player); if (!admin(player)) throw new HttpError(403, 'forbidden');
  const data = z.object({ gameId: z.uuid(), buildId: z.union([z.uuid(), z.literal('')]).optional(), decision: z.enum(['publish', 'draft', 'suspend']) }).parse(await formObject(request));
  const [game] = await db().select().from(games).where(eq(games.id, data.gameId)); if (!game) throw new HttpError(404, 'not_found');
  let buildId: string | null = game.activeBuildId;
  if (data.decision === 'publish') {
    if (!['review', 'published'].includes(game.status)) throw new HttpError(409, 'invalid_transition');
    if (game.type === 'hosted') { const [build] = await db().select().from(builds).where(and(eq(builds.id, data.buildId || ''), eq(builds.gameId, game.id))); if (!build || !['review', 'published'].includes(build.status)) throw new HttpError(400, 'invalid_build'); buildId = build.id; await publishBuild(game.id, build.id); }
  }
  await db().transaction(async tx => {
    await tx.update(games).set({ status: data.decision === 'publish' ? 'published' : data.decision === 'draft' ? 'draft' : 'suspended', activeBuildId: buildId, updatedAt: new Date() }).where(eq(games.id, game.id));
    if (data.decision === 'publish' && buildId) await tx.update(builds).set({ status: 'published' }).where(eq(builds.id, buildId));
    if (data.decision === 'draft') await tx.update(builds).set({ status: 'uploaded' }).where(and(eq(builds.gameId, game.id), eq(builds.status, 'review')));
    await tx.delete(tokens).where(eq(tokens.gameId, game.id)); await tx.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.gameId, game.id));
    await tx.insert(audit).values({ actorId: player.id, action: `game.${data.decision}`, targetId: game.id });
  });
  return redirect('/admin?saved=1');
} catch (e) { return failure(e); } };
