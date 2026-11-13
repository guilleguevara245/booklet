<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/booklet-logo-dark.svg">
    <img src="docs/brand/booklet-logo.svg" alt="Booklet" width="420">
  </picture>
</p>

<p align="center"><strong>Tu agenda, siempre al día.</strong></p>

<p align="center">
  <img src="https://github.com/guilleguevara245/booklet/actions/workflows/ci.yml/badge.svg" alt="CI">
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6" alt="TypeScript 6">
  <img src="https://img.shields.io/badge/NestJS-12-E0234E" alt="NestJS 12">
  <img src="https://img.shields.io/badge/React-19-61DAFB" alt="React 19">
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791" alt="PostgreSQL 16">
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="Licencia MIT">
</p>

# Booklet

**Turnos online para cualquier negocio.** El negocio carga sus servicios, horarios y profesionales; el cliente
reserva desde la web o la app y paga la seña con Mercado Pago. La agenda se actualiza en vivo y los recordatorios
salen solos.

> En construcción. Este README crece con cada fase.

<p align="center">
  <img src="docs/screenshots/agenda-en-vivo.png" alt="Agenda del día de la Peluquería Demo, con una columna por profesional y el aviso de un turno nuevo que llegó en vivo" width="820">
</p>

## Stack

Monorepo TypeScript de punta a punta, con tipos y validaciones compartidos entre el servidor y los clientes.

| Parte                | Tecnología                                                |
| -------------------- | --------------------------------------------------------- |
| API                  | NestJS 12 sobre Fastify, Drizzle ORM, Zod                 |
| Base de datos        | PostgreSQL 16                                             |
| Colas y caché        | Redis 7, BullMQ                                           |
| Panel web y reservas | React 19, Vite, TanStack Query, Tailwind CSS              |
| App mobile           | Expo (React Native), en la fase 8                         |
| Monorepo             | pnpm workspaces + Turborepo                               |
| Mails                | Nodemailer (SMTP); Mailpit en desarrollo y CI             |
| Calidad              | Vitest, Testing Library, ESLint, Prettier, GitHub Actions |

```
apps/api         API (NestJS)
apps/web         panel del negocio y página pública de reservas (React)
packages/shared  esquemas Zod y tipos compartidos
e2e              pruebas de punta a punta (Playwright)
docs/brand       logo e ícono
```

## Hoja de ruta

- [x] **Fase 0 · Fundaciones:** monorepo, Docker Compose, CI, chequeo de salud de la API.
- [x] **Fase 1 · Modelo y agenda:** negocios, sucursales, profesionales, servicios, horarios y cierres; cálculo
      de disponibilidad con zonas horarias.
- [x] **Fase 2 · Reservas sin choques:** reservar, cancelar y reprogramar; la base de datos impide un turno
      doble aunque lleguen muchas reservas al mismo tiempo.
- [x] **Fase 3 · Cuentas y roles:** dueño, staff y cliente; Google o mail; invitaciones.
- [x] **Fase 4 · Agenda en tiempo real:** panel web con la agenda del día, WebSockets con una sala por negocio,
      cancelar y reprogramar desde el panel.
- [x] **Fase 5 · Página pública de reservas:** `/n/mi-negocio`, reservar sin cuenta, agregar al calendario y
      "Mis turnos" para clientes.
- [x] **Fase 6 · Recordatorios:** BullMQ, mail 24 h y 1 h antes, cancelar o reprogramar con un link,
      verificación de email e invitaciones por mail.
- [ ] **Fase 7 · Pagos:** seña con Mercado Pago, webhooks idempotentes, reembolsos.
- [ ] **Fase 8 · App mobile:** Expo con notificaciones push.
- [ ] **Fase 9 · Cierre:** estadísticas, accesibilidad, observabilidad, privacidad y dominio propio.

## Cómo se calcula la disponibilidad

- Cada sucursal tiene su zona horaria IANA y los horarios se cargan en hora local. Si la zona tiene horario de
  verano, los turnos se mueven con el reloj: la hora que no existe no se ofrece y la repetida da un turno más.
- Un profesional puede tener varios tramos por día (horario partido) y atender en varias sucursales. Los tramos
  contiguos se unen, así que un turno puede cruzarlos.
- Un turno se ofrece si entra completo en el horario y, sumando el margen posterior del servicio, no pisa un
  cierre ni otro turno. Los cierres pueden ser de todo el negocio, de una sucursal o de una sola persona.
- Un turno tomado ocupa al profesional en todas sus sucursales: nadie atiende en dos lugares a la vez.
- Los turnos empiezan cada 15 minutos y con al menos una hora de anticipación.

