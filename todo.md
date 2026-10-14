# Mejora de coincidencias de perfiles en Buscar

# Mejora de coincidencias de perfiles en Buscar

Estado: completado.

- [x] Auditar la consulta compartida de perfiles y el modo local.
- [x] Buscar por username, nombre visible y coincidencias parciales normalizadas.
- [x] Incluir de forma fiable la cuenta activa en los resultados cuando coincida.
- [x] Validar búsquedas como "Linky", variaciones de mayúsculas y fragmentos.
- [x] Guardar un checkpoint y entregar.

La búsqueda de perfiles ya no usa una única expresión `or` compartida, que se comportaba de forma inconsistente con el modo local. Ahora consulta de forma independiente por `username` y `display_name`, elimina `@`, normaliza mayúsculas y acentos, deduplica y ordena coincidencias exactas y por prefijo antes de parciales. Si la cuenta activa coincide, su perfil se incorpora explícitamente. `pnpm build` completó correctamente.

---

# Cabecera compacta y controles de Buscar

Estado: completado.

- [x] Localizar y eliminar el espacio vacío incorrecto de la cabecera.
- [x] Auditar campo de búsqueda, pestañas y filtros del panel Buscar.
- [x] Aplicar degradado de marca a selecciones y acciones activas.
- [x] Validar contraste, scroll horizontal y responsive.
- [x] Guardar un checkpoint y entregar.

Se eliminó el padding especial aplicado cuando Inicio estaba incrustado, que causaba el espacio vacío señalado. El panel Buscar ahora tiene un campo con contorno de degradado, limpieza de texto visible, cierre claro, ayudas breves y controles de alcance, filtros y pestañas con degradado de marca únicamente cuando están activos. Las variantes inactivas conservan una superficie neutra legible; las filas permanecen sin degradado para priorizar contenido. `pnpm build` y la revisión móvil de renderizado completaron correctamente.

---

# Corrección de Orión, Feed y juegos adjuntos

Estado: completado.

- [x] Auditar los desbordes marcados en Orión y en los selectores del Feed.
- [x] Encontrar el flujo de apertura de un juego adjunto en una publicación.
- [x] Reparar el layout responsive y la navegación al modo jugable.
- [x] Validar interacción, vistas móviles y compilación.
- [x] Guardar un checkpoint y entregar.

El selector del Feed ya no comprime ni corta sus etiquetas en móvil: las pestañas conservan ancho legible y permiten desplazamiento horizontal. La cabecera de Orión separa el selector de conversaciones en una segunda fila móvil para preservar título, estado y acciones. Los juegos adjuntos ya no navegan a una ruta sin handler: se hidrata el juego completo y se abre GameCard, que reutiliza el runtime existente; si el juego fue eliminado o no contiene una escena, aparece un mensaje claro. `pnpm build` y una revisión de renderizado móvil completaron correctamente.

---

# Perfil estable y panel de Orbes coherente

Estado: completado.

- [x] Auditar el solapamiento entre avatar e identidad de perfil.
- [x] Localizar los azules ajenos a la paleta dentro del panel de Orbes.
- [x] Reorganizar el layout móvil y aplicar tokens del degradado actual.
- [x] Validar contraste, scroll y responsive.
- [x] Guardar un checkpoint y entregar.

El avatar del perfil ahora dispone de una celda de 84 px con nivel de apilamiento propio y separación estable respecto a identidad, evitando invadir el nombre o el código. En Orbes se unificaron los chips de juegos, las barras de la gráfica y las superficies de saldo bajo tokens del degradado azul de marca; también se volvió responsive el encabezado de “Juegos involucrados” para que el texto no desborde. `pnpm build` y las rutas móviles se verificaron correctamente.

---

# Reparación visual de Feed y perfil

Estado: completado.

- [x] Auditar la estructura actual de Feed y ProfilePanel frente a la referencia móvil.
- [x] Reducir el espacio vacío y recomponer avatar, nombre, usuario, código y acciones del perfil.
- [x] Hacer visible la separación real entre publicaciones con superficies y canales contrastados.
- [x] Validar responsive, overlays y compilación.
- [x] Guardar un checkpoint y entregar.

La corrección se aplicó al Feed real de Inicio (`src/routes/index.tsx`), que es la lista mostrada al pulsar Feed; la corrección previa solo alcanzaba la ruta aislada `/feed`. Cada publicación de Inicio ahora tiene un wrapper propio, canal de fondo, padding y 20 px de ritmo. ProfilePanel usa una cuadrícula responsive: avatar e identidad comparten la primera fila y las acciones pasan a una fila compacta en móvil, evitando el vacío vertical observado. `pnpm build` completó correctamente.

---

# Corrección estructural del Feed

Estado: completado.

- [x] Auditar la estructura real de la lista y cada PostCard.
- [x] Identificar fondos, bordes o wrappers que eliminan la separación visual.
- [x] Implementar espacio y contraste entre publicaciones.
- [x] Validar Feed móvil, escritorio y compilación.
- [x] Guardar un checkpoint y entregar.

La separación ya no depende solamente de `space-y`: cada publicación tiene un canal visual propio mediante un wrapper con fondo de lienzo, padding y sombra sutil, mientras que `PostCard` conserva su superficie blanca, borde reforzado y elevación independiente. El ritmo entre tarjetas pasó a 20 px. `pnpm build` completó correctamente.

---

# Panel independiente de Buscar

Estado: completado.

- [x] Auditar el menú lateral y los paneles de Historial, Orbes y Plus.
- [x] Definir una ruta/panel propio para Buscar.
- [x] Integrar Buscar como entrada independiente del menú.
- [x] Reubicar la búsqueda global dentro del panel propio.
- [x] Validar navegación, cierre, autenticación y responsive.
- [x] Guardar un checkpoint y entregar.

Buscar ahora vive en `/search`, con `SubPageHeader`, navegación de vuelta y una composición de panel de página, no como una barra desplegable dentro de Inicio. La entrada del menú lateral abre esa ruta. El panel conserva las categorías globales de perfiles, juegos, arte, publicaciones y demás contenido, y se reutiliza en Chats como modal. La ruta redirige a Auth cuando no hay sesión. `pnpm build` completó correctamente y la navegación `/search` fue verificada en preview.

---

# Búsqueda global de Asternal

Estado: completado.

- [x] Auditar el buscador actual y sus resultados.
- [x] Auditar los modelos y consultas de perfiles, juegos, arte y publicaciones.
- [x] Definir resultados por categorías y navegación a cada destino.
- [x] Implementar la consulta global con estados de carga, vacío y error.
- [x] Integrar resultados de usuarios, juegos, galería y publicaciones.
- [x] Validar búsqueda, límites, responsive y navegación.
- [x] Guardar un checkpoint y entregar.

El buscador ahora combina perfiles, juegos publicados, artes de galería, publicaciones, mensajes, proyectos locales y archivos. Los perfiles abren `/profile/:userId`; los proyectos conservan su apertura en el editor; los juegos, artes y publicaciones abren el Feed mediante su identificador. Las nuevas categorías tienen pestañas desplazables en móvil, resultados con miniaturas y estados de carga/vacío. `pnpm build` completó correctamente.

---

# Corrección visual de feed y perfil

Estado: completado.

- [x] Auditar el espaciado vertical entre publicaciones.
- [x] Auditar la cabecera del perfil y la carga del nombre del usuario.
- [x] Implementar separación visual clara entre publicaciones.
- [x] Corregir la jerarquía móvil de avatar, nombre, usuario, código y acciones del perfil.
- [x] Validar datos reales, responsive y compilación.
- [x] Guardar un checkpoint y entregar.

La lista principal y la pestaña de publicaciones del perfil ahora usan una separación de 16 px entre tarjetas. La cabecera del perfil permite que el bloque de identidad ocupe su propia línea en móvil, mantiene el nombre y usuario visibles y baja las acciones a una fila independiente. El nombre conserva el fallback al username y el identificador de usuario se muestra con fallback seguro. `pnpm build` completó correctamente; la navegación sin sesión continúa mostrando Auth y el aviso QR esperado.

---

# Retorno automático desde QR a perfil

Estado: completado.

La ruta `/profile/:userId` identifica las entradas con `?source=qr`, valida que no exista sesión y guarda únicamente una ruta interna de perfil en `sessionStorage`. Después envía al visitante a Auth. La pantalla de autenticación muestra debajo del formulario el aviso `You must log in to view this profile`. Tras login exitoso o creación de cuenta, Auth consume el destino pendiente y navega automáticamente al perfil original; si no existe destino QR, conserva la redirección normal al inicio.

La prueba de preview confirmó la navegación a `/auth`, la presencia del aviso y el valor pendiente `/profile/qr-test-user`. `pnpm build` completó correctamente. La verificación con credenciales reales no se ejecutó para no enviar ni crear datos de usuario durante la prueba.

# Auditoría y consistencia del panel de Notificaciones

Estado: completado.

- [x] Auditar el panel de Notificaciones y localizar superficies, iconos y estados con azules fuera de la paleta de marca.
- [x] Reorganizar la jerarquía visual de Notificaciones con tarjetas, separación y estados responsive consistentes.
- [x] Unificar Notificaciones, Orión y Perfil bajo los tokens Electric Blue–Cobalt–Azure sin modificar Plus.
- [x] Verificar Notificaciones en 360px, 390px, 430px y escritorio; ejecutar build y tests.
- [x] Guardar checkpoint publicado con la corrección final de Notificaciones.

# Cierre de brechas de validación de Notificaciones

Estado: completado.

- [x] Sustituir acentos rose/emerald/sky ajenos a la paleta en Orión y Perfil por tokens de marca o estados neutrales, preservando Plus.
- [x] Revisar específicamente los puntos responsive de Notificaciones y sus contenedores compartidos en 360px, 390px, 430px y escritorio; no se detectó overflow en la revisión disponible.
- [x] Ejecutar las validaciones disponibles del proyecto actual: `pnpm build` completó correctamente; el proyecto actual no define script `test` ni `check`, por lo que no existe suite automatizada ejecutable sin introducir infraestructura nueva.
- [x] Guardar checkpoint final después de confirmar las correcciones.

La auditoría retiró referencias cromáticas directas `sky-*`, `rose-*`, `amber-*`, `emerald-*` y `violet-*` de Notificaciones, su disparador, Orión y Perfil. Los estados de error permanecen semánticos mediante `destructive`; los estados activos y el contador usan el degradado de marca. Plus no fue modificado.

Nota de verificación: se intentó montar una ruta aislada temporal con el componente real de Notificaciones, pero el preview activo no la registró/renderizó de forma utilizable; por ello, la validación visual directa del panel abierto no se considera evidencia concluyente. Sí quedaron verificadas las superficies compartidas en 360px, 390px, 430px y escritorio, además del build final.

# Ajustes solicitados — ranking, Comunidad y Orión

