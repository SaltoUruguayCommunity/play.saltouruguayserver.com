# SaltoPlay — Plan de producto y arquitectura

Estado: implementación iniciada. Plan original: 22 de octubre de 2026. Actualización: 23 de octubre de 2026.
Destino: https://play.saltouruguayserver.com

Decisión del usuario: SaltoPlay nunca se lanzó. Crear un producto nuevo, sin importaciones de datos ni compatibilidad con clientes anteriores. Usar exclusivamente pnpm y pnpx. Por indicación posterior del usuario, el esquema propio usa pnpm db:generate y pnpm db:migrate, con SQL versionado en src/db/migrations. Su aplicación es manual sobre una base dedicada; no hay migración automática al arrancar o desplegar. Las referencias históricas de abajo documentan investigación del código, no obligaciones de migración de datos.

## 1. Objetivo

Crear una plataforma de juegos e identidad de jugador vinculada a SaltoUruguayServer. Debe servir para descubrir y jugar, conservar progreso y logros, y permitir que desarrolladores integren sus juegos mediante OAuth y un SDK público.

El lanzamiento debe completar un circuito real: un desarrollador registra un juego, configura su integración y logros, lo prueba, lo envía a revisión; un administrador lo publica; un jugador entra con SaltoUruguayServer, autoriza el juego y recibe un logro que aparece en su perfil.

## 2. Evidencia del proyecto actual

Revisión de código local; no se consultaron registros de producción ni se verificó cuántos clientes activos existen.

