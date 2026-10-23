import type { APIRoute } from 'astro';
import { db } from '@/db';
import { communityServers, audit } from '@/db/schema';
import { admin } from '@/lib/security';
import { serverFormSchema } from '@/lib/community-servers';
import { failure, formObject, requirePlayer, HttpError, json } from '@/lib/http';
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const player = requirePlayer(locals.player); if (!admin(player)) throw new HttpError(403, 'forbidden');
    const data = serverFormSchema.parse(await formObject(request));
    const { id: suppliedId, ...values } = data; const id = suppliedId || crypto.randomUUID();
    await db().transaction(async tx => {
      await tx.insert(communityServers).values({ ...values, id }).onConflictDoUpdate({ target: communityServers.id, set: { ...values, updatedAt: new Date() } });
      await tx.insert(audit).values({ actorId: player.id, action: suppliedId ? 'server.updated' : 'server.created', targetId: id });
    });
    return json({ ok: true, id });
  } catch (error) { return failure(error); }
};
