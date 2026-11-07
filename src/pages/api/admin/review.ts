import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { games, builds, audit, tokens, refreshTokens } from '@/db/schema';
import { admin } from '@/lib/security';
import { failure, formObject, HttpError, requirePlayer } from '@/lib/http';

// El admin aprueba o suspende JUEGOS. Nunca elige versiones:
// la candidata en producción la define el desarrollador (activeBuildId).
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  try {
    const actor = requirePlayer(locals.player); if (!admin(actor)) throw new HttpError(403, 'forbidden');
    const data = z.object({ gameId: z.uuid(), decision: z.enum(['publish', 'draft', 'suspend']) }).parse(await formObject(request));
    const [game] = await db().select().from(games).where(eq(games.id, data.gameId)); if (!game) throw new HttpError(404, 'not_found');
    if (data.decision === 'publish') {
      if (!['review', 'published', 'suspended'].includes(game.status)) throw new HttpError(409, 'invalid_transition');
      if (game.type === 'hosted') {
        if (!game.activeBuildId) throw new HttpError(409, 'build_required', 'El desarrollador todavía no eligió una versión para producción.');
        const [candidate] = await db().select().from(builds).where(and(eq(builds.id, game.activeBuildId), eq(builds.gameId, game.id)));
        if (!candidate || !['ready', 'review', 'approved'].includes(candidate.status) || !candidate.artifactId) throw new HttpError(409, 'invalid_build', 'La versión elegida por el desarrollador no está lista.');
      }
      await db().transaction(async tx => {
        await tx.update(games).set({ status: 'published', updatedAt: new Date() }).where(eq(games.id, game.id));
        await tx.insert(audit).values({ actorId: actor.id, action: 'game.publish', targetId: game.id });
      });
    } else {
      if (data.decision === 'draft' && game.status === 'draft') throw new HttpError(409, 'invalid_transition');
      if (data.decision === 'suspend' && game.status === 'suspended') throw new HttpError(409, 'invalid_transition');
      await db().transaction(async tx => {
        await tx.update(games).set({ status: data.decision === 'draft' ? 'draft' : 'suspended', updatedAt: new Date() }).where(eq(games.id, game.id));
        await tx.delete(tokens).where(eq(tokens.gameId, game.id)); await tx.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.gameId, game.id));
        await tx.insert(audit).values({ actorId: actor.id, action: 'game.' + data.decision, targetId: game.id });
      });
    }
    return redirect('/admin?saved=1');
  } catch (error) { return failure(error); }
};
