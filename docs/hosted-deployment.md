# Juegos alojados de SaltoUruguayServer

## Componentes

- El portal Astro autoriza subidas y gestiona revisiones/publicaciones.
- El navegador sube los ZIP e imágenes directamente a un bucket de lectura pública con una URL PUT firmada de 15 minutos. En local, usa el endpoint autenticado de desarrollo.
- `pnpm hosted:worker` procesa las colas de PostgreSQL fuera de Vercel. `pnpm hosted:worker --once` vacía la cola y termina. No migra ni inicia el portal.
- `pnpm runtime` sirve archivos desde el mismo bucket, bajo un origen independiente por juego. Cada instancia necesita acceso de lectura a la base dedicada y al almacenamiento. Configurá el directorio de trabajo en la raíz de este proyecto.

## Almacenamiento S3 / R2

Configurá S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID y S3_SECRET_ACCESS_KEY en portal, procesador y runtime. Para R2: S3_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com y S3_REGION=auto. Para S3, usá la región real y dejá S3_ENDPOINT vacío. S3_FORCE_PATH_STYLE es opcional para endpoints compatibles que lo necesiten.

Todo el contenido de SaltoPlay se puede leer públicamente: originales, imágenes y archivos de builds, incluso si la versión no figura en el catálogo. Las subidas, borrados y publicaciones siguen requiriendo autorización. Configurá lectura pública del prefijo de SaltoPlay en el proveedor; no habilites escritura anónima.

CORS del bucket: permití PUT desde el origen exacto de PUBLIC_APP_URL y los encabezados Content-Type, x-amz-* que requiera el proveedor. No uses credenciales del bucket en el navegador. Los juegos pasan por el runtime. Las imágenes usan S3_PUBLIC_URL o MEDIA_CDN_URL si están configuradas; en caso contrario usan el runtime. Las subidas firmadas siempre usan el endpoint S3, no el CDN.

Los archivos subidos primero se guardan bajo incoming/{gameId}/{id}/source. Configurá una regla de expiración para incoming/ (por ejemplo, 24 horas). No apliques esa regla a games/. Los originales procesados se borran automáticamente; la regla limpia subidas abandonadas. Un reintento de un procesamiento fallido requiere que su original no haya expirado.

## DNS y runtime

HOSTED_BASE_DOMAIN debe estar en un dominio registrable distinto del portal, con DNS y TLS wildcard, por ejemplo *.saltoplay-games.example. No uses el dominio de la cuenta para servir HTML de usuarios. En local se usan {gameId}.localhost:4322 y .data/hosted.

HOSTED_PREVIEW_SECRET debe ser un secreto aleatorio de al menos 32 caracteres, igual en portal y runtime. Las vistas previas vencen a los 15 minutos y usan una ruta firmada para que los assets relativos funcionen. No conceden sesión del portal ni permisos sobre los datos del jugador.

El runtime respeta Content-Type, nosniff, CSP, frame-ancestors y Range para audio/vídeo. Los documentos HTML y previews no se cachean. Los assets de una versión publicada son inmutables. La configuración del proveedor no despliega por sí sola el runtime: hay que alojar este proceso (o implementar un gateway equivalente) con acceso a bucket y PostgreSQL.

## Versiones

Cada ZIP tiene su identificador, versión legible, notas, hash SHA-256 y manifiesto de archivos. El procesador valida rutas, enlaces, límites de descompresión y tipos. Cada intento usa un prefijo de artefactos independiente; un intento interrumpido no puede sobrescribir una versión terminada.

Flujo: subida pendiente → en cola → procesando → lista → en revisión → aprobada. Publicar cambia activeBuildId en PostgreSQL y registra la acción. No se usa published.json ni otro puntero de publicación en el bucket. La versión anterior sigue disponible para sus partidas abiertas.

Los dueños pueden publicar versiones aprobadas y restaurar versiones que ya se publicaron. La primera publicación y la aprobación requieren administración. Suspender el juego bloquea el runtime y la API. Las partidas nuevas que se abrieron desde una página desactualizada deben recargarla; las ya iniciadas pueden renovar sus tokens para el mismo build. Un rollback no revierte guardados ni logros. Versioná los datos de guardado y mantené compatibilidad entre versiones.

## Imágenes

Hasta 8 MB por imagen. PNG, JPEG y WebP estáticos; se decodifican con límite de píxeles y se convierten a WebP sin conservar metadatos. Iconos: mínimo 128 × 128, salida 512 × 512. Banners/capturas: mínimo 320 × 180 y salida máxima 1920 × 1080. Se pueden seleccionar icono, banner y hasta ocho capturas; se aplican al catálogo y la ficha pública después del procesamiento.

