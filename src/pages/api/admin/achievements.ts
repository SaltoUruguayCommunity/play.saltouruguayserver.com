import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { achievements, unlocks, players, games, audit } from '@/db/schema';
import { admin } from '@/lib/security';
import { failure, formObject, HttpError, requirePlayer } from '@/lib/http';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  try {
    const actor = requirePlayer(locals.player);
    if (!admin(actor)) throw new HttpError(403, 'forbidden');
    const form = await formObject(request);
    const action = z.enum(['configure', 'award']).parse(form.action);
    const id = z.uuid().parse(form.achievementId);
    await db().transaction(async tx => {
      const [row] = await tx.select({ achievement: achievements, game: games }).from(achievements).innerJoin(games, eq(games.id, achievements.gameId)).where(eq(achievements.id, id)).for('update');
      if (!row) throw new HttpError(404, 'achievement_not_found');
      if (action === 'configure') {
        const score = z.coerce.number().int().min(0).max(1000).parse(form.score);
        const verified = form.verified === 'on';
        if (verified && score === 0) throw new HttpError(400, 'score_required', 'Un logro puntuable necesita entre 1 y 1000 puntos.');
        await tx.update(achievements).set({ verified, score: verified ? score : 0, updatedAt: new Date() }).where(eq(achievements.id, id));
        await tx.insert(audit).values({ actorId: actor.id, action: 'achievement.scoring_configured', targetId: id });
        return;
      }
      if (!row.achievement.verified || row.achievement.score <= 0) throw new HttpError(409, 'achievement_not_verified', 'Configurá y verificá este logro antes de otorgarlo.');
      if (row.game.status !== 'published') throw new HttpError(409, 'game_not_published');
      const tag = z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,30}$/).parse(form.tag);
      const [player] = await tx.select().from(players).where(eq(players.tag, tag));
      if (!player) throw new HttpError(404, 'player_not_found', 'No encontramos ese SaltoTag.');
      let [award] = await tx.insert(unlocks).values({ playerId: player.id, achievementId: id, scoreAwarded: row.achievement.score }).onConflictDoNothing().returning();
      // An explicitly reviewed casual unlock can be promoted once; existing points stay fixed.
      if (!award) [award] = await tx.update(unlocks).set({ scoreAwarded: row.achievement.score }).where(and(eq(unlocks.playerId, player.id), eq(unlocks.achievementId, id), eq(unlocks.scoreAwarded, 0))).returning();
      if (award) await tx.insert(audit).values({ actorId: actor.id, action: 'achievement.verified_award', targetId: award.id });
    });
    return redirect('/admin/logros?saved=1');
  } catch (error) { return failure(error); }
};