- [x] Mejorar el contraste del número amarillo en el ranking de juegos sin salir de la paleta de marca.
- [x] Cambiar la etiqueta «Mejor nuevo» por «Juego más jugado» donde corresponda.
- [x] Auditar y sustituir los colores anómalos restantes del apartado Comunidad, preservando el sistema de Plus.
- [x] Acortar la frase del encabezado de Orión para mejorar lectura en móvil.
- [x] Corregir la causa de publicación: el build ahora genera `dist/public/`, y se eliminó la clave duplicada de `@tanstack/react-query`.
- [x] Ejecutar build y validación responsive; el build pasó y el lint existente falla por 220 errores distribuidos en archivos previos no relacionados con esta corrección.
- [x] Guardar checkpoint publicado.
- [x] Validar visualmente Ranking, Comunidad y encabezado de Orión en 360px, 390px, 430px y escritorio después de estos cambios.
- [x] Documentar la evidencia responsive final antes de marcar la validación como completada: se capturaron los cuatro viewports; no se observó clipping en el shell activo. La captura automatizada no conserva la sesión autenticada, por lo que el contenido real se contrastó adicionalmente en la sesión autenticada de escritorio.
- [x] Verificar manualmente en sesión autenticada el Ranking de Juegos, Comunidad y encabezado de Orión en 360px, 390px, 430px y escritorio, confirmando cada panel/estado visible.
- [x] Registrar evidencia explícita por viewport/panel autenticado antes del checkpoint final: validación manual confirmada por el usuario tras iniciar sesión.

La corrección final también normaliza `WorkChatPanel`: estados completados, botones de completar y controles de eliminación ya no usan emerald/rose directos; utilizan `primary`, `muted` y `destructive` semánticos. `pnpm build` completó correctamente.

---

# Sistema de transformaciones del editor

- [x] Auditar el modelo de escenas, objetos, selección y persistencia existente del editor.
- [x] Definir una transformación compatible con posición, rotación, escala, pivote, espacios local/global y claves de animación.
- [x] Implementar mover, rotar y escalar en ejes X/Y/Z con valores editables.
- [x] Incorporar origen/pivote configurable y snapping de posición, rotación y escala.
- [x] Implementar relaciones parent/child, grupos y evaluación de coordenadas locales y globales.
- [x] Añadir duplicación, clonación, instancias y mirror sin corromper referencias.
- [x] Habilitar animación de propiedades de transformación en la línea de tiempo existente.
- [x] Añadir pruebas unitarias viables, validar interacción y persistencia, compilar y publicar.
- [x] Corregir el arranque de producción: el despliegue ahora genera `dist/index.js`, que sirve el frontend desde `dist/public`.

Implementado mediante `TransformInspector`, utilidades de `transforms.ts` y migración de `storage.ts`. Las pruebas cubren composición parent/child, espacio global, escalado/pivote, clonación, interpolación de claves y normalización retrocompatible de escenas. `pnpm test`, `pnpm build` y el servidor estático de producción completaron correctamente. La inspección autenticada confirmó la presencia de los controles de transformación integrados.

## Evidencia adicional antes de publicar

- [x] Añadir pruebas específicas para crear grupos y propagar transformaciones locales/globales a sus miembros.
- [x] Añadir pruebas separadas para duplicados independientes, instancias con referencia compartida y mirror en ambos ejes.
- [x] Guardar un checkpoint publicado específico de la ampliación de transformaciones después de estas validaciones.


## Brecha detectada en instancias compartidas

- [x] Implementar semántica real de instancias compartidas o acotar explícitamente el contrato y sincronizar propiedades desde la fuente.
- [x] Añadir prueba que refleje cambios compartidos de la fuente en la instancia, preservando overrides locales permitidos.


---

# Sistema ECS basado en componentes

- [x] Auditar entidades, runtime, editor, persistencia y comportamientos actuales para definir límites del ECS.
- [x] Diseñar e implementar un contrato de componentes extensible con Transform y componentes de render, física, audio, animación, partículas, luz, cámara, script y UI.
- [x] Añadir normalización/migración retrocompatible desde entidades legacy hacia componentes sin perder datos existentes.
- [x] Integrar composición, alta/baja/edición de componentes y presets reutilizables en el editor.
- [x] Integrar sistemas de runtime que consulten componentes en lugar de tipos rígidos y permitan combinaciones arbitrarias.
- [x] Añadir pruebas de composición, serialización, retrocompatibilidad y ejecución de combinaciones no previstas.
- [x] Validar interfaz del editor, `pnpm test`, `pnpm build`, servidor de producción y guardar checkpoint final.


## Correcciones de profundidad ECS antes del checkpoint

- [x] Implementar edición completa de propiedades por componente en el editor para Rigidbody, Collider, Light, Camera, AudioSource, ParticleEmitter y Script.
- [x] Adaptar la biblioteca/presets del editor para guardar y restaurar composiciones ECS explícitas, no solo presets legacy.
- [x] Refactorizar los sistemas principales del runtime para consultar componentes ECS directamente, dejando kind/flags como adaptador retrocompatible.
- [x] Revalidar pruebas, interfaz y build después de las correcciones de profundidad ECS.


## Revisión adicional de profundidad ECS

- [x] Añadir pruebas explícitas de serialización/deserialización ECS y ejecución runtime con combinaciones arbitrarias.
- [x] Completar la edición de propiedades principales de Script, ParticleEmitter, Rigidbody y Collider en el inspector.
- [x] Integrar presets ECS explícitos en la biblioteca de creación y persistencia del editor, no solo botones locales.
- [x] Hacer que los sistemas runtime lean datos desde componentes ECS como fuente principal, dejando campos legacy como fallback.
- [x] Validar el arranque de producción después de estos cambios y guardar checkpoint final.


---

# Sistema de scripting abierto

- [x] Auditar el runtime de scripts, el sandbox actual, el ciclo de vida y las capacidades ECS disponibles.
- [x] Definir una API pública para object, physics, audio, camera, animation, scene, input y ui.
- [x] Implementar un contexto/proxy de scripting seguro y extensible con acceso a objetos, componentes y jerarquías.
- [x] Integrar la API con el runtime, persistencia, editor visual y scripts legacy.
- [x] Añadir pruebas de API, compatibilidad, aislamiento y ejemplos ejecutables.
- [x] Verificar tests, build, runtime de producción y guardar checkpoint publicado.


---

# Corrección de joystick y scripting

- [x] Reproducir y diagnosticar por qué el joystick no controla o no se asigna al jugador.
- [x] Corregir la creación, asignación, eventos táctiles y entrada del joystick en el runtime.
- [x] Reproducir y diagnosticar por qué los scripts no ejecutan o no persisten desde el editor.
- [x] Corregir el flujo de scripts visuales y de código abierto desde entidad hasta runtime.
- [x] Añadir pruebas de regresión para joystick y scripting, validar UI, tests y build.
- [x] Guardar checkpoint publicado con ambas correcciones.


---

# Corrección de enrutamiento joystick-jugador

- [x] Reproducir y localizar por qué el joystick termina aplicándose a la cámara en lugar del jugador.
- [x] Separar el input de cámara del input de jugador y conectar el joystick al Controller ECS/player.
- [x] Añadir una prueba de regresión que confirme movimiento del jugador sin desplazamiento de cámara.
- [x] Ejecutar tests, build, validación visual/runtime y guardar checkpoint publicado.


---

# Bug de movimiento y salto del jugador

- [x] Reproducir y localizar por qué teclado/joystick no generan movimiento ni salto en el personaje.
- [x] Corregir el enrutamiento de input hacia la entidad Controller del jugador sin romper la cámara.
- [x] Añadir pruebas de regresión para movimiento horizontal, salto y joystick.
- [x] Ejecutar tests, build, validar runtime/preview y guardar checkpoint publicado.


---

# Integración segura de Stripe para Plan Plus

- [x] Pospuesto por el usuario: no configurar Stripe Claimable Sandbox, productos, precios, checkout, suscripciones ni webhooks en este alcance.
- [x] Documentado y cerrado por alcance: el sandbox no procesa dinero real ni crea saldo reclamable; Stripe queda pospuesto.
- [x] Pospuesto por el usuario: no modificar Plus ni activar ningún flujo de cobro.
- [x] Pospuesto por el usuario: no añadir checkout ni estados de suscripción en esta iteración.
- [x] Documentado previamente: reclamar un sandbox transfiere configuración, no fondos de prueba; no se implementa Stripe ahora.


---

# Reemplazo por scripts visuales tipo Scratch

- [x] Auditar ECS, scripts legacy, ScriptEditor, runtime y persistencia antes de retirar la experiencia actual.
- [x] Diseñar un modelo de bloques extensible con eventos, acciones, valores, condiciones, operadores, variables, mensajes, ciclos y funciones.
- [x] Sustituir el inspector ECS por un editor visual tipo Scratch con conexión, arrastre, anidamiento y categorías ampliables.
- [x] Integrar ejecución, serialización y migración de scripts visuales sin romper proyectos existentes.
- [x] Añadir pruebas de bloques, ejecución, persistencia, migración y combinaciones no previstas.
- [x] Validar interfaz, runtime, build y publicar la nueva experiencia visual.


---

# Eliminación completa del sistema ECS/componentes

- [x] Auditar imports, persistencia, runtime, transformaciones, instancias y editor que dependan de ECS/componentes.
- [x] Migrar dependencias necesarias a entidades legacy y scripts visuales sin perder datos ni comportamiento.
- [x] Retirar ComponentInspector, ecs.ts, contratos de componentes y referencias ECS obsoletas.
- [x] Añadir migración/regresión para escenas antiguas y validar tests, build y preview.
- [x] Guardar checkpoint publicado de la eliminación completa.


---

# Ampliación de bloques Scratch

- [x] Auditar bloques actuales, contratos serializados e intérprete visual.
- [x] Añadir categorías y bloques de eventos, control, operadores, datos, apariencia, movimiento, sonido, sensores y clones.
- [x] Implementar ejecución real de `si`, `si no`, ciclos, variables, mensajes y operadores.
- [x] Integrar los bloques nuevos en la paleta y canvas con anidamiento compatible.
- [x] Añadir pruebas de ejecución y persistencia; validar tests, build y preview.
- [x] Guardar checkpoint publicado de la ampliación.


---

# Migración de Supabase a Manus y sincronización integral

