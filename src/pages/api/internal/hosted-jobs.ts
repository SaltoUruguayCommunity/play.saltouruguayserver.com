import type { APIRoute } from 'astro';
import { equal } from '@/lib/security';
import { processQueuedBuild, recoverInterruptedBuilds } from '@/lib/build-process';
import { failure, json } from '@/lib/http';

/** Durable queue recovery; normal submissions start immediately via waitUntil. */
export const GET: APIRoute = async ({ request }) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return json({ error: 'cron_not_configured' }, 503);
  if (!equal(request.headers.get('authorization') || '', `Bearer ${secret}`)) return json({ error: 'unauthorized' }, 401);
  try {
    await recoverInterruptedBuilds();
    return json({ ok: true, processed: await processQueuedBuild() });
  } catch (error) { return failure(error); }
};
