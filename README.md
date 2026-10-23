# SaltoPlay

Plataforma de juegos para `play.saltouruguayserver.com`. Astro SSR, Tailwind CSS v4, PostgreSQL y Drizzle. Proyecto nuevo: **sin importaciones de datos ni cambios en la web principal**. El esquema propio usa migraciones SQL versionadas.

## Desarrollo

Requiere Node 22.12+ y pnpm 11.

```sh
pnpm install
pnpm dev --background
# En otra terminal: runtime aislado para la demo y juegos hosted
pnpm run runtime
```

Abrir `http://localhost:4321`. El portal utiliza el puerto 4321 y la demo `http://127.0.0.1:4322`. El servidor runtime sólo escucha loopback por defecto. El script se invoca con `pnpm run runtime` porque pnpm 11 reserva `pnpm runtime` para gestionar runtimes.

Sin `DATABASE_URL`, el sitio presenta una vista de demostración explícita y Órbita funciona con el bridge real. Los guardados/logros de esa demo viven en memoria de la página padre; no simulan persistencia de cuenta. Conga y Ruleta Loca enlazan a sus páginas actuales.

Para detener Astro: `pnpm exec astro dev stop`. Para el runtime, Ctrl+C en su terminal.

## Configuración conectada

1. Copiar `.env.example` a `.env` y configurar una **base PostgreSQL nueva y dedicada**. No usar la base de SaltoUruguayServer.
2. Registrar en SaltoUruguayServer un cliente OAuth con callback exacto `PUBLIC_APP_URL/auth/callback`. Agregar ID y secreto a `.env`.
3. El rol de administrador se hereda del booleano `is_admin` devuelto por `/oauth/userinfo` de SaltoUruguayServer y se sincroniza en cada inicio de sesión. Opcionalmente, `ADMIN_SUS_SUBJECTS` permite autorizar identificadores concretos como excepción local; dejarlo vacío para depender sólo del rol central. No usar email como identificador. Los cambios de rol centrales se reflejan al volver a iniciar sesión, no en tiempo real.
4. Revisar los archivos SQL en `src/db/migrations`. La integración de Astro ejecuta `pnpm db:migrate` al finalizar el build contra la base dedicada indicada por `DATABASE_URL`; también se puede ejecutar manualmente. Un error de migración hace fallar el build. No se ejecuta al iniciar ni al comprobar tipos.
5. Reiniciar Astro después de cambiar variables de entorno.

El acceso usa Authorization Code + PKCE S256. La sesión local es HttpOnly, host-only y Secure en HTTPS. OneTap usa el modo custom-auth del SDK SaltoUruguayServer y desemboca en ese mismo flujo; se puede desactivar con `SUS_ONETAP=false`. No se confía en el perfil ni en tokens recibidos del widget.

### Cambios de esquema

```sh
# Después de editar src/db/schema.ts: genera SQL y metadatos sin conectar a Postgres.
pnpm db:generate
# Tras revisar el SQL: aplica sólo las migraciones pendientes a DATABASE_URL.
pnpm db:migrate
# Opcional: inspeccionar la base configurada.
pnpm db:studio
```

Versionar tanto los archivos SQL como la carpeta `meta` de Drizzle. La migración inicial crea las tablas de SaltoPlay; no importa datos de SaltoUruguayServer ni ejecuta seeds.

### Despliegue en Vercel

El portal usa `@astrojs/vercel`. Configurar las variables de `.env.example` en Vercel y disponer de `DATABASE_URL` durante el build para aplicar las migraciones pendientes de la base dedicada de SaltoUruguayServer Play. El runtime de juegos requiere su propio alojamiento y almacenamiento persistente, separado del portal.

## Implementado

