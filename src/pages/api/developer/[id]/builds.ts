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
import { failure, requirePlayer, HttpError, json } from '@/lib/http';
export const POST: APIRoute = async ({ request, locals, params }) => {
 try {
  const actor = requirePlayer(locals.player), gameId = z.uuid().parse(params.id);
  const { buildId, action } = z.object({ buildId: z.uuid(), action: z.enum(['review', 'approve', 'reject', 'publish', 'rollback', 'preview', 'retry', 'discard']) }).parse(await request.json());
  const [game] = await db().select().from(games).where(eq(games.id, gameId));
  const privileged = admin(actor);
  if (!game || (!privileged && game.ownerId !== actor.id)) throw new HttpError(404, 'not_found');
  const [build] = await db().select().from(builds).where(and(eq(builds.id, buildId), eq(builds.gameId, gameId)));
  if (!build) throw new HttpError(404, 'not_found');
  if (action === 'preview') {
   if (!['ready', 'review', 'approved'].includes(build.status) || !build.artifactId) throw new HttpError(409, 'build_not_ready');
   return json({ url: runtimeOrigin(gameId) + '/_preview/' + createPreviewToken(gameId, buildId) + '/' + buildId + '/index.html' });
  }
  if (game.status === 'suspended' && !privileged) throw new HttpError(409, 'game_suspended');
  if (action === 'publish' || action === 'rollback') { await publishVersion(gameId, buildId, actor.id, privileged, action); return json({ ok: true }); }
  if (action === 'retry') {
   if (build.status !== 'failed') throw new HttpError(409, 'invalid_transition');
   await headObject(sourceKey(gameId, buildId));
   await db().update(builds).set({ status: 'queued', error: null, updatedAt: new Date() }).where(and(eq(builds.id, buildId), eq(builds.status, 'failed')));
   return json({ ok: true });
  }
  if (action === 'discard') {
   if (!['failed', 'awaiting_upload'].includes(build.status)) throw new HttpError(409, 'invalid_transition');
   await db().delete(builds).where(and(eq(builds.id, buildId), eq(builds.status, build.status)));
   return json({ ok: true });
  }
  if ((action === 'approve' || action === 'reject') && !privileged) throw new HttpError(403, 'forbidden');
  const expected = action === 'review' ? 'ready' : 'review';
  const next = action === 'review' ? 'review' : action === 'approve' ? 'approved' : 'rejected';
  await db().transaction(async tx => {
   const [lockedGame] = await tx.select().from(games).where(eq(games.id, gameId)).for('update');
   if (!lockedGame || (lockedGame.status === 'suspended' && !privileged)) throw new HttpError(409, 'game_suspended');
   const rows = await tx.update(builds).set({ status: next, updatedAt: new Date() }).where(and(eq(builds.id, buildId), eq(builds.status, expected))).returning({ id: builds.id });
   if (!rows.length) throw new HttpError(409, 'invalid_transition');
   if (action === 'review') await tx.update(games).set({ status: 'review', updatedAt: new Date() }).where(and(eq(games.id, gameId), eq(games.status, 'draft')));
   await tx.insert(audit).values({ actorId: actor.id, action: 'build.' + action, targetId: buildId });
  });
  return json({ ok: true });
 } catch (error) { return failure(error); }
};
