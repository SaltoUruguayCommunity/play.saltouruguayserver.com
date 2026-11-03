import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { players, audit } from '@/db/schema';
import { failure, formObject, requirePlayer, HttpError } from '@/lib/http';
import { canChangeSaltoTag, nextSaltoTagChange, formatSaltoTagDate } from '@/lib/saltotag';

const profileSchema = z.object({
  tag: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,30}$/).optional(),
  bio: z.string().max(300), publicProfile: z.string().optional(),
});
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  try {
    const player = requirePlayer(locals.player);
    const data = profileSchema.parse(await formObject(request));
    await db().transaction(async tx => {
      // Read and lock the latest row; a second concurrent rename must see the first one.
      const [current] = await tx.select().from(players).where(eq(players.id, player.id)).for('update');
      if (!current) throw new HttpError(404, 'player_not_found');
      const changed = data.tag !== undefined && data.tag !== current.tag;
      const now = new Date();
      if (changed && !canChangeSaltoTag(current.tagChangedAt, now)) {
        throw new HttpError(429, 'tag_cooldown', 'Podés volver a cambiar tu SaltoTag el ' + formatSaltoTagDate(nextSaltoTagChange(current.tagChangedAt)!) + '.');
      }
      await tx.update(players).set({
        bio: data.bio, publicProfile: data.publicProfile === 'on', updatedAt: now,
        ...(changed ? { tag: data.tag, tagChangedAt: now } : {}),
      }).where(eq(players.id, current.id));
      if (changed) await tx.insert(audit).values({ actorId: current.id, action: 'player.tag_changed', targetId: current.id });
    });
    return redirect('/ajustes?saved=1');
  } catch (error) {
    const pg = error as { code?: string; cause?: { code?: string } };
    if (pg.code === '23505' || pg.cause?.code === '23505') error = new HttpError(409, 'tag_taken', 'Ese SaltoTag ya está en uso.');
    if (!request.headers.get('accept')?.includes('application/json')) {
      const code = error instanceof HttpError && ['tag_cooldown', 'tag_taken'].includes(error.code) ? error.code : 'invalid_profile';
      return redirect('/ajustes?error=' + code);
    }
    return failure(error);
  }
};