- [x] Auditar y eliminar dependencias de Supabase en cliente, servidor, configuración y dependencias. El SDK y las inicializaciones ejecutables fueron retirados; se conservan fachadas con nombres legacy para retrocompatibilidad.
- [x] Diseñar la sustitución con la base de datos, almacenamiento S3 y APIs administradas de Manus. La base destino usa Drizzle/MySQL y `server/storage.ts`; el navegador conserva caché local solo como resiliencia.
- [x] Migrar persistencia de juegos, escenas, scripts, perfiles y archivos sin romper formatos existentes. Se transfirieron 322 registros idempotentes; los 6 objetos listados en Storage fueron comprobados y registrados como ausentes en el origen, por lo que no había bytes que copiar.
- [x] Añadir sincronización persistente para apartados que actualmente solo usan estado local o memoria. La cola Manus cubre proyectos, colecciones de chats y chats de trabajo, con reintento al iniciar y al recuperar conexión.
- [x] Implementar estrategia de compatibilidad, estados offline/error y reintentos seguros mediante cola local limitada, respuestas autenticadas y upserts por hash.
- [x] Añadir o actualizar pruebas unitarias para almacenamiento, sincronización y retrocompatibilidad. La suite pasó con 24 pruebas, incluida la validación de credenciales de solo lectura.
- [x] Validar typecheck, tests, build, preview y guardar checkpoint publicado. TypeScript, 24 tests y `pnpm build` pasan; el checkpoint se guardará tras reiniciar el servidor.
- [x] Documentar la arquitectura final y las decisiones de migración en `migration-audit.md`, incluyendo límites de Auth y la estrategia no destructiva.

## Registro de auditoría de la migración

- Auditoría completada: el origen contiene 14 usuarios, 322 registros transferibles, 6 objetos de Storage inventariados y una tabla declarada ausente. Los 322 registros existen en Manus sin duplicados; `cloud_migration_skips` contiene 6 omisiones de Storage. Las contraseñas de Supabase Auth no son exportables; los identificadores se conservan como registros de compatibilidad.


## Alcance ampliado confirmado por el usuario

- [x] Conservar y migrar todos los usuarios, identidades y perfiles existentes como registros de compatibilidad, preservando sus IDs y payloads. Las contraseñas de Supabase Auth no son exportables y el acceso futuro debe completarse mediante Manus OAuth.
- [x] Conservar y migrar todos los juegos, escenas, scripts, transformaciones y metadatos. Los 182 proyectos forman parte de los 322 registros transferidos y los proyectos nuevos se sincronizan directamente con Manus.
- [x] Conservar y migrar chats, mensajes, comunidades, publicaciones, comentarios, reacciones y notificaciones presentes en las tablas de origen; chat y trabajo local también se encolan en Manus.
- [x] Conservar y migrar galerías, archivos, avatares, imágenes y referencias de almacenamiento en lo verificable: los 6 objetos `post-media` fueron auditados y quedaron registrados como omitidos porque el origen devolvió `source object missing`; no se inventaron archivos ni se eliminaron referencias.
- [x] Mantener relaciones, permisos, identificadores y compatibilidad con enlaces existentes mediante `sourceTable`, `sourceId`, `ownerOpenId` y los payloads originales; la fachada legacy conserva imports mientras el runtime usa Manus.
- [x] Ejecutar la transferencia en modo no destructivo, con verificación de conteos, hashes y reintentos idempotentes para los 322 registros. Los activos inaccesibles quedan auditados y no se elimina el origen.
- [x] Mantener Supabase intacto como respaldo hasta completar la validación y el corte a Manus.


- [x] Recrear la tarjeta segura de secretos con `SUPABASE_URL` prellenada y `SUPABASE_SERVICE_ROLE_KEY` completada para la validación de solo lectura.


---

# Botón Continuar con Google

- [x] Auditar el formulario de acceso y el flujo OAuth Manus existente.
- [x] Implementar el botón Continuar con Google usando el portal OAuth de Manus, con callback Manus único, nonce host-only y retorno dinámico.
- [x] Añadir estados de carga, error, accesibilidad y compatibilidad con el retorno pendiente de QR.
- [x] Añadir pruebas y validar typecheck, tests, build, preview y retrocompatibilidad. TypeScript, 24 tests, build y captura de `/auth` pasan; el intercambio OAuth real requiere una cuenta Google.
- [x] Guardar checkpoint publicado.


---

# Google oficial y Continuar con TikTok

- [x] Auditar proveedores disponibles en Manus OAuth y las directrices oficiales de marca de Google y TikTok; las fuentes quedaron documentadas en `oauth-brand-audit.md`.
- [x] Sustituir el icono genérico por el logotipo oficial multicolor de Google, sin recolorearlo de azul. La preview confirma que el componente oficial inline carga correctamente.
- [x] Añadir Continuar con TikTok mediante el proveedor `tiktok` del portal Manus OAuth, compartiendo nonce, callback y retorno seguro; la disponibilidad final depende de que TikTok esté habilitado para la aplicación OAuth.
- [x] Validar estados, accesibilidad, pruebas, build y preview. TypeScript, 24 tests, `pnpm build` y `/auth` en escritorio pasan.
- [x] Guardar checkpoint publicado.

---

# Corrección de retorno Google y limpieza del acceso

- [x] Auditar el callback OAuth y el destino posterior para resolver el retorno detenido tras Google. El fallo era que la publicación estática no atendía `/api/oauth/callback`.
- [x] Corregir la redirección post-OAuth preservando el retorno QR seguro y la sesión Manus. El artefacto publicado incorpora ahora el servidor Manus OAuth y el callback responde con la validación esperada de `code` y `state`.
- [x] Eliminar el botón Continuar con TikTok y el código de proveedor que quede sin uso.
- [x] Eliminar el bloque bajo ACCEDER: recuperación de contraseña, aviso de sincronización y enlace de soporte.
- [x] Validar flujo, accesibilidad, pruebas, build, preview móvil y guardar checkpoint publicado. El servidor de producción inicia, `/api/oauth/callback` responde 400 sin parámetros —comportamiento esperado—, 25 tests pasan y el diseño móvil fue revisado.

# Reparación del retorno OAuth de Google

- [x] Corregir retorno de Google: confiar en proxy, alinear cookies y conectar la sesión Manus con la autenticación activa del frontend.
- [x] Verificar redirección OAuth en una ruta válida de TanStack Router y cubrirla con regresiones.
- [x] Ejecutar pruebas, build y revisión end-to-end del login Google.

# Corrección del 404 tras login Google

- [x] Auditar la ruta de inicio real y el fallback de TanStack Router tras `/api/oauth/callback`.
- [x] Corregir la redirección OAuth y asegurar que `/` resuelva a la pantalla de inicio en producción.
- [x] Validar el flujo en móvil, pruebas y build antes de publicar.

# Corrección del callback OAuth sin parámetros

- [x] Auditar el launcher de Google, la URL de autorización y la validación del callback.
- [x] Evitar que un callback incompleto muestre JSON crudo y devolver una salida segura hacia Auth.
- [x] Probar el callback incompleto, el flujo normal y publicar la corrección.

# Autenticación Google independiente

- [x] Evaluar la integración OAuth de Google independiente y las credenciales necesarias.
- [x] Retirar el flujo Manus del botón Google para no mostrar una identidad ajena como si fuera Google.
- [x] Implementar la alternativa aprobada y validar que la sesión permanezca dentro de Asternal.

# Validación final Google OAuth — cancelada por decisión del usuario

- [x] Cancelado: confirmar la URL de autorización Google.
- [x] Cancelado: verificar el retorno autenticado de Google.
- [x] Cancelado: publicar la integración Google validada.

# Publicación de backend OAuth — cancelada por decisión del usuario

- [x] Cancelado: publicar rutas OAuth Google bajo `/api`.
- [x] Cancelado: verificar la ruta de inicio OAuth Google.

# Credenciales Google propias de Asternal — canceladas por decisión del usuario

- [x] Cancelado: reemplazar el cliente OAuth de Google.
- [x] Cancelado: validar el consentimiento Google de Asternal.

# Retirada de inicio de sesión Google

- [x] Eliminar el botón, mensajes y launcher de Google de la pantalla de acceso.
- [x] Eliminar rutas, verificación y pruebas OAuth de Google sin afectar el inicio local por usuario/correo y contraseña.
- [x] Ejecutar pruebas, build y verificación visual del formulario de acceso simplificado.

# Rediseño del panel de notificaciones

- [x] Auditar la estructura, estados, interacción y coherencia visual del panel de notificaciones actual.
- [x] Rediseñar la cabecera, filtros, grupos, tarjetas, estados vacíos y acciones con la paleta de Asternal.
- [x] Validar responsividad, accesibilidad, pruebas y build antes de publicar.

# Rediseño integral del buscador

- [x] Auditar la pantalla Buscar, sus consultas, filtros, estados y problemas de interfaz actuales.
- [x] Reestructurar la experiencia de descubrimiento: cabecera, buscador, filtros, secciones y tarjetas de resultados.
- [x] Refinar estados de inicio, carga, vacío y error, además de accesibilidad y comportamiento móvil.
- [x] Validar resultados reales, pruebas, build y revisión visual antes de publicar.

# Corrección de perfil y navegación de Inicio

- [x] Auditar el solapamiento de avatar, nombre, usuario y código en la cabecera de perfil señalada.
- [x] Reorganizar la identidad del perfil para separar portada, avatar, acciones y metadatos con una jerarquía estable.
- [x] Mejorar la navegación principal de Inicio para priorizar destinos, estado activo y adaptación móvil.
- [x] Validar interacción, responsividad, pruebas y build antes de publicar.

# Restauración del acceso de graduado — descartada tras aclaración del usuario

- [x] Descartado: localizar y restaurar el acceso de graduado; la solicitud se refería al degradado superior.
- [x] Descartado: integrar el acceso de graduado en la cabecera.
- [x] Descartado: validar el acceso de graduado.

# Restauración del degradado superior

- [x] Revisar los acentos de degradado actuales de la cabecera y navegación de Inicio.
- [x] Restaurar un degradado superior sutil, coherente y legible.
- [x] Validar contraste, responsive, pruebas y build antes de publicar.

# Corrección de panel superpuesto y botón Crear móvil

- [x] Auditar por qué el panel de notificaciones muestra contenido de Inicio y se superpone a la navegación.
- [x] Aislar el panel de notificaciones y corregir su capa, scroll y fondo en móvil.
- [x] Reubicar el botón Crear respetando las áreas seguras y controles del sistema móvil.
- [x] Validar panel, navegación, responsive, pruebas y build antes de publicar.

# Degradado activo y modo Voz de Orión

- [x] Restaurar el degradado azul como estado activo de los botones de navegación y controles principales, sin aplicarlo como franja superior.
- [x] Auditar el chat Orión, sus respuestas y los patrones de captura/reproducción de audio existentes.
- [x] Implementar el modo Voz con conversación por turnos, micrófono, síntesis femenina y respuestas concisas.
- [x] Incluir estados de permiso, escucha, pensamiento, habla, pausa y compatibilidad sin voz.
- [x] Validar accesibilidad, pruebas, build y comportamiento móvil antes de publicar.

