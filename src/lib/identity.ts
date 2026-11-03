import { z } from 'zod';
import { db } from '@/db';
import { players } from '@/db/schema';
import { HttpError } from './http';
const profileSchema = z.object({ sub: z.string().min(1), username: z.string().optional(), displayName: z.string().optional(), name: z.string().optional(), avatar: z.string().nullish(), picture: z.string().nullish(), image: z.string().nullish(), is_admin: z.boolean().default(false) });

// Never trust a caller-supplied profile; resolve it with the configured issuer.
export async function playerFromAccessToken(accessToken: string) {
    const issuer = import.meta.env.SUS_ISSUER || 'https://saltouruguayserver.com';
    const response = await fetch(new URL('/oauth/userinfo', issuer), { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) });
    if (response.status === 401 || response.status === 403) throw new HttpError(401, 'invalid_token');
    if (!response.ok) throw new HttpError(502, 'identity_unavailable');
    const profile = profileSchema.parse(await response.json());
    const name = profile.displayName || profile.name || profile.username || 'Jugador';
    let avatar: string | null = null;
    for (const candidate of [profile.avatar, profile.picture, profile.image]) {
      if (!candidate) continue;
      try {
        const url = new URL(candidate, issuer);
        if ((url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) && !url.username && !url.password) { avatar = url.href; break; }
      } catch { /* A broken avatar must not prevent sign-in. */ }
    }
    const [player] = await db().insert(players).values({ subject: profile.sub, displayName: name, username: profile.username || 'jugador', avatar, isAdmin: profile.is_admin, tag: `jugador-${crypto.randomUUID().slice(0, 8)}` }).onConflictDoUpdate({ target: players.subject, set: { displayName: name, username: profile.username || 'jugador', avatar, isAdmin: profile.is_admin, updatedAt: new Date() } }).returning();

    return player;
}
