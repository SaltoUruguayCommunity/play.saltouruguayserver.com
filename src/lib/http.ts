import { z } from 'zod';
export class HttpError extends Error { constructor(public status: number, public code: string, message: string = code) { super(message); } }
export const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
export function failure(error: unknown) { if (error instanceof HttpError) return json({ error: error.code, message: error.message }, error.status); if (error instanceof z.ZodError) return json({ error: 'invalid_request', message: error.issues[0]?.message || 'Datos inválidos.' }, 400); console.error('[SaltoPlay] Request failed:', error instanceof Error ? error.name : 'Unknown'); return json({ error: 'server_error', message: 'No pudimos completar la operación.' }, 500); }
export async function formObject(request: Request) { return Object.fromEntries(await request.formData()); }
export function requirePlayer<T>(player: T | null): T { if (!player) throw new HttpError(401, 'login_required', 'Ingresá con SaltoUruguayServer para continuar.'); return player; }