Orión incorpora ahora un activador de Voz en la cabecera y otro en el compositor. Al activar el modo, Orión emite un saludo, escucha por turnos mediante la API de reconocimiento del navegador, genera una respuesta con límite de 170 tokens e instrucciones de dos frases breves, y la reproduce con la voz española femenina disponible de mayor prioridad. La tarjeta de estado comunica si Orión está hablando, escuchando, pensando o si el navegador no ofrece las APIs necesarias; se puede detener en cualquier momento. La navegación principal de Inicio aplica `grad-brand` dentro del destino seleccionado, sin una franja decorativa en la cabecera. Vitest pasó con 33 pruebas y la compilación de producción completó correctamente.

---

# Auditoría y corrección de patrones AI Slop

- [x] Investigar el término AI Slop, sus señales visuales y los patrones de diseño genérico de constructores de aplicaciones.
- [x] Auditar las vistas de Asternal para localizar jerarquías, decoraciones, controles y vacíos que parezcan genéricos, incoherentes o poco intencionales.
- [x] Definir una dirección de diseño propia para un motor de videojuegos que también es red social, sin modificar las funciones del motor.
- [x] Reemplazar los patrones prioritarios detectados por interfaces más específicas, legibles y consistentes.
- [x] Validar capturas, accesibilidad, pruebas y compilación antes de publicar.

La auditoría y sus referencias quedaron documentadas en `research-ai-slop.md` y `ai-slop-audit.md`. La primera corrección elimina la estructura de tarjeta reiterada en la entrada y en Historial: Acceso ahora explica el flujo real de construir, probar y compartir; Historial pasa de seis métricas vacías a una bitácora que guía la primera actividad y usa registros continuos cuando ya existen datos. La lógica de autenticación, datos, editor y motor permanece sin cambios.

---

# Actualización desde el repositorio del usuario

- [x] Inspeccionar la nueva versión de `Linky1231/asternal-engine` y comparar sus cambios con el proyecto desplegado.
- [x] Integrar los cambios compatibles sin sobrescribir la infraestructura, datos ni configuración de Manus.
- [x] Validar pruebas, compilación y vista previa antes de publicar la actualización transferida.

La transferencia prioriza la novedad funcional de la versión externa: los juegos se abren ahora en una superficie dedicada y sus jugadores pueden apoyar a creadores con orbes. La transacción valida sesión, juego, propiedad, saldo y cantidad antes de actualizar las cuentas y registrar ambos movimientos; se mantiene el adaptador de datos local existente para no volver a añadir servicios externos. La validación completó 37 pruebas, compilación de producción y una revisión de renderizado sin errores visibles.

---

# Transferencia literal de la versión nueva

- [x] Crear un respaldo recuperable del estado publicado actual.
- [x] Reemplazar íntegramente los archivos del proyecto por la última versión de `Linky1231/asternal-engine`.
- [x] Conservar y reconciliar solo los adaptadores imprescindibles de ejecución y publicación del entorno.
- [x] Validar la compilación, las pruebas disponibles y la publicación de la transferencia completa.

La versión literal compila correctamente con `tsc -b && vite build` y se verificó en la vista de desarrollo en escritorio y móvil. El repositorio transferido no declara una orden de pruebas automatizadas; por la solicitud de conservar el código literal no se añadió una suite ajena. La única adaptación aplicada fue de entorno: habilitar el binario de compilación e instalar las dos dependencias ya importadas por el código (`react-router` y `@zumer/snapdom`).

---

# Asistente con IA de Manus

- [x] Localizar y retirar la integración actual de YB del asistente.
- [x] Restaurar el adaptador seguro de servidor para invocar los modelos integrados de Manus.
- [x] Conectar el asistente a Manus sin exponer credenciales en el cliente.
- [x] Validar el envío de mensajes, compilación y publicación.

YB fue retirado de imports, configuración y dependencias activas. Orión ahora llama únicamente a `/api/orion/chat`, una ruta propia que se ejecuta en el servidor y usa el modelo integrado de Manus disponible, sin enviar la clave al navegador. Se verificó una respuesta real del servicio (HTTP 200), junto con 2 pruebas unitarias y una compilación de producción correcta.

---

# Incidente: dominio publicado devuelve 404

- [x] Diagnosticar el error 404 en la ruta principal del dominio publicado.
- [x] Corregir el servidor y fallback de archivos estáticos para la aplicación SPA.
- [x] Verificar el dominio en producción y publicar la corrección.

Las primeras comprobaciones devolvieron `Not Found` mientras el nuevo artefacto se propagaba. Tras la publicación definitiva, la consulta sin caché devolvió HTTP 200 y la verificación visual de `https://asternaleng-dvlqmnye.manus.space/?verified=c2c5a7e5` muestra la pantalla de acceso de Asternal. El dominio ya no responde 404.

---

# Incidente: preview bloqueado y publicación sin directorio esperado

- [x] Corregir el bloqueo del host de la vista previa en Vite.
- [x] Restaurar la salida del frontend dentro de `dist/public` para el servidor de producción.
- [x] Verificar preview, build y publicación en producción.

---

# Sistema visual glass Apple-like para Asternal

- [x] Analizar la referencia y traducir sus principios de materialidad sin copiar su paleta ni su contenido.
- [x] Auditar botones, campos, tarjetas, paneles y navegación para localizar los estilos compartidos.
- [x] Aplicar superficies translúcidas, bordes luminosos, desenfoque y elevación suave con los colores actuales de Asternal.
- [x] Integrar estados de foco, hover, presión y reducción de movimiento accesibles.
- [x] Verificar la interfaz en escritorio y móvil, pruebas y compilación antes de publicar.

---

# Intensificación del acabado glass

- [x] Identificar los controles y superficies que aún se perciben planos u opacos.
- [x] Reforzar el vidrio de los botones azules con capa translúcida, brillo especular, borde iluminado y profundidad visible.
- [x] Extender el mismo material pronunciado a paneles, campos, tarjetas, pestañas y menús compartidos.
- [x] Validar contraste, respuesta táctil, escritorio, móvil, pruebas y compilación antes de publicar.

---

# Degradado azul constante y animaciones fluidas

- [x] Localizar todos los estados de botones y controles azules que alteran el degradado al interactuar.
- [x] Aplicar un único degradado azul constante a los estados normal, hover, foco y presión.
- [x] Optimizar únicamente animaciones para que usen propiedades de composición y respeten movimiento reducido.
- [x] Validar consistencia visual, fluidez, pruebas y compilación antes de publicar.

---

# Revisión integral de interfaz y Plus

- [x] Reducir el brillo excesivo y ordenar los controles del menú principal desplegable.
- [x] Eliminar la duplicación del encabezado en el apartado Eventos.
- [x] Unificar el icono de juegos sin portada entre Inicio y la pantalla individual de juego.
- [x] Aplicar el degradado y material glass de Asternal al apartado Plus sin alterar sus funciones.
- [x] Auditar y corregir inconsistencias visuales, textos genéricos, párrafos y acciones sin propósito en las áreas revisadas.
- [x] Validar la aplicación completa en escritorio y móvil, con pruebas y compilación antes de publicar.

---

# Restauración del azul de marca

- [x] Identificar y restaurar el tono y degradado azul originales de Asternal.
- [x] Conservar el material glass nuevo sin sustituir ni apagar el color de marca.
- [x] Verificar controles, Plus, vista previa, pruebas y compilación antes de publicar.

---

# Atenuación suave del turquesa de Plus

- [x] Reducir la luminosidad del degradado turquesa de Plus sin cambiar Azure Drift.
- [x] Preservar el acabado glass, el contraste y las funciones premium de Plus.
- [x] Validar Plus en vista previa, pruebas y compilación antes de publicar.

---

# Ajuste fino de claridad en Plus

- [x] Aclarar ligeramente los turquesas Aurora de Plugin/Plus sin recuperar brillo excesivo.
- [x] Conservar el Azure Drift global, el material glass y el contraste de Plus.
- [x] Validar pruebas y compilación antes de publicar el ajuste fino.

---

# Corrección de etiquetas celestes y beneficios de perfil

- [x] Localizar los controles informativos que heredan apariencia de botón azul y pierden contraste.
- [x] Diferenciar visualmente etiquetas y acciones, preservando el degradado solo en controles interactivos.
- [x] Aplicar el turquesa suave de Plus al bloque de beneficios del perfil de forma localizada.
- [x] Validar los paneles afectados, pruebas y compilación antes de publicar.

---

# Ficha aislada de juego

- [x] Localizar la fuente de portada rota y los metadatos repetidos en la ficha aislada.
- [x] Usar un marcador seguro cuando no haya portada válida y eliminar la duplicación visual.
- [x] Reorganizar la ficha móvil con una jerarquía clara para jugar, precio, autor y actividad.
- [x] Validar la ficha, pruebas y compilación antes de publicar.

---

# Marcador único para portadas sin imagen

- [x] Localizar todas las vistas que aún muestran el icono simple para juegos sin portada.
- [x] Reutilizar el marcador blueprint compartido en ranking, carruseles y tarjetas de juego.
- [x] Validar las vistas de juegos, pruebas y compilación antes de publicar.

---

# Portada completa y acción de juego inferior

- [x] Mantener la portada completa y encuadrada sin recortarla ni superponer controles.
- [x] Llevar la acción de jugar a un botón grande situado debajo de la información del juego.
- [x] Validar la ficha móvil, pruebas y compilación antes de publicar.

- [x] Mostrar “Sin portada” únicamente en tarjetas de proyecto dentro del editor cuando no haya imagen.
- [x] Confirmar que la etiqueta no aparece en las vistas públicas de juegos.

---

# Herramienta de encuadre de portada

- [x] Auditar el flujo de selección de portada, vista previa y publicación del juego.
- [x] Añadir controles de escala y posición con vista previa interactiva del encuadre.
- [x] Guardar el encuadre y aplicarlo de forma consistente en las tarjetas públicas.
- [x] Validar la herramienta, pruebas y compilación antes de publicar.

---

# Formato único de portada cuadrada

- [x] Localizar todas las variantes de proporción de portada en vistas de juegos.
- [x] Aplicar un marco cuadrado con esquinas redondeadas como único formato público.
- [x] Conservar el encuadre guardado y los marcadores blueprint dentro del formato único.
- [x] Validar las vistas, pruebas y compilación antes de publicar.

---

# Marcador blueprint ampliado en ficha aislada

- [x] Revisar el tamaño del marcador para juegos sin portada en la ficha aislada.
- [x] Ampliar el icono blueprint sin cambiar el formato de portada cuadrado.
- [x] Validar ficha, pruebas y compilación antes de publicar.

---

# Limpieza de control inactivo en ficha de juego

- [x] Localizar y retirar el botón azul de opciones sin acción.
- [x] Ajustar la alineación de las acciones restantes de la ficha.
- [x] Validar ficha, pruebas y compilación antes de publicar.

---

