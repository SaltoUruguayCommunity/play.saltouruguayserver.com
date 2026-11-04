# SaltoPlay: wildcard, ZIP y ejecución serverless

## Arquitectura de producción

El proyecto Astro se despliega en Vercel con S3/R2 y la base dedicada de SaltoPlay. No necesita un runtime Node permanente ni un worker siempre encendido. No utiliza la base de la web principal ni el disco efímero de Vercel para guardar distribuciones.

- Portal: https://play.saltouruguayserver.com
- Runtime: https://{gameId}.hosted-games.play.saltouruguayserver.com/{buildId}/index.html
- HOSTED_BASE_DOMAIN=hosted-games.play.saltouruguayserver.com

El middleware intercepta el host del juego antes de leer cookies o resolver rutas del portal. El contenido se transmite desde el almacenamiento bajo el origen de cada juego, conservando CSP, nosniff, permisos y control de acceso. No se redirige el juego a S3_PUBLIC_URL: un CDN compartido cambiaría el origen del documento y rompería el aislamiento y sus rutas relativas.

El dominio elegido es un subdominio de la misma zona del portal: el aislamiento es por origen, no por dominio registrable. La cookie del portal sigue siendo HttpOnly, Secure en HTTPS y host-only. No ampliar su Domain a .play.saltouruguayserver.com ni .saltouruguayserver.com. Los juegos no reciben tokens de SaltoUruguayServer ni cookies de sesión del portal.

## DNS y certificado wildcard

1. En el mismo proyecto Vercel del portal, agregar el dominio *.hosted-games.play.saltouruguayserver.com como dominio del despliegue, sin redirección hacia el portal.
2. Configurar HOSTED_BASE_DOMAIN y PUBLIC_APP_URL en el entorno de producción de Vercel.
3. Si el DNS de saltouruguayserver.com se administra fuera de Vercel, delegar únicamente el desafío del certificado y configurar el wildcard:

| Tipo | Nombre relativo a saltouruguayserver.com | Destino |
| --- | --- | --- |
| CNAME | *.hosted-games.play | El destino exacto mostrado por Vercel para el dominio |
| NS | _acme-challenge.hosted-games.play | ns1.vercel-dns.com. |
| NS | _acme-challenge.hosted-games.play | ns2.vercel-dns.com. |

Seguir también el paso Enable Vercel DNS para la zona indicado en la documentación oficial de wildcard con DNS externo. Los NS del desafío no reemplazan los nameservers del dominio principal y no enrutan tráfico; se necesitan tanto los registros del certificado como el CNAME. Si el proveedor solicita nombres completos, usar _acme-challenge.hosted-games.play.saltouruguayserver.com. Mantener la delegación para renovar TLS.

No dar por terminado el DNS hasta que Vercel muestre dominio y certificado válidos. El código local no puede registrar el dominio ni modificar el DNS del proveedor. Esta implementación no modifica la cuenta de Vercel ni el DNS del proveedor.

Referencia: https://vercel.com/docs/domains/working-with-domains/add-a-domain

## Almacenamiento y subidas

Configurar S3_BUCKET, S3_REGION, S3_ENDPOINT cuando corresponda, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY y S3_PREFIX en Vercel. Para R2, el endpoint es https://ACCOUNT_ID.r2.cloudflarestorage.com y la región habitual es auto. Guardar las credenciales como secretos del despliegue, nunca en archivos versionados.

El navegador sube el ZIP directamente al bucket mediante PUT firmado de 15 minutos. La confirmación que llega a Vercel contiene sólo el identificador: los límites del body de una Function no son el umbral de procesamiento del ZIP. Permitir PUT desde el origen exacto del portal y los encabezados Content-Type y x-amz-* necesarios en el CORS del bucket.

S3_PREFIX se aplica una vez a las claves lógicas incoming/, games/ y media/. No incluirlo en S3_BUCKET ni S3_ENDPOINT. Configurar una expiración de 24 horas para S3_PREFIX + incoming/, nunca para games/ o media/. Los originales se borran al completar correctamente el procesamiento; los fallidos se conservan para reintentos hasta su expiración.

S3_PUBLIC_URL ya mapea S3_PREFIX y se usa para imágenes; MEDIA_CDN_URL puede reemplazarla sólo para imágenes. El runtime de juegos siempre conserva su propio origen. Si el bucket/prefijo es público, sus URLs directas continúan siendo públicas, incluidas versiones no publicadas: la revisión del portal no proporciona confidencialidad del bucket. Definir una URL pública no cambia los permisos del proveedor.

## Procesamiento automático de ZIP

La confirmación y el botón Reintentar usan el mismo despachador y el mismo procesador que el worker opcional.

