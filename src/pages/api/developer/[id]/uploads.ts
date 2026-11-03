import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { games, builds, gameMedia } from '@/db/schema';
import { failure, requirePlayer, HttpError, json } from '@/lib/http';
import { signedUpload, sourceKey, MAX_ZIP_BYTES, MAX_IMAGE_BYTES } from '@/lib/object-storage';
const input = z.object({ kind: z.enum(['build', 'icon', 'banner', 'screenshot']), size: z.number().int().positive(), contentType: z.string().max(100), version: z.string().trim().min(1).max(40).optional(), notes: z.string().max(2000).default(''), alt: z.string().max(150).default('') });
export const POST: APIRoute = async ({ request, locals, params }) => {
 try {
  const actor = requirePlayer(locals.player), gameId = z.uuid().parse(params.id), data = input.parse(await request.json());
  const isBuild = data.kind === 'build';
  if (data.size > (isBuild ? MAX_ZIP_BYTES : MAX_IMAGE_BYTES)) throw new HttpError(413, 'file_too_large');
  if (isBuild ? data.contentType !== 'application/zip' || !data.version : !['image/png', 'image/jpeg', 'image/webp'].includes(data.contentType)) throw new HttpError(400, 'invalid_file_type');
  const id = crypto.randomUUID();
  const url = await signedUpload(sourceKey(gameId, id), data.contentType, data.size);
  await db().transaction(async tx => {
   const [game] = await tx.select().from(games).where(and(eq(games.id, gameId), eq(games.ownerId, actor.id))).for('update');
   if (!game || game.status === 'suspended' || (isBuild && game.type !== 'hosted')) throw new HttpError(404, 'not_found');
   if (isBuild) {
    const existing = await tx.select({ id: builds.id }).from(builds).where(eq(builds.gameId, gameId));
    if (existing.length >= 30) throw new HttpError(429, 'build_limit', 'Límite: 30 versiones por juego.');
    await tx.insert(builds).values({ id, gameId, version: data.version!, notes: data.notes, sourceBytes: data.size });
   } else {
    const existing = await tx.select({ id: gameMedia.id }).from(gameMedia).where(eq(gameMedia.gameId, gameId));
    if (existing.length >= 40) throw new HttpError(429, 'media_limit', 'Quitá imágenes que ya no uses antes de subir otras.');
    await tx.insert(gameMedia).values({ id, gameId, kind: data.kind as 'icon' | 'banner' | 'screenshot', sourceBytes: data.size, contentType: data.contentType, alt: data.alt });
   }
  });
  return json({ id, kind: isBuild ? 'build' : 'media', url: url || `/api/developer/${gameId}/uploads/${id}/content?kind=${isBuild ? 'build' : 'media'}`, headers: { 'Content-Type': data.contentType }, completeUrl: `/api/developer/${gameId}/uploads/complete` }, 201);
 } catch (error) { return failure(error); }
};
