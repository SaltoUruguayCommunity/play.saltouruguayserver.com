# Juegos en una app nativa

La app mantiene su sesión de **SaltoUruguayServer**. No crea una sesión de portal ni usa cookies. El SDK 0.6 recoge automáticamente el fragmento del token de partida.

## Contrato

POST /api/native/token, con Authorization: Bearer del access token OAuth de usuario de SaltoUruguayServer y Content-Type: application/json.

Cuerpo: { "gameId": "UUID" }. Para external, agregar clientId de un cliente público registrado para ese juego. El origen de la URL del juego debe coincidir con un callback registrado. Los permisos son los del cliente; hosted usa los permisos del bridge.

Si falta autorización o hay permisos nuevos, responde 403 con { error: "consent_required", game: { id, title }, scopes: [...] }. La app muestra su diálogo nativo con el juego y esos permisos. Sólo después de aceptar repite con consent: true. Si cancela, no repite ni inicia una partida autenticada. La app mobile implementa este diálogo con el BottomSheet nativo de su sistema de UI.

Si está autorizado, responde 200 con { access_token, token_type: "Bearer", refresh_token, client_id, expires_in: 3600, scope, launch_url }.

SaltoPlay obtiene la identidad de /oauth/userinfo del emisor configurado, sin consultar la base principal. El token opaco queda almacenado como hash, limitado al usuario, juego y permisos; en hosted también al build activo. El refresh token pertenece únicamente a SaltoPlay y a este juego. Los clientes confidenciales mantienen su flujo OAuth existente.

## Abrir la WebView

Desde la app, usar launch_url devuelto por el servidor y agregar el parámetro play_access_token al fragmento:

~~~js
const url = new URL(result.launch_url);
const fragment = new URLSearchParams(url.hash.slice(1));
fragment.set('play_access_token', result.access_token);
fragment.set('play_refresh_token', result.refresh_token);
fragment.set('play_client_id', result.client_id);
fragment.set('play_expires_in', String(result.expires_in));
url.hash = fragment.toString();
// Usar url.toString() como source.uri de la WebView.
~~~

En el juego, cargar el SDK actualizado temprano y llamar normalmente a SaltoPlay.init(). Para esta partida no necesita clientId ni redirectUri. El SDK elimina sólo play_access_token mediante history.replaceState, mantiene el token en memoria y llama a /api/v1/* por Bearer. No lo guarda en sessionStorage ni localStorage. La entrada del fragmento tiene prioridad sobre sesiones OAuth guardadas y selecciona transporte directo incluso dentro de un iframe.

El fragmento no se envía al servidor HTTP del juego, pero sus scripts pueden leerlo. No incluir nunca el token de SaltoUruguayServer ni una sesión de portal. No registrar la URL completa en logs. Los fragmentos deben usar parámetros URLSearchParams: los routers hash necesitan una ruta de entrada compatible.

## Duración y cierre

El access token dura una hora. Antes de una llamada a la API, el SDK renueva automáticamente si quedan menos de 30 segundos, usando /oauth/token con grant_type=refresh_token y el client_id propio de SaltoPlay. El refresh token rota en cada uso, dura como máximo 30 días desde el inicio y su reutilización revoca la familia. En hosted la renovación conserva el build autorizado y falla si cambió. No utiliza ni renueva la sesión de SaltoUruguayServer. Al recargar se pierde la sesión en memoria y la app inicia otra partida. auth.getSession() informa transport: native; si la renovación fue rechazada, auth.login() devuelve native_auth_required. auth.logout() borra la copia local. Revocar el juego desde Ajustes revoca la sesión en servidor.

Revocar el juego desde Ajustes elimina también estos tokens. Revocar la sesión de SaltoUruguayServer no revoca automáticamente un token de partida ya emitido: el access token dura como máximo una hora y la sesión independiente puede renovarse hasta que venza o se revoque su refresh token.

El endpoint no habilita CORS para juegos. Las peticiones nativas pueden omitir Origin; si lo incluyen, debe coincidir con el portal. La API del juego conserva su validación de origen del runtime o callbacks registrados.
