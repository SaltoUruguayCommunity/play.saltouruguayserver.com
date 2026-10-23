import { eq } from 'drizzle-orm';
import { db, databaseConfigured } from '@/db';
import { games } from '@/db/schema';
export type Game = { id: string; slug: string; title: string; description: string; genre: string; type: 'hosted' | 'external'; status: string; url: string | null; cover: string | null; accent: string; activeBuildId?: string | null; demo?: boolean };
export const demoGames: Game[] = [
  { id: 'demo-orbita', slug: 'orbita', title: 'Órbita', description: 'Encontrá tu ritmo entre las estrellas. Un pequeño juego para descubrir todo lo que conecta SaltoPlay.', genre: 'Arcade', type: 'hosted', status: 'published', url: null, cover: '/art/orbita.svg', accent: 'violet', demo: true },
  { id: 'demo-conga', slug: 'conga', title: 'Conga!', description: 'La clásica conga uruguaya. Armá tus juegos, cortá a tiempo y compartí la mesa con tus amigos.', genre: 'Cartas', type: 'external', status: 'published', url: 'https://saltouruguayserver.com/comunidad/juegos/conga', cover: '/art/conga.svg', accent: 'mint', demo: true },
  { id: 'demo-ruleta', slug: 'ruleta-loca', title: 'Ruleta Loca', description: 'Una vuelta puede cambiarlo todo. Descubrí la frase y poné a prueba tu ingenio.', genre: 'Casual', type: 'external', status: 'published', url: 'https://saltouruguayserver.com/comunidad/juegos/ruleta-loca', cover: '/art/ruleta.svg', accent: 'orange', demo: true },
];
export async function catalog(): Promise<Game[]> { return databaseConfigured() ? db().select().from(games).where(eq(games.status, 'published')) : demoGames; }
export async function findGame(slug: string) { return (await catalog()).find(g => g.slug === slug); }
