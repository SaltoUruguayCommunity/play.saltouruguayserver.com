import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { games, builds, releases, audit } from '@/db/schema';
import { HttpError } from './http';

/**
 * El desarrollador elige qué versión está en producción.
 * - Si el juego ya está publicado, promover = release en vivo.
 * - Si aún no está publicado, promover = marcar la candidata (activeBuildId)
 *   que se pondrá en vivo cuando el admin apruebe el juego.
 * Un admin nunca elige versiones de juegos ajenos: solo aprueba/suspende el juego.
 * Un admin que es dueño del juego conserva los permisos de desarrollador sobre ese juego.
 */
export async function publishVersion(gameId: string, buildId: string, actorId: string, action: 'publish' | 'rollback') {
  return db().transaction(async tx => {
    const [game] = await tx.select().from(games).where(eq(games.id, gameId)).for('update');
    if (!game || game.ownerId !== actorId) throw new HttpError(404, 'not_found');
    if (game.type !== 'hosted') throw new HttpError(409, 'game_not_hosted');
    if (game.status === 'suspended') throw new HttpError(409, 'game_suspended');
    const [build] = await tx.select().from(builds).where(and(eq(builds.id, buildId), eq(builds.gameId, gameId))).for('update');
    // Aceptar estados legacy (review/approved) para builds subidas con el flujo anterior.
    if (!build || !['ready', 'review', 'approved'].includes(build.status) || !build.artifactId) throw new HttpError(409, 'build_not_ready', 'Elegí una versión lista para producción.');
    if (game.activeBuildId === build.id && game.status === 'published') return;
    if (action === 'rollback' && game.status !== 'published') throw new HttpError(409, 'game_not_published');
    if (action === 'rollback') {
      const [previous] = await tx.select({ id: releases.id }).from(releases).where(and(eq(releases.gameId, gameId), eq(releases.buildId, buildId))).limit(1);
      if (!previous) throw new HttpError(409, 'not_a_previous_release', 'Solo podés restaurar una versión que ya estuvo en producción.');
    }
    // Juego aún no publicado: solo se marca la candidata elegida por el dev.
    if (game.status !== 'published') {
      await tx.update(games).set({ activeBuildId: build.id, updatedAt: new Date() }).where(eq(games.id, gameId));
      await tx.insert(audit).values({ actorId, action: 'build.candidate', targetId: build.id });
      return;
    }
    await tx.update(games).set({ activeBuildId: build.id, updatedAt: new Date() }).where(eq(games.id, gameId));
    await tx.insert(releases).values({ gameId, fromBuildId: game.activeBuildId, buildId, actorId, action });
    await tx.insert(audit).values({ actorId, action: 'build.' + action, targetId: build.id });
  });
}
