import { db } from '@/db';
import { unlocks } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
/** Awarded points are snapshots: later edits to an achievement never change earned score. */
export async function getPlayerProgress(playerId: string) {
  const [row] = await db().select({
    score: sql<number>`coalesce(sum(${unlocks.scoreAwarded}), 0)`.mapWith(Number),
    unlocked: sql<number>`count(*)`.mapWith(Number),
    scored: sql<number>`count(case when ${unlocks.scoreAwarded} > 0 then 1 end)`.mapWith(Number),
  }).from(unlocks).where(eq(unlocks.playerId, playerId));
  return row ?? { score: 0, unlocked: 0, scored: 0 };
}
