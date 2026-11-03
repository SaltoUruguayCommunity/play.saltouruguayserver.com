import type { APIRoute } from 'astro';
import { asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { clients, games } from '@/db/schema';
import { failure, json } from '@/lib/http';
import { safeWebUrl, scopes } from '@/lib/security';

export const GET: APIRoute = async () => {
  try {
    const published = await db().select().from(games).where(eq(games.status, 'published')).orderBy(asc(games.title)).limit(100);
    const publicClients = await db().select().from(clients).where(isNull(clients.secretHash)).orderBy(asc(clients.id));
    return json({ games: published.flatMap(game => {
      const client = publicClients.find(c => c.gameId === game.id && game.url && safeWebUrl(game.url) && c.redirectUris.some(uri => new URL(uri).origin === new URL(game.url!).origin) && c.scopes.some(scope => (scopes as readonly string[]).includes(scope)));
      if (game.type === 'hosted' ? !game.activeBuildId : !client) return [];
      return [{ id: game.id, title: game.title, description: game.description, genre: game.genre, cover: game.cover, type: game.type, clientId: game.type === 'external' ? client!.id : null }];
    }) });
  } catch (error) { return failure(error); }
};
