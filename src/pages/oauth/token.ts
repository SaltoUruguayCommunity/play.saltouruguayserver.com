import type { APIRoute } from 'astro';
import { z } from 'zod';
import { approvedClient, exchangeCode, rotateRefresh } from '@/lib/oauth';
import { failure, formObject, json, HttpError } from '@/lib/http';
async function cors(request: Request, clientId: string): Promise<Record<string, string>> { const origin = request.headers.get('origin'); const { client } = await approvedClient(clientId); if (origin && !client.redirectUris.some(uri => new URL(uri).origin === origin)) throw new HttpError(403, 'origin_denied'); return origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}; }
export const OPTIONS: APIRoute = async ({ request, url }) => { try { const id = z.uuid().parse(url.searchParams.get('client_id')); const headers = await cors(request, id); return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } }); } catch (e) { return failure(e); } };
export const POST: APIRoute = async ({ request }) => { let headers: Record<string, string> = {}; try {
  const data = z.object({ client_id: z.uuid(), client_secret: z.string().optional(), grant_type: z.enum(['authorization_code', 'refresh_token']), code: z.string().optional(), redirect_uri: z.url().optional(), code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/).optional(), refresh_token: z.string().optional() }).parse(await formObject(request));
  headers = await cors(request, data.client_id);
  if (data.grant_type === 'refresh_token') { if (!data.refresh_token) throw new HttpError(400, 'invalid_request'); return json(await rotateRefresh(data.client_id, data.refresh_token, data.client_secret), 200, headers); }
  if (!data.code || !data.redirect_uri || !data.code_verifier) throw new HttpError(400, 'invalid_request');
  return json(await exchangeCode({ clientId: data.client_id, secret: data.client_secret, code: data.code, redirectUri: data.redirect_uri, verifier: data.code_verifier }), 200, headers);
} catch (e) { const response = failure(e); Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value)); return response; } };
