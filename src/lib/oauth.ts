import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { clients, games, codes, tokens, refreshTokens } from '@/db/schema';
import { equal, hash, pkce, randomToken } from './security';
import { HttpError } from './http';
export async function approvedClient(id: string) {
  const [row] = await db().select({ client: clients, game: games }).from(clients).innerJoin(games, eq(games.id, clients.gameId)).where(and(eq(clients.id, id), eq(games.status, 'published')));
  if (!row) throw new HttpError(400, 'invalid_client');
  return row;
}
export function validateRedirect(registered: string[], uri: string) { if (!registered.includes(uri)) throw new HttpError(400, 'invalid_redirect_uri'); }
export async function exchangeCode(input: { clientId: string; secret?: string; code: string; redirectUri: string; verifier: string }) {
  const { client } = await approvedClient(input.clientId);
  if (client.secretHash && !equal(client.secretHash, hash(input.secret || ''))) throw new HttpError(401, 'invalid_client');
  validateRedirect(client.redirectUris, input.redirectUri);
  return db().transaction(async tx => {
    const [code] = await tx.select().from(codes).where(and(eq(codes.hash, hash(input.code)), eq(codes.clientId, client.id), gt(codes.expiresAt, new Date()))).for('update');
    if (!code || code.redirectUri !== input.redirectUri || !equal(code.challenge, pkce(input.verifier))) throw new HttpError(400, 'invalid_grant');
    await tx.delete(codes).where(eq(codes.hash, code.hash));
    const access = randomToken(), refresh = randomToken();
    await tx.insert(tokens).values({ hash: hash(access), playerId: code.playerId, gameId: client.gameId, clientId: client.id, scopes: code.scopes, expiresAt: new Date(Date.now() + 3600000) });
    await tx.insert(refreshTokens).values({ hash: hash(refresh), accessHash: hash(access), family: crypto.randomUUID(), playerId: code.playerId, gameId: client.gameId, clientId: client.id, scopes: code.scopes, expiresAt: new Date(Date.now() + 30 * 86400000) });
    return { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: 3600, scope: code.scopes.join(' ') };
  });
}
export async function rotateRefresh(clientId: string, refresh: string, secret?: string) {
  const { client } = await approvedClient(clientId);
  if (client.secretHash && !equal(client.secretHash, hash(secret || ''))) throw new HttpError(401, 'invalid_client');
  const result = await db().transaction(async tx => {
    const [row] = await tx.select().from(refreshTokens).where(and(eq(refreshTokens.hash, hash(refresh)), eq(refreshTokens.clientId, clientId))).for('update');
    if (!row || row.revoked || row.expiresAt <= new Date()) return null;
    if (row.used) {
      const familyRows = await tx.select({ hash: refreshTokens.accessHash }).from(refreshTokens).where(eq(refreshTokens.family, row.family));
      await tx.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.family, row.family));
      for (const token of familyRows) await tx.delete(tokens).where(eq(tokens.hash, token.hash));
      return null; // Commit reuse revocation before reporting invalid_grant.
    }
    const access = randomToken(), replacement = randomToken();
    await tx.update(refreshTokens).set({ used: true }).where(eq(refreshTokens.hash, row.hash));
    await tx.delete(tokens).where(eq(tokens.hash, row.accessHash));
    await tx.insert(tokens).values({ hash: hash(access), playerId: row.playerId, gameId: row.gameId, clientId, scopes: row.scopes, expiresAt: new Date(Date.now() + 3600000) });
    await tx.insert(refreshTokens).values({ hash: hash(replacement), accessHash: hash(access), family: row.family, playerId: row.playerId, gameId: row.gameId, clientId, scopes: row.scopes, expiresAt: row.expiresAt });
    return { access_token: access, refresh_token: replacement, token_type: 'Bearer', expires_in: 3600, scope: row.scopes.join(' ') };
  });
  if (!result) throw new HttpError(400, 'invalid_grant');
  return result;
}
