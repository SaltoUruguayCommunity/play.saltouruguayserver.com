import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { achievements, unlocks, saves, clients } from '@/db/schema';
import { authenticateGame, scopeCheck } from '@/lib/game-auth';
import { failure, HttpError, json } from '@/lib/http';
import { runtimeOrigin } from '@/lib/runtime';
import { appUrl } from '@/lib/security';
const slotSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
export const ALL: APIRoute = async ({ request, params }) => {
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': request.headers.get('origin') || '', 'Access-Control-Allow-Methods': 'GET, POST, PUT', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match', 'Access-Control-Expose-Headers': 'ETag', 'Access-Control-Max-Age': '600', Vary: 'Origin' } });
  try {
    const { token, player, game } = await authenticateGame(request);
    const origin = request.headers.get('origin');
    const validOrigins = [new URL(appUrl()).origin, runtimeOrigin(game.id)];
    if (token.clientId) { const [client] = await db().select().from(clients).where(eq(clients.id, token.clientId)); if (client) validOrigins.push(...client.redirectUris.map(uri => new URL(uri).origin)); }
    if (origin && !validOrigins.includes(origin)) throw new HttpError(403, 'origin_denied');
    if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers['Access-Control-Expose-Headers'] = 'ETag'; }
    const path = params.path || '';
    if (path === 'me' && request.method === 'GET') { scopeCheck(token.scopes, 'profile:read'); return json({ id: player.id, displayName: player.displayName, avatar: player.avatar }, 200, headers); }
    if (path === 'me/saltotag' && request.method === 'GET') { scopeCheck(token.scopes, 'saltotag:read'); return json({ id: player.id, tag: player.tag, displayName: player.displayName }, 200, headers); }
    if (path === 'achievements' && request.method === 'GET') { scopeCheck(token.scopes, 'achievements:read'); const rows = await db().select({ achievement: achievements, unlockedAt: unlocks.createdAt }).from(achievements).leftJoin(unlocks, and(eq(unlocks.achievementId, achievements.id), eq(unlocks.playerId, player.id))).where(eq(achievements.gameId, game.id)); return json(rows.map(r => ({ ...r.achievement, unlockedAt: r.unlockedAt })), 200, headers); }
    if (path === 'achievements/unlock' && request.method === 'POST') {
      scopeCheck(token.scopes, 'achievements:write');
      const { key } = z.object({ key: z.string().min(1).max(80) }).parse(await request.json());
      const [achievement] = await db().select().from(achievements).where(and(eq(achievements.gameId, game.id), eq(achievements.key, key)));
      if (!achievement) throw new HttpError(404, 'achievement_not_found');
      if (achievement.verified) throw new HttpError(403, 'server_verification_required');
      const rows = await db().insert(unlocks).values({ playerId: player.id, achievementId: achievement.id }).onConflictDoNothing().returning();
      // Client-reported achievements never award global XP.
      return json({ key, unlocked: true, newlyUnlocked: rows.length > 0, xp: 0, gameTitle: game.title, achievement: { key: achievement.key, title: achievement.title, description: achievement.description } }, 200, headers);
    }
    if (path.startsWith('saves/')) {
      const slot = slotSchema.parse(path.slice(6));
      const where = and(eq(saves.playerId, player.id), eq(saves.gameId, game.id), eq(saves.slot, slot));
      if (request.method === 'GET') { scopeCheck(token.scopes, 'saves:read'); const [row] = await db().select().from(saves).where(where); if (!row) return json({ data: null, version: 0 }, 200, { ...headers, ETag: '"0"' }); return json({ data: row.data, version: row.version }, 200, { ...headers, ETag: `"${row.version}"` }); }
      if (request.method === 'PUT') {
        scopeCheck(token.scopes, 'saves:write'); const body = await request.text(); if (Buffer.byteLength(body) > 64 * 1024) throw new HttpError(413, 'save_too_large');
        const data = z.object({ data: z.unknown(), version: z.number().int().min(0) }).parse(JSON.parse(body));
        let row;
        if (data.version === 0) [row] = await db().insert(saves).values({ playerId: player.id, gameId: game.id, slot, data: data.data, version: 1 }).onConflictDoNothing().returning();
        else [row] = await db().update(saves).set({ data: data.data, version: sql`${saves.version} + 1`, updatedAt: new Date() }).where(and(where, eq(saves.version, data.version))).returning();
        if (!row) throw new HttpError(409, 'save_conflict', 'El guardado cambió. Volvé a leerlo antes de guardar.');
        return json({ version: row.version }, 200, { ...headers, ETag: `"${row.version}"` });
      }
    }
    throw new HttpError(404, 'endpoint_not_found');
  } catch (e) { const response = failure(e); Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v)); return response; }
};
