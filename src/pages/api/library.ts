import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { games, library } from '@/db/schema';
import { failure, formObject, requirePlayer, HttpError } from '@/lib/http';
import { safeReturn } from '@/lib/security';
export const POST: APIRoute = async ({ locals, request, redirect }) => { if (!locals.player) return redirect('/acceso?returnTo=/biblioteca'); try { const player = requirePlayer(locals.player); const data = z.object({ gameId: z.string().uuid(), returnTo: z.string().optional() }).parse(await formObject(request)); const [game] = await db().select().from(games).where(and(eq(games.id, data.gameId), eq(games.status, 'published'))); if (!game) throw new HttpError(404, 'not_found'); await db().insert(library).values({ playerId: player.id, gameId: game.id }).onConflictDoNothing(); return redirect(safeReturn(data.returnTo || '/biblioteca')); } catch (e) { return failure(e); } };
