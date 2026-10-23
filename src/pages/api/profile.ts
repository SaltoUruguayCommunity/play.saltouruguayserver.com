import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { players } from '@/db/schema';
import { failure, formObject, requirePlayer, json } from '@/lib/http';
export const POST: APIRoute = async ({ request, locals, redirect }) => { try { const player = requirePlayer(locals.player); const data = z.object({ tag: z.string().regex(/^[a-zA-Z0-9_-]{3,30}$/).transform(s => s.toLowerCase()), bio: z.string().max(300), publicProfile: z.string().optional() }).parse(await formObject(request)); try { await db().update(players).set({ tag: data.tag, bio: data.bio, publicProfile: data.publicProfile === 'on', updatedAt: new Date() }).where(eq(players.id, player.id)); } catch (error) { if ((error as { cause?: { code?: string } }).cause?.code === '23505') return json({ message: 'Ese SaltoTag ya está en uso.' }, 409); throw error; } return redirect('/ajustes?saved=1'); } catch (e) { return failure(e); } };
