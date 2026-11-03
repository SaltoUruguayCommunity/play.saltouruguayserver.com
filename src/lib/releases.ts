import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { games, builds, releases, audit } from '@/db/schema';
import { HttpError } from './http';
export async function publishVersion(gameId: string, buildId: string, actorId: string, isAdmin: boolean, action: 'publish' | 'rollback') {
  return db().transaction(async tx => {
    const [game] = await tx.select().from(games).where(eq(games.id, gameId)).for('update');
    if (!game || (!isAdmin && game.ownerId !== actorId)) throw new HttpError(404, 'not_found');
    if (game.type !== 'hosted' || (!isAdmin && game.status !== 'published')) throw new HttpError(409, 'game_not_published');
    const [build] = await tx.select().from(builds).where(and(eq(builds.id, buildId), eq(builds.gameId, gameId))).for('update');
    if (!build || build.status !== 'approved' || !build.artifactId) throw new HttpError(409, 'build_not_approved', 'Elegí una versión aprobada.');
    if (game.activeBuildId === build.id && game.status === 'published') return;
    if (action === 'rollback') {
      const [previous] = await tx.select({ id: releases.id }).from(releases).where(and(eq(releases.gameId, gameId), eq(releases.buildId, buildId))).limit(1);
      if (!previous) throw new HttpError(409, 'not_a_previous_release', 'Solo podés restaurar una versión publicada anteriormente.');
    }
    await tx.update(games).set({ status: 'published', activeBuildId: build.id, updatedAt: new Date() }).where(eq(games.id, gameId));
    await tx.insert(releases).values({ gameId, fromBuildId: game.activeBuildId, buildId, actorId, action });
    await tx.insert(audit).values({ actorId, action: 'build.' + action, targetId: build.id });
  });
}