## Operación

El procesador reclama filas con FOR UPDATE SKIP LOCKED, permite varias instancias y renueva su lease. Un proceso interrumpido sin latidos durante diez minutos se marca fallido. El propietario puede reintentarlo desde la consola. No hay un servicio de procesamiento activado por guardar código: desplegá y supervisá el worker aparte.

Aplicá las migraciones con pnpm db:migrate contra la base dedicada de SaltoPlay antes de iniciar las nuevas versiones del portal, worker y runtime. No uses la base de la web principal.

## Prefijo de bucket y CDN de imágenes

Configuración opcional, igual en portal, worker y runtime:

```env
S3_PREFIX=saltoplay/
S3_PUBLIC_URL=https://cdn.example.com/saltoplay/
# Opcional: una base diferente solo para imágenes
MEDIA_CDN_URL=
```

S3_PREFIX se normaliza y se añade una única vez en PUT, GET, HEAD, DELETE y subidas firmadas. No lo incluyas en S3_ENDPOINT ni S3_BUCKET. Se permiten varios segmentos, como plataformas/saltoplay/. El almacenamiento local no usa S3_PREFIX.

Las claves lógicas se conservan sin prefijo: incoming/... para originales, games/... para builds y media/{gameId}/{mediaId}/{attemptId}.webp para imágenes procesadas. Con el ejemplo anterior, una imagen se almacena en saltoplay/media/... y su URL pública es https://cdn.example.com/saltoplay/media/.... S3_PUBLIC_URL es la base pública de todos los archivos y ya mapea el prefijo; el código no vuelve a añadir S3_PREFIX a esa URL. MEDIA_CDN_URL permite usar otra base solo para las imágenes. Si el CDN reescribe el prefijo en su origen, usá la base pública correspondiente.

La URL pública/CDN puede exponer incoming/, games/ y media/ dentro de S3_PREFIX. En R2, habilitá un dominio público del bucket; en S3, configurá acceso de lectura de objetos o una distribución CDN que los publique. El acceso público se configura en el proveedor: definir S3_PUBLIC_URL no cambia los permisos del bucket. Si el bucket es compartido, la política puede limitarse al prefijo de SaltoPlay.

Las URLs usan el identificador del intento de procesamiento y son inmutables. Configurá Content-Type image/webp, nosniff y caché larga. Sin MEDIA_CDN_URL, las imágenes usan S3_PUBLIC_URL; sin ninguna de las dos bases usan el runtime por juego. Si configurás el CDN, también debe poder servir los WebP del almacenamiento que use el worker; no se levanta automáticamente un CDN al definir la variable.

Elegí S3_PREFIX antes de empezar a subir archivos: cambiarlo no mueve objetos existentes. Cambiar S3_PUBLIC_URL o MEDIA_CDN_URL no reescribe los enlaces ya seleccionados en la ficha; volvé a seleccionar las imágenes desde la consola para guardar sus nuevas URLs. La regla de expiración de originales debe apuntar a S3_PREFIX + incoming/, nunca a media/ ni games/.

Los juegos HTML/JS, sus assets y las previews siguen usando el origen aislado por juego y sus comprobaciones. Una CDN delante del runtime debe preservar Host, CSP y los encabezados de caché y no cachear previews ni documentos HTML.

## Lectura pública y publicación

S3_PUBLIC_URL permite que el runtime lea los archivos mediante HTTP/CDN, incluyendo solicitudes Range, mientras los uploads y el procesador siguen usando la API S3 autenticada. El CDN debe soportar Range para audio/vídeo. No se fuerza ninguna ACL por objeto: el acceso público se define a nivel de bucket/prefijo o dominio, compatible con R2 y S3.

La revisión y activeBuildId determinan qué versión ofrece el portal. No son un mecanismo de confidencialidad del bucket público: una URL directa puede leer un archivo de una versión no publicada y el vencimiento de una preview solo afecta a la ruta del runtime. Suspender un juego bloquea sus sesiones/API y las rutas del runtime, pero no elimina los archivos públicos ni sus copias en caché.

Los juegos siguen ejecutándose en el runtime aislado por juego para conservar CSP, la integración y la separación del portal. No apuntes S3_PUBLIC_URL al origen del portal. No se guardan tokens, credenciales ni datos privados de jugadores en los archivos del bucket.
