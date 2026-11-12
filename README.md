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

## Stack

Monorepo TypeScript de punta a punta, con tipos y validaciones compartidos entre el servidor y los clientes.

| Parte                | Tecnología                                                |
| -------------------- | --------------------------------------------------------- |
| API                  | NestJS 12 sobre Fastify, Drizzle ORM, Zod                 |
| Base de datos        | PostgreSQL 16                                             |
| Colas y caché        | Redis 7 (BullMQ en la fase de recordatorios)              |
| Panel web y reservas | React 19, Vite, TanStack Query, Tailwind CSS              |
| App mobile           | Expo (React Native), en la fase 8                         |
| Monorepo             | pnpm workspaces + Turborepo                               |
| Calidad              | Vitest, Testing Library, ESLint, Prettier, GitHub Actions |

```
apps/api         API (NestJS)
apps/web         panel del negocio y página pública de reservas (React)
packages/shared  esquemas Zod y tipos compartidos
docs/brand       logo e ícono
```

## Hoja de ruta

- [x] **Fase 0 · Fundaciones:** monorepo, Docker Compose, CI, chequeo de salud de la API.
- [x] **Fase 1 · Modelo y agenda:** negocios, sucursales, profesionales, servicios, horarios y cierres; cálculo
      de disponibilidad con zonas horarias.
- [ ] **Fase 2 · Reservas sin choques:** restricción de exclusión de PostgreSQL (`EXCLUDE USING gist` sobre
      `tstzrange`) para que la base misma impida un turno doble.
- [ ] **Fase 3 · Cuentas y roles:** dueño, staff y cliente; Google o mail; invitaciones.
- [ ] **Fase 4 · Agenda en tiempo real:** WebSockets, una sala por negocio.
- [ ] **Fase 5 · Página pública de reservas:** `/n/mi-negocio`.
- [ ] **Fase 6 · Recordatorios:** BullMQ, mail 24 h y 1 h antes, cancelar o reprogramar con un link.
- [ ] **Fase 7 · Pagos:** seña con Mercado Pago, webhooks idempotentes, reembolsos.
- [ ] **Fase 8 · App mobile:** Expo con notificaciones push.
- [ ] **Fase 9 · Cierre:** estadísticas, accesibilidad, observabilidad, privacidad y dominio propio.

## Cómo se calcula la disponibilidad

- Cada sucursal tiene su zona horaria IANA y los horarios se cargan en hora local. Si la zona tiene horario de
  verano, los turnos se mueven con el reloj: la hora que no existe no se ofrece y la repetida da un turno más.
- Un profesional puede tener varios tramos por día (horario partido) y atender en varias sucursales. Los tramos
  contiguos se unen, así que un turno puede cruzarlos.
- Un turno se ofrece si entra completo en el horario y, sumando el margen posterior del servicio, no pisa un
  cierre. Los cierres pueden ser de todo el negocio, de una sucursal o de una sola persona.
- Los turnos empiezan cada 15 minutos y con al menos una hora de anticipación. Desde la fase 2, los turnos ya
  tomados se descuentan igual que un cierre.

La lógica es una función pura (`apps/api/src/availability/compute.ts`) con pruebas para horarios partidos,
márgenes, anticipación y los dos cambios de hora de verano.

## API

Los endpoints de gestión todavía no piden sesión: las cuentas y los permisos llegan en la fase 3.

| Método        | Ruta                                             | Qué hace                                          |
| ------------- | ------------------------------------------------ | ------------------------------------------------- |
| `GET`         | `/health`                                        | estado de la API, la base de datos y Redis        |
| `POST`        | `/businesses`                                    | crea un negocio                                   |
| `GET`         | `/businesses/by-slug/:slug`                      | busca un negocio por su dirección                 |
| `GET` `PATCH` | `/businesses/:id`                                | consulta o modifica un negocio                    |
| `GET` `POST`  | `/businesses/:id/locations`                      | sucursales                                        |
| `PATCH`       | `/businesses/:id/locations/:locationId`          | modifica o da de baja una sucursal                |
| `GET` `POST`  | `/businesses/:id/services`                       | servicios                                         |
| `PATCH`       | `/businesses/:id/services/:serviceId`            | modifica o da de baja un servicio                 |
| `GET` `POST`  | `/businesses/:id/staff`                          | profesionales                                     |
| `GET` `PATCH` | `/businesses/:id/staff/:staffId`                 | consulta, modifica o da de baja un profesional    |
| `PUT`         | `/businesses/:id/staff/:staffId/services`        | servicios que hace un profesional                 |
| `GET` `PUT`   | `/businesses/:id/staff/:staffId/schedule`        | horario semanal en una sucursal                   |
| `GET` `POST`  | `/businesses/:id/closures`                       | feriados, vacaciones y otros cierres              |
| `DELETE`      | `/businesses/:id/closures/:closureId`            | borra un cierre                                   |
| `GET`         | `/businesses/:id/availability?serviceId&from&to` | turnos libres (opcional: `staffId`, `locationId`) |

Los errores de validación responden 400 con el campo y el motivo de cada problema.

## Correr el proyecto

Requisitos: Node 22.12 o superior, pnpm 10 y Docker.

```bash
pnpm install
pnpm db:up                                # PostgreSQL y Redis
cp apps/api/.env.example apps/api/.env
pnpm build && pnpm db:seed                # negocio de ejemplo: peluqueria-demo
pnpm dev                                  # API en :3000 y web en :5173
```

La web muestra el estado de la API, que consulta `GET /health`: responde 200 si la base de datos y Redis
contestan, y 503 con el detalle si alguno está caído. La API aplica las migraciones pendientes al arrancar.

| Comando                        | Qué hace                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `pnpm dev`                     | levanta todo en modo desarrollo                                                                 |
| `pnpm test`                    | corre las pruebas (las de integración necesitan `pnpm db:up` y las variables de `.env.example`) |
| `pnpm lint` / `pnpm typecheck` | revisa estilo y tipos                                                                           |
| `pnpm build`                   | compila todo                                                                                    |
| `pnpm db:seed`                 | carga el negocio de ejemplo (necesita `pnpm build`)                                             |
| `pnpm format`                  | formatea con Prettier                                                                           |

## Licencia

[MIT](LICENSE)
