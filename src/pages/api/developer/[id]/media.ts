import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { games, gameMedia } from '@/db/schema';
import { mediaUrl } from '@/lib/runtime';
import { deleteObject, sourceKey } from '@/lib/object-storage';
import { processMediaInline } from '@/lib/media-process';
import { failure, requirePlayer, HttpError, json } from '@/lib/http';
export const POST: APIRoute = async ({ request, locals, params }) => {
 try {
  const actor = requirePlayer(locals.player), gameId = z.uuid().parse(params.id);
  const { id, action } = z.object({ id: z.uuid(), action: z.enum(['select', 'remove', 'retry']) }).parse(await request.json());
  let artifact: string | null = null;
  let retry: { kind: 'icon' | 'banner' | 'screenshot'; sourceBytes: number } | null = null;
  await db().transaction(async tx => {
   const [game] = await tx.select().from(games).where(and(eq(games.id, gameId), eq(games.ownerId, actor.id))).for('update');
   if (!game || game.status === 'suspended') throw new HttpError(404, 'not_found');
   const [media] = await tx.select().from(gameMedia).where(and(eq(gameMedia.id, id), eq(gameMedia.gameId, gameId))).for('update');
   if (!media) throw new HttpError(404, 'not_found');
   const url = mediaUrl(gameId, id, media.artifactKey);
   if (action === 'retry') {
    if (media.status !== 'failed') throw new HttpError(409, 'invalid_transition');
    retry = { kind: media.kind, sourceBytes: media.sourceBytes };
    return;
   }
   if (action === 'remove') {
    if (['queued', 'processing'].includes(media.status)) throw new HttpError(409, 'media_processing');
    await tx.update(games).set({ icon: game.icon === url ? null : game.icon, cover: game.cover === url ? null : game.cover, screenshots: game.screenshots.filter(value => value !== url), updatedAt: new Date() }).where(eq(games.id, gameId));
    artifact = media.artifactKey;
    await tx.delete(gameMedia).where(eq(gameMedia.id, id)); return;
   }
   if (media.status !== 'ready') throw new HttpError(409, 'media_not_ready');
   if (media.kind === 'screenshot' && !game.screenshots.includes(url) && game.screenshots.length >= 8) throw new HttpError(409, 'screenshot_limit', 'Podés mostrar hasta 8 capturas.');
   await tx.update(games).set({ ...(media.kind === 'icon' ? { icon: url } : media.kind === 'banner' ? { cover: url } : { screenshots: [...new Set([...game.screenshots, url])] }), updatedAt: new Date() }).where(eq(games.id, gameId));
  });
  if (action === 'remove') { await deleteObject(sourceKey(gameId, id)).catch(() => {}); if (artifact) await deleteObject(artifact).catch(() => {}); }
  if (retry) {
   const result = await processMediaInline(gameId, id, retry.kind, retry.sourceBytes);
   return json({ ok: true, status: result.status, ...(result.error ? { error: result.error } : {}) }, result.status === 'ready' ? 200 : 422);
  }
  return json({ ok: true });
 } catch (error) { return failure(error); }
};
