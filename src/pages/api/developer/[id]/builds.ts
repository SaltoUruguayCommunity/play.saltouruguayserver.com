import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { games, builds, audit } from '@/db/schema';
import { admin } from '@/lib/security';
import { createPreviewToken } from '@/lib/hosted-preview';
import { runtimeOrigin } from '@/lib/runtime';
import { publishVersion } from '@/lib/releases';
import { headObject, sourceKey } from '@/lib/object-storage';
import { dispatchBuild } from '@/lib/build-dispatch';
import { failure, requirePlayer, HttpError, json } from '@/lib/http';
export const POST: APIRoute = async ({ request, locals, params }) => {
  try {
    const actor = requirePlayer(locals.player), gameId = z.uuid().parse(params.id);
    const { buildId, action } = z.object({ buildId: z.uuid(), action: z.enum(['review', 'publish', 'rollback', 'preview', 'retry', 'discard']) }).parse(await request.json());
    const [game] = await db().select().from(games).where(eq(games.id, gameId));
    const privileged = admin(actor);
    if (!game || (!privileged && game.ownerId !== actor.id)) throw new HttpError(404, 'not_found');
    const [build] = await db().select().from(builds).where(and(eq(builds.id, buildId), eq(builds.gameId, gameId)));
    if (!build) throw new HttpError(404, 'not_found');
    if (action === 'preview') {
      if (!['ready', 'review', 'approved'].includes(build.status) || !build.artifactId) throw new HttpError(409, 'build_not_ready');
      return json({ url: runtimeOrigin(gameId) + '/_preview/' + createPreviewToken(gameId, buildId) + '/' + buildId + '/index.html' });
    }
    // Solo el desarrollador dueño elige qué versión está en producción.
    // Un admin que también es dueño actúa como desarrollador de su propio juego;
    // un admin que no es dueño no puede elegir la versión.
    if (game.ownerId !== actor.id) {
      if (privileged) throw new HttpError(403, 'forbidden', 'La versión en producción la elige el desarrollador.');
      throw new HttpError(404, 'not_found');
    }
    if (game.status === 'suspended') throw new HttpError(409, 'game_suspended');
    if (action === 'publish' || action === 'rollback') { await publishVersion(gameId, buildId, actor.id, action); return json({ ok: true }); }
    if (action === 'retry') {
      if (build.status !== 'failed') throw new HttpError(409, 'invalid_transition');
      await headObject(sourceKey(gameId, buildId));
      await db().update(builds).set({ status: 'queued', error: null, updatedAt: new Date() }).where(and(eq(builds.id, buildId), eq(builds.status, 'failed')));
      const result = await dispatchBuild(gameId, buildId, build.sourceBytes);
      return json({ ok: true, ...result }, result.mode === 'background' ? 202 : 200);
    }
    if (action === 'discard') {
      if (!['failed', 'awaiting_upload'].includes(build.status)) throw new HttpError(409, 'invalid_transition');
      await db().delete(builds).where(and(eq(builds.id, buildId), eq(builds.status, build.status)));
      return json({ ok: true });
    }
    // review: el dev envía el juego a revisión marcando esta build como candidata.
    if (action === 'review') {
      if (build.status !== 'ready') throw new HttpError(409, 'invalid_transition');
      await db().transaction(async tx => {
        const [lockedGame] = await tx.select().from(games).where(eq(games.id, gameId)).for('update');
        if (!lockedGame || lockedGame.status === 'suspended') throw new HttpError(409, 'game_suspended');
        const rows = await tx.update(builds).set({ status: 'review' }).where(and(eq(builds.id, buildId), eq(builds.status, 'ready'))).returning({ id: builds.id });
        if (!rows.length) throw new HttpError(409, 'invalid_transition');
        await tx.update(games).set({ status: 'review', activeBuildId: buildId }).where(and(eq(games.id, gameId), eq(games.status, 'draft')));
        await tx.insert(audit).values({ actorId: actor.id, action: 'game.submitted', targetId: gameId });
      });
      return json({ ok: true });
    }
    throw new HttpError(409, 'invalid_transition');
  } catch (error) { return failure(error); }
};