- Inline: hasta 5 MiB comprimidos, 20 MiB declarados en el directorio central y 100 entradas. Se inspecciona el ZIP antes de decidir y luego se valida íntegramente al descomprimir. La respuesta contiene el estado final.
- Segundo plano: el resto de paquetes permitidos se procesa con waitUntil en Vercel, devolviendo 202. La consola consulta el estado persistido.
- Límites globales: 25 MiB comprimidos, 100 MiB expandidos, 30 MiB por archivo, 1500 entradas; index.html en la raíz. No se permiten rutas inseguras, enlaces, archivos especiales, cifrado ni formatos de backend.

El procesador guarda como máximo cuatro objetos en paralelo. Cada intento tiene un prefijo de artefactos independiente. La publicación del manifiesto está condicionada al processingToken del intento; un proceso viejo no puede sobrescribir una versión terminada. Se usa FOR UPDATE SKIP LOCKED para que el cron, el request y un worker opcional no reclamen el mismo trabajo.

La función se configura con maxDuration: 300 y requiere Fluid Compute habilitado con ese límite disponible. waitUntil no es una cola durable ni amplía el timeout: la cola durable es PostgreSQL. Al morir la Function, los datos de la tarea permanecen. Un procesamiento sin latido durante diez minutos se marca failed y se puede reintentar desde la consola si el original aún existe. Los trabajos que todavía están queued pueden ser recogidos por el cron.

Fuera de Vercel se espera el procesamiento en el request, porque no existe el ciclo de vida de waitUntil. No se deja una promesa desacoplada que pueda ser cancelada al terminar la petición.

## Cron HTTP externo

No se configura Vercel Cron ni se requiere Pro para programar el disparador externo.

Configurar un CRON_SECRET aleatorio de al menos 32 caracteres como variable privada de Vercel y en el servicio de cron. Cada 5 minutos, realizar:

~~~http
GET https://play.saltouruguayserver.com/api/internal/hosted-jobs
Authorization: Bearer <CRON_SECRET>
~~~

No poner el secreto en el query string. El endpoint responde 503 si falta configuración y 401 si el Bearer no coincide. Un request autorizado recupera leases interrumpidos y procesa como máximo un build queued; devuelve { ok: true, processed: true } o processed: false si no hay trabajo. Las invocaciones pueden solaparse sin reclamar dos veces el mismo build. Darle al cliente HTTP un timeout de hasta 300 segundos; cada llamada sigue consumiendo una Function de Vercel.

Este cron es recuperación, no un paso obligatorio de cada subida: las subidas inician su trabajo directamente al confirmar. Los estados failed requieren el botón Reintentar, que vuelve a disparar el procesamiento automáticamente. Para vaciar una cola grande, aumentar la frecuencia del cron o usar el worker opcional.

## Runtime, previews y versiones

El runtime serverless conserva autorización por juego y manifiesto, previews firmadas de 15 minutos, GET/HEAD y Range para audio/vídeo. Las respuestas del gateway usan no-store para que una caché no salte la revisión de una preview vencida o de un juego suspendido. La transmisión desde S3/R2 evita cargar el asset entero en memoria; el tráfico y la duración siguen sujetos a los límites y costes del proveedor.

Flujo: awaiting_upload → queued → processing → ready → review → approved. La publicación cambia activeBuildId en PostgreSQL y registra el release. Las versiones previamente publicadas siguen accesibles para sus partidas abiertas mientras el juego esté publicado. Una preview firmada permite revisar builds ready, review o approved y no concede sesión del portal.

El SDK se incluye en la Function para /sdk/saltoplay.js. La CSP permite el propio origen, /api/v1/ y /oauth/token del portal, conserva frame-ancestors del portal y bloquea service workers, subframes y APIs de cámara/micrófono. No se ejecuta código de backend subido por los juegos.

Las imágenes de hasta 8 MiB PNG/JPEG/WebP estáticas siguen procesándose inline con sharp, límite de píxeles y salida WebP sin metadatos. No usan la cola de builds.

## Desarrollo y operación opcional

Para la demo local, dejar HOSTED_BASE_DOMAIN vacío, ejecutar pnpm dev y pnpm runtime por separado. Se usan {gameId}.localhost:4322 y el almacenamiento local .data/hosted si no hay S3_BUCKET. HOSTED_STORAGE_PATH, HOSTED_PORT y HOSTED_BIND corresponden únicamente al servidor de desarrollo u operación Node opcional.

pnpm hosted:worker procesa la misma cola fuera de Vercel. pnpm hosted:worker --once la vacía y termina. No migra ni levanta el portal. Es opcional, útil para mantenimiento o cargas que no entren en el presupuesto de una Function.

El portal y el runtime necesitan la base dedicada y el almacenamiento configurados. HOSTED_PREVIEW_SECRET debe tener al menos 32 caracteres. Los reintentos reutilizan el original, pero nunca el prefijo de artefactos del intento anterior. No hay cambios de esquema en esta implementación; seguir aplicando las migraciones pendientes del proyecto mediante su flujo habitual.