La lógica es una función pura (`apps/api/src/availability/compute.ts`) con pruebas para horarios partidos,
márgenes, anticipación y los dos cambios de hora de verano.

## Cómo se evita un turno doble

Al reservar, la API primero comprueba que el horario se ofrezca. Pero si dos personas reservan al mismo tiempo,
las dos pasan ese chequeo. La garantía real está en PostgreSQL, con una restricción de exclusión
(`apps/api/drizzle/0002_bookings_no_overlap.sql`):

```sql
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
  staff_id WITH =,
  tstzrange(starts_at, blocked_until, '[)') WITH &&
) WHERE (status = 'confirmed');
```

Dos turnos confirmados del mismo profesional no pueden superponerse, contando el margen posterior. La segunda
reserva recibe un 409. Una prueba lanza 20 reservas simultáneas al mismo horario y verifica que entre una sola.

Esa prueba encontró un problema real: con horarios distintos que se pisan, PostgreSQL a veces respondía
`deadlock detected` (un error 500). Ahora, antes de guardar, cada reserva toma un candado sobre la agenda de ese
profesional (`pg_advisory_xact_lock`): las reservas del mismo profesional se ponen en fila y la segunda recibe
un 409 limpio. La restricción sigue siendo la garantía; el candado solo evita el bloqueo mutuo.

## Página pública de reservas

Cada negocio tiene su página en `/n/su-direccion`. El cliente elige servicio, profesional (o "cualquiera"), día y
horario, y reserva sin crear cuenta. Al terminar puede agregar el turno a su calendario (archivo `.ics`).

- **Una semana por pedido:** la disponibilidad de los 7 días se pide de una vez, así los días sin lugar aparecen
  deshabilitados sin un pedido por día.
- **Todo en la dirección:** servicio, profesional, día y horario viven en la URL, así un link compartido abre en el
  mismo paso.
- **Si otra persona ganó el horario** mientras se completaban los datos, la API responde 409 y la página lo avisa,
  vuelve a pedir la disponibilidad y deja elegir otro.