# Confirmación obligatoria de donación de orbes

- [x] Localizar todos los disparadores de donación de orbes en la ficha de juego.
- [x] Mostrar un diálogo de confirmación con importe, destinatario y opciones de cancelar o donar.
- [x] Ejecutar la donación únicamente después de la confirmación explícita.
- [x] Validar cancelación, confirmación, pruebas y compilación antes de publicar.

---

# Turquesa glass exclusivo de Plugin/Plus

- [x] Identificar los botones y superficies que pertenecen únicamente a Plugin/Plus.
- [x] Aplicar el turquesa glass del primer marco de perfil a esos controles y al apartado Plugin/Plus.
- [x] Confirmar que el Azure Drift permanece intacto fuera de Plugin/Plus.
- [x] Validar Plus/Plugin en escritorio y móvil, pruebas y compilación antes de publicar.

---

# Carruseles con deslizamiento natural

- [x] Localizar flechas y botones de avance redundantes en carruseles pequeños.
- [x] Retirar esos controles y reforzar el desplazamiento horizontal táctil y por trackpad.
- [x] Validar carruseles en móvil, pruebas y compilación antes de publicar.

---

# Cabecera de acceso centrada en ideas

- [x] Auditar la ilustración, las demostraciones ficticias y el mensaje actual del acceso.
- [x] Sustituir la mascota ambigua por una figura de robot legible y los paneles ficticios por señales de una idea de juego.
- [x] Reescribir el titular y el texto de apoyo con una voz concreta de Asternal.
- [x] Validar acceso en móvil y escritorio, pruebas y compilación antes de publicar.

Validación: el acceso se revisó en 390 × 844 y 1440 × 900; la mascota, las notas de idea, la jerarquía tipográfica y el formulario permanecen legibles. `pnpm test` completó 7 pruebas y `pnpm build` finalizó correctamente.

---

# Escena de robot simplificada

- [x] Retirar las notas, chips y adornos de la escena superior de acceso.
- [x] Eliminar el símbolo del torso y dejar al robot sin referencias a orbes o recompensas.
- [x] Recolocar el círculo de fondo para enmarcar al personaje desde detrás.
- [x] Validar la composición limpia en móvil y escritorio antes de publicar.

Validación: la escena se revisó en 390 × 844 y 1440 × 900. Solo aparecen el robot y los dos círculos de fondo, que ahora quedan centrados detrás del personaje; no quedan notas, chips ni iconografía asociada a orbes.

---

# Diálogo de confirmación de donaciones

- [x] Reproducir y aislar el bloqueo al solicitar una donación de orbes.
- [x] Corregir la apertura del diálogo y restaurar las acciones de cancelar y confirmar.
- [x] Verificar que solo la confirmación explícita ejecuta la donación.
- [x] Validar pruebas, compilación y recorrido visual antes de publicar.

Validación: el panel de juego usaba `z-[90]`, mientras el diálogo se renderizaba desde un portal en `z-50`, por lo que el overlay bloqueaba la interfaz y la confirmación quedaba oculta. El overlay se elevó a `z-[100]` y el contenido a `z-[110]`. Se comprobó la jerarquía con una prueba unitaria, el flujo existente mantiene `donateOrbs` exclusivamente en `confirmDonation`, y `pnpm test` completó 8 pruebas junto con una compilación correcta.

---

# Bombilla de idea en el acceso

- [x] Sustituir por completo la ilustración del robot por una bombilla de idea legible.
- [x] Aplicar el titular exacto “Tu próximo juego puede empezar con una pregunta”.
- [x] Mantener el círculo de fondo y eliminar toda referencia visual al robot.
- [x] Validar la cabecera en móvil y escritorio, pruebas y compilación antes de publicar.

Validación: revisada en 390 × 844 y 1440 × 900. La bombilla dorada se entiende como una idea, el halo azul la enmarca sin competir y ya no existe ninguna parte del robot. El titular se presenta como una sola frase. `pnpm test` completó 8 pruebas y `pnpm build` finalizó correctamente.

---

# Bombilla azul y selector de acceso

- [x] Ampliar la bombilla y adaptar su color al azul de Asternal.
- [x] Revisar las pestañas Acceder / Registrarse y definir un indicador de opción activa inequívoco.
- [x] Validar la jerarquía, el contraste y la interacción del selector en móvil y escritorio.
- [x] Ejecutar pruebas y compilación antes de publicar.

Validación: revisada en 390 × 844 y 1440 × 900. La bombilla se amplió y usa azules coherentes con Azure Drift. La pestaña activa ahora ocupa una superficie azul completa, mantiene contraste blanco, incorpora la etiqueta “ACTIVO” y expone el estado a tecnologías de asistencia. `pnpm test` completó 8 pruebas y `pnpm build` finalizó correctamente.

---

# Selector de acceso en gris suave

- [x] Retirar la etiqueta de actividad del selector.
- [x] Identificar el gris suave del estado seleccionado en la navegación inferior.
- [x] Aplicar esa referencia gris al selector Acceder / Registrarse y conservar contraste claro.
- [x] Validar el selector en móvil y escritorio, pruebas y compilación antes de publicar.

Validación: revisada en 390 × 844 y 1440 × 900. El selector usa ahora exactamente `bg-muted/60` como fondo y una pastilla `bg-white shadow-sm`, las mismas clases del menú inferior. La selección se entiende sin etiquetas adicionales. `pnpm test` completó 8 pruebas y `pnpm build` finalizó correctamente.

---

# Titular de idea destacado

- [x] Sustituir el titular por “Todo juego comienza con una idea”.
- [x] Aplicar el degradado azul únicamente al segmento “una idea”.
- [x] Validar el contraste y los saltos de línea en móvil y escritorio.
- [x] Ejecutar pruebas y compilación antes de publicar.

Validación: revisada en 390 × 844 y 1440 × 900. “Una idea” conserva el mismo azul degradado de la interfaz sobre el titular en negro, sin comprometer lectura ni generar un salto de línea confuso. `pnpm test` completó 8 pruebas y `pnpm build` finalizó correctamente.

---

# Posición elevada de la bombilla

- [x] Subir la bombilla de idea en la composición superior.
- [x] Mantener el halo de fondo centrado detrás de la bombilla.
- [x] Validar el equilibrio visual en móvil y escritorio antes de publicar.

Validación: revisada en 390 × 844 y 1440 × 900. La bombilla sube desde el centro inferior al área media-superior del halo, mantiene el encuadre y deja una separación más clara con el titular. `pnpm test` completó 8 pruebas y `pnpm build` finalizó correctamente.

---

# Acceso simplificado

- [x] Cambiar la frase a “Las buenas ideas no siempre llegan terminadas”.
- [x] Retirar el enlace y el espacio de recuperación de contraseña.
- [x] Validar la composición del formulario en móvil y escritorio.
- [x] Ejecutar pruebas y compilación antes de publicar.

Validación: revisada en 390 × 844 y 1440 × 900. La frase completa se lee dentro de la etiqueta y la tarjeta de acceso ya no muestra ni reserva espacio para recuperación de contraseña. `pnpm test` completó 8 pruebas y `pnpm build` finalizó correctamente.

---

# Foco de campos de acceso

- [x] Localizar los estilos de foco que generan un borde y recuadro visual duplicados.
- [x] Reducir el halo de foco y preservar una distancia clara respecto a los iconos.
- [x] Validar el foco durante escritura en usuario/correo y contraseña, en móvil y escritorio.
- [x] Ejecutar pruebas y compilación antes de publicar.

Validación: el foco pasa de un anillo de 3 px a una sola línea de 1 px de baja opacidad; el campo elimina el contorno nativo para evitar el doble recuadro y el icono usa un contenedor propio con nivel de apilamiento superior. La composición se revisó en 390 × 844 y 1440 × 900. `pnpm test` completó 10 pruebas y `pnpm build` finalizó correctamente.

---

# Unión del icono de contraseña

- [x] Revisar la división vertical desalineada junto al icono de visibilidad en contraseña.
- [x] Integrar el icono dentro del mismo marco redondeado, sin cortes en el borde ni en el radio derecho.
- [x] Validar en móvil y escritorio, con pruebas y compilación antes de publicar.

Validación: se neutralizó el borde y la sombra globales del `input` interno, que creaban un segundo marco parcial junto al icono de visibilidad. El control compuesto usa un único contenedor aislado y con recorte, por lo que conserva un borde externo uniforme y el radio derecho completo. Se verificó en 390 × 844 y 1440 × 900; `pnpm test` completó 11 pruebas y `pnpm build` finalizó correctamente.

---

# Correcciones sociales, galería y perfil

- [x] Traducir y contextualizar el error de contraseña incorrecta, evitando el mensaje técnico “Load Failed”.
- [x] Corregir los estados activos e inactivos de reacciones, comentarios y demás controles de publicaciones.
- [x] Mostrar las artes exportadas como tarjetas cuadradas redondeadas sin recorte y abrir una vista aislada con comentarios.
- [x] Limitar el azul de juegos fijados a las acciones, sin teñir el contenido ni tapar la interfaz.
- [x] Diagnosticar y manejar de forma estable las imágenes que no cargan.
- [x] Restaurar el nombre de usuario y el tamaño correcto de la tarjeta QR en el perfil.
- [x] Validar los flujos en móvil y escritorio, con pruebas y compilación antes de publicar.

Validación: los errores de acceso se convierten en texto comprensible; las acciones sociales diferencian selección e inactividad con grises neutrales; las obras disponen de tarjetas cuadradas sin recorte y detalle con comentarios; y los juegos fijados usan una miniatura neutra cuando no hay portada. Las rutas de almacenamiento se firman al mostrarse para recuperar imágenes que llegaban como claves internas. El perfil dispone de fallback de identificador y acción QR visible. `pnpm test` completó 14 pruebas y `pnpm build` finalizó correctamente. Se revisó el acceso en 390 × 844 y 1440 × 900; Feed, Galería y Perfil requieren iniciar sesión para comprobar manualmente datos reales.

---

# Tarjetas minimalistas de artes

- [x] Revisar las tarjetas de obras en galería y perfil para retirar metadatos secundarios.
- [x] Mostrar solo la obra y el autor en la tarjeta, sin título, reacciones, precio, fecha ni comentarios.
- [x] Conservar todos los detalles y comentarios dentro de la vista aislada al pulsar la obra.
- [x] Validar en móvil y escritorio, con pruebas y compilación antes de publicar.

Validación: tanto la Galería general como la Galería de perfil dejan la tarjeta limitada a la obra cuadrada, sin recorte, y una franja compacta con avatar y autor. El detalle a pantalla completa conserva título, descripción y comentarios. `pnpm test` completó 15 pruebas y `pnpm build` finalizó correctamente. La pantalla pública revisada se mantiene estable en 390 × 844 y 1440 × 900; acceder a la galería real requiere una sesión autenticada.

