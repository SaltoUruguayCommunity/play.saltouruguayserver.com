/// <reference types="astro/client" />
declare namespace App { interface Locals { player: typeof import('./db/schema').players.$inferSelect | null; } }
