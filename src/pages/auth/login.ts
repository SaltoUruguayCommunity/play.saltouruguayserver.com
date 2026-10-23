import type { APIRoute } from 'astro';
import { cookieOptions } from '@/lib/auth';
import { appUrl, pkce, randomToken, safeReturn } from '@/lib/security';
import { databaseConfigured } from '@/db';
export const GET: APIRoute = ({ cookies, url, redirect }) => {
  const clientId = import.meta.env.SUS_CLIENT_ID;
  if (!clientId || !databaseConfigured()) return redirect('/acceso?setup=1');
  const state = randomToken(); const verifier = randomToken();
  cookies.set('saltoplay_oauth', JSON.stringify({ state, verifier, returnTo: safeReturn(url.searchParams.get('returnTo')) }), { ...cookieOptions(), maxAge: 600 });
  const target = new URL('/oauth/authorize', import.meta.env.SUS_ISSUER || 'https://saltouruguayserver.com');
  target.search = new URLSearchParams({ client_id: clientId, redirect_uri: `${appUrl()}/auth/callback`, response_type: 'code', scope: 'openid profile', state, code_challenge: pkce(verifier), code_challenge_method: 'S256' }).toString();
  return redirect(target.toString());
};
