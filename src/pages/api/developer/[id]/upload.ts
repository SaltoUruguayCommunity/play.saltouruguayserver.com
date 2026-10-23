import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { games, builds } from '@/db/schema';
import { failure, requirePlayer, HttpError, json } from '@/lib/http';
import { unpack } from '@/lib/archive';
import { storeBuild } from '@/lib/hosted-storage';
import { hash } from '@/lib/security';
export const POST: APIRoute = async ({ locals, request, params }) => { try {
  const player = requirePlayer(locals.player); const id = z.uuid().parse(params.id);
  const [game] = await db().select().from(games).where(and(eq(games.id, id), eq(games.ownerId, player.id), eq(games.type, 'hosted'), eq(games.status, 'draft'))); if (!game) throw new HttpError(404, 'not_found');
  const existing = await db().select({ id: builds.id }).from(builds).where(eq(builds.gameId, id)); if (existing.length >= 10) throw new HttpError(429, 'build_limit', 'Límite inicial: 10 distribuciones por juego.');
  const reader = request.body?.getReader(); if (!reader) throw new HttpError(400, 'missing_file'); const chunks: Uint8Array[] = []; let total = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; total += value.byteLength; if (total > 26 * 1024 * 1024) { await reader.cancel(); throw new HttpError(413, 'package_too_large'); } chunks.push(value); }
  const parsed = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData();
  const file = parsed.get('package'); if (!(file instanceof File) || !file.name.endsWith('.zip')) throw new HttpError(400, 'zip_required');
  const buffer = Buffer.from(await file.arrayBuffer());
  let files: Map<string, Buffer>; try { files = await unpack(buffer); } catch (e) { throw new HttpError(400, 'invalid_package', e instanceof Error ? e.message : 'Paquete inválido.'); }
  const buildId = crypto.randomUUID(); await storeBuild(id, buildId, files);
  await db().insert(builds).values({ id: buildId, gameId: id, digest: hash(buffer.toString('base64')), bytes: [...files.values()].reduce((n, b) => n + b.length, 0), fileCount: files.size });
  return json({ id: buildId, files: files.size }, 201);
} catch (e) { return failure(e); } };
