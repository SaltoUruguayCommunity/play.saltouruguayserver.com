import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { games, builds, gameMedia } from '@/db/schema';
import { headObject, sourceKey } from '@/lib/object-storage';
import { failure, requirePlayer, HttpError, json } from '@/lib/http';
export const POST: APIRoute = async ({ request, locals, params }) => {
 try {
  const actor = requirePlayer(locals.player), gameId = z.uuid().parse(params.id);
  const { id, kind } = z.object({ id: z.uuid(), kind: z.enum(['build', 'media']) }).parse(await request.json());
  const [game] = await db().select().from(games).where(and(eq(games.id, gameId), eq(games.ownerId, actor.id)));
  if (!game || game.status === 'suspended') throw new HttpError(404, 'not_found');
  const table = kind === 'build' ? builds : gameMedia;
  const [row] = await db().select().from(table).where(and(eq(table.id, id), eq(table.gameId, gameId)));
  if (!row) throw new HttpError(404, 'not_found');
  if (row.status !== 'awaiting_upload') return json({ ok: true, status: row.status });
  if (row.createdAt.getTime() < Date.now() - 15 * 60_000) throw new HttpError(409, 'upload_expired', 'La reserva de subida venció. Creá otra subida.');
  const stored = await headObject(sourceKey(gameId, id));
  if (stored.bytes !== row.sourceBytes) throw new HttpError(400, 'size_mismatch');
  await db().update(table).set({ status: 'queued', updatedAt: new Date() }).where(and(eq(table.id, id), eq(table.status, 'awaiting_upload')));
  return json({ ok: true, status: 'queued' }, 202);
 } catch (error) { return failure(error); }
};
