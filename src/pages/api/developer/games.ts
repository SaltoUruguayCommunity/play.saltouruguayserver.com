import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '@/db';
import { games } from '@/db/schema';
import { failure, formObject, json, requirePlayer } from '@/lib/http';
const schema = z.object({ title: z.string().min(2).max(80), slug: z.string().min(3).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), description: z.string().min(20).max(3000), genre: z.enum(['Arcade', 'Cartas', 'Casual', 'Aventura', 'Puzzle', 'Estrategia', 'Multijugador']), type: z.enum(['hosted', 'external']) });
export const POST: APIRoute = async ({ request, locals }) => { try { const player = requirePlayer(locals.player); const data = schema.parse(await formObject(request)); const [game] = await db().insert(games).values({ ...data, ownerId: player.id }).onConflictDoNothing({ target: games.slug }).returning(); if (!game) return json({ message: 'Ese identificador ya está en uso.' }, 409); return json({ id: game.id }, 201); } catch (e) { return failure(e); } };
