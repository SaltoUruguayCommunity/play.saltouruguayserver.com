import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { sessions } from '@/db/schema';
import { sessionCookie } from '@/lib/auth';
import { hash } from '@/lib/security';
export const POST: APIRoute = async ({ cookies, redirect }) => { const token = cookies.get(sessionCookie)?.value; if (token) await db().delete(sessions).where(eq(sessions.id, hash(token))); cookies.delete(sessionCookie, { path: '/' }); return redirect('/'); };
