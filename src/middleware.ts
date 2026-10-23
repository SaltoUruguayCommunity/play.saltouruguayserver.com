import { defineMiddleware } from 'astro:middleware';
import { getPlayer } from '@/lib/auth';
import { appUrl } from '@/lib/security';
export const onRequest = defineMiddleware(async (context, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(context.request.method) && !context.url.pathname.startsWith('/api/v1/') && context.url.pathname !== '/oauth/token') {
    if (context.request.headers.get('origin') !== new URL(appUrl()).origin) return new Response('Origen no permitido', { status: 403 });
  }
  context.locals.player = await getPlayer(context.cookies);
  const response = await next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (context.locals.player || context.url.pathname.startsWith('/auth/') || context.url.pathname.startsWith('/oauth/') || context.url.pathname.startsWith('/api/')) response.headers.set('Cache-Control', 'no-store');
  return response;
});