| Elemento | Ubicación en saltouruguay-web | Situación observada |
| --- | --- | --- |
| Portada y navegación | src/pages/saltoplay/index.astro; src/components/saltoplay/SidebarNav.astro | Hay interfaz, con nombre, avatar y notificaciones de ejemplo; enlaces a funciones que requieren inventario adicional. |
| Datos del producto | src/db/schema.ts | Existen salto_tags, salto_play_developers, salto_play_games, salto_play_achievements, salto_tag_achievements y tablas de tokens/códigos. |
| OAuth de juegos | src/lib/saltoplay/oauth.ts; src/pages/gamecenter/oauth/* | Flujo propio con códigos, acceso y refresh. Requiere rediseño antes de abrirlo a terceros. |
| SaltoTag | src/lib/saltoplay/saltotag.ts | getSaltoTag está vacío. El esquema ya conserva nombre, discriminador, avatar y XP. |
| Identidad SaltoUruguayServer | src/pages/oauth/*; src/lib/oauth.ts | Proveedor central separado; la ruta de autorización y el esquema incluyen PKCE. Debe validarse de extremo a extremo. |
| Perfil SaltoUruguayServer | src/pages/oauth/userinfo.ts | Entrega sub, perfil por scope y email por scope; no entrega SaltoTag actualmente. |
| OneTap SaltoUruguayServer | public/sdk/onetap.js; onetap-frame.html; pkce-callback.html | Implementación existente con opciones PKCE/custom-auth; integrar mediante el flujo de sesión del servidor. |
| Juegos propios | src/pages/comunidad/juegos/*; src/components/games/* | Conga y Ruleta Loca son candidatos iniciales; tienen lógica, acciones y dependencias que deben migrarse juntas. |
| Consumidor OAuth SaltoUruguayServer | ../inscripciones.saltouruguayserver.com/auth.config.mjs | Referencia útil de integración con authorize/token/userinfo, no plantilla para copiar su persistencia. |

Problemas observados en OAuth de juegos: secretos y tokens persistidos sin hash; firma HS256 con el secreto entregado al desarrollador; consumo de código mediante lectura y borrado separados; validación de acceso que busca un registro por juego/usuario sin comparar el token recibido con el vigente; refresh que tampoco compara el token recibido con el almacenado. El endpoint exige client_secret, inadecuado para un SDK público de navegador. No trasladar esta implementación sin corregirla.

La versión declarada en package.json de la web principal es Astro 7.0.7; AGENTS.md menciona 6.3.3. Resolver versiones y compatibilidad de adaptadores al iniciar el nuevo proyecto.

## 3. Experiencia y diseño

Actualización del usuario: priorizar un portal de jugadores inspirado en Facebook Gameroom. Reducir desarrollo a enlaces discretos de pie y navegación contextual; el inicio debe mostrar juegos, biblioteca y series/servidores de la comunidad. RUSTico 7 está confirmado como activo con acceso por Discord. Permitir administrar IP copiable y enlace de acceso independiente por servidor, sin confundir el estado editorial con disponibilidad en tiempo real.

Dirección: biblioteca de juegos oscura, con identidad SaltoPlay y parentesco visual con SaltoUruguayServer. Fondo carbón con matiz violeta, superficies elevadas sutiles, acento violeta y lavanda, texto claro y estados semánticos independientes del acento.

Rubik para texto y navegación; Teko para titulares puntuales si encaja con la marca. Portadas y capturas de juegos como protagonistas. Evitar llenar toda la interfaz de neón, degradados o tarjetas genéricas.

Escritorio: navegación lateral con etiquetas, búsqueda superior y acceso visible al perfil. Inicio con juego destacado, continuar jugando cuando haya historial, novedades y selección editorial. Móvil: navegación compacta, búsqueda accesible y tarjetas adaptadas al ancho disponible.

Consola de desarrolladores más funcional y densa: selector de organización/juego, navegación de configuración y estados de publicación claros. Documentación con ejemplos copiables y selector de entorno.

Accesibilidad: teclado completo, foco visible, contraste AA, texto alternativo, reduced-motion, mensajes de estado y errores asociados al campo. Diseñar estados vacíos, carga, error, sesión vencida, acceso denegado y juego suspendido. Sin estadísticas o actividad inventadas.

## 4. Áreas y rutas propuestas

| Área | Rutas | Funciones |
| --- | --- | --- |
| Descubrimiento | /; /juegos; /juegos/[slug] | Catálogo, búsqueda, filtros, ficha, medios, plataforma, desarrollador y permisos. |
| Juego | /jugar/[slug] | Lanzador para juegos web y enlace verificado para juegos externos; tratamiento explícito de compatibilidad. |
| Jugador | /biblioteca; /perfil/[tag]; /logros; /actividad | Juegos guardados/recientes, SaltoTag, XP, progreso y actividad según privacidad. |
| Social | /amigos; /ajustes/privacidad | Solicitudes, aceptación, eliminación, bloqueo y visibilidad de actividad. |
| Cuenta | /ajustes; /ajustes/conexiones | Perfil, autorizaciones concedidas y revocación por juego. |
| Desarrolladores | /developers; /developers/juegos/* | Organizaciones, miembros, juegos, medios, OAuth, logros, marcadores, guardados, webhooks y métricas. |
| Documentación | /docs/* | Inicio rápido, SDK, API, scopes, errores, integración segura y migración. |
| Administración | /admin/* | Revisión, publicación, suspensión, reportes y auditoría. |
| Integración | /auth/*; /oauth/*; /api/v1/* | Acceso SaltoUruguayServer, autorización de juegos y API versionada. |

Torneos, Awards y Modpack seguirán enlazados a sus productos actuales; no se migran automáticamente por aparecer en la barra lateral antigua.

## 5. Arquitectura

- Proyecto independiente en esta carpeta, Astro SSR, TypeScript estricto y Tailwind CSS v4 con @tailwindcss/vite.
- Preact para islas interactivas: consola, búsqueda, notificaciones y componentes de juegos. HTML de Astro para contenido y navegación que no requieren hidratación.
- PostgreSQL dedicado y Drizzle ORM/Kit para esquema y migraciones. Entornos local, pruebas y producción separados; proveedor de Postgres por definir, sin dependencia obligatoria de Neon.
- Adaptador Node como opción inicial para un servicio propio; Vercel es alternativa coherente con la web actual. Elegir alojamiento antes de configurar despliegue y conexiones.
- API y servicios de dominio dentro de Astro al inicio: catálogo, identidad, logros, OAuth y consola. Sin microservicios prematuros.
- Almacenamiento S3 compatible/CDN para iconos, portadas y capturas; URLs firmadas, límites y validación de archivos. No alojar ejecutables arbitrarios de terceros en el lanzamiento.
- Pusher reutilizable para notificaciones y juegos que ya lo necesitan; autorización de canales en servidor. No usar presencia como prueba de identidad ni de logros.
- Tareas persistentes para webhooks/reintentos mediante outbox en Postgres y worker programado, independiente del ciclo de una petición.
- Secretos por entorno; registros estructurados sin credenciales; seguimiento de errores, backups y prueba de restauración.

## 6. Identidad, SaltoTag y OAuth

SaltoUruguayServer autentica a las personas. SaltoPlay administra la experiencia de juego y los permisos concedidos a cada aplicación. No crear otra contraseña ni compartir la cookie de sesión entre todos los subdominios.

Acceso: SaltoPlay redirige a SaltoUruguayServer usando Authorization Code + PKCE y state; el servidor intercambia el código, obtiene el perfil y crea una sesión local con cookie Secure, HttpOnly y SameSite apropiado. La relación de identidad será UNIQUE(issuer, subject), sin asumir que email es identificador estable.

OneTap es una mejora progresiva: debe desembocar en la misma sesión verificada por servidor y conservar un botón normal de acceso. Revisar el modo custom-auth existente para no intercambiar estado ni tokens del navegador sin validación. Probar restricciones de cookies/iframes, popup bloqueado y navegación móvil.

SaltoPlay será propietario de los nuevos SaltoTags; SaltoUruguayServer seguirá siendo propietario de la cuenta. No importar tags, IDs ni XP del código anterior. Agregar a SaltoUruguayServer una integración autenticada de lectura para mostrar SaltoTag donde sea necesario. Evitar dos bases que escriban concurrentemente el mismo tag o XP. Definir borrado/suspensión de cuenta mediante eventos autenticados o reconciliación periódica.

OAuth para juegos:

- Clientes públicos para navegador/móvil con PKCE S256, sin client_secret en bundles; confidenciales para backends con credenciales rotables y hash persistido.
- Juego y cliente OAuth como entidades separadas: varios clientes por juego y entorno, redirect URIs exactas, orígenes registrados y callbacks de desarrollo explícitos.
- Consentimiento por juego y scopes; códigos breves, de un solo uso, consumidos atómicamente y vinculados a cliente, redirect URI y PKCE.
- Tokens de acceso opacos aleatorios y almacenados como hash para la primera versión; refresh rotatorio con familias y detección de reutilización. Ningún secreto del desarrollador firma identidad de jugadores.
- Revocación por usuario, juego, cliente y suspensión; expiración y audiencia verificadas en cada petición. Sesiones de navegador separadas de tokens del SDK.
- Scopes iniciales: profile:read, saltotag:read, achievements:read, achievements:write, leaderboards:read, leaderboards:write, saves:read, saves:write y friends:read. Escrituras sujetas también al tipo de cliente y políticas del juego.
- OAuth no implica implementar OpenID Connect: no anunciar discovery, id_token ni compatibilidad OIDC hasta soportarlos y verificarlos expresamente.

## 7. Modelo de datos

| Dominio | Entidades propuestas y restricciones principales |
| --- | --- |
| Identidad | players, external_identities (issuer/subject únicos), sessions, player_profiles (SaltoTag único según regla acordada). |
| Equipos | developer_organizations, organization_members (usuario/organización único; owner, admin, developer, viewer). |
| Catálogo | games (slug único, titular y estado), game_releases, game_media, categories, game_categories, publication_reviews. |
| OAuth | oauth_clients, redirect_uris, allowed_origins, grants, authorization_codes, access_tokens, refresh_token_families y refresh_tokens. |
| Progreso | achievements (clave única por juego), player_achievements (jugador/logro único), achievement_progress, xp_ledger con referencia idempotente. |
| Biblioteca | library_entries (jugador/juego único), play_sessions, favorites. |
| Social | friendships, friend_requests, blocks, privacy_settings; impedir duplicados y respetar bloqueos en todas las consultas. |
| Marcadores | leaderboards, leaderboard_seasons, leaderboard_entries, score_submissions con idempotencia y política de validación. |
| Guardados | cloud_saves con jugador/juego/slot único, versión para concurrencia optimista y límites de tamaño. |
| Operación | webhook_endpoints, webhook_deliveries, outbox_events, notifications, reports, audit_logs y cuotas. |

Timestamps con zona horaria. FKs e índices según acceso por juego/usuario/estado. Transacción única para desbloqueo + XP + evento; el ledger permite reconciliar totalXP. No premiar XP ilimitado elegido por cada desarrollador: aprobación, topes y política global.

## 8. SDK y API

SDK inicial TypeScript/JavaScript, paquete propuesto @saltoplay/sdk sujeto a disponibilidad del nombre, distribución ESM y script CDN versionado. SDK de servidor separado para credenciales confidenciales. Ejemplo ejecutable de juego web y backend de referencia.

Superficie: auth.login/logout/getSession, player.getProfile/getSaltoTag, achievements.list/getProgress, leaderboards.list/submit, saves.get/set y eventos de sesión. APIs privilegiadas de desbloqueo/verificación desde servidor; ningún método de navegador concede confianza por sí solo.

Dos niveles de integridad: logros casuales declarados por cliente con límites y etiqueta apropiada, y logros/puntuaciones verificados por backend del juego. XP global competitivo sólo con política de confianza aprobada. Documentar que un resultado enviado por navegador puede falsificarse.

API REST /api/v1 con OpenAPI, validación en servidor, errores estables, paginación, límites, idempotencia y CORS por cliente. Nunca guardar secretos en localStorage. Webhooks firmados con timestamp, tolerancia de replay, identificador de evento y reintentos; entrega al menos una vez. Proteger destinos contra SSRF y comprobar URLs en el momento del envío.

Juegos embebidos en origen separado del portal y con iframe sandbox/CSP específicos. El SDK no debe dar acceso al DOM ni a las cookies del portal. Para juegos propios, decidir explícitamente cuándo conviene una página integrada en vez de iframe.

### 8.1. Juegos hosted y bridge interno

Requisito incorporado: los desarrolladores podrán subir una distribución web estática (HTML, JavaScript, CSS, imágenes, audio y WASM) que SaltoPlay publica y sirve. Tipos de distribución: hosted y external. Ambos consumen el mismo SDK público; hosted usa un transporte interno por iframe para integrar la sesión y la interfaz del portal.

Flujo de ejecución:

1. El jugador abre /jugar/[slug]. El servidor verifica publicación, versión, sesión y permisos concedidos. Puede ofrecer invitado si el juego lo permite; sin login obligatorio para consultar el catálogo.
2. El portal carga una versión inmutable del juego en un origen de ejecución propio de ese juego, separado del portal y de otros juegos. Preferir un dominio registrable independiente para contenido subido por terceros; el hostname definitivo queda por configurar.
3. El SDK del iframe anuncia ready con versión del protocolo. El portal valida event.origin contra el origen exacto de la versión y event.source contra iframe.contentWindow; intercambia nonce de lanzamiento y transfiere un puerto MessageChannel usando targetOrigin exacto. El juego también valida origen y ventana padre. El nonce correlaciona el lanzamiento; no sustituye la autenticación ni es un secreto si se entrega al juego.
4. El portal obtiene del servidor una sesión de juego breve, ligada al jugador, juego, versión, entorno, scopes y lanzamiento. El consentimiento se muestra en la interfaz del portal la primera vez o al ampliar permisos.
5. Por defecto, el token permanece en memoria del portal. El iframe solicita operaciones RPC al bridge; el portal llama a la API con esa credencial y devuelve sólo el resultado permitido. La API verifica todas las restricciones, no confía en un gameId o playerId enviado por el juego.
6. Si un juego necesita comunicarse directamente con su backend, puede solicitar una credencial efímera de audiencia específica o un ticket de canje de un solo uso. Su emisión requiere permisos explícitos, caducidad, validación de audiencia y controles del servidor. Nunca se entrega el token SaltoUruguayServer, una cookie de sesión, un refresh token ni un secreto de cliente.
7. Renovación controlada por el portal mientras la sesión siga autorizada. Al navegar/recargar el iframe, cerrar la partida, cerrar sesión o revocar permisos, cerrar el canal y revocar el lanzamiento; no reutilizar puertos entre documentos. Cada nueva carga exige handshake.

Protocolo RPC versionado con requestId, método, payload validado, respuesta/error, timeout, límites de frecuencia/tamaño y lista explícita de métodos. Las validaciones de origin/source se aplican al handshake de ventana; los mensajes del puerto se validan por su esquema y contexto de lanzamiento asociado. Rechazar métodos desconocidos, IDs duplicados, respuestas tardías y solicitudes fuera de permisos. Sin eval, ejecución de código remoto solicitada por mensajes ni RPC genérico hacia URLs arbitrarias.

API propuesta para el desarrollador (contrato ilustrativo, aún no implementado):

```ts
const play = await SaltoPlay.init(); // detecta transporte hosted o external
const player = await play.player.getSaltoTag();
await play.saves.set('slot-1', { level: 3 });
await play.achievements.requestUnlock('first-win');
```

El bridge también puede ofrecer locale, capacidades disponibles, cambios de sesión, pausa/reanudación, volumen, overlay de logros y solicitud de pantalla completa sujeta a interacción del usuario. El SDK debe declarar qué capacidades funcionan fuera de SaltoPlay. El cierre de sesión del juego desconecta su contexto; no cierra la cuenta SaltoUruguayServer globalmente.

Hosting no equivale a código confiable: logros declarados por el juego y puntuaciones del navegador conservan el nivel de integridad casual. El bridge aplica permisos, pero no demuestra que el jugador ganó. Las recompensas verificadas necesitan backend autoritativo o validación específica.

Pipeline de subida: upload firmado a cuarentena, cuota por organización, límites de tamaño comprimido/descomprimido y cantidad de archivos, rechazo de path traversal/symlinks y archivos de servidor, validación de entrypoint y MIME, manifest de capacidades/orígenes de red, análisis y revisión antes de publicar. Un paquete hosted no ejecuta código en nuestros servidores. Cada versión tiene hash, estado y assets inmutables; activar una versión y volver a la anterior son operaciones auditadas. Preview privado aislado de producción, sin credenciales de jugadores reales.

El dominio de ejecución no recibe cookies de SaltoUruguayServer/portal. Configurar CSP, frame-ancestors, Permissions-Policy y sandbox por capacidades, sin navegación superior ni popups por defecto. Para usar validación de origen exacto, mantener un origen no opaco con allow-same-origin únicamente en el origen externo aislado, nunca servir estas distribuciones bajo el origen del portal. Service workers deshabilitados inicialmente para evitar persistencia entre versiones. Compatibilidad WASM/WebGL y, si se ofrece memoria compartida, requisitos COOP/COEP documentados y probados.

Datos adicionales: hosted_uploads, hosted_builds, hosted_build_files, build_reviews y game_launches. Registrar quién subió/aprobó/publicó cada versión; separar permisos de subir, publicar y administrar OAuth. Cuotas de almacenamiento, transferencia y sesiones activas visibles en consola.

Criterios de aceptación: subir/publicar/revertir un juego de ejemplo; iniciar con SaltoUruguayServer sin otro login tras consentimiento; leer SaltoTag, guardar progreso y solicitar logro por bridge; invitado y permisos denegados; rechazo de origen/ventana incorrectos, iframe navegado y mensajes malformados; aislamiento entre juegos/versiones; token vencido/revocado; archivo malicioso o paquete que excede límites. Hosting y bridge forman parte del lanzamiento, dentro de entregas 2 y 3.

## 9. Lanzamiento desde cero

No se importan datos ni se consulta la base de la web principal. No existen clientes legados que mantener. La base, perfiles, juegos y credenciales de SaltoPlay nacen nuevos. Las migraciones de Drizzle crean y actualizan únicamente el esquema propio. El código anterior sirve como referencia y Conga/Ruleta pueden enlazarse hasta que se adapte su integración, sin duplicar ni trasladar su backend automáticamente.

Preparar una base PostgreSQL dedicada, registrar un cliente SaltoUruguayServer con callback exacto, configurar almacenamiento persistente y runtime aislado, verificar el circuito completo en staging y después configurar dominio y publicación. Cambiar enlaces de la web principal será una tarea explícita una vez que el nuevo destino funcione.

## 10. Entregas y criterios de aceptación

| Entrega | Resultado verificable |
| --- | --- |
| 0. Diseño y contratos | Mapa de pantallas, tokens visuales, wireframes de inicio/ficha/perfil/consola, decisiones de alojamiento y contrato de identidad. |
| 1. Base y acceso | Astro/Tailwind, Postgres/Drizzle, acceso SaltoUruguayServer real, sesión local, permisos, OneTap con fallback y navegación responsive. |
| 2. Catálogo y publicación | CRUD por organización, carga de medios, borradores, revisión administrativa, publicación/suspensión y búsqueda con datos reales. |
| 3. Plataforma y SDK | OAuth público/confidencial, SaltoTag, consentimiento/revocación, logros idempotentes, XP y ejemplo integrado documentado. |
| 4. Jugador y servicios | Biblioteca, perfiles, privacidad, amigos/bloqueos, marcadores, guardados, actividad y notificaciones. |
| 5. Operación y lanzamiento | Juegos propios integrados, backups, métricas, límites, staging y lanzamiento en el dominio, sin migración de datos. |

El alcance de lanzamiento incluye las cinco entregas. Funciones posteriores: SDK Unity/Godot nativo, matchmaking genérico, torneos propios, monetización, pagos, tienda de ejecutables, chat y launcher de escritorio. No se prometen dentro del primer lanzamiento.

Pruebas necesarias: OAuth contra replay/PKCE incorrecto/redirect inválido/refresh reutilizado; aislamiento entre organizaciones y juegos; logro concurrente sin doble XP; revocación y suspensión; privacidad/bloqueos; guardados concurrentes; webhook duplicado/fallido; E2E del circuito completo; regresión de partidas multijugador; migración y rollback. Validación visual en móvil/escritorio y teclado. No ejecutar builds ni migraciones de la web principal durante esta fase de planificación.

## 11. Decisiones pendientes, con propuesta por defecto

- Alojamiento: Node con Postgres administrado; si se mantiene Vercel, ajustar adaptador, pool y ejecución de tareas.
- Publicación: cualquier usuario SaltoUruguayServer puede solicitar alta como desarrollador; cada juego requiere revisión antes de ser público. Sandbox privado desde su creación.
- Formatos iniciales: juegos hosted mediante subida de distribuciones web estáticas, juegos web propios y juegos externos registrados; no ejecutar backends ni binarios nativos subidos por desarrolladores.
- Identidad: SaltoUruguayServer conserva cuentas; SaltoPlay crea nuevos tags y progreso en una base independiente, con lectura desde SaltoUruguayServer cuando se implemente.
- Alcance: trasladar SaltoPlay y los juegos arcade propios; conservar enlaces a otros productos del ecosistema.
- Recursos operativos antes de producción: cliente OAuth SaltoUruguayServer registrado con callbacks exactos, Postgres de cada entorno, almacenamiento/CDN, credenciales Pusher si se mantiene, dominio/DNS y configuración de despliegue. No hacen falta para comenzar la implementación local.

## Referencias técnicas

- Astro SSR/adaptadores: https://docs.astro.build/en/reference/adapter-reference/
- Tailwind CSS con Astro: https://tailwindcss.com/docs/installation/framework-guides/astro
- Seguridad OAuth (PKCE, redirects, refresh): https://www.rfc-editor.org/rfc/rfc9700.html
- Handshake entre ventanas: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
- Canal privado del bridge: https://developer.mozilla.org/en-US/docs/Web/API/Channel_Messaging_API/Using_channel_messaging