- Interfaz dark responsive: descubrimiento, filtros/búsqueda, fichas, biblioteca, perfil público/privado, SaltoTag, logros y ajustes.
- Consola por propietario: crear juego, editar borrador, crear logros casuales, registrar clientes públicos/confidenciales y enviar a revisión.
- Administración por subject SaltoUruguayServer: publicar, devolver a borrador, suspender y seleccionar una distribución publicada anterior.
- OAuth para juegos con callbacks exactos, PKCE obligatorio, códigos de un uso consumidos bajo bloqueo de fila, tokens opacos persistidos como hash, refresh rotatorio y revocación de familia por reutilización.
- API v1: perfil, SaltoTag, logros casuales idempotentes y guardados con concurrencia optimista.
- SDK web en `public/sdk/saltoplay.js`: transportes hosted/external, errores, timeouts y control de versiones de guardado. No se publicó un paquete npm.
- Bridge hosted con validación de origen/ventana, puerto privado, lista de métodos y límites de mensajes. El token de partida queda en el portal y caduca en cinco minutos.
- UI unificada del SDK 0.2: avisos flotantes de logros nuevos confirmados por la API, notificaciones generales, cola, cierre, posición/duración configurables, pausa y movimiento reducido. Hosted presenta la UI en el portal y external usa el mismo renderer aislado con Shadow DOM. La UI visual no concede recompensas. Guerra Saltana carga directamente el SDK oficial alojado en el portal.
- Subida de ZIP validado, almacenamiento fuera de public y runtime separado. Distribuciones inmutables, revisión y selección de versión activa.
- Documentación de integración dentro de `/docs` y demo interactiva en `/jugar/orbita`.
- Portal centrado en jugadores: juegos destacados, biblioteca y servidores/series, sin promociones de desarrollo en el inicio o la cabecera.
- Servidores y series en `/servidores`, administrables en `/admin/servidores`: estado editorial, dirección copiable, versión, nota de acceso y enlace HTTPS o de launcher. RUSTico 7 aparece como serie activa confirmada por el propietario, con el Discord oficial de la web principal como enlace inicial editable. No se consulta ni se afirma un estado de conexión en tiempo real.

## Hosting de juegos

Esta base implementa almacenamiento en disco persistente y un proceso Node independiente para servir distribuciones. **No usar filesystem efímero/serverless para hosted**. Portal y runtime deben compartir el volumen configurado en `HOSTED_STORAGE_PATH`.

Producción necesita:

- Portal HTTPS y Postgres dedicado.
- Dominio registrable separado para el runtime, configurado como `HOSTED_BASE_DOMAIN` con DNS/TLS wildcard y proxy hacia el proceso runtime.
- Cada juego usa `https://<game-id>.<HOSTED_BASE_DOMAIN>/<build-id>/index.html`.
- Proxy que preserve el Host original y limite cuerpo de subida a 26 MB, conexiones y frecuencia de solicitudes. No publicar el puerto de Node directamente.
- Respaldos del volumen y Postgres coordinados. El archivo `published.json` es un puntero del runtime; no contiene credenciales.
- Almacenamiento S3/CDN puede sustituir esta implementación después; todavía no hay adaptador S3.

Límites de paquetes: 25 MB ZIP / 100 MB extraído / 30 MB por archivo / 1500 entradas / 10 builds por juego. Assets estáticos y WASM de una hebra; nada de backends o ejecutables nativos. CSP bloquea red externa, service workers y subframes. No hay un antivirus externo conectado; la validación estructural no certifica que el código de un juego sea confiable.

## Validación

```sh
pnpm check
pnpm test
pnpm build
```

Las pruebas automáticas cubren PKCE, redirecciones, credenciales, handshake/RPC y paquetes maliciosos. La verificación contra SaltoUruguayServer y PostgreSQL reales requiere configurar ambos servicios; no se ha simulado su éxito. El build es sólo de este proyecto y no modifica esquemas.

## Trabajo pendiente antes del lanzamiento completo

- Verificación E2E con cliente SaltoUruguayServer y PostgreSQL reales; configuración de DNS, TLS, backups y despliegue.
- Organizaciones y roles de equipo (por ahora cada juego tiene un propietario), amigos/bloqueos, marcadores, webhooks/outbox y notificaciones persistentes.
- API de servidor para logros verificados y XP, límites distribuidos, cuotas por organización y monitorización. Los logros casuales nunca conceden XP global.
- Preview privado firmado, actualización de juegos sin retirarlos del catálogo, portadas personalizadas y rotación/revocación de clientes desde la consola.
- Borrado/exportación de datos, operador/contacto y revisión de términos/privacidad antes de abrir registros públicos.
- Publicación de SDK versionado como paquete, tipos públicos, OpenAPI descargable y SDK de servidor.

No se presenta esta base como lanzamiento completo: la documentación del sitio distingue las funciones disponibles de las planificadas. Ver [PLAN.md](PLAN.md).
