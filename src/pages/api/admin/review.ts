import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { games, builds, audit, tokens, refreshTokens } from '@/db/schema';
import { admin } from '@/lib/security';
import { failure, formObject, HttpError, requirePlayer } from '@/lib/http';
import { publishVersion } from '@/lib/releases';
export const POST: APIRoute = async ({ request, locals, redirect }) => {
 try {
  const actor = requirePlayer(locals.player); if (!admin(actor)) throw new HttpError(403, 'forbidden');
  const data = z.object({ gameId: z.uuid(), buildId: z.union([z.uuid(), z.literal('')]).optional(), decision: z.enum(['publish', 'draft', 'suspend']) }).parse(await formObject(request));
  const [game] = await db().select().from(games).where(eq(games.id, data.gameId)); if (!game) throw new HttpError(404, 'not_found');
  if (data.decision === 'publish' && game.type === 'hosted') {
   const buildId = z.uuid().parse(data.buildId);
   await db().transaction(async tx => {
    await tx.select({ id: games.id }).from(games).where(eq(games.id, game.id)).for('update');
    const [build] = await tx.select().from(builds).where(and(eq(builds.id, buildId), eq(builds.gameId, game.id))).for('update');
    if (!build || !['review', 'approved'].includes(build.status) || !build.artifactId) throw new HttpError(409, 'invalid_build');
    await tx.update(builds).set({ status: 'approved', updatedAt: new Date() }).where(eq(builds.id, build.id));
    await tx.insert(audit).values({ actorId: actor.id, action: 'build.approve', targetId: build.id });
   });
   await publishVersion(game.id, buildId, actor.id, true, 'publish');
  } else {
   if (data.decision === 'publish' && !['review', 'published'].includes(game.status)) throw new HttpError(409, 'invalid_transition');
   await db().transaction(async tx => {
    await tx.update(games).set({ status: data.decision === 'publish' ? 'published' : data.decision === 'draft' ? 'draft' : 'suspended', updatedAt: new Date() }).where(eq(games.id, game.id));
    if (data.decision !== 'publish') { await tx.delete(tokens).where(eq(tokens.gameId, game.id)); await tx.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.gameId, game.id)); }
    await tx.insert(audit).values({ actorId: actor.id, action: 'game.' + data.decision, targetId: game.id });
   });
  }
  return redirect('/admin?saved=1');
 } catch (error) { return failure(error); }
};