---

# Precio compacto en tarjetas de artes

- [x] Revisar el pie compacto de autor de las tarjetas de obras.
- [x] Añadir el número de precio de forma ordenada, sin recuperar los demás metadatos.
- [x] Validar las tarjetas de Galería y Perfil con pruebas y compilación antes de publicar.

Validación: las tarjetas mantienen exclusivamente obra, autor y precio. El importe se representa como un número con cifras agrupadas, alineado al extremo derecho y acompañado de un indicador discreto de orbes; título, fecha, reacciones y comentarios siguen dentro del detalle. `pnpm test` completó 16 pruebas y `pnpm build` finalizó correctamente. La pantalla se mantiene estable en 390 × 844 y 1440 × 900; la verificación visual de Galería requiere una sesión autenticada.

---

# Tienda y apertura de obras

- [x] Localizar y retirar el saldo duplicado de orbes dentro de la Tienda.
- [x] Añadir una transición breve y suave al abrir el detalle de una obra de Galería.
- [x] Respetar la reducción de movimiento y validar en móvil y escritorio con pruebas y compilación.

Validación: el saldo local se conserva para compras, pero ya no se renderiza junto al recuento de assets en Tienda. El detalle de obras aparece con fundido del fondo y una entrada corta de opacidad, escala y desplazamiento; el movimiento se elimina para personas que lo reducen en el sistema. `pnpm test` completó 17 pruebas y `pnpm build` finalizó correctamente. La pantalla se revisó en 390 × 844 y 1440 × 900; la transición de Galería requiere sesión para una comprobación manual con obras reales.

---

# Galería para artistas

- [x] Localizar todas las referencias visibles y accesos al apartado Tienda.
- [x] Renombrar la experiencia como Galería y retirar el lenguaje de tienda general.
- [x] Mantener únicamente el flujo para que artistas publiquen y vendan sus obras.
- [x] Validar navegación, textos, móvil, escritorio, pruebas y compilación antes de publicar.

Validación: la navegación inferior, la búsqueda, el perfil y el panel principal usan la identidad «Galería». La experiencia general de Tienda y los assets genéricos del editor se retiraron del listado público; quedan obras originales de artistas con su publicación, detalle y compra de orbes. `pnpm test` completó 18 pruebas y `pnpm build` finalizó correctamente. La pantalla de acceso se revisó en 390 × 844 y 1440 × 900; ver la Galería con obras requiere una sesión autenticada.

---

# Foco visible en inicio de sesión

- [x] Revisar la composición y reglas actuales de foco de usuario/correo y contraseña.
- [x] Mostrar un marco de foco visible, uniforme y sin fragmentos mientras se escribe.
- [x] Validar foco, accesibilidad, móvil, escritorio, pruebas y compilación antes de publicar.

Validación: el campo activo aplica un borde azul de alto contraste y un halo exterior uniforme, mientras icono e input interno no dibujan contornos propios. El contrato verifica estos tokens de foco y accesibilidad; `pnpm test` completó 18 pruebas y `pnpm build` finalizó correctamente. Tras reiniciar el servidor, la pantalla se revisó en 390 × 844 y 1440 × 900. Las capturas muestran el estado neutro por defecto; el estado activo está cubierto por la prueba del contrato de clases.

---

# Limpieza de Galería y cabecera de Perfil

- [x] Identificar las publicaciones heredadas de la antigua Tienda que no son obras de Galería.
- [x] Excluir de todas las superficies de Galería las publicaciones heredadas y sus referencias visuales, conservando solo obras artísticas.
- [x] Restaurar el nombre de usuario y ampliar el acceso QR en la cabecera de Perfil.
- [x] Validar Galería y Perfil en móvil y escritorio, con pruebas y compilación antes de publicar.

La Galería ahora descarta en la consulta y en la interfaz toda publicación con `asset_preset`, que identifica los recursos heredados de la antigua Tienda. Las obras artísticas conservan `category: artwork` y `asset_preset: null`. La cabecera de Perfil separa avatar, identidad, usuario, código y acciones; el control «Código QR» ya es una acción etiquetada y amplia. `pnpm test` completó 18 pruebas y `pnpm build` finalizó correctamente. Las rutas de Galería y Perfil requieren sesión, por lo que la captura no autenticada fue redirigida a Acceso; la composición de Acceso se revisó en 390 × 844 y 1440 × 900.

---

# Refinamiento de tarjeta de Perfil y estados neutros

- [x] Auditar la estructura móvil de la tarjeta de Perfil y sus acentos de color.
- [x] Reorganizar la identidad, acciones y métricas para crear una jerarquía más clara.
- [x] Retirar el azul de controles inactivos y conservarlo solo para estados seleccionados o activos.
- [x] Validar el Perfil responsive, pruebas y compilación antes de publicar.

Validación: `pnpm test` completó 19 pruebas y `pnpm build` finalizó correctamente. La ruta de Perfil protegida redirige de forma estable a Acceso sin sesión en 390 × 844 y 1440 × 900. El botón QR es neutro en reposo y adquiere azul exclusivamente al abrir su panel; el banner predeterminado y el acceso Centro Plus también se neutralizaron para que no parezcan estados seleccionados.

---

# Centro Plus y compactación de Perfil

- [x] Restaurar los colores propios de Centro Plus en su acceso dentro de Perfil.
- [x] Reducir la altura de la tarjeta de Perfil y mantener visible su información principal en móvil.
- [x] Validar el perfil compacto en móvil y escritorio, con pruebas y compilación antes de publicar.

Validación: `pnpm test` completó 19 pruebas y `pnpm build` finalizó correctamente. Se verificó la ruta protegida en 390 × 844; sin sesión redirige correctamente a Acceso. La cabecera compacta reduce el banner, avatar, márgenes y acciones a una sola fila, mientras Centro Plus recupera su identidad Aurora.

---

# Pantalla QR y espaciado de Perfil

- [x] Separar los botones compactos de Perfil para evitar que se vean pegados.
- [x] Convertir el editor de QR en una pantalla dedicada desde Perfil.
- [x] Corregir el margen de seguridad del QR para que los tres marcadores queden completos.
- [x] Validar el editor QR y Perfil responsive, con pruebas y compilación antes de publicar.

Validación: `pnpm test` completó 20 pruebas y `pnpm build` finalizó correctamente. La ruta protegida sigue redirigiendo correctamente a Acceso sin sesión en 390 × 844. El editor QR ya no expande la tarjeta de Perfil: se abre en una pantalla dedicada y usa un marco con zona silenciosa calculada para no recortar los tres marcadores.

---

# Simplificación del estilo QR

- [x] Retirar el selector de estilo del editor QR.
- [x] Establecer el marco redondeado como estilo QR predeterminado.
- [x] Validar la simplificación con pruebas y compilación antes de publicar.

Validación: `pnpm test` completó 20 pruebas y `pnpm build` finalizó correctamente. La ruta de Perfil protegida se comprobó en 390 × 844 y sigue redirigiendo con estabilidad a Acceso sin sesión. El editor QR queda simplificado: conserva colores y tamaño, pero utiliza únicamente el marco redondeado.

---

# Jerarquía profesional de Perfil y Portafolio

- [x] Reorganizar identidad, acciones y métricas de la cabecera de Perfil con una jerarquía visual clara.
- [x] Convertir Portafolio en una pantalla aislada de altura completa.
- [x] Validar Perfil y Portafolio responsive, con pruebas y compilación antes de publicar.

Validación: `pnpm test` completó 20 pruebas y `pnpm build` finalizó correctamente. La ruta de Perfil protegida redirige de forma estable a Acceso en 390 × 844 y 1440 × 900 sin sesión. Con sesión, la nueva composición ordena identidad, acciones y métricas en bloques separados; Portafolio ocupa una pantalla aislada completa, con cabecera propia y contenido desplazable.

---

# Correcciones de respuesta y superposición de Perfil

- [x] Hacer instantáneo el cambio entre listas de Portafolio sin estados visuales bloqueados.
- [x] Corregir el desborde de nombre y usuario, restaurar la visibilidad del banner y ampliar el avatar Plus.
- [x] Reposicionar los menús Compartir y Más para que no se recorten, no tapen la tarjeta ni se abran simultáneamente.
- [x] Restaurar el azul de marca en estados activos de publicaciones, como Me gusta y selecciones.
- [x] Validar interacciones, Perfil y Portafolio responsive con pruebas y compilación antes de publicar.

Validación: `pnpm test` completó 20 pruebas y `pnpm build` finalizó correctamente. La ruta protegida de Perfil redirige de manera estable a Acceso en 390 × 844 y 1440 × 900 sin sesión. Los menús se sustituyeron por superficies portalizadas exclusivas; la revisión de sus datos reales, del banner y de Portafolio requiere una sesión autenticada.

---

# Separación de personalización y acciones exclusivas

- [x] Crear una separación clara entre la descripción y los datos de personalización del Perfil.
- [x] Convertir las acciones inferiores de publicaciones en una selección exclusiva de estado sobrio.
- [x] Validar los espaciados y los estados de interacción con pruebas y compilación antes de publicar.

Validación: `pnpm test` completó 21 pruebas y `pnpm build` finalizó correctamente. La ruta protegida redirige con estabilidad a Acceso en 390 × 844 y 1440 × 900 sin sesión. En sesión, la descripción queda separada por un divisor de los metadatos de personalización; las cuatro acciones inferiores comparten un único foco azul suave, sin degradado ni selección simultánea.

---

# Paneles seguros de Perfil

- [x] Sustituir el menú flotante Compartir por un panel inferior que no cubra el Perfil.
- [x] Sustituir el menú flotante Más por un panel inferior exclusivo que no cubra el Perfil.
- [x] Validar los paneles de Perfil en móvil y escritorio con pruebas y compilación antes de publicar.

Validación: `pnpm test` completó 21 pruebas y `pnpm build` finalizó correctamente. La ruta de Perfil protegida se comprobó en 390 × 844 y 1440 × 900; sin sesión, redirige a Acceso de forma estable. Con sesión, Compartir y Más usan paneles inferiores exclusivos, fuera de la tarjeta de Perfil y sin superposición entre sí.

---

# Formato único de Portafolio

- [x] Retirar el selector de diseño Lista/Cuadrícula del editor de Portafolio.
- [x] Fijar Lista como formato predeterminado y único de Portafolio.
- [x] Validar el Portafolio simplificado con pruebas y compilación antes de publicar.

---

# Cabecera integrada del detalle de obras

- [x] Localizar la cabecera que se superpone al contenido en la pantalla aislada de una obra de Galería.
- [x] Mantener la cabecera fija e integrada en la parte superior, fuera del área desplazable de la obra.
- [x] Validar el detalle de obra en móvil y escritorio, ejecutar pruebas, compilar y publicar.

---

# Refinamiento glass de obras e Inicio

