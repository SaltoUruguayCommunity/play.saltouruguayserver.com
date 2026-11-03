import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { games, builds, gameMedia } from '@/db/schema';
import { admin } from '@/lib/security';
import { failure, requirePlayer, HttpError, json } from '@/lib/http';
export const GET: APIRoute = async ({ locals, params }) => { try {
 const actor = requirePlayer(locals.player), id = z.uuid().parse(params.id);
 const [game] = await db().select().from(games).where(eq(games.id, id));
 if (!game || (game.ownerId !== actor.id && !admin(actor))) throw new HttpError(404, 'not_found');
 const rows = await Promise.all([db().select({ id: builds.id, status: builds.status }).from(builds).where(eq(builds.gameId, id)), db().select({ id: gameMedia.id, status: gameMedia.status }).from(gameMedia).where(eq(gameMedia.gameId, id))]);
 return json(rows.flat());
} catch (error) { return failure(error); } };
