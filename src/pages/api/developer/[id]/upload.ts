import type { APIRoute } from 'astro';
import { json } from '@/lib/http';
export const POST: APIRoute = () => json({ error: 'use_direct_upload', message: 'Usá el nuevo panel de versiones para subir el paquete directamente al almacenamiento.' }, 410);
