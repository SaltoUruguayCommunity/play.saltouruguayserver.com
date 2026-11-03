import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { games, builds, gameMedia } from '@/db/schema';
import { cloudStorage, putObject, sourceKey, MAX_ZIP_BYTES, MAX_IMAGE_BYTES } from '@/lib/object-storage';
import { failure, requirePlayer, HttpError, json } from '@/lib/http';
export const PUT: APIRoute = async ({ request, locals, params, url }) => {
 try {
  if (cloudStorage() || process.env.VERCEL) throw new HttpError(404, 'not_found');
  const actor = requirePlayer(locals.player), gameId = z.uuid().parse(params.id), id = z.uuid().parse(params.uploadId);
  const [game] = await db().select().from(games).where(and(eq(games.id, gameId), eq(games.ownerId, actor.id)));
  if (!game || game.status === 'suspended') throw new HttpError(404, 'not_found');
  const table = url.searchParams.get('kind') === 'build' ? builds : gameMedia;
  const [row] = await db().select().from(table).where(and(eq(table.id, id), eq(table.gameId, gameId)));
  if (!row || row.status !== 'awaiting_upload' || row.createdAt.getTime() < Date.now() - 15 * 60_000) throw new HttpError(409, 'upload_expired');
  const max = table === builds ? MAX_ZIP_BYTES : MAX_IMAGE_BYTES;
  const reader = request.body?.getReader(); if (!reader) throw new HttpError(400, 'missing_file');
  const parts: Uint8Array[] = []; let size = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > max || size > row.sourceBytes) { await reader.cancel(); throw new HttpError(413, 'file_too_large'); } parts.push(value); }
  if (size !== row.sourceBytes) throw new HttpError(400, 'size_mismatch');
  await putObject(sourceKey(gameId, id), Buffer.concat(parts), request.headers.get('content-type') || 'application/octet-stream');
  return json({ ok: true });
 } catch (error) { return failure(error); }
};