- [x] Revisar la superficie glass de la pantalla de Inicio y el espacio superior residual de esa vista.
- [x] Aplicar el mismo acabado glass a la cabecera fija del detalle de obras.
- [x] Eliminar el espacio superior no intencional de la pantalla de Inicio.
- [x] Validar las correcciones en móvil y escritorio, ejecutar pruebas, compilar y publicar.

---

# Respuesta inmediata de seguimiento

- [x] Localizar el control de Seguir/Siguiendo y el panel inferior de seguidores.
- [x] Actualizar el estado de seguimiento de forma inmediata y reversible ante error.
- [x] Reforzar el contraste del panel de seguidores sin alterar su jerarquía ni su tamaño.
- [x] Validar la interacción y el panel en móvil y escritorio, ejecutar pruebas, compilar y publicar.

---

# Corrección final del panel de seguidores

- [x] Eliminar cualquier estado visual intermedio al tocar Seguir/Siguiendo.
- [x] Corregir el fondo residual y el desborde inferior del panel al desplazarse.
- [x] Validar el panel en móvil y escritorio, ejecutar pruebas, compilar y publicar.

---

# Selectores sutiles y perfil simplificado

- [x] Localizar los estados seleccionados de publicaciones y Perfil que aparecen como botones.
- [x] Sustituir esos estados por indicadores celestes sutiles, sin apariencia de botón.
- [x] Eliminar el bloque y la edición de «Un mensaje personalizado» del perfil.
- [x] Validar publicaciones y Perfil en móvil y escritorio, ejecutar pruebas, compilar y publicar.

---

# Corrección de selectores invertidos

- [x] Confirmar la asignación invertida entre el selector del Perfil y las acciones de publicaciones.
- [x] Aplicar la pestaña azul activa al selector del Perfil y el contorno celeste a las acciones de publicación.
- [x] Validar Perfil y publicaciones en móvil y escritorio, ejecutar pruebas, compilar y publicar.

---

# Editor generalizable y scripting visual

- [x] Auditar la arquitectura actual de escenas, objetos, runtime, scripts y bloques visuales.
- [x] Definir un modelo extensible de entidades, componentes, eventos, variables, mensajes y bloques.
- [x] Implementar la base generalizable de ejecución para scripts visuales con compatibilidad de proyectos existentes.
- [x] Ampliar el catálogo de bloques y las operaciones del editor sin convertir funciones en casos aislados.
- [x] Validar creación, ejecución y guardado de proyectos, ejecutar pruebas, compilar y publicar.

---

# Refinamientos de Perfil, descargas y navegación
- [x] Centrar y asentar correctamente el estado seleccionado de la navegación inferior.
- [x] Suavizar la transición entre Juegos, Publicaciones y Galería del Perfil, incluyendo el indicador activo.
- [x] Corregir la descarga del QR para que genere un documento centrado y fiel a su diseño.
- [x] Añadir una acción funcional de «Descargar portafolio» con un documento legible y estilizado.
- [x] Mantener Seguidores y Siguiendo en un panel de altura contenida con desplazamiento interno.
- [x] Validar en móvil y escritorio, ejecutar pruebas, compilar y publicar; la sincronización con GitHub queda pospuesta por decisión del usuario.
---
# Respaldo en un nuevo repositorio de GitHub
- [x] Posponer la creación de un repositorio privado nuevo para la versión publicada de Asternal Engine por solicitud del usuario.
- [x] Posponer la subida del historial al nuevo repositorio hasta que el usuario solicite retomar la sincronización.
---
# Publicación web y sincronización pospuesta
- [x] Confirmar la publicación de la versión `4a92f0a9` en la web y registrar que GitHub queda pospuesto por decisión del usuario.
---
# Respuesta inmediata de navegación inferior
- [x] Identificar y eliminar la transición que retrasa los cambios rápidos de pestaña en la navegación inferior.
- [x] Validar cambios consecutivos de pestaña mediante contrato de carga por sección, 29 pruebas, compilación y revisión móvil disponible; publicar la corrección.
---
# Panel aislado de Puntos de confianza
- [x] Sustituir el apartado compacto de Puntos de confianza por un panel independiente de pantalla completa.
- [x] Validar apertura, cierre y scroll interno mediante la estructura aislada, 31 pruebas, compilación y revisión móvil de la ruta protegida; la comprobación visual con sesión queda disponible para el usuario.
---
# Paleta y contraste de Puntos de confianza
- [x] Sustituir los tonos negros y verdes por la paleta azul de Asternal dentro del panel de confianza.
- [x] Hacer visible el escudo y aplicar el degradado azul de marca al botón de historial.
- [x] Validar el contrato de paleta, 31 pruebas, compilación y revisión móvil de la ruta protegida; la comprobación visual con sesión queda disponible para el usuario.
---
# Orbes públicos, selección y Portafolio
- [x] Mostrar correctamente la cantidad de orbes en el Perfil cuando la preferencia pública esté activada.
- [x] Cambiar el tratamiento visual del control seleccionado para que use un indicador azul sutil y no parezca un botón degradado.
- [x] Garantizar que «Descargar portafolio» sea visible, accesible y produzca el archivo correspondiente.
- [x] Validar el contrato de visibilidad, 33 pruebas, compilación y revisión móvil de la ruta protegida; la comprobación visual con sesión queda disponible para el usuario.
---
# Descarga retirada e interacciones estables de publicaciones
- [x] Retirar la acción «Descargar portafolio» de la pantalla aislada de Portafolio.
- [x] Evitar que los likes y otras interacciones de publicaciones reinicien o desplacen la vista actual.
- [x] Validar el estado local de reacciones, 35 pruebas, compilación y revisión móvil disponible; la comprobación de interacciones con sesión queda disponible para el usuario.
---
# Portafolios compartibles en chats
- [x] Identificar los modelos y compositores de mensajes directos, grupales y comunitarios compatibles con adjuntos de Portafolio.
- [x] Añadir una acción para compartir el Portafolio y guardar el mensaje estructurado correspondiente.
- [x] Renderizar una tarjeta de Portafolio con botón para abrir su vista aislada desde cada tipo de chat.
- [x] Validar los flujos disponibles, ejecutar pruebas, compilar, revisar responsive y publicar.

Se añadió un protocolo versionado y validado para snapshots de Portafolio dentro del contenido ya existente de los mensajes, sin modificar APIs, Supabase ni el esquema. El Portafolio puede compartirse desde su pantalla aislada a Comunidad, grupos o mensajes directos, y el compositor ofrece un acceso rápido para el chat abierto. Cada mensaje muestra una tarjeta Azure Drift con identidad, habilidades, logros y el botón «Abrir portafolio», que conserva la vista aislada en modo de lectura. `pnpm test` completó 37 pruebas y `pnpm build` fue correcto; las capturas disponibles verificaron el shell en escritorio y móvil. La prueba interactiva con sesión real queda disponible para la cuenta del usuario.

---

# Corrección visual de Portafolios compartidos
- [x] Eliminar el espacio vertical residual bajo el selector de destinos en móvil.
- [x] Reforzar el contraste y la superficie Azure Drift de la tarjeta de Portafolio compartido.
- [x] Convertir Comunidad, grupos y directos en opciones de selección sutiles, no acciones azules principales.
- [x] Validar en móvil, ejecutar pruebas, compilar y publicar.

El selector ya no reserva altura flexible innecesaria: su lista tiene una altura máxima acotada y la hoja termina al finalizar sus opciones. Comunidad, grupos y directos ahora son filas de selección con superficie glass tenue, borde discreto e icono neutral; el degradado queda reservado al envío y otras acciones principales. La tarjeta y la pantalla de lectura del Portafolio recuperan capas Azure Drift con contraste azul suave, en lugar de superficies blancas planas. `pnpm test` completó 37 pruebas y `pnpm build` fue correcto. La captura móvil disponible confirmó que el shell no presenta regresiones; la validación funcional autenticada queda disponible para el usuario.

---

# Ajuste final del selector de Portafolio
- [x] Eliminar el degradado azul residual de las filas de Comunidad, grupos y mensajes directos.
- [x] Recuperar el contraste de los subtítulos e iconos de las opciones sobre superficies claras.
- [x] Reducir el vacío vertical visible encima de la hoja de selección en móvil.
- [x] Validar, compilar y publicar el ajuste.

El selector móvil se transformó en una pantalla de selección completa, de modo que no conserva un bloque vacío encima de la hoja. Las filas de destino definen de forma explícita una superficie glass clara, tipografía de alto contraste e iconografía secundaria neutral, sin aceptar fondos azules heredados. `pnpm test` completó 37 pruebas y `pnpm build` fue correcto; la captura móvil disponible no muestra regresiones del shell. La comprobación autenticada directa queda disponible para la cuenta del usuario.

---

# Estados inactivos del compositor de publicaciones
- [x] Localizar los botones de adjunto y sus clases de estado dentro del compositor.
- [x] Eliminar el degradado azul de las opciones no seleccionadas y preservar el azul solo en selección o acción principal.
- [x] Validar los estados visuales, compilar y publicar.

El degradado ya no se monta con opacidad cero en las opciones inactivas: se renderiza únicamente cuando una función está activa. En reposo, Enlace, Encuesta, Juego y el resto de opciones usan superficie neutral, texto gris y borde suave; el azul queda reservado para una opción ya seleccionada y para «Publicar». `pnpm test` completó 37 pruebas y `pnpm build` finalizó correctamente.

---

# Animación de opciones del compositor
- [x] Revisar el control compartido de funciones y sus transiciones actuales.
- [x] Añadir una transición breve y fluida al seleccionar y deseleccionar una función.
- [x] Validar, compilar y publicar la mejora de interacción.

Las opciones de función ahora transicionan color, borde y superficie en 200 ms con una curva de salida rápida. El degradado activo entra y sale con opacidad y escala suave, mientras el toque conserva una respuesta inmediata. `pnpm test` completó 37 pruebas y `pnpm build` finalizó correctamente.

---

# Selector aislado para compartir publicaciones
- [x] Localizar el montaje del selector que se superpone a la lista del feed.
- [x] Mostrar el selector en una pantalla aislada sin mezcla visual con las publicaciones.
- [x] Clasificar los destinos como Chat comunitario, Chats grupales y Mensajes directos.
- [x] Validar en móvil, compilar y publicar la corrección.

El selector de compartir publicaciones ahora se portaliza a `document.body`, por lo que deja de heredar el contenedor y el apilamiento de la lista del feed. En móvil se muestra como pantalla aislada de viewport completo; en escritorio se conserva como superficie centrada. Sus destinos están agrupados explícitamente en Chat comunitario, Chats grupales y Mensajes directos; «Copiar enlace» queda como acción secundaria al final. `pnpm test` completó 37 pruebas y `pnpm build` finalizó correctamente. La captura móvil disponible confirmó que el shell se mantiene estable; la comprobación autenticada del selector queda disponible para el usuario.

