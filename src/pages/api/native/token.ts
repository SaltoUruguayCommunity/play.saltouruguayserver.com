import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { builds, clients, games, grants, tokens, refreshTokens } from '@/db/schema';
import { playerFromAccessToken } from '@/lib/identity';
import { failure, HttpError, json } from '@/lib/http';
import { hash, randomToken, safeWebUrl, scopes } from '@/lib/security';
import { runtimeOrigin } from '@/lib/runtime';

// Called by the native host, never by the embedded game. No portal session needed.
export const POST: APIRoute = async ({ request }) => {
  try {
    const accessToken = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!accessToken || accessToken.length > 8192) throw new HttpError(401, 'invalid_token');
    const input = z.object({ gameId: z.uuid(), clientId: z.uuid().optional(), consent: z.boolean().default(false) }).parse(await request.json());
    const player = await playerFromAccessToken(accessToken);
    const [game] = await db().select().from(games).where(and(eq(games.id, input.gameId), eq(games.status, 'published')));
    if (!game) throw new HttpError(404, 'game_unavailable');
    let requested: string[] = [...scopes];
    let clientId: string | null = null;
    let launchUrl: string;
    if (game.type === 'hosted') {
      const [build] = await db().select().from(builds).where(and(eq(builds.id, game.activeBuildId || '00000000-0000-0000-0000-000000000000'), eq(builds.gameId, game.id), eq(builds.status, 'approved')));
      if (!build?.artifactId) throw new HttpError(404, 'game_unavailable');
      launchUrl = `${runtimeOrigin(game.id)}/${build.id}/${build.entrypoint}`;
    } else {
      if (!input.clientId) throw new HttpError(400, 'client_id_required');
      const [client] = await db().select().from(clients).where(and(eq(clients.id, input.clientId), eq(clients.gameId, game.id)));
      // Native launch must not bypass confidential-client authentication.
      if (!client || client.secretHash) throw new HttpError(400, 'invalid_client');
      if (!game.url || !safeWebUrl(game.url) || !client.redirectUris.some(uri => new URL(uri).origin === new URL(game.url!).origin)) throw new HttpError(400, 'invalid_game_url');
      requested = client.scopes.filter(scope => (scopes as readonly string[]).includes(scope));
      if (!requested.length) throw new HttpError(400, 'invalid_scope');
      clientId = client.id;
      launchUrl = game.url;
    }
    const [grant] = await db().select().from(grants).where(and(eq(grants.playerId, player.id), eq(grants.gameId, game.id)));
    if (!input.consent && (!grant || requested.some(scope => !grant.scopes.includes(scope)))) {
      return json({ error: 'consent_required', game: { id: game.id, title: game.title }, scopes: requested }, 403);
    }
    const value = randomToken(), refresh = randomToken();
    await db().transaction(async tx => {
      if (!clientId) {
        // A stable public client per hosted game reuses SaltoPlay's independent
        // OAuth refresh rotation without coupling it to the main app session.
        const key = hash(`saltoplay:native:${game.id}`);
        clientId = `${key.slice(0, 8)}-${key.slice(8, 12)}-4${key.slice(13, 16)}-a${key.slice(17, 20)}-${key.slice(20, 32)}`;
        await tx.insert(clients).values({ id: clientId, gameId: game.id, name: 'SaltoPlay Native', scopes: requested, redirectUris: [runtimeOrigin(game.id) + '/native-callback'] }).onConflictDoNothing();
      }
      if (input.consent) {
        await tx.insert(grants).values({ playerId: player.id, gameId: game.id, scopes: requested }).onConflictDoUpdate({ target: [grants.playerId, grants.gameId], set: { scopes: requested, updatedAt: new Date() } });
      }
      await tx.insert(tokens).values({ hash: hash(value), playerId: player.id, gameId: game.id, clientId, buildId: game.type === 'hosted' ? game.activeBuildId : null, scopes: requested, expiresAt: new Date(Date.now() + 3600_000) });
      await tx.insert(refreshTokens).values({ hash: hash(refresh), accessHash: hash(value), family: crypto.randomUUID(), playerId: player.id, gameId: game.id, clientId: clientId!, scopes: requested, expiresAt: new Date(Date.now() + 30 * 86400_000) });
    });
    return json({ access_token: value, refresh_token: refresh, client_id: clientId, token_type: 'Bearer', expires_in: 3600, scope: requested.join(' '), launch_url: launchUrl });
  } catch (error) { return failure(error); }
};
