import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '@/db';
import { codes, grants } from '@/db/schema';
import { approvedClient, validateRedirect } from '@/lib/oauth';
import { hash, randomToken, scopes } from '@/lib/security';
import { failure, formObject, requirePlayer, HttpError } from '@/lib/http';
export const POST: APIRoute = async ({ locals, request, redirect }) => { try {
  const player = requirePlayer(locals.player);
  const data = z.object({ client_id: z.uuid(), redirect_uri: z.url(), response_type: z.literal('code'), code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code_challenge_method: z.literal('S256'), state: z.string().min(16).max(512), scope: z.string().max(500), decision: z.enum(['allow', 'deny']) }).parse(await formObject(request));
  const { client } = await approvedClient(data.client_id); validateRedirect(client.redirectUris, data.redirect_uri);
  const requested = [...new Set(data.scope.split(' ').filter(Boolean))];
  if (!requested.length || requested.some(s => !client.scopes.includes(s) || !(scopes as readonly string[]).includes(s))) throw new HttpError(400, 'invalid_scope');
  const target = new URL(data.redirect_uri); target.searchParams.set('state', data.state);
  if (data.decision === 'deny') { target.searchParams.set('error', 'access_denied'); return redirect(target.toString()); }
  const code = randomToken();
  await db().transaction(async tx => { await tx.insert(grants).values({ playerId: player.id, gameId: client.gameId, scopes: requested }).onConflictDoUpdate({ target: [grants.playerId, grants.gameId], set: { scopes: requested, updatedAt: new Date() } }); await tx.insert(codes).values({ hash: hash(code), clientId: client.id, playerId: player.id, redirectUri: data.redirect_uri, challenge: data.code_challenge, scopes: requested, expiresAt: new Date(Date.now() + 60000) }); });
  target.searchParams.set('code', code); return redirect(target.toString());
} catch (e) { return failure(e); } };
