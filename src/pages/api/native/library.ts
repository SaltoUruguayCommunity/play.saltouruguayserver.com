import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { games, library } from '@/db/schema';
import { playerFromAccessToken } from '@/lib/identity';
import { failure, HttpError, json } from '@/lib/http';

async function authenticate(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 8192) throw new HttpError(401, 'invalid_token');
  return playerFromAccessToken(token);
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const player = await authenticate(request);
    const rows = await db().select({ gameId: library.gameId }).from(library).where(eq(library.playerId, player.id));
    return json({ gameIds: rows.map(row => row.gameId) });
  } catch (error) { return failure(error); }
};

const update: APIRoute = async ({ request }) => {
  try {
    const player = await authenticate(request);
    const { gameId } = z.object({ gameId: z.uuid() }).parse(await request.json());
    if (request.method === 'POST') {
      const [game] = await db().select({ id: games.id }).from(games).where(and(eq(games.id, gameId), eq(games.status, 'published')));
      if (!game) throw new HttpError(404, 'game_unavailable');
      await db().insert(library).values({ playerId: player.id, gameId }).onConflictDoNothing();
    } else {
      await db().delete(library).where(and(eq(library.playerId, player.id), eq(library.gameId, gameId)));
    }
    return json({ gameId, saved: request.method === 'POST' });
  } catch (error) { return failure(error); }
};

export const POST = update;
export const DELETE = update;
