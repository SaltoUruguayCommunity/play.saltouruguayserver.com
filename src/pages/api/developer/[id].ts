import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { games, clients, achievements, builds, audit } from '@/db/schema';
import { failure, formObject, HttpError, json, requirePlayer } from '@/lib/http';
import { hash, scopes, safeWebUrl } from '@/lib/security';
export const POST: APIRoute = async ({ params, locals, request }) => { try {
  const player = requirePlayer(locals.player); const id = z.uuid().parse(params.id);
  const [game] = await db().select().from(games).where(and(eq(games.id, id), eq(games.ownerId, player.id)));
  if (!game) throw new HttpError(404, 'not_found');
  const form = await formObject(request); const action = z.enum(['update', 'achievement', 'client', 'review']).parse(form.action);
  if (action === 'update') {
    if (game.status !== 'draft') throw new HttpError(409, 'game_locked', 'Solo se pueden editar los borradores.');
    const data = z.object({ title: z.string().min(2).max(80), description: z.string().min(20).max(3000), url: z.string().max(1000).optional() }).parse(form);
    if (game.type === 'external' && (!data.url || !safeWebUrl(data.url))) throw new HttpError(400, 'invalid_url', 'Usá una dirección HTTPS válida.');
    await db().update(games).set({ title: data.title, description: data.description, url: game.type === 'external' ? data.url : null, updatedAt: new Date() }).where(eq(games.id, id));
  }
  if (action === 'achievement') {
    if (game.status !== 'draft') throw new HttpError(409, 'game_locked');
    const data = z.object({ key: z.string().regex(/^[a-z0-9-]{2,80}$/), title: z.string().min(2).max(80), description: z.string().min(3).max(300) }).parse(form);
    const [inserted] = await db().insert(achievements).values({ ...data, gameId: id, xp: 0 }).onConflictDoNothing().returning(); if (!inserted) throw new HttpError(409, 'duplicate_key', 'Esa clave ya existe.');
  }
  if (action === 'client') {
    const data = z.object({ name: z.string().min(2).max(80), redirectUri: z.url(), kind: z.enum(['public', 'confidential']) }).parse(form);
    const uri = new URL(data.redirectUri); if ((!safeWebUrl(data.redirectUri) && !(uri.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(uri.hostname))) || uri.hash) throw new HttpError(400, 'invalid_redirect_uri');
    const secret = data.kind === 'confidential' ? crypto.randomUUID() + crypto.randomUUID() : null;
    const [client] = await db().insert(clients).values({ gameId: id, name: data.name, redirectUris: [data.redirectUri], scopes: [...scopes], secretHash: secret ? hash(secret) : null }).returning();
    await db().insert(audit).values({ actorId: player.id, action: 'client.created', targetId: client.id });
    return json({ ok: true, clientId: client.id, secret });
  }
  if (action === 'review') {
    if (game.status !== 'draft') throw new HttpError(409, 'invalid_transition');
    if (game.type === 'external' && (!game.url || !safeWebUrl(game.url))) throw new HttpError(400, 'url_required', 'Configurá la URL del juego antes de enviarlo.');
    if (game.type === 'hosted') { const ready = await db().select().from(builds).where(and(eq(builds.gameId, id), eq(builds.status, 'uploaded'))); if (!ready.length) throw new HttpError(400, 'build_required', 'Subí una distribución web antes de enviarlo.'); }
    await db().transaction(async tx => { await tx.update(games).set({ status: 'review', updatedAt: new Date() }).where(eq(games.id, id)); await tx.update(builds).set({ status: 'review' }).where(and(eq(builds.gameId, id), eq(builds.status, 'uploaded'))); await tx.insert(audit).values({ actorId: player.id, action: 'game.submitted', targetId: id }); });
  }
  return json({ ok: true });
} catch (e) { return failure(e); } };
