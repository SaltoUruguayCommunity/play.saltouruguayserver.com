import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '@/db';
import { games } from '@/db/schema';
import { failure, formObject, HttpError, json, requirePlayer } from '@/lib/http';
import { gameSlug } from '@/lib/game-slug';
const schema = z.object({ title: z.string().trim().min(2).max(80), description: z.string().min(20).max(3000), genre: z.enum(['Arcade', 'Cartas', 'Casual', 'Aventura', 'Puzzle', 'Estrategia', 'Multijugador']), type: z.enum(['hosted', 'external']) });
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const player = requirePlayer(locals.player);
    const data = schema.parse(await formObject(request));
    // The unique constraint reserves the slug atomically, including concurrent submissions.
    for (let attempt = 1; attempt <= 1000; attempt++) {
      const slug = gameSlug(data.title, attempt);
      const [game] = await db().insert(games).values({ ...data, slug, ownerId: player.id })
        .onConflictDoNothing({ target: games.slug }).returning();
      if (game) return json({ id: game.id, slug: game.slug }, 201);
    }
    throw new HttpError(409, 'slug_unavailable', 'No pudimos asignar un identificador disponible. Probá con otro nombre.');
  } catch (e) { return failure(e); }
};