- **Con cuenta** se completan nombre y email, y el turno queda en "Mis turnos", desde donde se puede cancelar.
- **Accesibilidad:** las pruebas de punta a punta pasan [axe](https://github.com/dequelabs/axe-core) contra WCAG
  2.1 AA en la portada, el inicio de sesión, la reserva completa y el panel, en tema claro y oscuro.

<p align="center">
  <img src="docs/screenshots/reserva-publica.png" alt="Página pública de reservas de la Peluquería Demo: servicios con precio, elección de profesional, días de la semana, horarios y formulario de datos" width="420">
</p>

## Mails y recordatorios

Todos los mails salen por una cola de BullMQ en Redis: si el servidor de mails falla, se reintenta 5 veces con
espera exponencial, y una reserva nunca falla porque el mail no salió.

- **Confirmación** al reservar, con el detalle del turno y un botón para gestionarlo.
- **Recordatorios** 24 h y 1 h antes, como trabajos demorados con un id fijo por turno. Al cancelar se borran y
  al reprogramar se vuelven a programar. Antes de mandar se relee el turno: si se canceló o se movió, no sale.
- **Avisos** cuando el negocio cancela o mueve el turno.
- **Gestionar sin cuenta:** el link `/turno/:token` deja ver, cancelar o cambiar el turno. El token es un HMAC
  del id del turno con `APP_SECRET` y en la base se guarda solo su hash.
- **Verificación de email:** al crear la cuenta llega un link firmado que vence a las 48 h. Se puede pedir de
  nuevo una vez por minuto.
- **Invitaciones al equipo:** el link `/invitacion/:token` muestra qué negocio invita; para aceptar hay que
  entrar o crear la cuenta con el email invitado.
- **Plantillas** con estilos en línea y versión de texto plano, con el logo y los colores de Booklet.

En desarrollo los mails llegan a [Mailpit](http://localhost:8025) (incluido en `docker compose`). Las pruebas de
punta a punta de CI leen la casilla de Mailpit por su API: reservan, abren el link del mail y cancelan; y
aceptan una invitación creando la cuenta desde el link.

## Panel en tiempo real

La agenda del día muestra una columna por profesional, en la zona horaria de la sucursal. Cuando entra, se
cancela o se mueve un turno, todos los paneles abiertos de ese negocio se actualizan solos, sin recargar, y
avisan qué cambió (también a lectores de pantalla).

- **Socket.IO** con una sala por negocio. Al conectar se valida la sesión con las mismas reglas que HTTP:
  cookie desde la web de Booklet o token en `auth.token` para las apps nativas. Para entrar a la sala de un
  negocio hay que ser dueña o staff.
- **Varias instancias:** con el adaptador de Redis, un aviso emitido en una instancia de la API llega a los paneles
  conectados a cualquier otra. Hay una prueba que levanta dos instancias y lo verifica.
- **Sin avisos perdidos:** al reconectar, el panel vuelve a pedir los turnos del día.
- **Cancelar y reprogramar** desde el detalle del turno. Al reprogramar se ofrecen los horarios libres de ese
  día con cualquier profesional que haga el servicio; el horario actual del turno cuenta como libre.

<p align="center">
  <img src="docs/screenshots/reprogramar.png" alt="Diálogo para reprogramar un turno, con los horarios libres agrupados por profesional" width="560">
  <img src="docs/screenshots/agenda-celular.png" alt="La agenda en un celular" width="200">
</p>

## Cuentas y seguridad

- **Inicio de sesión** con email y contraseña o con Google. Las contraseñas se guardan con scrypt (incluido en
  Node, sin dependencias nativas). Con Google se verifica la firma, el emisor y la audiencia del ID token.
- **Sesiones** en una cookie `HttpOnly` y `SameSite=Lax` (y `Secure` en producción) que JavaScript no puede leer.
  Las apps nativas reciben el token y lo mandan como `Authorization: Bearer`. En la base se guarda solo el hash
  SHA-256 del token: quien lea la base no puede usar las sesiones.
- **CSRF:** un pedido que modifica algo con la cookie de sesión tiene que venir de un origen permitido
  (`CORS_ORIGIN`). Con `Bearer` no hace falta, porque el navegador nunca lo agrega solo.
- **Adivinación de contraseñas:** 5 intentos fallidos por email o 50 por IP bloquean por 15 minutos (contados en
  Redis). El error es el mismo si el email no existe o si la contraseña está mal, y tarda lo mismo.
- **Cuentas tomadas de antemano:** si alguien registra una cuenta con un email ajeno y después la dueña real entra
  con Google, la cuenta pasa a ser de ella: se borra la contraseña y se cierran las sesiones anteriores.
- **Roles por negocio:** quien crea un negocio queda como dueña. El staff entra por invitación y gestiona
  turnos, pero no el catálogo ni el equipo. Todo exige sesión salvo lo que usa la página pública: catálogo,
  disponibilidad y reservas.
- **Invitaciones:** el link solo lo puede aceptar la cuenta del email invitado, sirve una vez y vence a los 7
  días. El link viaja por mail y también vuelve en la respuesta, para copiarlo a mano.

## API

Columna "Quién": 🌐 sin sesión, 👤 con sesión, 🛠 staff o dueña del negocio, 👑 solo dueña.

| Método                  | Ruta                                               | Quién  | Qué hace                                           |
| ----------------------- | -------------------------------------------------- | ------ | -------------------------------------------------- |
| `GET`                   | `/health`                                          | 🌐     | estado de la API, la base de datos y Redis         |
| `POST`                  | `/auth/register` · `/auth/login` · `/auth/google`  | 🌐     | crea la cuenta o inicia sesión                     |
| `POST`                  | `/auth/logout`                                     | 🌐     | cierra la sesión                                   |
| `POST`                  | `/auth/verify-email`                               | 🌐     | confirma el email con el token del mail            |
| `POST`                  | `/auth/resend-verification`                        | 👤     | vuelve a mandar el mail de verificación            |
| `GET`                   | `/auth/me`                                         | 👤     | la persona y los negocios que administra           |
| `POST`                  | `/businesses`                                      | 👤     | crea un negocio y deja a quien lo crea como dueña  |
| `GET`                   | `/businesses/by-slug/:slug` · `/businesses/:id`    | 🌐     | datos públicos de un negocio                       |
| `PATCH`                 | `/businesses/:id`                                  | 👑     | modifica un negocio                                |
| `GET`                   | `/businesses/:id/locations` · `services` · `staff` | 🌐     | catálogo para la página de reservas                |
| `POST` `PATCH`          | `/businesses/:id/locations` · `services` · `staff` | 👑     | carga y modifica el catálogo                       |
| `GET`                   | `/businesses/:id/staff/:staffId`                   | 🛠      | un profesional                                     |
| `PUT`                   | `/businesses/:id/staff/:staffId/services`          | 👑     | servicios que hace un profesional                  |
| `GET` · `PUT`           | `/businesses/:id/staff/:staffId/schedule`          | 🛠 · 👑 | horario semanal en una sucursal                    |
| `GET` · `POST` `DELETE` | `/businesses/:id/closures`                         | 🛠 · 👑 | feriados, vacaciones y otros cierres               |
| `GET`                   | `/businesses/:id/availability?serviceId&from&to`   | 🌐     | turnos libres (opcional: `staffId`, `locationId`)  |
| `POST`                  | `/businesses/:id/bookings`                         | 🌐     | reserva un turno (con sesión, queda en su cuenta)  |
| `GET`                   | `/businesses/:id/bookings` · `/:bookingId`         | 🛠      | turnos del negocio                                 |
| `POST`                  | `/businesses/:id/bookings/:bookingId/cancel`       | 🛠      | cancela un turno y libera el horario               |
| `POST`                  | `/businesses/:id/bookings/:bookingId/reschedule`   | 🛠      | mueve un turno de horario, profesional o sucursal  |
| `GET`                   | `/businesses/:id/members`                          | 🛠      | el equipo                                          |
| `DELETE`                | `/businesses/:id/members/:userId`                  | 👑     | saca a alguien del equipo                          |
| `GET` `POST` `DELETE`   | `/businesses/:id/invitations`                      | 👑     | invitaciones pendientes                            |
| `GET`                   | `/invitations/:token`                              | 🌐     | qué negocio invita y a qué email                   |
| `POST`                  | `/invitations/:token/accept`                       | 👤     | acepta la invitación                               |
| `GET`                   | `/manage/:token` · `/manage/:token/options?date`   | 🌐     | un turno y sus horarios para cambiarlo, sin cuenta |
| `POST`                  | `/manage/:token/cancel` · `reschedule`             | 🌐     | cancela o mueve el turno desde el link del mail    |
| `GET`                   | `/me/bookings`                                     | 👤     | mis turnos en cualquier negocio                    |
| `POST`                  | `/me/bookings/:bookingId/cancel`                   | 👤     | cancela un turno propio                            |

Los errores de validación responden 400 con el campo y el motivo de cada problema. Sin sesión, 401; sin el rol
necesario, 403. Un horario tomado o no ofrecido, o un turno que ya pasó o ya está cancelado, responde 409.

## Correr el proyecto

Requisitos: Node 22.22 o superior, pnpm 10 y Docker.

```bash
pnpm install
pnpm db:up                                # PostgreSQL, Redis y Mailpit
cp apps/api/.env.example apps/api/.env
pnpm build && pnpm db:seed                # negocio de ejemplo; dueña: demo@booklet.local / demo-booklet
pnpm dev                                  # API en :3000 y web en :5173
```

Entrá a <http://localhost:5173/entrar> con la dueña de ejemplo para ver el panel. La portada muestra el estado de
la API, que consulta `GET /health`: responde 200 si la base de datos y Redis
contestan, y 503 con el detalle si alguno está caído. La API aplica las migraciones pendientes al arrancar.
Los mails se ven en <http://localhost:8025>.

Variables de la API (`apps/api/.env.example`): las de la base y Redis, y además:

| Variable         | Para qué                                                                         |
| ---------------- | -------------------------------------------------------------------------------- |
| `APP_SECRET`     | firma los links de los mails; en producción es obligatoria (32 caracteres o más) |
| `WEB_URL`        | dirección de la web, para armar los links                                        |
| `MAIL_TRANSPORT` | `smtp` (por defecto), `log` (solo los escribe en el log) o `memory` (pruebas)    |
| `SMTP_URL`       | servidor de mails, por defecto Mailpit en `smtp://localhost:1025`                |
| `MAIL_FROM`      | remitente                                                                        |
| `WORKER_ENABLED` | `false` para una instancia que solo encola y no procesa trabajos                 |

| Comando                                                          | Qué hace                                                                                        |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                       | levanta todo en modo desarrollo                                                                 |
| `pnpm e2e`                                                       | compila y corre las pruebas de punta a punta con Playwright (necesita `pnpm db:up`)             |
| `MAIL_TRANSPORT=smtp MAILPIT_URL=http://localhost:8025 pnpm e2e` | suma las pruebas de mails contra Mailpit                                                        |
| `pnpm test`                                                      | corre las pruebas (las de integración necesitan `pnpm db:up` y las variables de `.env.example`) |
| `pnpm lint` / `pnpm typecheck`                                   | revisa estilo y tipos                                                                           |
| `pnpm build`                                                     | compila todo                                                                                    |
| `pnpm db:seed`                                                   | carga el negocio de ejemplo (necesita `pnpm build`)                                             |
| `pnpm format`                                                    | formatea con Prettier                                                                           |

## Licencia

[MIT](LICENSE)
