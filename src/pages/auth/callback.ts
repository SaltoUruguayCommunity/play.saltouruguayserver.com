import type { APIRoute } from 'astro';
import { z } from 'zod';
import { playerFromAccessToken } from '@/lib/identity';
import { createSession } from '@/lib/auth';
import { appUrl, equal, safeReturn } from '@/lib/security';
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
    const player = await playerFromAccessToken(token.access_token);
    await createSession(player.id, cookies);
    return redirect(safeReturn(flow.returnTo));
  } catch { return redirect('/acceso?error=oauth'); }
};
