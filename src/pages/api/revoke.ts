import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { tokens, grants, codes, clients, refreshTokens } from '@/db/schema';
import { failure, formObject, requirePlayer } from '@/lib/http';
export const POST: APIRoute = async ({ locals, request, redirect }) => { try { const player = requirePlayer(locals.player); const { gameId } = z.object({ gameId: z.uuid() }).parse(await formObject(request)); await db().transaction(async tx => { await tx.delete(tokens).where(and(eq(tokens.playerId, player.id), eq(tokens.gameId, gameId))); await tx.update(refreshTokens).set({ revoked: true }).where(and(eq(refreshTokens.playerId, player.id), eq(refreshTokens.gameId, gameId))); await tx.delete(grants).where(and(eq(grants.playerId, player.id), eq(grants.gameId, gameId))); const gameClients = await tx.select().from(clients).where(eq(clients.gameId, gameId)); for (const client of gameClients) await tx.delete(codes).where(and(eq(codes.playerId, player.id), eq(codes.clientId, client.id))); }); return redirect('/ajustes'); } catch (e) { return failure(e); } };
