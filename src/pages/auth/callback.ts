import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '@/db';
import { players } from '@/db/schema';
import { createSession } from '@/lib/auth';
import { appUrl, equal, safeReturn } from '@/lib/security';
const profileSchema = z.object({ sub: z.string().min(1), username: z.string().optional(), displayName: z.string().optional(), name: z.string().optional(), avatar: z.string().nullish(), picture: z.string().nullish(), image: z.string().nullish(), is_admin: z.boolean().default(false) });
export const GET: APIRoute = async ({ cookies, url, redirect }) => {
  const saved = cookies.get('saltoplay_oauth')?.value;
  cookies.delete('saltoplay_oauth', { path: '/' });
  try {
    if (!saved || url.searchParams.has('error')) throw new Error('OAuth cancelled');
    const flow = JSON.parse(saved);
    if (!equal(flow.state, url.searchParams.get('state') ?? '') || !url.searchParams.get('code')) throw new Error('Invalid state');
    const issuer = import.meta.env.SUS_ISSUER || 'https://saltouruguayserver.com';
    const tokenResponse = await fetch(new URL('/oauth/token', issuer), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code')!, client_id: import.meta.env.SUS_CLIENT_ID, client_secret: import.meta.env.SUS_CLIENT_SECRET || '', redirect_uri: `${appUrl()}/auth/callback`, code_verifier: flow.verifier }), signal: AbortSignal.timeout(10000) });
    if (!tokenResponse.ok) throw new Error('Token exchange failed');
    const token = z.object({ access_token: z.string().min(1) }).parse(await tokenResponse.json());
    const response = await fetch(new URL('/oauth/userinfo', issuer), { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Profile failed');
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
    await createSession(player.id, cookies);
    return redirect(safeReturn(flow.returnTo));
  } catch { return redirect('/acceso?error=oauth'); }
};