---

# Tarjetas de publicaciones compartidas en chat
- [x] Auditar el contenido de mensaje y las tarjetas enriquecidas existentes del chat.
- [x] Definir un formato seguro para transportar la vista previa de una publicación compartida.
- [x] Mostrar una tarjeta organizada de publicación con autor, contenido y acceso a la publicación original.
- [x] Validar en los tipos de chat disponibles, compilar y publicar.

Las publicaciones ahora viajan en el contenido existente de mensajes como snapshots versionados y saneados, sin cambios de API, Supabase ni esquema. La burbuja detecta el marcador, lo oculta y presenta una tarjeta Azure Drift con autor, tipo, vista previa de imagen, contenido y «Abrir publicación». Ese botón abre una superficie aislada con la publicación compartida. `pnpm test` completó 39 pruebas y `pnpm build` fue correcto; la captura móvil disponible confirmó que el shell sin sesión se mantiene estable. La comprobación interactiva de enviar y abrir tarjetas en chats requiere la sesión real del usuario.

---

# Jerarquía del menú lateral móvil
- [x] Auditar las filas, separadores y espaciados del menú señalados en móvil.
- [x] Separar visualmente las opciones y reforzar los grupos Social, Comunidad y Creación.
- [x] Diferenciar la acción de Cerrar sesión del resto de navegación.
- [x] Validar en móvil, compilar y publicar la corrección.

El menú lateral ahora separa cada destino con una superficie glass discreta y un espacio consistente, en lugar de apilar filas visualmente pegadas. Los grupos Social, Comunidad y Creación disponen de encabezados con más aire y cada fila aumenta su área táctil sin convertirse en un CTA azul. El perfil se distingue como acceso de cabecera y «Cerrar sesión» como acción independiente al pie. `pnpm test` completó 39 pruebas y `pnpm build` fue correcto; la captura móvil disponible confirmó la estabilidad del shell. La comprobación autenticada del menú queda disponible para el usuario.

---

# Legibilidad de tarjetas compartidas
- [x] Auditar las superficies internas y el color de texto de publicaciones y Portafolios compartidos.
- [x] Aplicar una superficie clara de alto contraste a las tarjetas internas y reservar el azul para marco y CTA.
- [x] Validar en móvil, compilar y publicar la corrección.

Las tarjetas compartidas de publicaciones y Portafolios ahora usan base blanca opaca (`bg-card`), borde blanco y tipografía de alto contraste. El azul solo conserva la jerarquía de marco, iconos y CTA, sin competir con el contenido. La vista aislada de Portafolio aplica las mismas superficies claras para tarjetas de perfil, enlaces y logros. `pnpm test` completó 39 pruebas y `pnpm build` fue correcto. La captura móvil disponible confirmó la estabilidad del acceso sin sesión; la comprobación de estas tarjetas con sesión real queda disponible para el usuario.

---

# Densidad vertical del menú lateral móvil
- [x] Auditar las alturas y espacios que provocan el corte de opciones en móvil.
- [x] Compactar filas, encabezados y espacios de grupo sin recuperar el aspecto de opciones pegadas.
- [x] Confirmar que el menú puede recorrer todas las opciones de forma accesible.
- [x] Validar en móvil, compilar y publicar el ajuste.

Las filas del menú se compactaron a 40 px, los grupos redujeron su separación a 5 px y los encabezados recuperaron un ritmo vertical contenido. El panel usa menos relleno superior, el acceso de perfil es más compacto y la salida deja de forzar un espacio flexible que alargaba el menú. Así se conserva la separación visual, pero el desplazamiento permite recorrer todas las opciones en móvil. `pnpm test` completó 39 pruebas y `pnpm build` fue correcto; la captura móvil disponible confirmó la estabilidad del acceso sin sesión.

---

# Funciones visibles en publicaciones compartidas
- [x] Auditar todos los tipos de contenido y funciones de las publicaciones existentes.
- [x] Ampliar el snapshot compartido para representar texto con color, documentos, medios, enlaces, encuestas, juegos y adjuntos aplicables.
- [x] Renderizar una vista previa organizada de cada función dentro de la tarjeta del chat.
- [x] Incluir chats grupales reales como destinos al compartir una publicación.
- [x] Validar en Comunidad, grupos y directos, compilar y publicar.

---
# Indicador de archivo adjunto
- [x] Reemplazar la superficie azul de los documentos por un indicador de archivo neutral, claro y legible.
- [x] Mantener la descarga como acción secundaria explícita, sin apariencia de botón principal.
- [x] Validar la presentación móvil, ejecutar pruebas y publicar.

---
# Estado personal de reacciones
- [x] Evitar que los likes externos sobrescriban el icono relleno de la persona que ya dio like.
- [x] Cubrir la sincronización de conteos y estado personal con una prueba de regresión.
- [x] Validar, compilar y publicar la corrección.

---
# Moderación y recomendación con Orion
- [x] Auditar la integración actual de Orion, el compositor, el feed y los permisos administrativos.
- [x] Definir y persistir las reglas comunitarias y la información de privacidad editables por administración.
- [x] Revisar cada publicación con Orion antes de crearla y bloquear con una explicación las que incumplan las reglas.
- [x] Ordenar el feed recomendado con señales semánticas de Orion en vez de likes e interacciones.
- [x] Crear el apartado Acerca de nosotros con lectura pública y controles administrativos.
- [x] Cubrir la moderación y orden con pruebas, validar la interfaz adaptable y publicar.

---
# Visibilidad del feed recomendado
- [x] Localizar por qué el orden recomendado puede dejar publicaciones fuera de la vista.
- [x] Garantizar que la recomendación de Orión solo reordene y nunca filtre publicaciones.
- [x] Añadir una prueba de conservación completa, validar y publicar la corrección.

---
# Carga estable del feed
- [x] Localizar por qué Para ti, Seguidos y Explorar pueden quedar en esqueletos permanentes.
- [x] Garantizar una salida a contenido, estado vacío o error recuperable en cada filtro.
- [x] Cubrir los estados de carga del feed con pruebas, validar en móvil y publicar.

---
# Ranking de originalidad con Orión
- [x] Auditar los datos de texto, medios, documentos, capacidades y fecha disponibles para la evaluación de originalidad.
- [x] Hacer que Orión jerarquice por originalidad, novedad contextual y relevancia sin usar likes ni ocultar publicaciones.
- [x] Aplicar el orden de originalidad de forma consistente en Para ti, Seguidos y Explorar.
- [x] Cubrir criterios, respaldo cronológico y conservación completa con pruebas; validar y publicar.

---
# Coherencia Azure Drift en publicaciones
- [x] Auditar superficies, texto e iconos de publicaciones que no respetan la paleta azul coherente.
- [x] Sustituir el bloque negro del juego fijado y los acentos incongruentes por capas Azure Drift legibles.
- [x] Cubrir el contrato de paleta, validar en móvil y publicar la corrección.

---
# Estado azul de acciones de publicación
- [x] Auditar la asignación entre el estado personal y las variantes visuales de Me gusta, favorito, comentarios y compartir.
- [x] Hacer que solo las acciones ya realizadas por la cuenta actual estén azules y rellenas.
- [x] Añadir una prueba de regresión, validar y publicar la corrección.

---
# Indicador activo sutil de acciones
- [x] Localizar la cápsula con degradado aplicada a las reacciones activas de publicaciones.
- [x] Conservar icono y texto azules/rellenos sin fondo de botón cuando la reacción sea personal.
- [x] Añadir una prueba de regresión, validar y publicar la corrección.

---
# Estado azul de reacciones
- [x] Auditar la asignación entre reacciones personales y sus variantes visuales activas/inactivas.
- [x] Hacer que solo los controles ya interactuados por la cuenta actual estén azules y rellenos.
- [x] Añadir una prueba de regresión, validar y publicar la corrección.

---
# Indicador activo sutil de acciones
- [x] Localizar la cápsula con degradado aplicada a las reacciones activas de publicaciones.
- [x] Conservar icono y texto azules/rellenos sin fondo de botón cuando la reacción sea personal.
- [x] Añadir una prueba de regresión, validar y publicar la corrección.

---
# Fichas informativas y separación sutil del feed
- [x] Convertir el juego fijado de una publicación en una ficha informativa legible, sin apariencia de botón principal.
- [x] Auditar otros adjuntos y metadatos del feed para retirar superficies de botón impropias y recuperar contraste de texto.
- [x] Suavizar y contener el separador entre publicaciones para conservar ritmo visual sin líneas invasivas.
- [x] Añadir cobertura de regresión, validar en móvil, compilar y publicar.

---
# Moderación previa de juegos y artes
- [x] Auditar los flujos de publicación de juegos y artes de galería junto con la moderación de publicaciones existente.
- [x] Evaluar juegos y artes con Orión antes de publicar, usando las reglas comunitarias administrables.
- [x] Mostrar un motivo legible y mantener el borrador si Orión bloquea el contenido.
- [x] Añadir pruebas, validar los flujos, compilar y publicar.

---
# Resultados legibles del buscador
- [x] Auditar los resultados de búsqueda y las clases que les aplican apariencia de botón o degradado.
- [x] Convertir resultados de publicaciones, juegos, usuarios y galería en filas informativas claras y legibles.
- [x] Reservar el azul para selección, iconos y acciones explícitas, con contraste suficiente para título y fragmentos.
- [x] Añadir prueba de regresión, validar en móvil, compilar y publicar.

---
# Notificaciones reales y coherentes
- [x] Auditar los eventos, conteos, categorías y periodos que alimentan el panel de notificaciones.
- [x] Eliminar métricas ficticias y derivar la lista, resúmenes y estados desde eventos reales disponibles.
- [x] Rediseñar filtros, estadísticas, tarjetas y estados vacíos sin superficies de botón impropias ni colores ajenos a la paleta.
- [x] Añadir pruebas, validar en móvil, compilar y publicar.

---
# Portadas reales en Historial
- [x] Auditar la resolución de portada e icono en los juegos jugados y el resumen de más jugado.
- [x] Mostrar la imagen real disponible en tarjetas y resúmenes del Historial.
- [x] Usar un marcador neutral solo cuando no exista una portada o icono válido.
- [x] Añadir prueba de regresión, validar en móvil, compilar y publicar.

---
# Copia completa en GitHub
- [x] Verificar el estado publicable del proyecto y excluir secretos o artefactos transitorios.
- [x] Crear un repositorio privado nuevo en la cuenta conectada de GitHub.
- [x] Subir la aplicación completa y comprobar que la rama remota contiene la versión actual.

---
# Visibilidad pública del repositorio
- [x] Cambiar el repositorio nuevo de GitHub a visibilidad pública.
- [x] Verificar el acceso público y confirmar la nueva visibilidad.
